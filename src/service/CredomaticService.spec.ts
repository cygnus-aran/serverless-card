/**
 * CredomaticService Unit Tests
 */

import {
  AurusError,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { TokenTypeEnum } from "@kushki/core/lib/infrastructure/TokenTypeEnum";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, set } from "lodash";
import { Done } from "mocha";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { delay } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { TokensCardResponse } from "types/tokens_card_response";

use(sinonChai);

describe("CredomaticService Unit Tests", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];
  let token_stub: SinonStub;
  let token_response_mock: TokensCardResponse;
  const common_error_message: string = "Procesador inalcanzable";
  const message_unreachable_processor: string = "Unreachable processor";
  const axios_error_message: string = "Axios error";

  function mockLambdaGateway(invokeStub: SinonStub): void {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invokeStub,
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

  describe("tokens Method", () => {
    it("should make a tokens", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[7].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
    it("should make a tokens - on aurus error", (done: Done) => {
      token_stub = sandbox.stub().throws(new Error("Aurus Error"));
      mockAurus();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[7].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
  });

  describe("preAuthorization Method", () => {
    let pre_auth_request_mock: ChargeInput;
    let pre_auth_response_mock: AurusResponse;
    let trx_reference: string;
    let put_stub: SinonStub;
    const invalid_card_message: string = "Tarjeta invalida.";
    const unreachable_error_message: string = "Unreachable Error";

    beforeEach(() => {
      trx_reference = "12121212121212";
      pre_auth_request_mock = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "555176247223",
          merchantId: "12345672290",
        },
        currentMerchant: {
          country: CountryEnum.HONDURAS,
          merchant_name: "test",
          public_id: "123456789",
          whiteList: true,
        },
        currentToken: {
          amount: 123,
          bin: "424242",
          created: 65191827272,
          currency: "PEN",
          id: "id",
          ip: "127.0.0.1",
          lastFourDigits: "4242",
          maskedCardNumber: "424242XXXXXX4242",
          merchantId: "0987654321",
          transactionReference: trx_reference,
        },
        event: {
          amount: {
            iva: 0,
            subtotalIva: 123,
            subtotalIva0: 0,
          },
          tokenId: "abcdefghijklmnopqrstuvwxyz",
          usrvOrigin: UsrvOriginEnum.CARD,
        },
        plccInfo: { flag: "" },
        processor: {
          private_id: "11223344",
          processor_name: "Credomatic processor",
          public_id: "44332211",
        },
        transactionType: "preAuthorization",
      });
      pre_auth_response_mock = Mock.of<AurusResponse>({
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
      process.env.CREDOMATIC_TIME_OUT = "30000";
    });

    it("When call a preAuthorization method without 3ds, it should be success", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].preAuthorization(pre_auth_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).eq(trx_reference);
          expect(pre_auth_stub).calledOnce;
          expect(rs.response_code).eq("00");
          expect(pre_auth_stub.args[0][1]["3DS"]).to.be.undefined;
          expect(pre_auth_stub.args[0][1].country).to.be.equal(
            pre_auth_request_mock.currentMerchant.country
          );
          done();
        },
      });
    });

    it("When call a preAuthorization with time out, it should throw error", (done: Done) => {
      process.env.CREDOMATIC_TIME_OUT = "30";

      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock).pipe(delay(400)));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].preAuthorization(pre_auth_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.equal(common_error_message);
          expect(put_stub).to.have.been.calledOnce;
          expect(put_stub.args[0][0].transactionReference).to.be.equal(
            "12121212121212"
          );
          expect(pre_auth_stub).calledOnce;
          done();
        },
      });
    });

    it("When call a reAuthorization with time out, it should throw error", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock).pipe(delay(400)));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].reAuthorization(undefined, undefined, undefined).subscribe({
        error: (error: AurusError): void => {
          expect(error.code).to.be.eq("K041");
          expect(error.getMessage()).to.be.eq(ERRORS.E041.message);
          expect(error).to.be.instanceOf(KushkiError);
          done();
        },
      });
    });

    it("When call a preAuthorization method with 3ds, it should be success", (done: Done) => {
      pre_auth_request_mock = {
        ...pre_auth_request_mock,
        currentToken: {
          ...pre_auth_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "123",
              eci: "eci",
              specificationVersion: 0,
              xid: "xid",
            },
          },
        },
      };
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].preAuthorization(pre_auth_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).to.be.equal(trx_reference);
          expect(pre_auth_stub).to.have.been.calledOnce;
          expect(pre_auth_stub.args[0][1]["3DS"]).to.be.not.undefined;
          expect(pre_auth_stub.args[0][1]["3DS"].cavv).to.be.equal("123");
          done();
        },
      });
    });

    it("When call a preAuthorization method, it should return unhandled error", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .throws(new Error(unreachable_error_message));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].preAuthorization(pre_auth_request_mock).subscribe({
        error: (error: Error): void => {
          expect(error.message).eq(unreachable_error_message);
          done();
        },
      });
    });

    it("When call a preAuthorization method, it should return 600 kushki error", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E600, "Rejected transaction", {
          response_code: "018",
          response_text: invalid_card_message,
        })
      );

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].preAuthorization(pre_auth_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).eq(invalid_card_message);
          expect(get(error.getMetadata(), "response_text")).eq(
            invalid_card_message
          );
          done();
        },
      });
    });

    it("When call a preAuthorization method, it should return 500 kushki error", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E500, "Rejected Ip", {
          response_code: "500",
          response_text: common_error_message,
        })
      );

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].preAuthorization(pre_auth_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(get(error.getMetadata(), "processorName")).eq(
            ProcessorEnum.CREDOMATIC
          );
          expect(error.getMessage()).eq(common_error_message);
          done();
        },
      });
    });

    it("When call a preAuthorization method, it should be no registered kushki error", (done: Done) => {
      const pre_auth_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E007, message_unreachable_processor, {
          response_code: "",
          response_text: axios_error_message,
        })
      );

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].preAuthorization(pre_auth_request_mock).subscribe({
        error: (error: KushkiError): void => {
          expect(error).to.be.instanceOf(KushkiError);
          expect(get(error.getMetadata(), "response_text")).eq(
            axios_error_message
          );
          expect(error.getMessage()).eq(message_unreachable_processor);
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
      process.env.CREDOMATIC_TIME_OUT = "30000";
    });

    function commonExpectChargeSuccess(done: Done): void {
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(rs.transaction_reference).eq(trx_reference);
          expect(rs.response_code).eq("00");
          expect(charge_stub).calledOnce;
          expect(charge_stub.args[0][1].country).to.be.equal(
            charge_request_mock.currentMerchant.country
          );

          done();
        },
      });
    }

    it("should make a charge", (done: Done) => {
      commonExpectChargeSuccess(done);
    });

    it("should make a charge with usrvOrigin usrv-subscriptions", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      charge_request_mock.event.tokenType = TokenTypeEnum.SUBSCRIPTION;
      commonExpectChargeSuccess(done);
    });

    it("should make a charge with usrvOrigin usrv-commission", (done: Done) => {
      charge_request_mock.event.isSubscriptionCharge = true;
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      commonExpectChargeSuccess(done);
    });

    it("should make a charge with usrvOrigin usrv-commission and isSubscriptionCharge is false", (done: Done) => {
      charge_request_mock.event.isSubscriptionCharge = false;
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      commonExpectChargeSuccess(done);
    });

    it("should throw error when its time out", (done: Done) => {
      process.env.CREDOMATIC_TIME_OUT = "30";

      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock).pipe(delay(400)));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].charge(charge_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.equal(common_error_message);
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
      };
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(charge_stub).calledOnce;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;
          done();
        },
      });
    });

    it("should make a charge with 3DS and brand mastercard", (done: Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              dsTransactionId: "abc123",
              eci: "eci",
              specificationVersion: 0,
              xid: "xid",
            },
          },
        },
      };
      set(
        charge_request_mock,
        "currentToken.binInfo.brand",
        CardBrandEnum.MASTERCARD
      );

      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].charge(charge_request_mock).subscribe({
        next: (): void => {
          expect(charge_stub).calledOnce;
          expect(charge_stub.args[0][1]["3DS"].xid).to.be.equal("xid");
          done();
        },
      });
    });

    it("should make a charge with 3DS and other brand than mastercard", (done: Done) => {
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
      };
      set(
        charge_request_mock,
        "currentToken.binInfo.brand",
        CardBrandEnum.VISA
      );

      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].charge(charge_request_mock).subscribe({
        next: (): void => {
          expect(charge_stub.args[0][1]["3DS"].xid).to.be.equal("xid");
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
      service[7].charge(charge_request_mock).subscribe({
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
      service[7].charge(charge_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).eq(response_text);
          expect(get(error.getMetadata(), "response_text")).eq(response_text);
          done();
        },
      });
    });

    it("should make a charge, with 500 kushki error", (done: Done) => {
      const response_text: string = common_error_message;
      const charge_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E500, "Rejected Ip", {
          response_text,
          response_code: "500",
        })
      );

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].charge(charge_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).eq(response_text);
          expect(get(error.getMetadata(), "processorName")).eq(
            ProcessorEnum.CREDOMATIC
          );
          done();
        },
      });
    });

    it("should make a charge, with no registered kushki error", (done: Done) => {
      const charge_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E007, message_unreachable_processor, {
          response_code: "",
          response_text: axios_error_message,
        })
      );

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[7].charge(charge_request_mock).subscribe({
        error: (error: KushkiError): void => {
          expect(error).to.be.instanceOf(KushkiError);
          expect(error.getMessage()).eq(message_unreachable_processor);
          expect(get(error.getMetadata(), "response_text")).eq(
            axios_error_message
          );
          done();
        },
      });
    });
  });

  describe("Capture Method", () => {
    const fake_trx_reference: string = "fakeTrxReference";
    const fake_merchant_id: string = "fakeMerchantId";
    const unreachable_error_message: string = "Unreachable Error";

    let provider_services: IProviderService[];
    let invoke_stub: SinonStub;
    let capture_request: CaptureInput;
    let fake_amount: Amount;
    let put_stub: SinonStub;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
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
      capture_request = Mock.of<CaptureInput>({
        body: {
          amount: fake_amount,
          ticketNumber: "ticketNumber",
        },
        merchantId: fake_merchant_id,
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
        trxReference: fake_trx_reference,
      });

      put_stub = sandbox.stub().returns(of(true));
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
        })
      );
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("It should succeed when calling credomatic capture capture", (done: Done) => {
      invoke_stub = sandbox.stub().returns(of(true));
      mockLambdaGateway(invoke_stub);
      provider_services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      provider_services[7].capture(capture_request).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).to.be.true;
          expect(invoke_stub).to.have.been.calledOnce;
          done();
        },
      });
    });

    it("Should handle timeout errors", (done: Done) => {
      process.env.CREDOMATIC_TIME_OUT = "30";
      invoke_stub = sandbox.stub().returns(of(true).pipe(delay(100)));
      mockLambdaGateway(invoke_stub);

      provider_services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      provider_services[7].capture(capture_request).subscribe({
        error: (error): void => {
          expect(get(error, "_metadata.processorName")).to.be.equal(
            "Credomatic Processor"
          );
          expect(invoke_stub).to.have.been.calledOnce;
          expect(put_stub).to.have.been.calledOnce;
          done();
        },
      });
    });

    it("Should return an unhandled error", (done: Done) => {
      invoke_stub = sandbox.stub().throws(new Error(unreachable_error_message));
      mockLambdaGateway(invoke_stub);

      provider_services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      provider_services[7].capture(capture_request).subscribe({
        error: (error: Error): void => {
          expect(error.message).to.be.equal(unreachable_error_message);
          expect(invoke_stub).to.have.been.calledOnce;
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

      service[CardProviderIndexEnum.Credomatic]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });

    it("should throw K041 error when the method validateAccount is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Credomatic]
        .validateAccount(undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });
  });
});
