/**
 * AurusService Unit Tests
 */
import { IDENTIFIERS as CORE, KushkiError } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CONTAINER } from "infrastructure/Container";
import { ERRORS } from "infrastructure/ErrorEnum";
import { Done } from "mocha";
import { ICardGateway } from "repository/ICardGateway";
import { IProviderService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { CaptureInput, ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";

use(sinonChai);
describe("AurusService", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];

  beforeEach(() => {
    sandbox = createSandbox();
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
  });

  function mockCardGateway(
    tokenStub?: SinonStub,
    chargeStub?: SinonStub,
    preAuthStub?: SinonStub,
    captureStub?: SinonStub
  ): void {
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        captureTransaction: captureStub,
        chargesTransaction: chargeStub,
        getAurusToken: tokenStub,
        preAuthorization: preAuthStub,
      })
    );
  }

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
  });

  describe("tokens Method", () => {
    let token_request_mock: AurusTokenLambdaRequest;
    let token_response_mock: TokensCardResponse;

    beforeEach(() => {
      token_request_mock = Mock.of<AurusTokenLambdaRequest>({
        merchantId: "merchantId",
        totalAmount: 100,
        vaultToken: "vaultToken",
      });
      token_response_mock = Mock.of<TokensCardResponse>({
        token: "token",
      });
    });

    it("should make a tokens with aurus", (done: Done) => {
      const token_stub: SinonStub = sandbox
        .stub()
        .returns(of(token_response_mock));

      mockCardGateway(token_stub);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Aurus]
        .tokens(token_request_mock)
        .subscribe({
          next: (rs: TokensCardResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(token_stub).calledOnce;
            done();
          },
        });
    });
  });

  describe("charge Method", () => {
    let charge_request_mock: ChargeInput;
    let charge_response_mock: AurusResponse;
    let trx_reference: string;

    beforeEach(() => {
      trx_reference = "124asdsa123asdk123131";
      charge_request_mock = Mock.of<ChargeInput>({
        amount: {
          iva: 342423,
          subtotalIva: 42432,
          subtotalIva0: 4234,
        },
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
          usrvOrigin: "usrv-subscriptions",
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
        response_code: "00",
        transaction_reference: trx_reference,
      });
    });

    it("should make a charge with aurus", (done: Done) => {
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockCardGateway(
        sandbox.stub().returns(
          of({
            token: "token44",
          })
        ),
        charge_stub
      );

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Aurus]
        .charge(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(rs.transaction_reference).eq(trx_reference);
            expect(rs.response_code).eq("00");
            expect(charge_stub).calledOnce;
            done();
          },
        });
    });
  });

  describe("preAuthorization Method", () => {
    let pre_auth_request_mock: ChargeInput;
    let pre_auth_response_mock: AurusResponse;
    let trx_reference: string;

    beforeEach(() => {
      trx_reference = "124asdsa123asdk123131";
      pre_auth_request_mock = Mock.of<ChargeInput>({
        amount: {
          iva: 342423,
          subtotalIva: 42432,
          subtotalIva0: 4234,
        },
        authorizerContext: {
          credentialId: "1234",
          merchantId: "12345",
        },
        currentMerchant: {
          merchant_name: "testing",
          public_id: "1234567890",
          whiteList: true,
        },
        currentToken: {
          amount: 4444,
          bin: "123132",
          created: 2131312,
          currency: "USD",
          id: "id",
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
          metadata: {
            ksh_subscriptionValidation: true,
          },
          tokenId: "asdad",
          usrvOrigin: "test",
        },
        plccInfo: { flag: "" },
        processor: {
          private_id: "1412312",
          processor_name: "Try",
          public_id: "112",
        },
        transactionType: "charge",
      });
      pre_auth_response_mock = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: trx_reference,
      });
    });

    it("should make a preAuthorization with aurus", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockCardGateway(
        sandbox.stub().returns(
          of({
            token: "token",
          })
        ),
        undefined,
        pre_auth_stub
      );

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Aurus]
        .preAuthorization(pre_auth_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs.transaction_reference).eq(trx_reference);
            expect(rs.response_code).eq("00");
            expect(pre_auth_stub).calledOnce;
            done();
          },
        });
    });

    function testMethondError(err: KushkiError, done: Mocha.Done): void {
      expect(err.code).to.be.eq("K041");
      expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
      expect(err).to.be.instanceOf(KushkiError);
      done();
    }

    it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockCardGateway(undefined, undefined, pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Aurus]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });

    it("should throw K041 error when the method validateAccount is not supported by the processor", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockCardGateway(undefined, undefined, pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Aurus]
        .validateAccount(undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });
  });

  describe("capture Method", () => {
    let capture_request_mock: CaptureInput;
    let pre_auth_response_mock: AurusResponse;
    let trx_reference: string;

    beforeEach(() => {
      trx_reference = "124asdsa123asdk123131";
      capture_request_mock = Mock.of<CaptureInput>({
        body: {
          amount: {
            currency: "USD",
            ice: 12,
            iva: 12,
            subtotalIva: 12,
            subtotalIva0: 12,
          },
          ticketNumber: "test",
        },
        context: {
          awsRequestId: "test",
          callbackWaitsForEmptyEventLoop: true,
          functionName: "test",
          functionVersion: "test",
          invokedFunctionArn: "test",
          logGroupName: "test",
          logStreamName: "test",
          memoryLimitInMB: "test",
        },
        processor: {
          acquirer_bank: "test",
          created: 11111111,
          merchant_id: "test",
          private_id: "test",
          processor_name: "test",
          processor_type: "test",
          public_id: "test",
        },
        transaction: {
          approval_code: "test",
          approved_transaction_amount: 123131313,
          bin_card: "test",
          card_holder_name: "test",
          created: 123131313,
          currency_code: "test",
          iva_value: 123131313,
          last_four_digits: "test",
          merchant_id: "test",
          merchant_name: "test",
          payment_brand: "teasdast",
          processor_bank_name: "test",
          processor_id: "asda",
          processor_name: "test",
          recap: "test",
          request_amount: 123131313,
          subtotal_iva: 123131313,
          subtotal_iva0: 123131313,
          sync_mode: "online",
          ticket_number: "test",
          transaction_id: "test",
          transaction_reference: "test",
          transaction_status: "test",
          transaction_type: "test",
        },

        merchantId: "123131",
        trxReference: "1231313",
        trxRuleResponse: {
          body: {
            privateId: "test",
            processor: "test",
            publicId: "test",
          },
        },
      });
      pre_auth_response_mock = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: trx_reference,
      });
    });

    it("should make a capture with aurus", (done: Done) => {
      const capture_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockCardGateway(undefined, undefined, undefined, capture_stub);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[1].capture(capture_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).eq(trx_reference);
          expect(rs.response_code).eq("00");
          expect(capture_stub).calledOnce;
          done();
        },
      });
    });
  });
});
