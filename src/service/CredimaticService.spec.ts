/**
 * CredomaticService Unit Tests
 */

import {
  AurusError,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  KushkiError,
  KushkiErrorAttr,
  StatusCodeEnum,
} from "@kushki/core";
import { TokenTypeEnum } from "@kushki/core/lib/infrastructure/TokenTypeEnum";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import { ErrorCode, ERRORS } from "infrastructure/ErrorEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { isEmpty, isUndefined, set } from "lodash";
import { Done } from "mocha";
import { ICardGateway } from "repository/ICardGateway";
import { IProviderService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { delay } from "rxjs/operators";
import { ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusResponse } from "types/aurus_response";
import { Cybersource } from "types/dynamo_token_fetch";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";

use(sinonChai);

describe("CredimaticService Unit Tests", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];
  let token_stub: SinonStub;
  let token_response_mock: TokensCardResponse;
  let invoke_stub: SinonStub;
  let invoke_response_mock: AurusResponse;

  function mockLambdaGateway(
    errorCode: string,
    isDelay?: boolean,
    kushkiErrCode?: KushkiErrorAttr<ErrorCode, StatusCodeEnum>
  ): void {
    invoke_stub = isDelay
      ? sandbox.stub().returns(of(invoke_response_mock).pipe(delay(2)))
      : sandbox.stub().returns(of(invoke_response_mock));

    invoke_stub = isEmpty(errorCode)
      ? invoke_stub
      : sandbox
          .stub()
          .rejects(
            isUndefined(kushkiErrCode)
              ? new Error(errorCode)
              : new KushkiError(kushkiErrCode)
          );

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invoke_stub,
      })
    );
  }

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

  describe("tokens", () => {
    it("should return token successfully", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Credimatic]
        .tokens(undefined, undefined)
        .subscribe({
          next: (rs: TokensCardResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(rs.token).not.to.be.undefined;
            done();
          },
        });
    });
  });

  describe("charge", () => {
    let charge_request_mock: ChargeInput;

    beforeEach(() => {
      process.env.CREDIMATIC_TIMEOUT = "1";
      charge_request_mock = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "123",
          merchantId: "merchantId",
        },
        currentMerchant: {
          country: CountryEnum.HONDURAS,
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
          merchantId: "merchantId",
          transactionReference: "",
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
          sub_mcc_code: "9311",
        },
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: "charge",
      });

      invoke_response_mock = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: "123123132",
      });
    });

    it("should process charge successfully", (done: Done) => {
      mockLambdaGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .charge(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(rs.transaction_reference).eq("123123132");
            expect(rs.response_code).eq("00");
            expect(invoke_stub).calledOnce;
            expect(
              invoke_stub.args[0][1].subscriptionCardValidationTrxReference
            ).to.be.undefined;
            expect(invoke_stub.args[0][1].subMccCode).to.be.equal(
              charge_request_mock.processor.sub_mcc_code
            );
            done();
          },
        });
    });

    it("should process charge successfully when transaction has deferred", (done: Done) => {
      set(charge_request_mock.event, "deferred.months", 3);
      mockLambdaGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .charge(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(rs.transaction_reference).eq("123123132");
            expect(rs.response_code).eq("00");
            expect(invoke_stub.args[0][1].isDeferred).to.be.true;
            done();
          },
        });
    });

    it("Should send subsCardValidationTrxRef prop in charge request when this prop comes in input request", (done: Done) => {
      const subs_card_trx_ref = "123ABC";

      set(
        charge_request_mock,
        "subscriptionMinChargeTrxRef",
        subs_card_trx_ref
      );
      mockLambdaGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .charge(charge_request_mock)
        .subscribe({
          next: (): void => {
            expect(invoke_stub).calledOnce;
            expect(
              invoke_stub.args[0][1].subscriptionMinChargeTrxRef
            ).to.be.equal(subs_card_trx_ref);
            done();
          },
        });
    });

    it("should throw error when 3ds is not undefined and version is 1", (done: Done) => {
      const cybersource: Cybersource = {
        authentication: true,
        detail: { specificationVersion: 1 },
      };

      set(charge_request_mock, "currentToken.3ds", cybersource);
      mockLambdaGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(invoke_stub).not.to.be.called;
            expect(err.getMessage()).to.be.eql(ERRORS.E322.message);
            expect(err).to.be.instanceOf(KushkiError);
            done();
          },
        });
    });

    it("should throw kushki error when there is invoke lambda error and error is not a Kushki error", (done: Done) => {
      mockLambdaGateway(ErrorCode.E004);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(invoke_stub).calledOnce;
            expect(err.getMessage()).to.be.eql(ERRORS.E002.message);
            expect(err).to.be.instanceOf(KushkiError);
            done();
          },
        });
    });

    it("should throw kushki error when there is invoke lambda error and error is a Kushki error", (done: Done) => {
      mockLambdaGateway(ErrorCode.E004, false, ERRORS.E006);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(invoke_stub).calledOnce;
            expect(err).to.be.instanceOf(AurusError);
            done();
          },
        });
    });

    it("should throw E027 error when there is a timeout error", (done: Done) => {
      mockLambdaGateway("", true);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(invoke_stub).calledOnce;
            expect(err.getMessage()).to.be.eql(ERRORS.E027.message);
            expect(err).to.be.instanceOf(KushkiError);
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

    it("should throw K041 error when the method capture is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Credimatic].capture(undefined).subscribe({
        error: (err: KushkiError): void => {
          testMethondError(err, done);
        },
      });
    });

    it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Credimatic]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });

    it("should throw K041 error when the method preAuthorization is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Credimatic]
        .preAuthorization(undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });
  });

  describe("validate account", () => {
    let account_validation_request: SandboxAccountValidationRequest;

    beforeEach(() => {
      process.env.CREDIMATIC_TIMEOUT = "1";
      account_validation_request = Mock.of<SandboxAccountValidationRequest>({});
      invoke_response_mock = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: "123123132",
      });
    });

    it("should return an approved transaction, when validate account successful ", (done: Done) => {
      mockLambdaGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .validateAccount(undefined, account_validation_request)
        .subscribe({
          next: (response: AurusResponse) => {
            expect(response).not.to.be.undefined;
            expect(response.transaction_reference).eq("123123132");
            expect(response.response_code).eq("00");
            done();
          },
        });
    });

    it("should return a KushkiError, when invoke lambda fails", (done: Done) => {
      mockLambdaGateway(ErrorCode.E004);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .validateAccount(undefined, account_validation_request)
        .subscribe({
          error: (err: KushkiError) => {
            expect(invoke_stub).calledOnce;
            expect(err).to.be.instanceOf(KushkiError);
            expect(err.getMessage()).to.be.eql(ERRORS.E002.message);
            done();
          },
        });
    });

    it("should return an AurusError, when invoke lambda fails ", (done: Done) => {
      mockLambdaGateway(ErrorCode.E004, false, ERRORS.E006);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Credimatic]
        .validateAccount(undefined, account_validation_request)
        .subscribe({
          error: (err: KushkiError) => {
            expect(err).to.be.instanceOf(AurusError);
            expect(invoke_stub).calledOnce;
            done();
          },
        });
    });
  });
});
