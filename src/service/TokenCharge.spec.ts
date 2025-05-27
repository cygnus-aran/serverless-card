/**
 * Token Charge Unit Tests
 */
import { Tracer } from "@aws-lambda-powertools/tracer";
import { ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { TokenTypeEnum } from "@kushki/core/lib/infrastructure/TokenTypeEnum";
import { Context } from "aws-lambda";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ChannelEnum } from "infrastructure/ChannelEnum";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { set } from "lodash";
import "reflect-metadata";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import { ISQSGateway } from "repository/ISQSGateway";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { CardService } from "service/CardService";
import { createSandbox, match, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusResponse } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import {
  LambdaTransactionRuleBodyResponse,
  LambdaTransactionRuleResponse,
} from "types/lambda_transaction_rule_response";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { SiftScienceWorkflowsResponse } from "types/sift_science_workflows_response";
import { TokenChargeRequest } from "types/token_charge_request";

use(sinonChai);

const CONTEXT_HIERARCHY_CONFIG: string = `{"processing":{"processors":"200000000345046","businessRules":"200000000345046","securityRules":"200000000345046","deferred":"200000000345046"},"rootId":"3000abc0001"}`;
const PATH_HIERARCHY_CONFIG = "requestContext.authorizer.hierarchyConfig";

describe("Card Service - Token Charge", () => {
  let service: CardService;
  let sandbox: SinonSandbox;
  let lambda_context: Context;
  let merchant_fetch: DynamoMerchantFetch;
  let processor_fetch: DynamoProcessorFetch;
  let bin_fetch: DynamoBinFetch;
  let tracer: SinonStub;
  const request: TokenChargeRequest = {
    amount: {
      currency: CurrencyEnum.USD,
      ice: 0,
      iva: 0,
      subtotalIva: 20,
      subtotalIva0: 0,
    },
    cardHolderName: "abcd ef",
    channel: ChannelEnum.OTP_CHANNEL,
    contactDetails: {
      documentNumber: "1231231231",
      email: "asasds@asdds.com",
      firstName: "test",
      lastName: "lastest",
    },
    credentialId: "1234",
    currency: CurrencyEnum.USD,
    maskedCardNumber: "4242424242424242",
    merchantIdKushki: "1234",
    metadata: {
      merchantId: "merchant_id",
      securityId: "security_id",
      totalAmount: "20",
    },
    tokenType: TokenTypeEnum.TRANSACTION,
    totalAmount: 20,
    vaultToken: "some_vault_token",
  };
  let request_authorize_context: AuthorizerContext = {
    credentialAlias: "",
    credentialId: "",
    hierarchyConfig: {},
    merchantId: "",
    privateMerchantId: "",
    publicMerchantId: "",
  };
  const transaction_rule_response = {
    body: {
      detail: {
        bank: "My bank",
        bin: "123456",
        brand: "VISA",
        country: CountryEnum.MEXICO,
        credentialId: "1234",
        currency: CurrencyEnum.USD,
        customer: {},
        ignoreWarnings: true,
        ip: "",
        isCreditCard: "true",
        isDeferred: "false",
        lastFourDigits: "4242",
        maskedCardNumber: "12346XXXXXX0909",
        otpData: match.any,
        processor: "processor",
        totalAmount: "20",
        transactionType: "charge",
      },
      merchantId: "1234",
      transactionKind: "card",
    },
  };
  const cybersource_response: object = {
    authentication: true,
    detail: {
      authenticationTransactionId: "OWgXwASsYPW4hr1ATcf0",
      cardType: "001",
      cardTypeName: "",
      cavv: "AAABAWFlmQAAAABjRWWZEEFgFz+=",
      commerceIndicator: "vbv",
      eci: "05",
      jwt: "",
      merchantId: "kushki_co",
      merchantReferenceCode: "360d1949-e22f-4d15-afbd-5ffc8e5cbb5d",
      paresStatus: "Y",
      reasonCode: "100",
      referenceId: "301c160c-acaa-486c-a51a-544ed9fc2fa2",
      specificationVersion: "1.0.2",
      tokenType: "su*********n",
      ucafAuthenticationData: "",
      vaultToken: "IA*********=",
      veresEnrolled: "Y",
      xid: "T1dnWHdBU3NZUFc0aHIxQVRjZjA",
    },
  };
  const approved_trx: string = "Transacción aprobada";

  function commonBeforeEach() {
    CONTAINER.snapshot();
    sandbox = createSandbox();
  }

  function rollbarInstance(box: SinonSandbox): void {
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

  function createSchemas(): void {
    merchant_fetch = Mock.of<DynamoMerchantFetch>({
      commission: false,
      contactPerson: "person",
      deferredOptions: true,
      email: "mail",
      merchant_name: "name",
      multi_merchant: true,
      private_id: "pid",
      public_id: "id",
      sift_science: {
        SandboxAccountId: "sai",
        SandboxApiKey: "apk",
        SiftScore: 22,
      },
    });
    processor_fetch = Mock.of<DynamoProcessorFetch>({
      merchant_id: "merchant_id",
      plcc: false,
      private_id: "private_id",
      processor_name: "processor_name",
      processor_type: "processor_type",
      public_id: "public_id",
      terminal_id: "terminal_id",
    });
    bin_fetch = Mock.of<DynamoBinFetch>({
      bank: "My bank",
      bin: "123456",
      brand: "VISA",
      processor: "processor",
    });
  }

  beforeEach(() => {
    commonBeforeEach();
    rollbarInstance(sandbox);
    process.env.IVA_VALUES = '{"USD":0,"COP":0,"CLP":0,"UF":0,"PEN":0,"MXN":0}';
    set(request, "requestContext", {
      authorizer: {
        credentialId: "1234",
      },
    });
    tracer = sandbox.stub(Tracer.prototype, "putAnnotation");
  });
  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
    tracer.restore();
  });
  describe("tokenCharge", () => {
    let get_merchants_stub: SinonStub;
    let query_processors_stub: SinonStub;
    let invoke_function_stub: SinonStub;
    let put_stub: SinonStub;
    let put_sqs: SinonStub;
    let sandbox_charge_stub: SinonStub;

    function mockDynamoGateway(
      getItem: SinonStub,
      query: SinonStub,
      put: SinonStub
    ): void {
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem,
          put,
          query,
          queryReservedWord: sandbox.stub().returns(of([])),
        })
      );
    }

    function mockSqs(put: SinonStub): void {
      CONTAINER.rebind(IDENTIFIERS.SQSGateway).toConstantValue(
        Mock.of<ISQSGateway>({
          put,
        })
      );
    }

    function mockProviderService(
      tokenStub: SinonStub,
      variantStub: CardProviderEnum,
      chargeStub: SinonStub
    ): void {
      CONTAINER.unbind(IDENTIFIERS.ProviderService);
      CONTAINER.bind(IDENTIFIERS.ProviderService).toConstantValue(
        Mock.of<IProviderService>({
          charge: chargeStub,
          tokens: tokenStub,
          variant: variantStub,
        })
      );
    }

    function mockInvokeFunction(
      lambdaStub: SinonStub,
      lambdaAsyncStub?: SinonStub
    ): void {
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeAsyncFunction: lambdaAsyncStub,
          invokeFunction: lambdaStub,
        })
      );
    }

    function testCorrectTokenCharge(
      done: Mocha.Done,
      isUser: boolean,
      isSession: boolean,
      isCybersourceInfo?: boolean
    ): void {
      const token_reponse: SinonStub = sandbox.stub().returns(
        of({
          sessionId: isUser ? "123123" : "",
          token: "sandbox_token",
          userId: isSession ? "123123123" : "",
        })
      );

      get_merchants_stub = sandbox
        .stub()
        .onCall(0)
        .returns(of({ ...merchant_fetch, sandboxEnable: true }))
        .onCall(1)
        .returns(of({ ...merchant_fetch, sandboxEnable: true }));
      invoke_function_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onCall(1)
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              ...bin_fetch,
            })
          )
        )
        .onCall(2)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleBodyResponse>({
              body: {
                cybersource: isCybersourceInfo
                  ? cybersource_response
                  : undefined,
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        );

      put_stub = sandbox.stub().returns(of(true));
      put_sqs = sandbox.stub().returns(of(true));

      mockSqs(put_sqs);
      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);

      mockInvokeFunction(invoke_function_stub);
      mockProviderService(
        token_reponse,
        CardProviderEnum.SANDBOX,
        sandbox_charge_stub
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(request, lambda_context).subscribe({
        error: done,
        next: (data: object): void => {
          expect(data).haveOwnProperty("ticketNumber");
          done();
        },
      });
    }

    beforeEach(() => {
      lambda_context = Mock.of<Context>({
        getRemainingTimeInMillis: sandbox.stub().returns(600000),
      });
      commonBeforeEach();
      createSchemas();
      process.env.USRV_STAGE = "qa";
      process.env.LAMBDA_RULE = "usrv-transaction-rule-qa-processor";
      process.env.LAMBDA_VALUES =
        '{"CHARGEBACK":"usrv-card-chargeback-ci-chargeback","GET_BIN_INFO":"usrv-deferred-ci-getBinInfo","RULE":"usrv-transaction-rule-qa-processor","ASYNC_VOID":"usrv-card-chargeback-ci-voidTrigger","CREDOMATIC_CHARGE":"usrv-card-credomatic-ci-charge","REDEBAN_CHARGE":"usrv-card-redeban-ci-charge","TRANSBANK_TOKEN":"usrv-wssecurity-processor-ci-token"}';

      process.env.MERCHANT_VALUES = '{"MIGRATE_IDS":"1111111111"}';
      process.env.MERCHANT_MIGRATE_IDS = "1111111111";
      sandbox_charge_stub = sandbox.stub().returns(
        of({
          response_code: "000",
          response_text: approved_trx,
          ticket_number: "123",
        })
      );
    });
    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    it("should tokenCharge -  success", (done: Mocha.Done) => {
      const token_reponse: SinonStub = sandbox.stub().returns(
        of({
          card: {
            bin: "123456",
            maskedNumber: "123456XXXXXX0909",
            name: "Ted",
          },
          token: "aurus_token",
        })
      );

      get_merchants_stub = sandbox
        .stub()
        .onCall(0)
        .returns(of(merchant_fetch))
        .onCall(1)
        .returns(of({ ...merchant_fetch, sandboxEnable: false }));
      query_processors_stub = sandbox.stub().returns(of([processor_fetch]));
      invoke_function_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onCall(1)
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              ...bin_fetch,
              binType: 6,
              brand: "VISA",
              info: {
                country: {
                  name: "Mexico",
                },
                type: "credit",
              },
            })
          )
        )
        .onCall(2)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleBodyResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        );

      put_stub = sandbox.stub().returns(of(true));
      put_sqs = sandbox.stub().returns(of(true));
      const aurus_charge_stub: SinonStub = sandbox.stub().returns(
        of({
          response_code: "000",
          response_text: approved_trx,
          ticket_number: "123",
        })
      );

      mockSqs(put_sqs);
      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);
      mockInvokeFunction(invoke_function_stub);
      mockProviderService(
        token_reponse,
        CardProviderEnum.AURUS,
        aurus_charge_stub
      );
      set(request, PATH_HIERARCHY_CONFIG, JSON.parse(CONTEXT_HIERARCHY_CONFIG));

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(request, lambda_context).subscribe({
        complete: (): void => {
          expect(invoke_function_stub.getCall(2)).to.have.been.calledWithMatch(
            match.any,
            {
              body: {
                detail: {
                  bank: "My bank",
                  bin: "123456",
                  brand: "VISA",
                  country: CountryEnum.MEXICO,
                  credentialId: "1234",
                  currency: CurrencyEnum.USD,
                  customer: request.contactDetails,
                  ignoreWarnings: true,
                  ip: "",
                  isCreditCard: "true",
                  isDeferred: "false",
                  lastFourDigits: "4242",
                  maskedCardNumber: "123456XXXXXX0909",
                  otpData: match.any,
                  processor: "processor",
                  totalAmount: "20",
                  transactionType: "charge",
                },
                hierarchyConfig: {
                  processing: {
                    businessRules: "200000000345046",
                    deferred: "200000000345046",
                    processors: "200000000345046",
                    securityRules: "200000000345046",
                  },
                  rootId: "3000abc0001",
                },
                merchantId: "1234",
                transactionKind: "card",
              },
            }
          );
          expect(invoke_function_stub.args[0][1].body.sandboxEnable).to.be
            .false;
          done();
        },
        error: done,
      });
    });

    it("tokenCharge - success", (done: Mocha.Done) => {
      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      testCorrectTokenCharge(done, false, false, true);
    });

    it("tokenCharge -  success, should invoke trx-rule's lambda when the merchant_id matches those in the MERCHANT_MIGRATE_IDS variable", (done: Mocha.Done) => {
      merchant_fetch.public_id = "1111111111";
      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      testCorrectTokenCharge(done, true, true);
    });

    it("should send the secureId value when this field exists in the lambda request and channel is different to OTP", (done: Mocha.Done) => {
      const secure_id: string = "1234";

      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      set(request, "channel", "test");
      set(request, "secureId", secure_id);
      testCorrectTokenCharge(done, false, false, true);
    });

    it("tokenCharge -  success, without bin fino", (done: Mocha.Done) => {
      merchant_fetch.public_id = "1111111111";
      bin_fetch = {
        bank: "",
        bin: "",
        brand: "",
        info: {
          type: "debit",
        },
        processor: "",
      };
      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      testCorrectTokenCharge(done, true, true);
    });

    it("tokenCharge with Params -  success", (done: Mocha.Done) => {
      request_authorize_context = {
        ...request_authorize_context,
        credentialMetadata: {
          metadata: "test metadata",
        },
        kushkiMetadata: {
          origin: "sub",
          ownerMerchantId: "1234132",
        },
        publicCredentialId: "123123123123123123",
      };

      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      set(
        request,
        "requestContext.authorizer.publicCredentialId",
        request_authorize_context.publicCredentialId
      );
      set(
        request,
        "requestContext.authorizer.credentialMetadata",
        request_authorize_context.credentialMetadata
      );
      bin_fetch = {
        ...bin_fetch,
        info: {
          ...bin_fetch.info,
          country: undefined,
        },
      };

      testCorrectTokenCharge(done, true, true, false);
    });

    it("should send kushkiInfo data when tokenCharge is called", (done: Mocha.Done) => {
      request_authorize_context = {
        ...request_authorize_context,
        credentialMetadata: {
          metadata: "test metadata",
        },
        kushkiMetadata: {
          origin: "sub",
          ownerMerchantId: "1234132",
        },
        publicCredentialId: "123123123123123123",
      };

      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      set(
        request,
        "requestContext.kushkiMetadata",
        request_authorize_context.kushkiMetadata
      );
      set(
        request,
        "requestContext.authorizer.publicCredentialId",
        request_authorize_context.publicCredentialId
      );
      set(
        request,
        "requestContext.authorizer.credentialMetadata",
        request_authorize_context.credentialMetadata
      );
      bin_fetch = {
        ...bin_fetch,
        info: {
          ...bin_fetch.info,
          country: undefined,
        },
      };

      testCorrectTokenCharge(done, true, true);
    });

    it("tokenCharge - with sift science contact details", (done: Mocha.Done) => {
      const token_response: SinonStub = sandbox.stub().returns(
        of({
          card: {
            bin: "123456",
            maskedNumber: "123456XXXXXX0909",
            name: "Ted",
          },
          token: "aurus_token",
        })
      );

      query_processors_stub = sandbox.stub().returns(of([processor_fetch]));
      get_merchants_stub = sandbox
        .stub()
        .onCall(0)
        .returns(of(merchant_fetch))
        .onCall(1)
        .returns(of({ ...merchant_fetch, sandboxEnable: false }));
      invoke_function_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onCall(1)
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              ...bin_fetch,
              brand: "VISA",
              info: {
                country: {
                  name: "Mexico",
                },
                type: "credit",
              },
            })
          )
        )
        .onCall(2)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleBodyResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        );
      put_stub = sandbox.stub().returns(of(true));
      put_sqs = sandbox.stub().returns(of(true));
      const aurus_charge_stub: SinonStub = sandbox.stub().returns(
        of({
          response_code: "000",
          response_text: approved_trx,
          ticket_number: "123",
        })
      );

      mockSqs(put_sqs);
      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);
      mockInvokeFunction(invoke_function_stub);
      mockProviderService(
        token_response,
        CardProviderEnum.AURUS,
        aurus_charge_stub
      );

      const token_charge_request: TokenChargeRequest = {
        amount: {
          currency: CurrencyEnum.USD,
          ice: 0,
          iva: 0,
          subtotalIva: 20,
          subtotalIva0: 0,
        },
        cardHolderName: "abcd ef",
        channel: ChannelEnum.OTP_CHANNEL,
        contactDetails: {
          documentNumber: "dnumber",
          documentType: "dtype",
          email: "test@test.com",
          firstName: "first name",
          lastName: "last name",
          phoneNumber: "00000000000",
          secondLastName: "second last name",
        },
        credentialId: "1234",
        currency: CurrencyEnum.USD,
        maskedCardNumber: "4242424242424242",
        merchantIdKushki: "1234",
        metadata: {
          merchantId: "merchant_id",
          securityId: "security_id",
          totalAmount: "20",
        },
        sessionId: "session id",
        tokenType: TokenTypeEnum.TRANSACTION,
        totalAmount: 20,
        userId: "user id",
        vaultToken: "some_vault_token",
      };

      set(
        token_charge_request,
        PATH_HIERARCHY_CONFIG,
        CONTEXT_HIERARCHY_CONFIG
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(token_charge_request, lambda_context).subscribe({
        complete: (): void => {
          expect(put_stub.args[0][0].userId).to.be.eql("user id");
          expect(put_stub.args[0][0].sessionId).to.be.eql("session id");
          done();
        },
        error: done,
      });
    });

    it("Should responds with a hierarchyConfig object when it is called in token charges ", (done: Mocha.Done) => {
      const token_response: SinonStub = sandbox.stub().returns(
        of({
          card: {
            bin: "123456",
            maskedNumber: "123456XXXXXX0909",
            name: "Ted",
          },
          token: "aurus_token",
        })
      );

      query_processors_stub = sandbox.stub().returns(of([processor_fetch]));
      get_merchants_stub = sandbox
        .stub()
        .onCall(0)
        .returns(of(merchant_fetch))
        .onCall(1)
        .returns(of({ ...merchant_fetch, sandboxEnable: false }));
      invoke_function_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onCall(1)
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              ...bin_fetch,
              brand: "VISA",
              info: {
                country: {
                  name: "Mexico",
                },
                type: "credit",
              },
            })
          )
        )
        .onCall(2)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleBodyResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        );

      put_stub = sandbox.stub().returns(of(true));
      put_sqs = sandbox.stub().returns(of(true));
      const aurus_charge_stub: SinonStub = sandbox.stub().returns(
        of({
          response_code: "000",
          response_text: approved_trx,
          ticket_number: "123",
        })
      );

      mockSqs(put_sqs);
      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);
      mockInvokeFunction(invoke_function_stub);
      mockProviderService(
        token_response,
        CardProviderEnum.AURUS,
        aurus_charge_stub
      );

      const token_charge_request: TokenChargeRequest = {
        amount: {
          currency: CurrencyEnum.USD,
          ice: 0,
          iva: 0,
          subtotalIva: 20,
          subtotalIva0: 0,
        },
        cardHolderName: "abcd ef",
        channel: ChannelEnum.OTP_CHANNEL,
        contactDetails: {
          documentNumber: "dnumber",
          documentType: "dtype",
          email: "test@test.com",
          firstName: "first name",
          lastName: "last name",
          phoneNumber: "00000000000",
          secondLastName: "second last name",
        },
        credentialId: "1234",
        currency: CurrencyEnum.USD,
        maskedCardNumber: "4242424242424242",
        merchantIdKushki: "1234",
        metadata: {
          merchantId: "merchant_id",
          securityId: "security_id",
          totalAmount: "20",
        },
        sessionId: "sessionId",
        tokenType: TokenTypeEnum.TRANSACTION,
        totalAmount: 20,
        userId: "user id",
        vaultToken: "some_vault_token",
      };

      set(
        token_charge_request,
        PATH_HIERARCHY_CONFIG,
        `{"processing":{"processors":"200000000345046","businessRules":"200000000345046","securityRules":"200000000345046","deferred":"200000000345046"},"rootId":"3000abc0001"}`
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(token_charge_request, lambda_context).subscribe({
        error: done,
        next: (): void => {
          expect(invoke_function_stub).to.be.calledThrice;
          expect(
            invoke_function_stub.args[0][1].body.hierarchyConfig
          ).to.be.deep.equals({
            processing: {
              businessRules: "200000000345046",
              deferred: "200000000345046",
              processors: "200000000345046",
              securityRules: "200000000345046",
            },
            rootId: "3000abc0001",
          });
          done();
        },
      });
    });

    it("tokenCharge - with sift science contact details should go to antifraud gateway", (done: Mocha.Done) => {
      const token_response: SinonStub = sandbox.stub().returns(
        of({
          card: {
            bin: "123456",
            maskedNumber: "123456XXXXXX0909",
            name: "Ted",
          },
          token: "aurus_token",
        })
      );

      query_processors_stub = sandbox.stub().returns(of([processor_fetch]));
      get_merchants_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of({
            ...merchant_fetch,
            sift_science: {
              ...merchant_fetch.sift_science,
              ProdAccountId: "qd",
            },
          })
        )
        .onCall(1)
        .returns(
          of({
            ...merchant_fetch,
            sandboxEnable: false,
            sift_science: {
              ...merchant_fetch.sift_science,
              ProdAccountId: "qd",
            },
          })
        );
      invoke_function_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onCall(1)
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              ...bin_fetch,
              brand: "VISA",
              info: {
                country: {
                  name: "Mexico",
                },
                type: "credit",
              },
            })
          )
        )
        .onCall(2)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleBodyResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        );

      put_stub = sandbox.stub().returns(of(true));
      put_sqs = sandbox.stub().returns(of(true));
      const aurus_charge_stub: SinonStub = sandbox.stub().returns(
        of({
          response_code: "000",
          response_text: approved_trx,
          ticket_number: "123",
        })
      );

      mockSqs(put_sqs);
      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);
      mockInvokeFunction(invoke_function_stub);
      mockProviderService(
        token_response,
        CardProviderEnum.AURUS,
        aurus_charge_stub
      );

      const token_charge_request: TokenChargeRequest = {
        amount: {
          currency: CurrencyEnum.USD,
          ice: 0,
          iva: 0,
          subtotalIva: 20,
          subtotalIva0: 0,
        },
        cardHolderName: "abcdef",
        channel: ChannelEnum.OTP_CHANNEL,
        contactDetails: {
          documentNumber: "docnumber",
          documentType: "doctype",
          email: "testing@test.com",
          firstName: "first_name",
          lastName: "last_name",
          phoneNumber: "00000000000",
          secondLastName: "second_last_name",
        },
        credentialId: "1234",
        currency: CurrencyEnum.USD,
        maskedCardNumber: "4242424242424242",
        merchantIdKushki: "1234",
        metadata: {
          merchantId: "merchant_id",
          securityId: "security_id",
          totalAmount: "20",
        },
        sessionId: "session_id",
        tokenType: TokenTypeEnum.TRANSACTION,
        totalAmount: 20,
        userId: "user id",
        vaultToken: "some_vault_token",
      };

      const sift_science_get_workflow_response =
        Mock.of<SiftScienceWorkflowsResponse>({});
      const workflows_stub: SinonStub = sandbox
        .stub()
        .returns(of(sift_science_get_workflow_response));

      const transaction_stub: SinonStub = sandbox.stub().returns(of(true));

      CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
      CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
        Mock.of<IAntifraudGateway>({
          getWorkflows: workflows_stub,
          transaction: transaction_stub,
        })
      );

      set(
        token_charge_request,
        PATH_HIERARCHY_CONFIG,
        CONTEXT_HIERARCHY_CONFIG
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(token_charge_request, lambda_context).subscribe({
        complete: (): void => {
          expect(workflows_stub).to.be.called;
          expect(workflows_stub.args[0][2].contactDetails.email).eql(
            "testing@test.com"
          );
          done();
        },
        error: done,
      });
    });

    it("tokenCharge - sandbox success", (done: Mocha.Done) => {
      const token_reponse: SinonStub = sandbox.stub().returns(
        of({
          token: "sandbox_token",
        })
      );

      get_merchants_stub = sandbox
        .stub()
        .onCall(0)
        .returns(of({ ...merchant_fetch, sandboxEnable: true }))
        .onCall(1)
        .returns(of({ ...merchant_fetch, sandboxEnable: true }));
      invoke_function_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onCall(1)
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              ...bin_fetch,
            })
          )
        )
        .onCall(2)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleBodyResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        );

      put_stub = sandbox.stub().returns(of(true));
      put_sqs = sandbox.stub().returns(of(true));

      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      mockSqs(put_sqs);
      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);
      mockInvokeFunction(invoke_function_stub);
      mockProviderService(
        token_reponse,
        CardProviderEnum.SANDBOX,
        sandbox_charge_stub
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(request, lambda_context).subscribe({
        error: done,
        next: (data: object): void => {
          expect(data).haveOwnProperty("ticketNumber");
          done();
        },
      });
    });

    it("tokenCharge -  if dynamo merchant is undefined should return error E004", (done: Mocha.Done) => {
      get_merchants_stub = sandbox.stub().onFirstCall().returns(of(undefined));
      query_processors_stub = sandbox.stub().returns(of([processor_fetch]));
      invoke_function_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        );

      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);
      mockInvokeFunction(invoke_function_stub);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(request, lambda_context).subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("K004");
          done();
        },
      });
    });

    it("tokenCharge -  if invoke to aurus token on vault gives error should return error E010", (done: Mocha.Done) => {
      get_merchants_stub = sandbox.stub().onCall(0).returns(of(merchant_fetch));
      query_processors_stub = sandbox.stub().returns(of([processor_fetch]));
      invoke_function_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onSecondCall()
        .throws(new KushkiError(ERRORS.E001));

      put_stub = sandbox.stub().returns(of(true));

      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);
      mockInvokeFunction(invoke_function_stub);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(request, lambda_context).subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("020");
          done();
        },
      });
    });

    it("tokenCharge - success using validateBinInformationWithoutThrowError", (done: Mocha.Done) => {
      const token_reponse: SinonStub = sandbox.stub().returns(
        of({
          card: {
            bin: "1234567",
            maskedNumber: "123456XXXXXX0907",
            name: "Ted",
          },
          token: "aurus_token",
        })
      );

      get_merchants_stub = sandbox
        .stub()
        .onCall(0)
        .returns(of(merchant_fetch))
        .onCall(1)
        .returns(of({ ...merchant_fetch }));
      query_processors_stub = sandbox.stub().returns(of([processor_fetch]));
      invoke_function_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onCall(1)
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              ...bin_fetch,
              brand: "VISA",
              info: {
                country: {
                  name: "Mexico",
                },
                type: "credit",
              },
              invalid: true,
            })
          )
        )
        .onCall(2)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleBodyResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        )
        .onCall(3)
        .returns(
          of(
            Mock.of<{ body: AurusResponse }>({
              body: {
                response_code: "000",
                response_text: approved_trx,
                ticket_number: "123",
              },
            })
          )
        );

      put_stub = sandbox.stub().returns(of(true));
      put_sqs = sandbox.stub().returns(of(true));

      mockSqs(put_sqs);
      mockDynamoGateway(get_merchants_stub, query_processors_stub, put_stub);
      mockInvokeFunction(invoke_function_stub);
      mockProviderService(
        token_reponse,
        CardProviderEnum.AURUS,
        sandbox.stub().returns(
          of({
            response_code: "000",
            response_text: approved_trx,
            ticket_number: "123",
          })
        )
      );

      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(request, lambda_context).subscribe({
        error: done,
        next: (data: object): void => {
          expect(data).haveOwnProperty("ticketNumber");
          done();
        },
      });
    });

    // tslint:disable-next-line:max-func-body-length
    function tokenChargeAction(done: Mocha.Done): void {
      const token = sandbox.stub().returns(
        of({
          card: {
            bin: "123",
            maskedNumber: "12346XXXXXX0909",
            name: "Ted",
          },
          token: "aurus_token",
        })
      );

      get_merchants_stub = sandbox
        .stub()
        .onCall(0)
        .returns(of(merchant_fetch))
        .onCall(1)
        .returns(of({ ...merchant_fetch, sandboxEnable: false }));

      invoke_function_stub = sandbox
        .stub()
        .onCall(0)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "009022",
              },
            })
          )
        )
        .onCall(1)
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              ...bin_fetch,
              brand: "VISA",
              info: {
                country: {
                  name: CountryEnum.MEXICO,
                },
                type: "credit",
              },
            })
          )
        )
        .onCall(2)
        .returns(
          of(
            Mock.of<LambdaTransactionRuleBodyResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "009022",
              },
            })
          )
        )
        .onCall(3)
        .returns(
          of(
            Mock.of<{ body: AurusResponse }>({
              body: {
                response_code: "000123",
                response_text: approved_trx,
                ticket_number: "123555",
              },
            })
          )
        );

      const aurus_charge_stub: SinonStub = sandbox.stub().returns(
        of({
          response_code: "000",
          response_text: approved_trx,
          ticket_number: "123",
        })
      );

      put_sqs = sandbox.stub().returns(of(true));

      mockSqs(put_sqs);
      mockDynamoGateway(
        get_merchants_stub,
        sandbox.stub().returns(of([processor_fetch])),
        sandbox.stub().returns(of(true))
      );
      mockInvokeFunction(invoke_function_stub);
      mockProviderService(token, CardProviderEnum.AURUS, aurus_charge_stub);

      set(request, PATH_HIERARCHY_CONFIG, CONTEXT_HIERARCHY_CONFIG);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.tokenCharge(request, lambda_context).subscribe({
        complete: (): void => {
          expect(invoke_function_stub.getCall(2)).to.have.been.calledWithMatch(
            match.any,
            transaction_rule_response
          );
          done();
        },
      });
    }

    it("tokenCharge - OTP", (done: Mocha.Done) => {
      tokenChargeAction(done);
    });

    it("tokenCharge - Suscriptions", (done: Mocha.Done) => {
      request_authorize_context.kushkiMetadata = {
        origin: "sub",
        ownerMerchantId: "1234132",
      };
      set(
        request,
        "requestContext.kushkiMetadata",
        request_authorize_context.kushkiMetadata
      );
      tokenChargeAction(done);
    });
  });
});
