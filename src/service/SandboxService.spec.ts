/**
 * SandboxService Unit Tests
 */
import { IDENTIFIERS as CORE } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { Done } from "mocha";
import { IProviderService } from "repository/IProviderService";
import { ISandboxGateway } from "repository/ISandboxGateway";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { CaptureInput, ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { AurusResponse } from "types/sandbox_charge_response";
import { SandboxTokenLambdaRequest } from "types/sandbox_token_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";

use(sinonChai);
describe("SandboxService", () => {
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

  function mockSandboxGateway(
    tokenStub?: SinonStub,
    chargeStub?: SinonStub
  ): void {
    CONTAINER.unbind(IDENTIFIERS.SandboxGateway);
    CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
      Mock.of<ISandboxGateway>({
        chargesTransaction: chargeStub,
        reauthTransaction: chargeStub,
        tokensTransaction: tokenStub,
      })
    );
  }

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
  });

  describe("tokens Method", () => {
    let token_request_mock: SandboxTokenLambdaRequest;
    let token_response_mock: TokensCardResponse;

    beforeEach(() => {
      token_request_mock = Mock.of<SandboxTokenLambdaRequest>({
        body: {
          card: {
            number: "123456XXXXXX7890",
          },
        },
        mid: "mid",
        processorName: "processorName",
        tokenType: "tokenType",
      });
      token_response_mock = Mock.of<TokensCardResponse>({
        token: "token",
      });
    });

    it("should make a tokens with aurus", (done: Done) => {
      const token_stub: SinonStub = sandbox
        .stub()
        .returns(of(token_response_mock));

      mockSandboxGateway(token_stub);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[0].tokens(token_request_mock).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(token_stub).calledOnce;
          expect(token_stub.args[0][0].card.number).to.be.equal(
            "123456XXXXXX7890"
          );
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

    it("should make a charge with sandbox", (done: Done) => {
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockSandboxGateway(undefined, charge_stub);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[0].charge(charge_request_mock).subscribe({
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
    const trx_reference: string = "a1b2c3-d4e5f6-g7h8i9j0";

    beforeEach(() => {
      pre_auth_request_mock = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "12345",
          merchantId: "1234567890",
        },
        currentMerchant: {
          merchant_name: "testing",
          public_id: "12345",
          whiteList: true,
        },
        currentToken: {
          amount: 123,
          bin: "424242",
          created: 5156524738,
          currency: "PEN",
          id: "id",
          ip: "ip",
          lastFourDigits: "4242",
          maskedCardNumber: "123456XXXXXX7890",
          merchantId: "0987654321",
          transactionReference: trx_reference,
        },
        event: {
          amount: {
            iva: 0,
            subtotalIva: 123,
            subtotalIva0: 0,
          },
          tokenId: "12345678900987654321",
        },
        plccInfo: { flag: "" },
        processor: {
          private_id: "1234567890",
          processor_name: "name processor",
          public_id: "09876543210987654321",
        },
        transactionType: "charge",
      });

      pre_auth_response_mock = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: trx_reference,
      });
    });

    it("when make a preAuthorization, it should be success", (done: Mocha.Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockSandboxGateway(undefined, pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[0].preAuthorization(pre_auth_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).to.be.equal(trx_reference);
          expect(rs.response_code).to.be.equal("00");
          expect(pre_auth_stub).to.have.been.calledOnce;
          done();
        },
      });
    });
  });

  describe("reAuthorization Method", () => {
    it("should process a reauthorization successfully", (done: Mocha.Done) => {
      const transaction_reference: string = "abcd-1234-edfg";

      const reauth_request: Transaction = Mock.of<Transaction>({
        ticket_number: "asd",
      });
      const re_auth_stub: SinonStub = sandbox.stub().returns(
        of(
          Mock.of<AurusResponse>({
            transaction_reference,
            response_code: "00",
          })
        )
      );

      mockSandboxGateway(undefined, re_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      const amount: Amount = Mock.of<Amount>({
        iva: 13,
        subtotalIva: 45,
        subtotalIva0: 44,
      });

      service[0].reAuthorization(amount, undefined, reauth_request).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).to.be.equal(transaction_reference);
          expect(rs.response_code).to.be.equal("00");
          expect(re_auth_stub).to.have.been.calledOnce;
          done();
        },
      });
    });
  });

  describe("capture method", () => {
    let request: CaptureInput;
    let fake_amount: Amount;

    beforeEach(() => {
      fake_amount = {
        currency: "PEN",
        extraTaxes: {
          agenciaDeViaje: 0,
          iac: 0,
          propina: 0,
          tasaAeroportuaria: 0,
        },
        ice: 0,
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
      };

      request = Mock.of<CaptureInput>({
        body: {
          amount: fake_amount,
          ticketNumber: "ticketNumber",
        },
        merchantId: "merchant_id",
        processor: {
          created: 1613149635690,
          merchant_id: "merchant_id",
          private_id: "private_id",
          processor_name: "processor_name",
          processor_type: "processor_type",
          public_id: "public_id",
        },
        transaction: {
          approval_code: "approval_code",
          approved_transaction_amount: 0,
          bin_card: "bin_card",
          card_holder_name: "card_holder_name",
          created: 1613149173701,
          currency_code: "PEN",
          iva_value: 0,
          last_four_digits: "7890",
          merchant_id: "merchant_id",
          merchant_name: "merchant_name",
          payment_brand: "payment_brand",
          processor_bank_name: "processor_bank_name",
          processor_id: "processor_id",
          processor_name: ProcessorEnum.NIUBIZ,
          recap: "recap",
          request_amount: 0,
          subtotal_iva: 0,
          subtotal_iva0: 0,
          sync_mode: "api",
          ticket_number: "ticket_number",
          transaction_id: "transaction_id",
          transaction_reference: "transaction_reference",
          transaction_status: "transaction_status",
          transaction_type: "transaction_type",
        },
        trxReference: "trxReference",
      });
    });

    it("Should call the capture from sandbox", (done: Done) => {
      const capture_stub: SinonStub = sandbox.stub().returns(of(1));

      CONTAINER.unbind(IDENTIFIERS.SandboxGateway);
      CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue({
        captureTransaction: capture_stub,
      });

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[0].capture(request).subscribe({
        next: (res: AurusResponse): void => {
          expect(res).to.not.be.undefined;
          expect(capture_stub.args[0][0]).to.be.equal(request.body);
          expect(capture_stub.args[0][1]).to.be.equal(request.transaction);
          expect(capture_stub.args[0][2]).to.be.equal(request.merchantId);
          done();
        },
      });
    });
  });

  describe("preAuthorization Method", () => {
    let pre_auth_request_mock: ChargeInput;
    const trx_reference: string = "a1b2c3-d4e5f6-g7h8i9j0";

    beforeEach(() => {
      pre_auth_request_mock = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "12345",
          merchantId: "1234567890",
        },
        currentMerchant: {
          merchant_name: "testing",
          public_id: "12345",
          whiteList: true,
        },
        currentToken: {
          amount: 123,
          bin: "424242",
          created: 5156524738,
          currency: "PEN",
          id: "id",
          ip: "ip",
          lastFourDigits: "4242",
          maskedCardNumber: "123456XXXXXX7890",
          merchantId: "0987654321",
          transactionReference: trx_reference,
        },
        event: {
          amount: {
            iva: 0,
            subtotalIva: 123,
            subtotalIva0: 0,
          },
          tokenId: "12345678900987654321",
        },
        plccInfo: { flag: "" },
        processor: {
          private_id: "1234567890",
          processor_name: "name processor",
          public_id: "09876543210987654321",
        },
        transactionType: "charge",
      });
    });

    it("when make a preAuthorization, it should be success", (done: Mocha.Done) => {
      const pre_auth_response_stub: SinonStub = sandbox
        .stub()
        .returns(of(true));

      CONTAINER.unbind(IDENTIFIERS.SandboxGateway);
      CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
        Mock.of<ISandboxGateway>({
          chargesTransaction: pre_auth_response_stub,
        })
      );

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[0].preAuthorization(pre_auth_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(pre_auth_response_stub).calledOnce;
          expect(pre_auth_response_stub.args[0][0]).to.be.equal(
            pre_auth_request_mock.event
          );
          expect(pre_auth_response_stub.args[0][1]).to.be.equal(
            pre_auth_request_mock.processor.private_id
          );
          expect(pre_auth_response_stub.args[0][2]).to.be.equal(
            pre_auth_request_mock.currentToken.transactionReference
          );
          expect(pre_auth_response_stub.args[0][3]).to.be.equal(
            pre_auth_request_mock.plccInfo.flag
          );
          expect(pre_auth_response_stub.args[0][4]).to.be.equal(
            pre_auth_request_mock.currentToken
          );
          done();
        },
      });
    });
  });

  describe("charge Method", () => {
    let charge_request_mock: ChargeInput;
    let validate_account_request_mock: SandboxAccountValidationRequest;

    beforeEach(() => {
      charge_request_mock = Mock.of<ChargeInput>({
        amount: {
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 0,
        },
        authorizerContext: {
          credentialAlias: "",
          credentialId: "",
          merchantId: "",
          privateMerchantId: "",
          publicMerchantId: "",
        },
        currentMerchant: {
          country: "country",
          merchant_name: "",
          public_id: "",
          sift_science: {},
        },
        currentToken: {
          amount: 0,
          bin: "bin",
          created: 0,
          currency: "currency",
          id: "id",
          ip: "ip",
          lastFourDigits: "1234",
          maskedCardNumber: "",
          merchantId: "",
          transactionReference: "transactionReference",
        },
        event: {
          amount: {
            iva: 10,
            subtotalIva: 10,
            subtotalIva0: 10,
          },
          tokenId: "",
        },
        isFailoverRetry: false,
        lambdaContext: undefined,
        plccInfo: {
          brand: "",
          flag: "flag",
        },
        processor: {
          merchant_id: "",
          private_id: "private_id",
          processor_name: "",
          processor_type: "",
          public_id: "",
        },
        ruleInfo: {},
        siftScience: false,
        transactionType: "",
        trxRuleResponse: {
          body: {},
        },
      });
      validate_account_request_mock = Mock.of<SandboxAccountValidationRequest>({
        body: {
          country: "Colombia",
          currency_code: "USD",
          language_indicator: "es",
          merchant_identifier: "1000000745161276291315923550630777",
          plcc: "0",
          transaction_amount: {
            ICE: "0.00",
            IVA: "0.00",
            Subtotal_IVA: "0.00",
            Subtotal_IVA0: "0.00",
            Total_amount: "0.00",
          },
          transaction_reference: "b8c6bf2e-88aa-4a60-be60-68b59bfc2dfe",
          transaction_token: "d28194b4c6a34e17b2c3ae2a3a9240d3",
        },
      });
    });

    it("should make a tokens with aurus", (done: Done) => {
      const charge_response_stub: SinonStub = sandbox.stub().returns(of(true));

      CONTAINER.unbind(IDENTIFIERS.SandboxGateway);
      CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
        Mock.of<ISandboxGateway>({
          chargesTransaction: charge_response_stub,
        })
      );

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[0].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(charge_response_stub).calledOnce;
          expect(charge_response_stub.args[0][0]).to.be.equal(
            charge_request_mock.event
          );
          expect(charge_response_stub.args[0][1]).to.be.equal(
            charge_request_mock.processor.private_id
          );
          expect(charge_response_stub.args[0][2]).to.be.equal(
            charge_request_mock.currentToken.transactionReference
          );
          expect(charge_response_stub.args[0][3]).to.be.equal(
            charge_request_mock.plccInfo.flag
          );
          expect(charge_response_stub.args[0][4]).to.be.equal(
            charge_request_mock.currentToken
          );
          expect(charge_response_stub.args[0][5]).to.be.equal(
            charge_request_mock.currentMerchant.country
          );
          done();
        },
      });
    });

    it("should make a validateAccount when sandbox is enabled", (done: Done) => {
      const charge_response_stub: SinonStub = sandbox.stub().returns(of(true));

      CONTAINER.unbind(IDENTIFIERS.SandboxGateway);
      CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
        Mock.of<ISandboxGateway>({
          validateAccountTransaction: charge_response_stub,
        })
      );

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[0]
        .validateAccount(undefined, validate_account_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(charge_response_stub).calledOnce;
            done();
          },
        });
    });
  });
});
