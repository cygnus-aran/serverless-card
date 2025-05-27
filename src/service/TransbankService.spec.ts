/**
 * TransbankService Unit Tests
 */
import {
  AurusError,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  KushkiError,
  StatusCodeEnum,
} from "@kushki/core";
import { TokenTypeEnum } from "@kushki/core/lib/infrastructure/TokenTypeEnum";
import { Context } from "aws-lambda";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CaptureMethodEnum } from "infrastructure/CaptureMethodEnum";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CompleteTransactionTypeEnum } from "infrastructure/CompleteTransactionTypeEnum";
import { CONTAINER } from "infrastructure/Container";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { ErrorCode, ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { WebpayIntegrationTypeEnum } from "infrastructure/WebpayIntegrationTypeEnum";
import { get, set } from "lodash";
import { Done } from "mocha";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { of, throwError } from "rxjs";
import { delay } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { LambdaTransactionRuleResponse } from "types/lambda_transaction_rule_response";
import { TimeoutTransactionsTables } from "types/timeout_transactions_tables";
import { TimeoutVars } from "types/timeout_vars";
import { TransbankCaptureResponse } from "types/transbank_capture_response";
import { TransbankChargeResponse } from "types/transbank_charge_response";
import { TransbankCredentials } from "types/transbank_credentials";

use(sinonChai);

let gToken: DynamoTokenFetch;
const TRX_REF = "1234-455559-tutu6";
const MID: string = "1291219939131";
let gChargesRequest: ChargesCardRequest;
let gCaptureReponse: TransbankCaptureResponse;

describe("TransbankService", () => {
  let box: SinonSandbox;
  let service: IProviderService[];
  let card_stub: SinonStub;
  let charge_response: TransbankChargeResponse;
  let request: ChargeInput;
  let capture_input: CaptureInput;
  let pre_auth_request: ChargeInput;
  let put_stub: SinonStub;

  function mockLambdaContextAndRollbar(): void {
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(Mock.of());
    CONTAINER.unbind(CORE.RollbarInstance);
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        critical: box.stub(),
        warn: box.stub(),
        warning: box.stub(),
      })
    );
  }

  function mockRuleTrx(
    objectRequest: ChargeInput,
    completeType: "soap" | "rest" | "mall"
  ) {
    objectRequest.trxRuleResponse = {
      body: {
        completeTransactionType: completeType,
        privateId: "23232",
        processor: "tezt",
        publicId: "3y2u3y2u",
      },
    };
  }

  // tslint:disable-next-line:max-func-body-length
  function setInitialData(): void {
    gChargesRequest = Mock.of<ChargesCardRequest>({
      amount: {
        iva: 342423,
        subtotalIva: 42432,
        subtotalIva0: 4234,
      },
      tokenId: "asdad",
      usrvOrigin: UsrvOriginEnum.CARD,
    });
    gToken = Mock.of<DynamoTokenFetch>({
      amount: 4444,
      bin: "123132",
      binInfo: {
        brand: "VISA",
        info: {
          type: "credit",
        },
      },
      cardHolderName: "MAX POWERS",
      created: 2131312,
      currency: "USD",
      id: "sadasd",
      ip: "ip",
      lastFourDigits: "4344",
      maskedCardNumber: "23424werwe",
      merchantId: "dasdasd",
      transactionReference: "reasa",
    });
    charge_response = Mock.of<TransbankChargeResponse>({
      approvalCode: "string",
      approvedTransactionAmount: 100,
      buyOrder: "001",
      conciliationId: "string",
      creditType: "VN",
      numberOfMonths: 0,
      requestedAmount: 100,
      responseCode: "string",
      responseText: "string",
      ticketNumber: "123123",
      transactionId: "001",
    });
    request = Mock.of<ChargeInput>({
      amount: {
        iva: 12,
        subtotalIva: 101,
        subtotalIva0: 0,
      },
      authorizerContext: {
        credentialId: "123",
        merchantId: "0000",
      },
      currentMerchant: {
        merchant_name: "XX STORE",
        public_id: "1111",
        whiteList: true,
      },
      currentToken: {
        ...gToken,
        transactionReference: TRX_REF,
      },
      event: {
        ...gChargesRequest,
        tokenObject: gToken,
      },
      plccInfo: { flag: "" },
      processor: {
        acquirer_bank: "BANKCITO",
        private_id: MID,
        processor_name: "Try",
        public_id: "112",
      },
      transactionType: "charge",
    });
    pre_auth_request = Mock.of<ChargeInput>({
      amount: {
        iva: 12,
        subtotalIva: 101,
        subtotalIva0: 0,
      },
      authorizerContext: {
        credentialId: "123",
        merchantId: "0000",
      },
      currentMerchant: {
        public_id: "123123",
        whiteList: true,
      },
      currentToken: {
        ...gToken,
        transactionReference: TRX_REF,
      },
      event: {
        ...gChargesRequest,
        tokenObject: gToken,
      },
      plccInfo: { flag: "" },
      processor: {
        private_id: MID,
        processor_name: "Try",
        public_id: "112",
      },
      transactionType: "charge",
    });
    process.env.USRV_STAGE = "qa";
  }

  function mockLambdaGateway(invokeFunctionStub: SinonStub): void {
    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invokeFunctionStub,
      })
    );
  }

  function genericSuccessExpect(response, stub: SinonStub, done) {
    expect(response).not.to.be.undefined;
    expect(stub).to.be.calledOnce;
    expect(response).to.be.deep.contain({ transaction_id: "001" });
    expect(response).to.be.deep.contain({ creditType: "VN" });
    expect(response.completeTransactionType).to.be.undefined;
    done();
  }

  function mockDynamo(): void {
    put_stub = box.stub().returns(of(true));
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );
  }

  function setTimeoutVars(value: number): void {
    const tables: TimeoutVars = {
      fis: value,
      redeban: value,
      transbank: value,
    };

    process.env.TIMEOUT_VARS = JSON.stringify(tables);
  }

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    mockLambdaContextAndRollbar();
    setInitialData();
    setTimeoutVars(15000);
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function commonMockCardStub(): void {
    card_stub = box.stub().returns(of({ body: charge_response }));
  }

  function expectIsCommission(done: Done): void {
    expect(card_stub.args[0][1].chargeRequest).to.be.eqls({
      currency: CurrencyEnum.CLP,
      gracePeriod: false,
      referenceNumber: request.currentToken.transactionReference,
      shareNumber: request.amount.totalAmount,
      totalAmount: request.amount.totalAmount,
    });
    expect(card_stub.args[0][1].merchantId).to.be.eqls(
      request.currentMerchant.public_id
    );
    expect(card_stub.args[0][1].merchantName).to.be.eqls(
      request.currentMerchant.merchant_name
    );
    expect(card_stub.args[0][1].processorId).to.be.eqls(
      ProcessorEnum.TRANSBANK
    );
    expect(card_stub.args[0][1].tokenVault).to.be.eqls(
      request.currentToken.vaultToken
    );
    done();
  }

  function commonExpectChargeSuccess(done: Done, isCommission: boolean): void {
    commonMockCardStub();
    mockLambdaGateway(card_stub);
    service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
    service[6].charge(request).subscribe({
      next: (response) => {
        if (isCommission) expectIsCommission(done);
        else genericSuccessExpect(response, card_stub, done);
      },
    });
  }

  describe("Charges Method", () => {
    it("Succes when chargesTransaction is called", (done: Done) => {
      commonExpectChargeSuccess(done, false);
    });

    it("Succes when chargesTransaction is called with usrvOrigin usrv-commission", (done: Done) => {
      request.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      request.currentToken.transactionReference = "123123123123";
      request.amount = {
        iva: 342423,
        subtotalIva: 42432,
        subtotalIva0: 4234,
        totalAmount: 22222,
      };
      request.currentMerchant.public_id = "666";
      request.currentMerchant.merchant_name = "samael";
      set(request, "trxRuleResponse.body.processor", ProcessorEnum.TRANSBANK);
      request.currentToken.vaultToken = "999";

      commonExpectChargeSuccess(done, true);
    });

    it("chargesTransaction should fall in timeout and launch and error", (done: Done) => {
      setTimeoutVars(30);
      const expected_error_details: object = {
        approvalCode: "000000",
        binCard: "123132",
        cardHolderName: "MAX POWERS",
        cardType: "VISA",
        conciliationId: "",
        isDeferred: "N",
        lastFourDigitsOfCard: "4344",
        merchantName: "XX STORE",
        processorBankName: "BANKCITO",
        processorName: "Transbank Processor",
      };
      const details_key: string = "transaction_details";
      const tables: TimeoutTransactionsTables = {
        fis: "fis-timeout-table",
        redeban: "redeban-timeout-table",
        transbank: "transbank-timeout-table",
      };

      process.env.TIMEOUT_TRANSACTIONS_TABLES = JSON.stringify(tables);

      card_stub = box.stub().returns(of({}).pipe(delay(400)));

      mockLambdaGateway(card_stub);
      mockDynamo();

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        error: (err: AurusError) => {
          expect(err).not.to.be.undefined;
          expect(err.code).to.be.eqls("228");
          expect(err.getMetadata()[details_key]).to.be.eqls(
            expected_error_details
          );
          done();
        },
      });
    });

    it("chargesTransaction should throw an Aurus error", (done: Done) => {
      card_stub = box.stub().rejects(
        new KushkiError({
          code: "TB600",
          message: "Transacción declinada",
          statusCode: StatusCodeEnum.BadRequest,
        })
      );
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        error: (error: Error) => {
          expect(error instanceof AurusError).to.be.true;
          done();
        },
      });
    });

    it("chargesTransaction should throw a kushki error", (done: Done) => {
      card_stub = box.stub().rejects(
        new KushkiError({
          code: "TB300",
          message: "Transacción muerta",
          statusCode: StatusCodeEnum.BadRequest,
        })
      );
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        error: (error: Error) => {
          expect(error instanceof KushkiError).to.be.true;
          done();
        },
      });
    });

    it("chargesTransaction should throw any other Error", (done: Done) => {
      card_stub = box.stub().rejects(new Error("ANY ERROR"));
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        error: (error: KushkiError) => {
          expect(error.getMessage()).to.be.eqls(
            "Ha ocurrido un error inesperado"
          );
          done();
        },
      });
    });

    it("Succes when chargesTransaction is called with tokenType and vaultToken", (done: Done) => {
      commonMockCardStub();
      mockLambdaGateway(card_stub);
      request.currentToken.tokenType = TokenTypeEnum.SUBSCRIPTION;
      request.currentToken.vaultToken =
        "389489348984393479623981279khdjshjaksgdsi";
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        next: (response) => {
          genericSuccessExpect(response, card_stub, done);
        },
      });
    });

    it("Success when chargesTransaction is called with months", (done: Done) => {
      set(request, "event.months", 5);
      set(request, "event.deferred", undefined);
      commonMockCardStub();
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        next: (response) => {
          genericSuccessExpect(response, card_stub, done);
        },
      });
    });

    it("when make a charge, it should return a kushki error 600 - with usrvOrigin usrv-commission", (done: Mocha.Done) => {
      const response_text: string = "Invalid card";
      const charge_stub: SinonStub = box.stub().throws(
        new KushkiError(ERRORS.E600, "Rejected transaction", {
          response_text,
          response_code: "018",
        })
      );

      request.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
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

    it("when make a charge, it should return a kushki error 500 - with usrvOrigin usrv-commission", (done: Mocha.Done) => {
      const response_text: string = "Processor unreachable";
      const charge_stub: SinonStub = box.stub().throws(
        new KushkiError(ERRORS.E500, "Rejected Ip", {
          response_text,
          response_code: "500",
        })
      );

      request.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        error: (err: AurusError): void => {
          expect(err.code).to.be.equal("500");
          expect(err.getMessage()).to.be.equal(response_text);
          expect(get(err.getMetadata(), "processorName")).to.be.equal(
            ProcessorEnum.TRANSBANK
          );
          done();
        },
      });
    });

    it("when make a charge, it should return a kushki error not registered - with usrvOrigin usrv-commission", (done: Mocha.Done) => {
      const charge_stub: SinonStub = box.stub().throws(
        new KushkiError(ERRORS.E006, "Informacion invalida", {
          response_code: "",
          response_text: "Axios error",
        })
      );

      request.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
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

    it("when make a charge, it should return an error unhandled - with usrvOrigin usrv-commission", (done: Mocha.Done) => {
      const charge_stub: SinonStub = box.stub().throws(new Error("error"));

      request.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        error: (err: Error): void => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.be.equal("error");
          done();
        },
      });
    });

    it("Success when chargesTransaction is called with completeTransactionType rest", (done: Done) => {
      card_stub = box.stub().returns(of({ body: charge_response }));
      mockRuleTrx(request, WebpayIntegrationTypeEnum.REST);
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        next: (response) => {
          genericSuccessExpect(response, card_stub, done);
        },
      });
    });

    it("should return error 228 when charge is called and invocation to Transbank lambda throws timeout error", (done: Done) => {
      const tables: TimeoutTransactionsTables = {
        fis: "fis-test",
        redeban: "redeban-test",
        transbank: "transbank-test",
      };

      setTimeoutVars(0);
      process.env.TIMEOUT_TRANSACTIONS_TABLES = JSON.stringify(tables);
      mockDynamo();
      card_stub = box.stub().throws(new KushkiError(ERRORS.E027));
      mockRuleTrx(request, WebpayIntegrationTypeEnum.REST);
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.equal("228");
          expect(err.message).to.contain("Procesador inalcanzable");
          done();
        },
      });
    });

    it("should return given error when charge is called and invocation to Transbank lambda throws error", (done: Done) => {
      const tables: TimeoutTransactionsTables = {
        fis: "fis-test",
        redeban: "redeban-test",
        transbank: "transbank-test",
      };

      setTimeoutVars(0);
      process.env.TIMEOUT_TRANSACTIONS_TABLES = JSON.stringify(tables);
      mockDynamo();
      card_stub = box.stub().throws(new KushkiError(ERRORS.E047));
      mockRuleTrx(request, WebpayIntegrationTypeEnum.REST);
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.equal("K047");
          done();
        },
      });
    });

    it("Success when chargesTransaction is called with completeTransactionType mall", (done: Done) => {
      card_stub = box.stub().returns(of({ body: charge_response }));
      mockRuleTrx(request, WebpayIntegrationTypeEnum.MALL);
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        next: (response) => {
          genericSuccessExpect(response, card_stub, done);
        },
      });
    });

    it("Success when chargesTransaction is called with completeTransactionType soap", (done: Done) => {
      card_stub = box.stub().returns(of({ body: charge_response }));
      mockRuleTrx(request, WebpayIntegrationTypeEnum.SOAP);
      mockLambdaGateway(card_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[6].charge(request).subscribe({
        next: (response) => {
          genericSuccessExpect(response, card_stub, done);
        },
      });
    });

    describe("preAuthorization Method", () => {
      it("Succes when preAuthorization is called", (done: Done) => {
        commonMockCardStub();
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].preAuthorization(pre_auth_request).subscribe({
          next: (response) => {
            genericSuccessExpect(response, card_stub, done);
          },
        });
      });

      it("Succes when preAuthorization is called with completeType rest", (done: Done) => {
        card_stub = box.stub().returns(of({ body: charge_response }));
        mockRuleTrx(pre_auth_request, WebpayIntegrationTypeEnum.REST);
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].preAuthorization(pre_auth_request).subscribe({
          next: (response) => {
            genericSuccessExpect(response, card_stub, done);
          },
        });
      });

      it("Succes when preAuthorization is called with completeType mall", (done: Done) => {
        card_stub = box.stub().returns(of({ body: charge_response }));
        mockRuleTrx(pre_auth_request, WebpayIntegrationTypeEnum.MALL);
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].preAuthorization(pre_auth_request).subscribe({
          next: (response) => {
            genericSuccessExpect(response, card_stub, done);
          },
        });
      });

      it("Succes when preAuthorization is called with completeType soap", (done: Done) => {
        card_stub = box.stub().returns(of({ body: charge_response }));
        mockRuleTrx(pre_auth_request, WebpayIntegrationTypeEnum.SOAP);
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].preAuthorization(pre_auth_request).subscribe({
          next: (response) => {
            genericSuccessExpect(response, card_stub, done);
          },
        });
      });
    });

    describe("reAuthorization Method", () => {
      function testMethondError(err: KushkiError, done: Mocha.Done): void {
        expect(err.code).to.be.eq("K041");
        expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
        expect(err).to.be.instanceOf(KushkiError);
        done();
      }

      it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Done) => {
        card_stub = box.stub().returns(of({ body: charge_response }));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[CardProviderIndexEnum.Transbank]
          .reAuthorization(undefined, undefined, undefined)
          .subscribe({
            error: (err: KushkiError) => {
              testMethondError(err, done);
            },
          });
      });
      it("should throw K041 error when the method validateAccount is not supported by the processor", (done: Done) => {
        card_stub = box.stub().returns(of({ body: charge_response }));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[CardProviderIndexEnum.Transbank]
          .validateAccount(undefined, undefined)
          .subscribe({
            error: (err: KushkiError) => {
              testMethondError(err, done);
            },
          });
      });
    });

    describe("capture Method", () => {
      beforeEach(() => {
        gCaptureReponse = {
          approvalCode: "1",
          approvedTransactionAmount: "100",
          buyOrder: "001",
          requestedAmount: "100",
          responseCode: "01",
          responseText: "ok",
        };
        const context: Context = Mock.of<Context>({
          getRemainingTimeInMillis: box.stub().returns(29000),
        });
        const trx_rule_resp: LambdaTransactionRuleResponse =
          Mock.of<LambdaTransactionRuleResponse>({
            completeTransactionType: "soap",
          });

        capture_input = Mock.of<CaptureInput>({
          body: {
            amount: {
              iva: 12,
              subtotalIva: 101,
              subtotalIva0: 0,
            },
            ticketNumber: "eadadas",
          },
          context: { ...context },
          merchantId: "123123",
          processor: {
            private_id: MID,
            processor_name: "Try",
            public_id: "112",
          },
          transaction: {
            approval_code: "21321",
            approved_transaction_amount: 344,
            bin_card: "333333",
            card_holder_name: "name",
            created: 123242342,
            currency_code: "COP",
            iva_value: 5,
            last_four_digits: "1234",
            merchant_id: "mid",
            merchant_name: "asfsf",
            payment_brand: "visa",
            processor_bank_name: "gdgfd",
            processor_id: "id",
            processor_name: "zxvzv",
            recap: "adas",
            request_amount: 344,
            subtotal_iva: 5,
            subtotal_iva0: 2,
            sync_mode: "api",
            ticket_number: "11111",
            transaction_id: "2333333",
            transaction_status: "status",
            transaction_type: "type",
          },
          trxReference: "123123123",
          trxRuleResponse: {
            body: trx_rule_resp,
          },
          usrvOrigin: UsrvOriginEnum.CARD,
        });
      });

      it("Succes when captureTransaction is called for card", (done: Done) => {
        gCaptureReponse.transactionId = "2333333";
        gCaptureReponse.creditType = "VN";
        card_stub = box.stub().returns(of({ body: gCaptureReponse }));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].capture(capture_input).subscribe({
          next: (response) => {
            expect(response).not.to.be.undefined;
            expect(response).to.be.deep.contain({ transaction_id: "2333333" });
            expect(response).to.be.deep.contain({ creditType: "VN" });
            expect(card_stub).to.be.calledOnce;
            done();
          },
        });
      });

      it("When completeTransactionType is rest, it must invoke card-transbank-capture and send extra fields", (done: Done) => {
        card_stub = box.stub().returns(of({ body: gCaptureReponse }));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        capture_input.trxRuleResponse.body.completeTransactionType =
          CompleteTransactionTypeEnum.REST;
        service[6].capture(capture_input).subscribe({
          next: () => {
            expect(card_stub).to.be.calledOnce;
            expect(card_stub.args[0][1]).to.haveOwnProperty("credentials");
            expect(card_stub.args[0][0]).to.includes(
              "usrv-card-transbank-qa-capture"
            );
            expect(card_stub.args[0][1]).to.haveOwnProperty(
              "completeTransactionType"
            );
            done();
          },
        });
      });

      it("When capture falls in timeout, it must return 228 aurus error and save the transaction", (done: Done) => {
        const tables: TimeoutTransactionsTables = {
          fis: "fis-timeout-table",
          redeban: "redeban-timeout-table",
          transbank: "transbank-timeout-table",
        };

        setTimeoutVars(0);
        process.env.TIMEOUT_TRANSACTIONS_TABLES = JSON.stringify(tables);
        card_stub = box.stub().returns(of({}).pipe(delay(400)));
        mockLambdaGateway(card_stub);
        mockDynamo();
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        capture_input.trxRuleResponse.body.completeTransactionType =
          CompleteTransactionTypeEnum.REST;
        service[6].capture(capture_input).subscribe({
          error: (error: AurusError): void => {
            expect(error.code).to.be.eqls("228");
            expect(card_stub).to.be.calledOnce;
            expect(put_stub).to.be.calledOnce;
            done();
          },
        });
      });

      it("Succes when captureTransaction is called for subscriptions", (done: Done) => {
        gCaptureReponse.transactionId = "2333333";
        card_stub = box.stub().returns(of({ body: gCaptureReponse }));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        capture_input.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
        service[6].capture(capture_input).subscribe({
          next: (response) => {
            expect(response).to.be.haveOwnProperty("transaction_details");
            expect(card_stub).to.be.calledOnce;
            done();
          },
        });
      });

      it("when capture is called with kshCapture method and invoke lambda fails, should throw error (600)", () => {
        card_stub = box.stub().returns(
          throwError(
            new KushkiError({
              code: ErrorCode.E600,
              message: "Operación Rechazada",
              statusCode: StatusCodeEnum.BadRequest,
            })
          )
        );
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].capture(capture_input).subscribe({
          error: (error: KushkiError): void => {
            expect(error).to.be.instanceof(AurusError);
            expect(error).to.have.deep.property("code");
            expect(error).to.have.deep.property("message");
            expect(error.getMetadata()).to.have.deep.property("processorCode");
            expect(error.getMetadata()).to.have.deep.property(
              "processorName",
              ProcessorEnum.TRANSBANK
            );
            expect(card_stub).to.have.been.calledOnce;
            expect(card_stub.args[0][0]).to.be.includes(
              CaptureMethodEnum.KSH_CAPTURE
            );
          },
        });
      });

      it("when capture is called with kshCapture method and invoke lambda fails, should throw error (other)", () => {
        card_stub = box
          .stub()
          .returns(throwError(() => new KushkiError(ERRORS.E020)));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].capture(capture_input).subscribe({
          error: (error: KushkiError): void => {
            expect(error).to.be.instanceof(KushkiError);
            expect(card_stub).to.have.been.calledOnce;
            expect(card_stub.args[0][0]).to.be.includes(
              CaptureMethodEnum.KSH_CAPTURE
            );
          },
        });
      });

      it("when capture is called with kshCapture method and invoke lambda fails, should throw error E047", () => {
        card_stub = box.stub().returns(throwError(Error("panic error!")));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].capture(capture_input).subscribe({
          error: (error: KushkiError): void => {
            expect(error).to.be.instanceof(KushkiError);
            expect(error.code).to.be.eql("K047");
            expect(error.getMessage()).to.be.eql(ERRORS.E047.message);
            expect(card_stub).to.have.been.calledOnce;
            expect(card_stub.args[0][0]).to.be.includes(
              CaptureMethodEnum.KSH_CAPTURE
            );
          },
        });
      });
    });

    describe("tokens Method", () => {
      let token_request_mock: AurusTokenLambdaRequest;

      beforeEach(() => {
        process.env.USRV_STAGE = "qa";
        token_request_mock = Mock.of<AurusTokenLambdaRequest>({
          merchantId: "merchantId",
          totalAmount: 100,
          vaultToken: "vaultToken",
        });
      });

      it("Success when tokens transaction is called", (done: Done) => {
        const response_token = {
          token: "token",
        };

        card_stub = box.stub().returns(of(response_token));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        token_request_mock.tokenType = TokenTypeEnum.TRANSACTION;
        service[6].tokens(token_request_mock).subscribe({
          next: (response) => {
            expect(response).not.to.be.undefined;
            expect(response).to.be.deep.contain(response_token);
            expect(card_stub).to.be.calledTwice;
            expect(card_stub.args[1][0]).to.be.eql(
              "usrv-wssecurity-processor-qa-token"
            );
            done();
          },
        });
      });

      it("Success when tokens is called with tokenType subscription", (done: Done) => {
        const response_token = {
          token: "18685979e2544cd896f5cb7657881558",
        };

        card_stub = box.stub().returns(of(response_token));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        token_request_mock.tokenType = TokenTypeEnum.SUBSCRIPTION;
        service[6].tokens(token_request_mock).subscribe({
          next: (response) => {
            expect(response).not.to.be.undefined;
            expect(card_stub).not.to.be.called;
            done();
          },
        });
      });

      it("When the request includes completeTransactionType === mall | rest, then invoke lambda usrv-card-transbank", (done: Done) => {
        const response_token = {
          token: "im-a-token",
        };

        const credentials: TransbankCredentials = {
          completeTransaction: {
            saleWithCvv: {
              apikey: "123456",
              commerceCode: "123456789012",
            },
          },
          completeTransactionMall: {
            captureWithCvv: {
              commerceCode: "123456789012",
            },
          },
        };

        token_request_mock = Mock.of<AurusTokenLambdaRequest>({
          credentials,
          completeTransactionType: "mall",
          merchantId: "merchantId-01",
          totalAmount: 200,
          vaultToken: "vaultToken",
        });

        card_stub = box.stub().returns(of(response_token));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].tokens(token_request_mock).subscribe({
          next: (response) => {
            expect(response).to.be.deep.contain(response_token);
            expect(card_stub).to.be.calledTwice;
            expect(card_stub.args[0][0]).to.be.eql(
              "usrv-card-transbank-qa-token"
            );
            expect(card_stub.args[0][1]).to.haveOwnProperty(
              "completeTransactionType"
            );
            expect(card_stub.args[0][1]).to.haveOwnProperty("credentials");
            done();
          },
        });
      });

      it("When the request includes completeTransactionType === mall | rest, then invoke lambda usrv-card-transbank", (done: Done) => {
        const response_token = {
          token: "im-a-token",
        };

        const credentials: TransbankCredentials = {
          completeTransaction: {
            saleWithCvv: {
              apikey: "123456",
              commerceCode: "123456789012",
            },
          },
          completeTransactionMall: {
            captureWithCvv: {
              commerceCode: "123456789012",
            },
          },
        };

        token_request_mock = Mock.of<AurusTokenLambdaRequest>({
          credentials,
          completeTransactionType: "mall",
          merchantId: "merchantId-01",
          totalAmount: 200,
          vaultToken: "vaultToken",
        });

        card_stub = box.stub().returns(of(response_token));
        mockLambdaGateway(card_stub);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[6].tokens(token_request_mock).subscribe({
          next: (response) => {
            expect(response).to.be.deep.contain(response_token);
            expect(card_stub).to.be.calledTwice;
            expect(card_stub.args[0][1]).to.haveOwnProperty(
              "completeTransactionType"
            );
            expect(card_stub.args[0][1]).to.haveOwnProperty("credentials");
            done();
          },
        });
      });
    });
  });
});
