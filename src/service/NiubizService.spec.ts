/**
 * NiubizService Unit Tests
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
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, unset } from "lodash";
import { Done } from "mocha";
import { ICardGateway } from "repository/ICardGateway";
import { IProviderService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { CaptureInput, ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { TokensCardResponse } from "types/tokens_card_response";

use(sinonChai);

describe("NiubizService Unit Tests", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];

  function mockLambdaGateway(invokeStub: SinonStub): void {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invokeStub,
      })
    );
  }

  describe("tokens Method", () => {
    let token_response_mock: TokensCardResponse;

    function mockCardGateway(tokenStub?: SinonStub): void {
      CONTAINER.unbind(IDENTIFIERS.CardGateway);
      CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
        Mock.of<ICardGateway>({
          getAurusToken: tokenStub,
        })
      );
    }

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
      token_response_mock = Mock.of<TokensCardResponse>({
        token: "token",
      });
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

    it("should make a tokens", (done: Done) => {
      const token_stub: SinonStub = sandbox
        .stub()
        .returns(of(token_response_mock));

      mockCardGateway(token_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[3].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs).not.to.be.undefined;
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

    beforeEach(() => {
      trx_reference = "1234567890asdfghj";
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
        transactionType: "charge",
      });
      charge_response_mock = Mock.of<AurusResponse>({
        response_code: "000",
        transaction_reference: trx_reference,
      });
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

    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    function commonExpectSuccess(done: Mocha.Done): void {
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).to.be.not.undefined;
          expect(rs.transaction_reference).equal(trx_reference);
          expect(rs.response_code).to.be.equal("000");
          expect(charge_stub).to.have.been.calledOnce;

          done();
        },
      });
    }

    it("it should make a charge", (done: Mocha.Done) => {
      commonExpectSuccess(done);
    });

    it("it should make a charge with cvv on request", (done: Mocha.Done) => {
      charge_request_mock.cvv = "123";
      commonExpectSuccess(done);
    });

    it("it should make a charge with usrvOrigin usrv-commission", (done: Mocha.Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      charge_request_mock.event.isSubscriptionCharge = false;
      commonExpectSuccess(done);
    });

    it("when make a charge, it should return a kushki error 600", (done: Mocha.Done) => {
      const response_text: string = "Invalid card";
      const charge_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E600, "Rejected transaction", {
          response_text,
          response_code: "018",
        })
      );

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].charge(charge_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err.code).to.be.equal("018");
          expect(err.getMessage()).to.be.equal(response_text);
          expect(get(err.getMetadata(), "response_text")).to.be.equal(
            response_text
          );
          done();
        },
      });
    });

    it("when make a charge, it should return a kushki error 500", (done: Mocha.Done) => {
      const response_text: string = "Processor unreachable";
      const charge_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E500, "Rejected Ip", {
          response_text,
          response_code: "500",
        })
      );

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].charge(charge_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err.code).to.be.equal("500");
          expect(err.getMessage()).to.be.equal(response_text);
          expect(get(err.getMetadata(), "processorName")).to.be.equal(
            ProcessorEnum.NIUBIZ
          );
          done();
        },
      });
    });

    it("when make a charge, it should return a kushki error not registered", (done: Mocha.Done) => {
      const charge_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E006, "Informacion invalida", {
          response_code: "",
          response_text: "Axios error",
        })
      );

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].charge(charge_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err).to.be.instanceOf(KushkiError);
          expect(err.getMessage()).to.be.equal("Informacion invalida");
          expect(get(err.getMetadata(), "response_text")).to.be.equal(
            "Axios error"
          );
          done();
        },
      });
    });

    it("when make a charge, it should return an error unhandled", (done: Mocha.Done) => {
      const charge_stub: SinonStub = sandbox.stub().throws(new Error("error"));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].charge(charge_request_mock).subscribe({
        error: (err: Error): void => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.be.equal("error");
          done();
        },
      });
    });

    it("when make a charge with 3ds attr, it should be success", (done: Mocha.Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cardType: "cardType",
                cavv: "cavv",
                eci: "eci",
                eciRaw: "eciRaw",
                ucafAuthenticationData: "ucafAuthenticationData",
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
      service[3].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).equal(trx_reference);
          expect(rs.response_code).to.be.equal("000");
          expect(charge_stub).to.have.been.calledOnce;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;
          expect(charge_stub.args[0][1]).haveOwnProperty("3DS");
          done();
        },
      });
    });

    it("when make a charge with 3ds, with eciRaw, cardType and uacAuthenticationData it should be success", (done: Mocha.Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cardType: "cardType",
                cavv: "cavv",
                eci: "eci",
                eciRaw: "eciRaw",
                ucafAuthenticationData: "ucafAuthenticationData",
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
      service[3].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          const charge_stub_3ds_args: object = charge_stub.args[0][1]["3DS"];

          expect(rs.transaction_reference).equal(trx_reference);
          expect(rs.response_code).to.be.equal("000");
          expect(charge_stub).to.have.been.calledOnce;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;
          expect(charge_stub.args[0][1]).haveOwnProperty("3DS");

          expect(charge_stub_3ds_args).to.haveOwnProperty(
            "ucafAuthenticationData"
          );

          done();
        },
      });
    });

    it("when make a charge with 3ds, with no fields eciRaw, cardType and uacAuthenticationData it should be success", (done: Mocha.Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cavv: "cavv",
                eci: "eci",
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
      service[3].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).equal(trx_reference);
          expect(rs.response_code).to.be.equal("000");
          expect(charge_stub).to.have.been.calledOnce;
          expect(charge_stub.args[0][1]).haveOwnProperty("3DS");
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;

          done();
        },
      });
    });
  });

  describe("preAuthorization method", () => {
    let pre_auth_request_mock: ChargeInput;
    let pre_auth_response_mock: AurusResponse;
    const trx_reference: string = "12345678900987654321";

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
      pre_auth_request_mock = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "555176247343",
          merchantId: "1234567890",
        },
        currentMerchant: {
          merchant_name: "testing",
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
          processor_name: "name processor",
          public_id: "44332211",
        },
        transactionType: "preAuthorization",
      });

      pre_auth_response_mock = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: trx_reference,
      });
    });
    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    function testMethondError(err: AurusError, done: Mocha.Done): void {
      expect(err.code).to.be.eq("K041");
      expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
      expect(err).to.be.instanceOf(KushkiError);
      done();
    }

    function commonSuccessExpectPreauth(done: Mocha.Done): void {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].preAuthorization(pre_auth_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).to.be.equal(trx_reference);
          expect(pre_auth_stub).to.have.been.calledOnce;
          expect(pre_auth_stub.args[0][1]["3DS"]).to.be.undefined;
          done();
        },
      });
    }

    it("When call a preAuthorization method without 3ds, it should be success", (done: Mocha.Done) => {
      commonSuccessExpectPreauth(done);
    });

    it("When call a preAuthorization method without 3ds, it should be success with usrvOrigin usrv-commissin", (done: Mocha.Done) => {
      pre_auth_request_mock.event.isSubscriptionCharge = true;
      pre_auth_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      commonSuccessExpectPreauth(done);
    });

    it("When call a preAuthorization method with 3ds, it should be success", (done: Mocha.Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      pre_auth_request_mock = {
        ...pre_auth_request_mock,
        currentToken: {
          ...pre_auth_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              directoryServerTransactionId: "DS1234123-123412",
              eci: "eci",
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cardType: "cardType",
                cavv: "cavv",
                eci: "eci",
                eciRaw: "eciRaw",
                ucafAuthenticationData: "ucafAuthenticationData",
                xid: "xid",
              },
            },
            privateId: "privateId",
            processor: "NIUBIZ",
            publicId: "publicId",
          },
        },
      };
      mockLambdaGateway(pre_auth_stub);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].preAuthorization(pre_auth_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).to.be.equal(trx_reference);
          expect(pre_auth_stub).to.have.been.calledOnce;
          expect(pre_auth_stub.args[0][1]["3DS"]).to.be.not.undefined;
          expect(pre_auth_stub.args[0][1]["3DS"].cavv).to.be.equal("cavv");
          done();
        },
      });
    });

    it("When call a preAuthorization method it should return kushkierror", (done: Mocha.Done) => {
      const pre_auth_stub: SinonStub = sandbox.stub().throws(
        new KushkiError(ERRORS.E006, "Invalid Information", {
          response_code: "",
          response_text: "AxiosError",
        })
      );

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].preAuthorization(pre_auth_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err).to.be.instanceOf(KushkiError);
          expect(get(err.getMetadata(), "response_text")).to.be.equal(
            "AxiosError"
          );
          done();
        },
      });
    });

    it("When call a preAuthorization method it should return an error", (done: Mocha.Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .throws(new Error("error"));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].preAuthorization(pre_auth_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err.message).to.be.equal("error");
          expect(err).to.be.instanceOf(Error);
          done();
        },
      });
    });

    it("When call a preAuthorization method it should return a KushkiError 012", (done: Mocha.Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .throws(new KushkiError(ERRORS.E012));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].preAuthorization(pre_auth_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err.code).to.be.equal("504");
          expect(err.getMessage()).to.be.equal("Procesador inalcanzable");
          done();
        },
      });
    });

    it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Mocha.Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .throws(new Error("error"));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Niubiz]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (err: AurusError): void => {
            testMethondError(err, done);
          },
        });
    });

    it("should throw K041 error when the method validateAccount is not supported by the processor", (done: Mocha.Done) => {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .throws(new Error("error"));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Niubiz]
        .validateAccount(undefined, undefined)
        .subscribe({
          error: (err: AurusError): void => {
            testMethondError(err, done);
          },
        });
    });
  });

  describe("capture Method", () => {
    const fake_merchant_id: string = "fakeMerchantId";
    const fake_trx_reference: string = "fakeTrxReference";

    let request: CaptureInput;
    let fake_amount: Amount;

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
    });
    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    function testKushkiErrorsFor500And600(done: Done): void {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[3].capture(request).subscribe({
        error: (err: AurusError): void => {
          expect(err).not.to.be.undefined;
          expect(err.code).to.be.equal("");
          expect(err.getMetadata()).to.deep.equal({
            processorCode: "",
            processorName: ProcessorEnum.NIUBIZ,
          });
          done();
        },
      });
    }

    it("Should get a common error if something is undefined", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      unset(request, "transaction");

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[3].capture(request).subscribe({
        error: (err: Error): void => {
          expect(err).not.to.be.undefined;
          done();
        },
      });
    });

    it("Should get a KushkiError (500) trying to invoke the lambda", (done: Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue({
        invokeFunction: sandbox.stub().throws(new KushkiError(ERRORS.E500)),
      });

      testKushkiErrorsFor500And600(done);
    });

    it("Should get a KushkiError (600) trying to invoke the lambda", (done: Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue({
        invokeFunction: sandbox.stub().throws(new KushkiError(ERRORS.E600)),
      });
      testKushkiErrorsFor500And600(done);
    });

    it("Should get a KushkiError (012) trying to invoke the lambda", (done: Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue({
        invokeFunction: sandbox.stub().throws(new KushkiError(ERRORS.E012)),
      });

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].capture(request).subscribe({
        error: (err: AurusError): void => {
          expect(err).not.to.be.undefined;
          expect(err.code).to.be.equal("504");
          expect(err.getMessage()).to.be.equal("Procesador inalcanzable");
          expect(err.getMetadata()).to.deep.equal({
            processorName: ProcessorEnum.NIUBIZ,
          });
          done();
        },
      });
    });

    it("Should get a KushkiError (X) trying to invoke the lambda", (done: Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue({
        invokeFunction: sandbox.stub().throws(new KushkiError(ERRORS.E004)),
      });

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[3].capture(request).subscribe({
        error: (err: AurusError): void => {
          expect(err).not.to.be.undefined;
          expect(err.code).to.be.equal("K004");
          expect(err.getMessage()).to.be.equal("Id de comercio no válido.");
          expect(err.getMetadata()).to.deep.equal({});
          done();
        },
      });
    });

    it("Should get an AurusResponse | HappyPath", (done: Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue({
        invokeFunction: sandbox.stub().returns(of(1)),
      });

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[3].capture(request).subscribe({
        next: (res: AurusResponse): void => {
          expect(res).not.to.be.undefined;
          done();
        },
      });
    });

    it("Should get an AurusResponse when an amount is not sent", (done: Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue({
        invokeFunction: sandbox.stub().returns(of(1)),
      });

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      delete request.body.amount;

      service[3].capture(request).subscribe({
        next: (res: AurusResponse): void => {
          expect(res).not.to.be.undefined;
          done();
        },
      });
    });

    it("Should get an AurusResponse when a ice value is not sent", (done: Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue({
        invokeFunction: sandbox.stub().returns(of(1)),
      });

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      delete request.body.amount;
      delete request.transaction.ice_value;

      service[3].capture(request).subscribe({
        next: (res: AurusResponse): void => {
          expect(res).not.to.be.undefined;
          done();
        },
      });
    });

    it("Should get an AurusResponse when a ice value is sent", (done: Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue({
        invokeFunction: sandbox.stub().returns(of(1)),
      });

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      delete request.body.amount;
      request.transaction.ice_value = 10;

      service[3].capture(request).subscribe({
        next: (res: AurusResponse): void => {
          expect(res).not.to.be.undefined;
          done();
        },
      });
    });
  });
});
