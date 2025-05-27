/**
 * KushkiAcqService Unit Tests
 */
import {
  AurusError,
  KushkiError,
  KushkiErrorAttr,
  StatusCodeEnum,
} from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import { ErrorAcqCode, ERRORS_ACQ } from "infrastructure/ErrorAcqEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ErrorMapAcqEnum } from "infrastructure/ErrorMapAcqEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { SubscriptionTriggerEnum } from "infrastructure/SubscriptionEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, isEmpty, isUndefined, set, unset } from "lodash";
import { Done } from "mocha";
import { IAcqGateway } from "repository/IAcqGateway";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { delay } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { KushkiAcqService } from "service/KushkiAcqService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CaptureCardRequest } from "types/capture_card_request";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoBinFetch } from "types/dynamo_token_fetch";
import { KushkiAcqVars } from "types/kushki_acq_vars";
import {
  LambdaTransactionRuleBodyResponse,
  LambdaTransactionRuleResponse,
} from "types/lambda_transaction_rule_response";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";

use(sinonChai);

describe("KushkiAcqService", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];
  let capture_request_mock: CaptureInput;
  let invoke_response_mock: AurusResponse;
  let invoke_stub: SinonStub;
  let put_stub: SinonStub;
  let query_stub: SinonStub;
  let error_message: string;
  let metadata: object;
  let token_stub: SinonStub;
  let token_response_mock: TokensCardResponse;
  const other_error: string = "Other Error";
  const unreachable_error: string = "Unreachable processor";
  const rejected_error: string = "Rejected transaction";
  const unreachable_processor_500: string = "Procesador Inalcanzable";
  const unreachable_processor_504: string = "Procesador inalcanzable";
  const old_env = process.env;
  const indicator_3ds: string = "F";
  const fake_subscription_id: string = "fakeID";

  function mockEnvVars(isDelay?: boolean): void {
    const env_vars: KushkiAcqVars = {
      CAPTURE_PERCENTAGE: 10,
      LAMBDA_CAPTURE: "usrv-card-acq-test-capture",
      LAMBDA_CHARGE: "usrv-card-acq-test-charge",
      LAMBDA_PREAUTHORIZATION: "usrv-card-acq-test-preauth",
      LAMBDA_REAUTHORIZATION: "usrv-card-acq-test-reauth",
      SWITCH_INT_DEFERRED: false,
      TABLE_TIMEOUTS: "usrv-card-test-timeoutTransactions",
      TIMEOUT: isDelay ? "0" : "500",
    };

    process.env.KUSHKI_ADQUIRER_VARS = JSON.stringify(env_vars);
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
    capture_request_mock = Mock.of<CaptureInput>({
      body: Mock.of<CaptureCardRequest>({}),
      processor: Mock.of<DynamoProcessorFetch>({
        processor_name: ProcessorEnum.KUSHKI,
      }),
      transaction: Mock.of<Transaction>({
        preauth_transaction_reference: Date.now().toString(),
        transaction_reference: Date.now().toString(),
      }),
      trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({
        body: Mock.of<LambdaTransactionRuleResponse>({
          processor: ProcessorEnum.KUSHKI,
        }),
      }),
    });
    invoke_response_mock = Mock.of<AurusResponse>({
      response_code: "000",
      transaction_reference: trxReference,
    });
  }

  function mockAcqGateway(codeError: string, isDelay?: boolean): void {
    mockEnvVars(isDelay);
    invoke_stub = isDelay
      ? sandbox.stub().returns(of(invoke_response_mock).pipe(delay(400)))
      : sandbox.stub().returns(of(invoke_response_mock));

    invoke_stub = isEmpty(codeError)
      ? invoke_stub
      : sandbox
          .stub()
          .rejects(
            codeError === other_error
              ? new Error(codeError)
              : new KushkiError(
                  ERRORS_ACQ[codeError],
                  ERRORS_ACQ[codeError].message,
                  metadata
                )
          );

    CONTAINER.rebind(IDENTIFIERS.AcqGateway).toConstantValue(
      Mock.of<IAcqGateway>({
        charge: invoke_stub,
        preAuthorization: invoke_stub,
        reAuthorization: invoke_stub,
        validateAccount: invoke_stub,
      })
    );
  }

  function mockDynamoGateway(): void {
    put_stub = sandbox.stub().returns(of(true));
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
        query: query_stub,
      })
    );
  }

  function testNotImplementedError(
    err: KushkiError | Error,
    errorCode: string,
    done: Done
  ): void {
    expect(get(err, "code", err.message)).to.be.equal(errorCode);
    done();
  }

  function testAurusError(
    err: AurusError | Error,
    msg: string,
    done: Done
  ): void {
    expect(err instanceof AurusError).to.be.true;
    expect(err.name).contains("AURUS");
    expect(err).not.to.be.undefined;
    expect(err.message).to.be.contains(msg);
    done();
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
    process.env = { ...old_env };
    CONTAINER.snapshot();
    sandbox = createSandbox();
    token_response_mock = Mock.of<TokensCardResponse>({
      token: "token",
    });
    token_stub = sandbox.stub().returns(of(token_response_mock));
    mockData("Test");
    mockCore();
    mockAurus();
  });

  afterEach(() => {
    CONTAINER.restore();
    sandbox.restore();
  });

  describe("tokens", () => {
    it("should make a tokens", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.KushkiAcq].tokens(undefined).subscribe({
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

      service[CardProviderIndexEnum.KushkiAcq].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
  });

  describe("buildCaptureRequestKushki", () => {
    const last_transaction_id = "last-transaction";
    const transaction_id = "transaction";

    describe("when there's a subsequent transaction 'reauth'", () => {
      it("should take the processor_transaction_id of the last transaction", () => {
        expect(
          KushkiAcqService.buildCaptureRequestKushki(
            Mock.of<CaptureInput>({
              body: {},
              lastTransaction: {
                processor_transaction_id: last_transaction_id,
              },
              transaction: {
                processor_transaction_id: transaction_id,
              },
            })
          ).transaction_reference
        ).to.be.equal(last_transaction_id);
      });
    });

    describe("when there's NOT a subsequent transaction 'reauth'", () => {
      it("should take the processor_transaction_id of the precedent preauth transaction", () => {
        expect(
          KushkiAcqService.buildCaptureRequestKushki(
            Mock.of<CaptureInput>({
              body: {},
              transaction: {
                processor_transaction_id: transaction_id,
              },
            })
          ).transaction_reference
        ).to.be.equal(transaction_id);
      });
    });

    describe("when the amount object is present in the request", () => {
      it("should calculate the amount based on that object", () => {
        expect(
          KushkiAcqService.buildCaptureRequestKushki(
            Mock.of<CaptureInput>({
              body: {
                amount: {
                  ice: 2,
                  subtotalIva: 2,
                  subtotalIva0: 1.5,
                },
              },
            })
          ).amount
        ).to.be.equal("5.5");
      });
    });
  });

  describe("capture", () => {
    let put_fields: string[];

    beforeEach(() => {
      put_fields = [
        "amount",
        "bin_info",
        "preauth_transaction_reference",
        "transaction_reference",
        "transaction_status",
      ];
      setAcqEnvVars();
    });

    afterEach(() => {
      process.env.KUSHKI_ADQUIRER_VARS = undefined;
    });

    function mockCaptureAcq(captureStub: SinonStub) {
      CONTAINER.unbind(IDENTIFIERS.AcqGateway);
      CONTAINER.bind(IDENTIFIERS.AcqGateway).toConstantValue(
        Mock.of<IAcqGateway>({
          capture: captureStub,
        })
      );
    }

    function setAcqEnvVars() {
      process.env.KUSHKI_ADQUIRER_VARS = `{
        "LAMBDA_CAPTURE": "usrv-card-acq-qa-capture",
        "LAMBDA_CHARGE": "usrv-card-acq-qa-charge",
        "TABLE_TIMEOUTS": "usrv-acq-ecommerce-qa-timedOutTransactions",
        "LAMBDA_PREAUTHORIZATION": "usrv-card-acq-qa-preAuthorization",
        "LAMBDA_REAUTHORIZATION": "usrv-card-acq-qa-reAuthorization"
      }`;
    }

    const common_acq_successful_response = {
      approval_code: "R02902",
      authorized_amount: 11000,
      authorizer: "MASTERCARD",
      kushki_response: {
        code: "000",
        message: "Approved or completed successfully.",
      },
      reference_number: "308117182935",
      relevant_fields: {
        indicator_3ds,
      },
      stan: "182935",
      transaction_reference: "40d32be8-765f-4311-b9ae-051f2068b4d6",
      transaction_status: "approved",
      transaction_type: "sale",
    };

    it("should make a capture with kushkiAcq", (done: Done) => {
      const capture_stub = sandbox
        .stub()
        .returns(of(common_acq_successful_response));

      mockCaptureAcq(capture_stub);
      mockDynamoGateway();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .capture(capture_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(rs.indicator_3ds).to.be.equal(indicator_3ds);
            expect(capture_stub).to.be.have.callCount(1);
            expect(put_stub).to.be.have.callCount(0);
            done();
          },
        });
    });

    it("should make a capture fall timeout and put dynamo", (done: Done) => {
      const capture_stub = sandbox
        .stub()
        .returns(of(common_acq_successful_response).pipe(delay(400)));

      mockCaptureAcq(capture_stub);
      mockDynamoGateway();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .capture(capture_request_mock)
        .subscribe({
          error: (err: Error): void => {
            expect(get(err, "message")).to.be.contains(
              unreachable_processor_504
            );
            expect(capture_stub).to.be.have.callCount(1);
            expect(put_stub).to.be.have.callCount(1);
            expect(put_stub.args[0][0]).to.have.keys(put_fields);
            expect(err).not.to.be.undefined;
            done();
          },
        });
    });

    it("should do a capture, invoke to kushkiAcq and return an error E500", (done: Done) => {
      const response_text: string = ERRORS_ACQ.E500.message.toString();

      error_message = unreachable_error;
      metadata = {
        response_text,
        response_code: "500",
      };

      mockCaptureAcq(
        sandbox.stub().rejects(
          new KushkiError(ERRORS_ACQ[ErrorAcqCode.E500], error_message, {
            ...metadata,
          })
        )
      );
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .capture(capture_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            testAurusError(err, unreachable_processor_500, done);
          },
        });
    });

    it("should do a capture, invoke to kushkiAcq and return an error E600", (done: Done) => {
      const response_text: string = ERRORS_ACQ.E600.message.toString();

      error_message = rejected_error;
      metadata = {
        response_text,
        response_code: "600",
      };
      mockCaptureAcq(
        sandbox.stub().rejects(
          new KushkiError(ERRORS_ACQ[ErrorAcqCode.E600], error_message, {
            ...metadata,
          })
        )
      );
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .capture(capture_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            testAurusError(err, unreachable_processor_500, done);
          },
        });
    });

    it("should do a capture, invoke to kushkiAcq and return an error E012", (done: Done) => {
      mockCaptureAcq(
        sandbox.stub().rejects(
          new KushkiError(ERRORS_ACQ[ErrorAcqCode.E012], error_message, {
            ...metadata,
          })
        )
      );
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .capture(capture_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            testAurusError(err, unreachable_processor_504, done);
          },
        });
    });

    it("should do a capture, invoke to kushkiAcq and return generic Error", (done: Done) => {
      mockCaptureAcq(sandbox.stub().rejects(new Error(other_error)));
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .capture(capture_request_mock)
        .subscribe({
          error: (err: Error): void => {
            testNotImplementedError(err, "K002", done);
          },
        });
    });

    it("should do a capture, invoke to kushkiAcq and return error dont mapped ", (done: Done) => {
      capture_request_mock.lastTransaction = Mock.of<Transaction>({
        transaction_reference: "fake transaction reference",
      });
      mockCaptureAcq(
        sandbox.stub().rejects(
          new KushkiError(ERRORS_ACQ[ErrorAcqCode.E001], error_message, {
            ...metadata,
          })
        )
      );
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .capture(capture_request_mock)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err instanceof KushkiError).to.be.true;
            expect(err).not.to.be.undefined;
            done();
          },
        });
    });
  });

  describe("charge | preAuthorization", () => {
    let charge_request_mock: ChargeInput;
    let trx_reference: string;
    let charge_response_mock: AurusResponse;

    beforeEach(() => {
      const bin_info: DynamoBinFetch = Mock.of<DynamoBinFetch>({
        bank: "CITIBANAMEX",
        bin: "405306",
        brand: "VISA",
        info: {
          country: {
            name: "Mexico",
          },
          type: "credit",
        },
      });

      trx_reference = "b42dc604-9ef7-4292-9daf-2f53d33ef7b6";
      charge_request_mock = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "50e2c0a2755c4d08a346999c5a1d9313",
          hierarchyConfig: {
            processing: {
              basicInfo: "2999999999999999999",
            },
          },
          merchantId: "20000000105127023000",
        },
        currentMerchant: {
          merchant_name: "TEST KUSHKI",
          public_id: "20000000105127023000",
          whiteList: true,
        },
        currentToken: {
          amount: 100,
          bin: "402162",
          binInfo: bin_info,
          created: 2131312,
          currency: "USD",
          id: "transactionId",
          ip: "73.176.30.41",
          isBlockedCard: true,
          lastFourDigits: "4242",
          maskedCardNumber: "424242XXXXXX4242",
          merchantId: "20000000105127023000",
          transactionCardId: "transactionCardIdTest",
          transactionReference: trx_reference,
          vaultToken: "some_token",
        },
        event: {
          amount: {
            iva: 0,
            subtotalIva: 0,
            subtotalIva0: 0,
          },
          binInfo: bin_info,
          metadata: {
            ksh_subscriptionValidation: true,
          },
          subscriptionId: fake_subscription_id,
          subscriptionTrigger: SubscriptionTriggerEnum.ON_DEMAND,
          tokenId: "z8aPSl1000003VDCXU067369aOSyN7Fk",
          usrvOrigin: UsrvOriginEnum.SUBSCRIPTIONS,
        },
        plccInfo: { flag: "" },
        processor: {
          private_id: "1000000673693349363715774685521",
          processor_name: "Some Kushki Processor",
          public_id: "100000067369334936371577468552120000000103114420000",
        },
        transactionType: "charge",
      });
      charge_response_mock = Mock.of<AurusResponse>({
        relevant_fields: {
          indicator_3ds,
        },
        response_code: "00",
        transaction_reference: trx_reference,
      });

      put_stub = sandbox.stub().returns(of(true));
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
        })
      );
    });

    afterEach(() => {
      process.env.KUSHKI_ACQ_TIME_OUT = "30000";
    });

    function commonExpectChargeSuccess(done: Done, isCard: boolean): void {
      invoke_response_mock = Mock.of<AurusResponse>({
        ...charge_response_mock,
      });
      charge_request_mock.isAft = true;
      mockAcqGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(rs.indicator_3ds).eq(indicator_3ds);
            expect(rs.transaction_reference).eq(trx_reference);
            expect(rs.response_code).eq("000");
            expect(invoke_stub).calledOnce;
            const acq_gtw_call = invoke_stub.firstCall.firstArg;

            if (isCard) {
              expect(acq_gtw_call.card.months).to.be.eqls(
                charge_request_mock.event.deferred?.months
              );
              expect(acq_gtw_call.card.deferred).to.be.eqls(
                charge_request_mock.event.deferred
              );
              expect(acq_gtw_call.cardId).to.be.eqls(
                charge_request_mock.currentToken.transactionCardId
              );
              expect(acq_gtw_call.isBlockedCard).to.be.true;
            }
            if (acq_gtw_call.isSubscription)
              expect(acq_gtw_call.subscriptionTrigger).to.be.eqls(
                charge_request_mock.event.subscriptionTrigger
              );
            done();
          },
        });
    }

    it("When Charge is called, should return aurus response", (done: Done) => {
      commonExpectChargeSuccess(done, false);
    });

    it("When Charge is called and is subscription cof subsequent onDemand, should return aurus response", (done: Done) => {
      charge_request_mock.event.metadata = {
        ksh_subscriptionValidation: false,
      };
      commonExpectChargeSuccess(done, false);
    });

    it("When Charge is called and is subscription cof subsequent scheduled, should return aurus response", (done: Done) => {
      charge_request_mock.event.metadata = {
        ksh_subscriptionValidation: false,
      };
      charge_request_mock.event.subscriptionTrigger =
        SubscriptionTriggerEnum.SCHEDULED;
      commonExpectChargeSuccess(done, false);
    });

    it("When Charge is called, should return aurus response with usrvOrigin usrv-card", (done: Done) => {
      charge_request_mock.event.deferred = {
        creditType: "1",
        graceMonths: "",
        months: 1,
      };
      charge_request_mock.cvv = "123";
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.CARD;
      commonExpectChargeSuccess(done, true);
    });

    it("When Charge is called, should return aurus response with deferred.months", (done: Done) => {
      charge_request_mock.event.months = 2;

      commonExpectChargeSuccess(done, true);
    });

    it("When charge is called and falls in timeout, should throw error when its time out", (done: Done) => {
      invoke_response_mock = Mock.of<AurusResponse>({
        ...charge_response_mock,
      });

      mockAcqGateway("", true);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          error: (error: AurusError): void => {
            expect(error.getMessage()).to.be.equal(unreachable_processor_504);
            expect(put_stub).to.have.been.calledOnce;
            expect(put_stub.args[0][0].transaction_reference).to.be.equal(
              charge_request_mock.currentToken.transactionReference
            );
            expect(invoke_stub).calledOnce;
            done();
          },
        });
    });

    it("When charge has a 3DS object request, should generate a charge", (done: Done) => {
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
        event: {
          ...charge_request_mock.event,
          cvv: "123",
          months: 9,
        },
      };

      invoke_response_mock = Mock.of<AurusResponse>({
        ...charge_response_mock,
      });

      mockAcqGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(invoke_stub).calledOnce;
            expect(invoke_stub.firstCall.firstArg["3DS"]).to.be.not.undefined;
            done();
          },
        });
    });

    it("When charge has a unhandled Error, should throw an error", (done: Done) => {
      mockAcqGateway(other_error);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          error: (error: Error): void => {
            expect(error.message).contains("error inesperado.");
            done();
          },
        });
    });

    it("When charge has a unhandled Error, should throw an error 211", (done: Done) => {
      mockAcqGateway(ErrorAcqCode.E211);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          error: (error: Error): void => {
            expect(error.message).contains("Solicitud no valida");
            done();
          },
        });
    });

    it("When charge is made with an invalid processor, with 500 kushki error", (done: Done) => {
      const response_text: string = unreachable_processor_500;

      error_message = "Rejected transaction";
      metadata = {
        response_text,
        response_code: "500",
      };
      charge_request_mock.currentToken.isDeferred = true;
      charge_request_mock.event.months = 5;

      mockAcqGateway(ErrorAcqCode.E500);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          error: (error: AurusError): void => {
            expect(error.getMessage()).eq(response_text);
            expect(get(error.getMetadata(), "processorName")).eq(
              ProcessorEnum.KUSHKI
            );
            done();
          },
        });
    });

    it("should make a charge, with no registered kushki error", (done: Done) => {
      metadata = {
        response_code: "500",
        response_text: "Axios error",
      };
      mockAcqGateway(ErrorAcqCode.E009);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error).to.be.instanceOf(KushkiError);
            expect(error.getMessage()).to.contains("Ha ocurrido un error");
            done();
          },
        });
    });

    it("When call a charge method it should return a KushkiError 012", (done: Mocha.Done) => {
      mockAcqGateway(ErrorAcqCode.E012);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            expect(err.code).to.be.equal("504");
            expect(err.getMessage()).to.be.equal(unreachable_processor_504);
            done();
          },
        });
    });

    it("When charge is done, should return error 505 from blocked card", (done: Mocha.Done) => {
      mockAcqGateway(ErrorAcqCode.E505);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            expect(err.code).to.be.equal("K505");
            done();
          },
        });
    });

    it("When charge is done, should return error 506 from temporary blocked card", (done: Mocha.Done) => {
      mockAcqGateway(ErrorAcqCode.E506);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .charge(charge_request_mock)
        .subscribe({
          error: (err: AurusError): void => {
            expect(err.code).to.be.equal("K506");
            done();
          },
        });
    });

    it("When preAuthorization return aurus response", (done: Done) => {
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockAcqGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .preAuthorization(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(rs.response_code).eq("000");
            expect(charge_stub).callCount(0);
            expect(invoke_stub.args[0][0].subscriptionId).to.be.eq(
              charge_request_mock.event.subscriptionId
            );
            done();
          },
        });
    });

    it("Should return error when preAuthorization fail and is not acq error", (done: Done) => {
      mockEnvVars();
      invoke_stub = sandbox
        .stub()
        .rejects(new KushkiError(ERRORS.E901, ERRORS.E901.message, {}));

      CONTAINER.rebind(IDENTIFIERS.AcqGateway).toConstantValue(
        Mock.of<IAcqGateway>({
          charge: invoke_stub,
          preAuthorization: invoke_stub,
        })
      );

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .preAuthorization(charge_request_mock)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.code).to.be.eq("K002");
            expect(err.getMessage()).to.contains("error inesperado");

            done();
          },
        });
    });

    it("When preAuthorization has a 3DS object request", (done: Done) => {
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
        event: {
          ...charge_request_mock.event,
          citMit: "C101",
        },
      };
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockAcqGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .preAuthorization(charge_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(charge_stub).callCount(0);
            done();
          },
        });
    });

    it("When preAuthorization is called and falls in timeout, should throw error when its time out", (done: Done) => {
      process.env.KUSHKI_ACQ_TIME_OUT = "30";
      invoke_response_mock = Mock.of<AurusResponse>({
        ...charge_response_mock,
      });

      mockAcqGateway("", true);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .preAuthorization(charge_request_mock)
        .subscribe({
          error: (error: AurusError): void => {
            expect(error.getMessage()).to.be.equal(unreachable_processor_504);
            expect(put_stub).to.have.been.calledOnce;
            expect(put_stub.args[0][0].transaction_reference).to.be.equal(
              charge_request_mock.currentToken.transactionReference
            );
            done();
          },
        });
    });

    it("When preAuthorization is called and falls for invalid bin, should throw E011 error", (done: Done) => {
      charge_request_mock.event.binInfo = undefined;

      mockAcqGateway("", false);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .preAuthorization(charge_request_mock)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.getMessage()).to.be.equal(ERRORS_ACQ.E011.message);
            done();
          },
        });
    });

    it("When preAuthorization is called and falls for invalid deferred, should throw E028 error", (done: Done) => {
      const error_code = ERRORS_ACQ.E028.code;

      mockAcqGateway(error_code, false);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .preAuthorization(charge_request_mock)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.getMessage()).to.be.equal(ERRORS_ACQ.E028.message);
            done();
          },
        });
    });

    it("When preAuthorization fails with temporary blocked card, should throw error E506", (done: Done) => {
      const error_code = ERRORS_ACQ.E506.code;

      mockAcqGateway(error_code, false);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .preAuthorization(charge_request_mock)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.getMessage()).to.be.equal(ERRORS_ACQ.E506.message);
            done();
          },
        });
    });

    describe("When sandbox return some KXXX error", () => {
      let ksh_error: KushkiErrorAttr<ErrorAcqCode, StatusCodeEnum>;
      let error_code: string;

      it("should call charge and return error E003 when sandbox return error K003", () => {
        ksh_error = ERRORS_ACQ.E003;
        error_code = ErrorMapAcqEnum.E003;
      });

      it("should call charge and return error E004 when sandbox return error K004", () => {
        ksh_error = ERRORS_ACQ.E004;
        error_code = ErrorMapAcqEnum.E004;
      });

      it("should call charge and return error E005 when sandbox return error K005", () => {
        ksh_error = ERRORS_ACQ.E005;
        error_code = ErrorMapAcqEnum.E005;
      });

      it("should call charge and return error E505 when sandbox return error K505", () => {
        ksh_error = ERRORS_ACQ.E505;
        error_code = ErrorMapAcqEnum.E505;
      });

      it("should call charge and return error E601 when sandbox return error K601", () => {
        ksh_error = ERRORS_ACQ.E601;
        error_code = ErrorMapAcqEnum.K601;
      });

      afterEach((done: Mocha.Done) => {
        mockAcqGateway(ksh_error.code);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[CardProviderIndexEnum.KushkiAcq]
          .charge(charge_request_mock)
          .subscribe({
            error: (err: KushkiError): void => {
              expect(err.code).to.be.eq(error_code);
              expect(err.getMessage()).to.be.eq(ksh_error.message);

              done();
            },
          });
      });
    });
  });

  describe("reAuthorization", () => {
    let reauthorization_request_mock: Transaction;
    let authorizer_context: AuthorizerContext;
    let amount: Amount;
    let error_code: string;
    let error_msg: string;

    beforeEach(() => {
      amount = Mock.of<Amount>();
      authorizer_context = Mock.of<AuthorizerContext>({
        hierarchyConfig: {
          basicInfo: "666666666666666",
        },
        merchantId: "5555555555555",
      });
      reauthorization_request_mock = Mock.of<Transaction>({
        bin_card: "432100",
        card_country: CountryEnum.PERU,
        payment_brand: CardBrandEnum.VISA,
        ticket_number: "",
        vaultToken: "234567890",
        token_type: "transaction",
      });
      invoke_response_mock = Mock.of<AurusResponse>({
        kushki_response: {
          code: "000",
          message: "Fake Message",
        },
      });

      query_stub = sandbox.stub().returns(
        of([
          {
            processor_transaction_id: "fake processor transaction ID",
          },
        ])
      );

      mockDynamoGateway();
    });

    it("Should return an aurus response when doesn't have errors", (done: Done) => {
      mockAcqGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .reAuthorization(
          amount,
          authorizer_context,
          reauthorization_request_mock
        )
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(invoke_stub).calledOnce.calledWithMatch({
              tokenType: reauthorization_request_mock.token_type,
            });
            expect(rs.response_code).eq("000");
            done();
          },
        });
    });

    it("Should return an error when acq gateway response error", (done: Done) => {
      mockAcqGateway(ErrorAcqCode.E505);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .reAuthorization(
          amount,
          authorizer_context,
          reauthorization_request_mock
        )
        .subscribe({
          error: (error: KushkiError) => {
            expect(error).to.be.not.null;
            done();
          },
        });
    });

    describe("When return an error", () => {
      beforeEach(() => {
        error_code = "";
      });
      it("Should throw error when has an invalid binInfo", () => {
        unset(reauthorization_request_mock, "bin_card");
        error_msg = ERRORS_ACQ.E011.message;
      });

      it("Should throw error when dynamo query return undefined transaction", () => {
        error_msg = "Ha ocurrido un error inesperado.";
        query_stub = sandbox.stub().returns(of([]));
        mockDynamoGateway();
      });

      it("Should throw Bin no válido error when acq gateway return E011 error", () => {
        error_code = ErrorAcqCode.E011;
        error_msg = ERRORS_ACQ.E011.message;
      });

      it("Should throw temporary blocked card error when acq gateway return E506 error", () => {
        error_code = ErrorAcqCode.E506;
        error_msg = ERRORS_ACQ.E506.message;
      });

      it("Should throw error when acq gateway has timeout", () => {
        set(process.env, "KUSHKI_ADQUIRER_VARS.TIMEOUT", 1);

        error_code = ERRORS_ACQ.E012.code;
        error_msg = unreachable_processor_504;
      });

      afterEach((done: Done) => {
        mockAcqGateway(error_code);
        service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
        service[CardProviderIndexEnum.KushkiAcq]
          .reAuthorization(
            amount,
            authorizer_context,
            reauthorization_request_mock
          )
          .subscribe({
            error: (err: KushkiError): void => {
              expect(err.getMessage()).to.be.equal(error_msg);
              done();
            },
          });
      });
    });
  });

  describe("validateAccount", () => {
    let validate_account_request_mock: SandboxAccountValidationRequest;
    let trx_reference: string;
    let validate_account_response_mock: AurusResponse;
    let authorizer_context: AuthorizerContext;

    beforeEach(() => {
      trx_reference = "b42dc604-9ef7-4292-9daf-2f53d33ef7b9";
      validate_account_response_mock = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: trx_reference,
      });
      authorizer_context = Mock.of<AuthorizerContext>({
        hierarchyConfig: {
          basicInfo: "666666666666666",
        },
        merchantId: "5555555555555",
      });
      validate_account_request_mock = Mock.of<SandboxAccountValidationRequest>({
        binInfo: {
          bank: "CITIBANAMEX",
          bin: "405306",
          brand: "VISA",
          country: "Mexico",
          type: "credit",
        },
        body: {
          currency_code: "USD",
          is_blocked_card: false,
          transaction_card_id: "999999999",
          transaction_reference: trx_reference,
          transaction_token: "123123",
        },
      });
    });

    function commonExpectValidateAccount(done: Done): void {
      invoke_response_mock = Mock.of<AurusResponse>({
        ...validate_account_response_mock,
      });
      mockAcqGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .validateAccount(authorizer_context, validate_account_request_mock)
        .subscribe({
          next: (rs: AurusResponse): void => {
            expect(rs).not.to.be.undefined;
            expect(rs.response_code).eq("000");
            expect(rs).haveOwnProperty("ticket_number");
            expect(invoke_stub).calledOnce;
            if (isUndefined(validate_account_request_mock.body)) {
              expect(validate_account_request_mock.is_blocked_card).not.to.be
                .undefined;
              expect(validate_account_request_mock.transaction_card_id).not.to
                .be.undefined;
            } else {
              expect(validate_account_request_mock.body.is_blocked_card).not.to
                .be.undefined;
              expect(validate_account_request_mock.body.transaction_card_id).not
                .to.be.undefined;
            }
            done();
          },
        });
    }

    it("When validateAccount is called with request Sandbox, should return response without transactionReference", (done: Done) => {
      commonExpectValidateAccount(done);
    });

    it("When validateAccount is called with request ValidateAccountLambdaRequest, should return response with transactionReference", (done: Done) => {
      validate_account_request_mock = Mock.of<SandboxAccountValidationRequest>({
        binInfo: {
          bank: "CITIBANAMEX",
          bin: "405306",
          brand: "VISA",
          country: "Mexico",
        },
        currency_code: "USD",
        is_blocked_card: false,
        transaction_card_id: "999999999",
        transaction_reference: trx_reference,
        transaction_token: "123123",
      });

      commonExpectValidateAccount(done);
    });

    it("When validateAccount is called with an invalid card, should throw a 600 kushki error ", (done: Done) => {
      const response_text: string = "Tarjeta invalida.";
      const processor_code: string = "14";

      error_message = rejected_error;
      metadata = {
        processor_code,
        response_text,
        response_code: "018",
      };

      mockAcqGateway(ErrorAcqCode.E600);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .validateAccount(authorizer_context, validate_account_request_mock)
        .subscribe({
          error: (error: AurusError): void => {
            expect(error.getMessage()).eq(unreachable_processor_500);
            expect(get(error.getMetadata(), "response_text")).eq(
              unreachable_processor_500
            );
            done();
          },
        });
    });

    it("When validateAccount is called and falls for invalid bin, should throw K011 error", (done: Done) => {
      validate_account_request_mock.binInfo = undefined;

      mockAcqGateway("");
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.KushkiAcq]
        .validateAccount(authorizer_context, validate_account_request_mock)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.getMessage()).to.be.equal(ERRORS_ACQ.E011.message);
            expect(error.code).to.be.equal("K011");
            done();
          },
        });
    });
  });
});
