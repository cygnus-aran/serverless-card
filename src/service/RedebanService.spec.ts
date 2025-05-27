/**
 * RedebanService Unit Tests
 */

import {
  AurusError,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CONTAINER } from "infrastructure/Container";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TokenTypeEnum } from "infrastructure/TokenTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get } from "lodash";
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
import { TimeoutTransactionsTables } from "types/timeout_transactions_tables";
import { TimeoutVars } from "types/timeout_vars";
import { TokensCardResponse } from "types/tokens_card_response";

use(sinonChai);

describe("RedebanService Unit Tests", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];
  let token_stub: SinonStub;
  let token_response_mock: TokensCardResponse;

  function mockAurus() {
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        getAurusToken: token_stub,
      })
    );
  }

  beforeEach(() => {
    sandbox = createSandbox();
    token_response_mock = Mock.of<TokensCardResponse>({
      token: "token",
    });
    token_stub = sandbox.stub().returns(of(token_response_mock));
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(Mock.of());
    CONTAINER.unbind(CORE.RollbarInstance);
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        critical: sandbox.stub(),
        warn: sandbox.stub(),
        warning: sandbox.stub(),
      })
    );
    mockAurus();
  });

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        warn: sandbox.stub(),
      })
    );
  });

  function mockLambdaGateway(invokeStub: SinonStub): void {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invokeStub,
      })
    );
  }

  describe("tokens Method", () => {
    it("should make a tokens", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[2].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
    it("should make a tokens - on Aurus error", (done: Done) => {
      token_stub = sandbox.stub().throws(new Error("Aurus Error"));
      mockAurus();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[2].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
  });

  describe("charge Method", () => {
    let charge_request_mock: ChargeInput;
    let charge_response_mock: AurusResponse;
    let trx_reference: string;
    let put_stub: SinonStub;

    beforeEach(() => {
      trx_reference = "124asdsa123asdk123131";
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
          transactionReference: trx_reference,
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
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: "charge",
      });
      charge_response_mock = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: trx_reference,
      });

      put_stub = sandbox.stub().returns(of(true));
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
        })
      );
    });

    afterEach(() => {
      setTimeoutVars(30000);
    });

    function setTimeoutVars(value: number): void {
      const tables: TimeoutVars = {
        fis: value,
        redeban: value,
        transbank: value,
      };

      process.env.TIMEOUT_VARS = JSON.stringify(tables);
    }

    function commonExpectSuccessCharge(
      done: Done,
      isSubscription: boolean,
      isCommission: boolean
    ): void {
      setTimeoutVars(30000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(rs.transaction_reference).eq(trx_reference);
          expect(rs.response_code).eq("00");
          expect(charge_stub).calledOnce;
          if (isSubscription && !isCommission) {
            expect(charge_stub.args[0][1].card.months).to.be.eqls(
              charge_request_mock.event.deferred?.months
            );
            expect(charge_stub.args[0][1].isDeferred).to.be.false;
            expect(charge_stub.args[0][1].subscription).to.be.eqls("monthly");
          } else
            expect(charge_stub.args[0][1].tokenType).to.be.eqls(
              TokenTypeEnum.TRANSACTION
            );

          done();
        },
      });
    }

    it("should make a charge", (done: Done) => {
      commonExpectSuccessCharge(done, false, false);
    });

    it("should make a charge with usrvOrigin = usrv-subscriptions ", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      charge_request_mock.event.periodicity = "monthly";
      charge_request_mock.event.deferred = {
        creditType: "1",
        graceMonths: "",
        months: 1,
      };
      commonExpectSuccessCharge(done, true, false);
    });

    it("should make a charge with usrvOrigin = usrv-subscriptions and cvv ", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      charge_request_mock.event.periodicity = "monthly";
      charge_request_mock.cvv = "123";
      charge_request_mock.event.deferred = {
        creditType: "1",
        graceMonths: "",
        months: 1,
      };
      commonExpectSuccessCharge(done, true, false);
    });

    it("should make a subscription charge with usrvOrigin = usrv-commission ", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      charge_request_mock.event.isSubscriptionCharge = true;
      commonExpectSuccessCharge(done, true, true);
    });

    it("should make a charge with usrvOrigin = usrv-commission and isSubscriptionCharge is false", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      charge_request_mock.event.isSubscriptionCharge = false;
      commonExpectSuccessCharge(done, false, true);
    });

    it("should throw error when its time out", (done: Done) => {
      setTimeoutVars(30);
      const tables: TimeoutTransactionsTables = {
        fis: "fis-timeout-table",
        redeban: "redeban-timeout-table",
        transbank: "transbank-timeout-table",
      };

      process.env.TIMEOUT_TRANSACTIONS_TABLES = JSON.stringify(tables);

      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock).pipe(delay(400)));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.equal("Procesador inalcanzable");
          expect(put_stub).to.have.been.calledOnce;
          expect(put_stub.args[0][0].transactionReference).to.be.equal(
            "124asdsa123asdk123131"
          );
          expect(charge_stub).calledOnce;
          done();
        },
      });
    });

    it("should make a charge with 3DS", (done: Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              specificationVersion: 0,
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cardType: "cardType test",
                cavv: "cavv test",
                eci: "eci test",
                eciRaw: "eciRaw test",
                ucafAuthenticationData: "ucafAuthenticationData test",
                xid: "xid",
              },
            },
            privateId: "privateId",
            processor: "NIUBIZ",
            publicId: "publicId",
          },
        },
      };
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(charge_stub).calledOnce;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;
          done();
        },
      });
    });

    it("should make a charge with 3DS with eciRaw, cardType and ucafAuthenticationData", (done: Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              specificationVersion: 0,
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cardType: "cardType test",
                cavv: "cavv test",
                eci: "eci test",
                eciRaw: "eciRaw test",
                ucafAuthenticationData: "ucafAuthenticationData test",
                xid: "xid",
              },
            },
            privateId: "privateId",
            processor: "NIUBIZ",
            publicId: "publicId",
          },
        },
      };
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      process.env.TIMEOUT_VARS = `{"redeban": 12341234, "transbank": 1234}`;

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          const charge_stub_3ds_args: object = charge_stub.args[0][1]["3DS"];

          expect(rs).not.to.be.undefined;
          expect(charge_stub).calledOnce;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;

          expect(charge_stub_3ds_args).to.haveOwnProperty(
            "ucafAuthenticationData"
          );

          done();
        },
      });
    });

    it("should make a charge with 3DS with no fields eciRaw, cardType and ucafAuthenticationData", (done: Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              specificationVersion: 0,
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cavv: "cavv test",
                eci: "eci test",
                xid: "xid",
              },
            },
            privateId: "privateId",
            processor: "NIUBIZ",
            publicId: "publicId",
          },
        },
      };
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      process.env.TIMEOUT_VARS = `{"redeban": 12341234, "transbank": 1234}`;

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;
          expect(charge_stub).calledOnce;

          done();
        },
      });
    });

    it("should make a charge, with unhandled error", (done: Done) => {
      const charge_stub: SinonStub = sandbox
        .stub()
        .throws(new Error("Unhandled Error"));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        error: (error: Error): void => {
          expect(error.message).eq("Unhandled Error");
          done();
        },
      });
    });

    it("should make a charge, with 600 kushki error", (done: Done) => {
      const response_text: string = "Tarjeta invalida.";
      const charge_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E600, "Rejected transaction", {
          response_text,
          response_code: "018",
        })
      );

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).eq(response_text);
          expect(get(error.getMetadata(), "response_text")).eq(response_text);
          done();
        },
      });
    });

    it("should make a charge, with 500 kushki error", (done: Done) => {
      const response_text: string = "Procesador inalcanzable";
      const charge_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E500, "Rejected Ip", {
          response_text,
          response_code: "500",
        })
      );

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).eq(response_text);
          expect(get(error.getMetadata(), "processorName")).eq(
            ProcessorEnum.REDEBAN
          );
          done();
        },
      });
    });

    it("should make a charge, with no registered kushki error", (done: Done) => {
      const charge_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E007, "Unreachable processor", {
          response_code: "",
          response_text: "Axios error",
        })
      );

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[2].charge(charge_request_mock).subscribe({
        error: (error: KushkiError): void => {
          expect(error).to.be.instanceOf(KushkiError);
          expect(error.getMessage()).eq("Unreachable processor");
          expect(get(error.getMetadata(), "response_text")).eq("Axios error");
          done();
        },
      });
    });
  });

  describe("processors errors", () => {
    let services: IProviderService[];
    let invoke_stub: SinonStub;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
      invoke_stub = sandbox.stub().returns(of(true));
      mockLambdaGateway(invoke_stub);
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    function testMethondError(err: KushkiError, done: Mocha.Done): void {
      expect(err.code).to.be.eq("K041");
      expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
      expect(err).to.be.instanceOf(KushkiError);
      done();
    }

    it("capture should throw K041 error, method is not supported by the processor", (done: Mocha.Done) => {
      services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      services[CardProviderIndexEnum.Redeban].capture(undefined).subscribe({
        error: (err: KushkiError): void => {
          testMethondError(err, done);
        },
      });
    });
    it("should throw K041 error when the method preAuthorization is not supported by the processor", (done: Mocha.Done) => {
      services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      services[CardProviderIndexEnum.Redeban]
        .preAuthorization(undefined)
        .subscribe({
          error: (error: KushkiError): void => {
            testMethondError(error, done);
          },
        });
    });
    it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Mocha.Done) => {
      services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      services[CardProviderIndexEnum.Redeban]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (error: KushkiError): void => {
            testMethondError(error, done);
          },
        });
    });

    it("should throw K041 error when the method validateAccount is not supported by the processor Redeban", (done: Mocha.Done) => {
      services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      services[CardProviderIndexEnum.Redeban]
        .validateAccount(undefined, undefined)
        .subscribe({
          error: (error: KushkiError): void => {
            testMethondError(error, done);
          },
        });
    });
  });
});
