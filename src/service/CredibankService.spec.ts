/**
 * CredibankService Unit Tests
 */
import { AurusError, ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";
import { CONTAINER } from "infrastructure/Container";
import { ErrorCode, ERRORS } from "infrastructure/ErrorEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, isEmpty, set } from "lodash";
import { Done } from "mocha";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { delay } from "rxjs/operators";
import { ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusResponse } from "types/aurus_response";
import { CredibankVars } from "types/credibank_vars";
import { TokensCardResponse } from "types/tokens_card_response";
import { CommissionFetch } from "types/unified_charges_preauth_request";

use(sinonChai);

describe("CredibankService", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];
  let token_response_mock: TokensCardResponse;
  let charge_request_mock: ChargeInput;
  let charge_response_mock: AurusResponse;
  let invoke_stub: SinonStub;
  let aurus_stub: SinonStub;
  let put_stub: SinonStub;

  function mockAurus(): void {
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        getAurusToken: aurus_stub,
      })
    );
  }

  function mockEnvVars(isDelay?: boolean): void {
    const env_vars: CredibankVars = {
      LAMBDA_CHARGE: "usrv-card-credibanco-test-charge",
      TABLE_TIMEOUTS: "usrv-card-credibanco-test-timeoutTransactions",
      TIMEOUT: isDelay ? "0" : "500",
    };

    process.env.CREDIBANK_VARS = JSON.stringify(env_vars);
  }

  function mockCore(): void {
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(Mock.of());
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    CONTAINER.unbind(CORE.RollbarInstance);
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        critical: sandbox.stub(),
        warn: sandbox.stub(),
        warning: sandbox.stub(),
      })
    );
  }

  function mockData(trxReference: string): void {
    charge_request_mock = Mock.of<ChargeInput>({
      authorizerContext: {
        credentialId: "123",
        merchantId: "0000",
      },
      currentMerchant: {
        merchant_name: "test",
        public_id: "1111",
        whiteList: true,
      },
      currentToken: {
        amount: 4444,
        bin: "123132",
        created: 2131312,
        currency: "USD",
        id: "sadasd",
        ip: "ip",
        lastFourDigits: "4344",
        maskedCardNumber: "23424werwe",
        merchantId: "dasdasd",
        transactionReference: trxReference,
      },
      event: {
        amount: {
          iva: 342423,
          subtotalIva: 42432,
          subtotalIva0: 4234,
        },
        tokenId: "asdad",
        usrvOrigin: UsrvOriginEnum.CARD,
      },
      plccInfo: { flag: "" },
      processor: {
        private_id: "1412312",
        processor_name: "Try",
        public_id: "112",
      },
      transactionType: "charge",
    });
    charge_response_mock = Mock.of<AurusResponse>({
      response_code: "000",
      transaction_reference: trxReference,
    });
    token_response_mock = Mock.of<TokensCardResponse>({
      token: "token",
    });
  }

  function mockLambdaGateway(errorCode: string, isDelay?: boolean): void {
    mockEnvVars(isDelay);
    invoke_stub = isDelay
      ? sandbox.stub().returns(of(charge_response_mock).pipe(delay(400)))
      : sandbox.stub().returns(of(charge_response_mock));

    invoke_stub = isEmpty(errorCode)
      ? invoke_stub
      : sandbox
          .stub()
          .rejects(
            errorCode === "Other Error"
              ? new Error(errorCode)
              : new KushkiError(ERRORS[errorCode])
          );

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invoke_stub,
      })
    );
  }

  function mockDynamoGateway(): void {
    put_stub = sandbox.stub().returns(of(true));
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );
  }

  function testNotImplementedError(
    err: KushkiError | Error,
    errorCode: string
  ): void {
    expect(get(err, "code", err.message)).to.be.equal(errorCode);
  }

  function testAurusError(err: AurusError, done: Done): void {
    expect(err instanceof AurusError).to.be.true;
    expect(err).not.to.be.undefined;
    done();
  }

  function testChargeStubsPerCount(
    invokeCounter: number,
    putCounter: number
  ): void {
    expect(invoke_stub).to.be.have.callCount(invokeCounter);
    expect(put_stub).to.be.have.callCount(putCounter);
  }

  function testTokenGeneration(response: TokensCardResponse, done: Mocha.Done) {
    expect(response).not.to.be.undefined;
    expect(response.token).not.to.be.undefined;
    done();
  }

  beforeEach(() => {
    CONTAINER.snapshot();
    sandbox = createSandbox();
    mockData("Test");
    mockCore();
  });

  afterEach(() => {
    CONTAINER.restore();
    sandbox.restore();
  });

  describe("tokens", () => {
    it("should make a tokens", (done: Done) => {
      aurus_stub = sandbox.stub().returns(of(token_response_mock));
      mockAurus();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          testTokenGeneration(rs, done);
        },
      });
    });
    it("should make a tokens wher aurus throw error", (done: Done) => {
      aurus_stub = sandbox.stub().throws(new Error("Error aurus"));
      mockAurus();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          testTokenGeneration(rs, done);
        },
      });
    });
  });

  describe("charge", () => {
    let put_fields: string[];

    beforeEach(() => {
      put_fields = [
        "accountType",
        "airlineCode",
        "card",
        "isCardValidation",
        "isDeferred",
        "isSubscription",
        "merchantId",
        "merchantName",
        "processorBankName",
        "processorId",
        "subMccCode",
        "tokenType",
        "transactionReference",
        "vaultToken",
      ];
    });

    function commonExpectChargeSuccess(
      done: Done,
      isCommission: boolean,
      isBinTypeNull?: boolean
    ): void {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            if (isCommission) expect(invoke_stub.args[0][1].isDeferred).eqls(0);
            if (isBinTypeNull)
              expect(invoke_stub.args[0][1].card.type).eqls(
                CardTypeEnum.CREDIT.toUpperCase()
              );
            testChargeStubsPerCount(1, 0);
            done();
          },
        });
    }

    it("should make a charge with credibank", (done: Done) => {
      mockLambdaGateway("");
      mockDynamoGateway();
      commonExpectChargeSuccess(done, false);
    });

    it("should make a charge with usrvOrigin equal usrv-subscription", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      mockLambdaGateway("");
      mockDynamoGateway();
      commonExpectChargeSuccess(done, false);
    });

    it("should return CREDIT when binInfo type is null", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      charge_request_mock.currentToken.binInfo = {
        bank: "bank",
        bin: "238000",
        brand: "MASTERCARD",
        info: {
          bank: { name: "", phone: "", url: "" },
          brand: "mastercard",
          country: [Object],
          scheme: "mastercard",
          type: null,
        },
        processor: "NA",
      };
      mockLambdaGateway("");
      mockDynamoGateway();
      commonExpectChargeSuccess(done, false, true);
    });

    it("should make a charge with usrvOrigin equal usrv-commision", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      set(
        charge_request_mock,
        "event.merchant.commission",
        Mock.of<CommissionFetch>({
          commission: {
            deferred: 0,
          },
          country: "Ecuador",
        })
      );
      mockLambdaGateway("");
      mockDynamoGateway();
      commonExpectChargeSuccess(done, true);
    });

    it("should make a charge with usrvOrigin equal usrv-commision and isSubscriptionCharge is false", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      set(
        charge_request_mock,
        "event.merchant.commission",
        Mock.of<CommissionFetch>({
          commission: {
            deferred: 0,
          },
          country: "Ecuador",
        })
      );
      charge_request_mock.event.isSubscriptionCharge = true;
      mockLambdaGateway("");
      mockDynamoGateway();
      commonExpectChargeSuccess(done, true);
    });

    it("should make a charge with 3ds object", (done: Done) => {
      charge_request_mock.currentToken["3ds"] = {
        authentication: false,
        detail: {
          cavv: "cavv",
          eci: "eci",
          ucafAuthenticationData: "authData",
          ucafCollectionIndicator: "collection",
          xid: "xid",
        },
      };
      set(charge_request_mock, "trxRuleResponse.body.subMccCode", "12345");

      mockLambdaGateway("", false);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          next: () => {
            expect(invoke_stub.args[0][1]["3DS"]).to.be.deep.equal({
              cavv: "cavv",
              directoryServerTransactionID: undefined,
              eci: "eci",
              specificationVersion: undefined,
              ucafAuthenticationData: "authData",
              ucafCollectionIndicator: "collection",
              xid: "xid",
            });
            expect(invoke_stub.args[0][1].card.cvv).to.be.undefined;
            expect(invoke_stub.args[0][1].subMccCode).to.be.equal("12345");
            done();
          },
        });
    });

    it("should invoke charge with request cvv when it is a subscription and request cvv is not empty", (done: Done) => {
      charge_request_mock.cvv = "444";
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      set(
        charge_request_mock,
        "event.metadata.ksh_subscriptionValidation",
        false
      );

      set(charge_request_mock, "trxRuleResponse.body.subMccCode", "12345");

      mockLambdaGateway("", false);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          next: () => {
            expect(invoke_stub.args[0][1].card.cvv).to.be.deep.equal(
              charge_request_mock.cvv
            );
            done();
          },
        });
    });

    it("should make a charge fall timeout and put dynamo", (done: Done) => {
      mockLambdaGateway("", true);
      mockDynamoGateway();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: Error): void => {
            expect(get(err, "message")).to.be.contains(ERRORS.E030.message);
            testChargeStubsPerCount(1, 1);
            expect(put_stub.args[0][0]).to.have.keys(put_fields);
            expect(err).not.to.be.undefined;
            done();
          },
        });
    });

    it("should make a charge with E500", (done: Done) => {
      mockLambdaGateway(ErrorCode.E500);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            testAurusError(err, done);
          },
        });
    });

    it("should make a charge with E600", (done: Done) => {
      mockLambdaGateway(ErrorCode.E600);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            testAurusError(err, done);
          },
        });
    });

    it("should make a charge with E012", (done: Done) => {
      mockLambdaGateway(ErrorCode.E012);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            testAurusError(err, done);
          },
        });
    });

    it("should make a charge with other Error", (done: Done) => {
      const error_code: string = "Other Error";

      mockLambdaGateway(error_code);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: Error): void => {
            testNotImplementedError(err, error_code);
            done();
          },
        });
    });

    it("should make a charge with with other code", (done: Done) => {
      mockLambdaGateway(ErrorCode.E001);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err instanceof KushkiError).to.be.true;
            expect(err).not.to.be.undefined;
            done();
          },
        });
    });

    it("When username and password are included in trx rule response, should make a credibank charge", (done: Done) => {
      mockDynamoGateway();
      mockLambdaGateway("");
      set(charge_request_mock, "trxRuleResponse.body.username", "jonDoe");
      set(charge_request_mock, "trxRuleResponse.body.password", "somevalue");

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .charge(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            testChargeStubsPerCount(1, 0);
            expect(invoke_stub.args[0][1].password).to.be.eql(
              charge_request_mock.trxRuleResponse.body.password
            );
            expect(invoke_stub.args[0][1].username).to.be.eql(
              charge_request_mock.trxRuleResponse.body.username
            );
            done();
          },
        });
    });
  });

  describe("preAuthorization", () => {
    it("should make a preAuthorization and return Error", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank]
        .preAuthorization(undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testNotImplementedError(err, "K016");
            done();
          },
        });
    });
  });

  describe("capture", () => {
    it("should make a capture and return Error", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.CrediBank].capture(undefined).subscribe({
        error: (err: KushkiError): void => {
          testNotImplementedError(err, "K016");
          done();
        },
      });
    });
  });

  describe("processors errors", () => {
    function testMethondError(err: KushkiError, done: Mocha.Done): void {
      expect(err.code).to.be.eq("K041");
      expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
      expect(err).to.be.instanceOf(KushkiError);
      done();
    }

    it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.CrediBank]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });

    it("should throw K041 error when the method validateAccount is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.CrediBank]
        .validateAccount(undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });
  });
});
