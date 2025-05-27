/**
 * TransactionService Unit Tests
 */
import {
  AurusError,
  DynamoEventNameEnum,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE_ID,
  IDynamoDbEvent,
  IDynamoElement,
  IDynamoRecord,
  ILambdaGateway,
  ISQSEvent,
  ISQSRecord,
  KushkiError,
} from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import {
  IdentityCategoryEnum,
  IdentityCodeEnum,
  ManagementIdEnum,
  ManagementValuesEnum,
  PartnerNameEnum,
  PaymentMethodsIdsEnum,
  PaymentMethodsNamesEnum,
  PlatformsCodesEnum,
  PlatformsNamesEnum,
} from "@kushki/core/lib/infrastructure/DataFormatterCatalogEnum";
import { IKushkiInfo } from "@kushki/core/lib/repository/IDataFormatter";
import { expect, use } from "chai";
import * as chaiJsonSchema from "chai-json-schema";
import { IDENTIFIERS } from "constant/Identifiers";
import { lorem } from "faker";
import * as fs from "fs";
import { DynamoGateway } from "gateway/DynamoGateway";
import { CategoryTypeEnum } from "infrastructure/CategoryTypeEnum";
import { ChannelEnum } from "infrastructure/ChannelEnum";
import { CONTAINER } from "infrastructure/Container";
import {
  AntiFraudErrorEnum,
  ERROR_REJECTED_TRANSACTION,
  ERRORS,
  RejectedSecureServiceCodes,
  RejectedTransactionEnum,
  WarningSecurityEnum,
} from "infrastructure/ErrorEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { PlatformsVersionEnum } from "infrastructure/KushkiInfoEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { ProcessorTypeEnum } from "infrastructure/ProcessorTypeEnum";
import { PartnerValidatorEnum } from "infrastructure/SecureIdentityEnum";
import { SQSChargesInput } from "infrastructure/SQSChargesInput";
import { SubscriptionAttemptMessageEnum } from "infrastructure/SubscriptionAttemptMessageEnum";
import {
  SubscriptionTriggerEnum,
  SubscriptionTrxTypeEnum,
} from "infrastructure/SubscriptionEnum";
import { TransactionActionEnum } from "infrastructure/TransactionActionEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import {
  SuccessfulAuthentication3DSEnum,
  TransactionStatusEnum,
  TRX_OK_RESPONSE_CODE,
} from "infrastructure/TransactionStatusEnum";
import { TransactionSyncModeEnum } from "infrastructure/TransactionSyncModeEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { WebpayIntegrationTypeEnum } from "infrastructure/WebpayIntegrationTypeEnum";
import { get, set, unset } from "lodash";
import { Done } from "mocha";
import "reflect-metadata";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IEventBridgeGateway } from "repository/IEventBridgeGateway";
import { ISQSGateway } from "repository/ISQSGateway";
import { ITransactionService, VoidBody } from "repository/ITransactionService";
import rollbar = require("rollbar");
import { Observable, Observer, of } from "rxjs";
import { delay } from "rxjs/operators";
import {
  createSandbox,
  match,
  SinonFakeTimers,
  SinonSandbox,
  SinonSpy,
  SinonStub,
  useFakeTimers,
} from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusResponse } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CaptureCardRequest } from "types/capture_card_request";
import { CardTrxFailed } from "types/card_trx_failed";
import { ChargesCardRequest } from "types/charges_card_request";
import { CreateSubscriptionMetadata } from "types/create_subscription_metadata";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { LambdaTransactionRuleResponse } from "types/lambda_transaction_rule_response";
import { RecordTransactionRequest } from "types/record_transaction_request";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { SaveCardTransactionsEvent } from "types/save_card_transactions_event";
import { SaveDeclineTrxRequest } from "types/save_decline_trx_request";
import { SyncTransactionStream } from "types/sync_transaction_stream";
import { TokenDynamo } from "types/token_dynamo";
import { Transaction } from "types/transaction";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { MessageFields } from "types/preauth_full_response_v2";

use(sinonChai);
use(chaiJsonSchema);

const TRX_REFERENCE: string = "124-345-556-677";
const ISO_CODE: string = "EC";
const COUNTRY_BIN: string = "Ecuador";
const MASTER_CARD: string = "Mastercard";
const CREDIMATIC: string = "Credimatic Processor";
const FAKE_CODE: string = "test_code";
const ECUADORIAN_PROCESSORS: string[] = [CREDIMATIC, "Datafast Processor"];
const PROCESSOR_NAME_PATH: string = "processor.processor_name";
const METADATA_SUBS_VALIDATION_PATH: string =
  "metadata.ksh_subscriptionValidation";
let gAurusResponse: AurusResponse;
let gMerchantFetch: DynamoMerchantFetch;
let gProcessorFetch: DynamoProcessorFetch;
let gBinFetch: DynamoBinFetch;
let gTokenDynamo: TokenDynamo;
let gGetItemStub: SinonStub;

// tslint:disable-next-line: max-func-body-length
function createSchemas(): void {
  gAurusResponse = Mock.of<AurusResponse>({
    approved_amount: "czxczx",
    recap: "sadads",
    response_code: "asdcxva",
    response_text: "sadbcvbs",
    ticket_number: "asasdass",
    transaction_details: {
      approvalCode: "q2eqeq",
      binCard: "bxbcv",
      cardHolderName: "sxzczc",
      cardType: "asgdfgs",
      isDeferred: "mvmbvcb",
      lastFourDigitsOfCard: "2432423",
      merchantName: "tryryt",
      processorBankName: "yryrty",
      processorName: "nvnvb",
    },
    transaction_id: "vxcvx",
    transaction_reference: "gfjgh",
  });
  gMerchantFetch = Mock.of<DynamoMerchantFetch>({
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
  gProcessorFetch = Mock.of<DynamoProcessorFetch>({
    merchant_id: "iuoi",
    private_id: "mossf",
    processor_name: "nnkjbj",
    processor_type: "mvsdv",
    public_id: "123456789",
    terminal_id: "pmkxnv",
  });
  gBinFetch = Mock.of<DynamoBinFetch>({
    bank: "zczxc",
    bin: "dvzxc",
    brand: "ioiou",
    processor: "edsgbdsvs",
  });
}

function dynamoBinding(put: SinonStub, box: SinonSandbox): void {
  gGetItemStub = box
    .stub()
    .onFirstCall()
    .returns(of(gMerchantFetch))
    .onSecondCall()
    .returns(of(gTokenDynamo))
    .onThirdCall()
    .returns(of(gProcessorFetch))
    .onCall(3)
    .returns(of(gBinFetch));

  CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
    Mock.of<IDynamoGateway>({
      put,
      getItem: gGetItemStub,
      queryReservedWord: box.stub().returns(of([])),
    })
  );
}

function lambdaStubTransactionRule(box: SinonSandbox): SinonStub {
  return box.stub().returns(
    of(
      Mock.of<{ body: LambdaTransactionRuleResponse }>({
        body: {
          privateId: gProcessorFetch.private_id,
          publicId: gProcessorFetch.public_id,
        },
      })
    )
  );
}

function lambdaServiceBinding(lambdaStub: SinonStub): void {
  CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeAsyncFunction: lambdaStub,
      invokeFunction: lambdaStub,
    })
  );
}

function rollbarInstance(box: SinonSandbox): void {
  const rollbar_instance: rollbar = Mock.of<rollbar>({
    critical: box.stub(),
    warn: box.stub(),
    warning: box.stub(),
  });

  CONTAINER.bind(CORE_ID.RollbarInstance).toConstantValue(Mock.of());
  CONTAINER.unbind(CORE_ID.RollbarInstance);
  CONTAINER.bind(CORE_ID.RollbarInstance).toConstantValue(rollbar_instance);
}

function getTransaction(
  type,
  status,
  ticketNumber,
  saleTicketNumber
): Transaction {
  return {
    approval_code: "",
    approved_amount: "czxczx",
    approved_transaction_amount: 0,
    bin_card: "",
    card_holder_name: "",
    created: 0,
    currency_code: "",
    iva_value: 0,
    last_four_digits: "",
    merchant_id: "",
    merchant_name: "",
    payment_brand: "",
    processor_bank_name: "",
    processor_id: "",
    processor_name: "",
    recap: "sadads",
    request_amount: 0,
    response_code: "asdcxva",
    response_text: "sadbcvbs",
    sale_ticket_number: saleTicketNumber,
    subtotal_iva: 0,
    subtotal_iva0: 0,
    sync_mode: "online",
    ticket_number: ticketNumber,
    transaction_details: {
      approvalCode: "q2eqeq",
      binCard: "bxbcv",
      cardHolderName: "sxzczc",
      cardType: "asgdfgs",
      isDeferred: "mvmbvcb",
      lastFourDigitsOfCard: "2432423",
      merchantName: "tryryt",
      processorBankName: "yryrty",
      processorName: "nvnvb",
    },
    transaction_id: "vxcvx",
    transaction_reference: "gfjgh",
    transaction_status: status,
    transaction_type: type,
  };
}

function chargeEventStatus(
  status,
  ticketNumber,
  saleTicketNumber
): SaveCardTransactionsEvent {
  return {
    aurusChargeResponse: Mock.of<AurusResponse>({
      approved_amount: "czxczx",
      indicator_3ds: "F",
      recap: "sadads",
      response_code: "asdcxva",
      response_text: "sadbcvbs",
      sale_ticket_number: saleTicketNumber,
      ticket_number: ticketNumber,
      transaction_details: {
        approvalCode: "q2eqeq",
        binCard: "bxbcv",
        cardHolderName: "sxzczc",
        cardType: "asgdfgs",
        isDeferred: "mvmbvcb",
        lastFourDigitsOfCard: "2432423",
        merchantName: "tryryt",
        processorBankName: "yryrty",
        processorName: "nvnvb",
      },
      transaction_id: "vxcvx",
      transaction_reference: "gfjgh",
    }),
    authorizerContext: Mock.of<AuthorizerContext>({
      credentialAlias: "credentialAlias",
      credentialId: "credential_id",
      credentialMetadata: { origin: "test", data: "test" },
      merchantCountry: "Ecuador",
      merchantData: { mcc: "mcc", merchantCategory: "merchantCategory" },
      merchantId: "2000000001291929192",
      publicMerchantId: "publicMerchantId",
      sandboxEnable: true,
    }),
    country: "NA",
    error:
      status === TransactionStatusEnum.DECLINED
        ? new AurusError("228", "Transacci?n.\nRechazo del banco.", {
            approvalCode: "000000",
            binCard: "450724",
            cardHolderName: "Juan Salvador",
            cardType: "VISA",
            isDeferred: "N",
            lastFourDigitsOfCard: "3249",
            merchantName: "",
            processorBankName: "",
            processorCode: "0001",
            processorMessage: "test",
            processorName: ECUADORIAN_PROCESSORS[0],
          })
        : null,
    integration: "aurus",
    merchantId: "2000000001291929192",
    merchantName: "name",
    partner: "",
    plccInfo: { flag: "0", brand: "" },
    processor: Mock.of<DynamoProcessorFetch>({
      created: 0,
      merchant_category_code: "",
      merchant_id: "2000000001291929192",
      password: "",
      private_id: "mossf",
      processor_merchant_id: "",
      processor_type: "gateway",
      public_id: "123456789",
      username: "",
    }),
    requestEvent: {
      amount: { iva: 12, subtotalIva: 100, subtotalIva0: 1000.04 },
      fullResponse: false,
      token: "asdad",
    },
    ruleInfo: { ip: "", maskedCardNumber: undefined, user_agent: "" },
    saleTicketNumber: null,
    siftValidation: false,
    tokenInfo: Mock.of<DynamoTokenFetch>({
      amount: 1112,
      bin: "bxbcv",
      binInfo: {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        info: {
          type: "debit",
        },
        processor: "Credimatic",
      },
      convertedAmount: undefined,
      lastFourDigits: "2432423",
      maskedCardNumber: "bxbcvXXXXXX2432423",
      merchantId: "2000000001291929192",
    }),
    trxType: TransactionRuleTypeEnum.CHARGE,
    whitelist: false,
  };
}

function captureEventsSQS(
  type: string,
  status: string,
  ticketNumber: string,
  saleTicketNumber: string
): ISQSEvent<Transaction> {
  const selected_body: Partial<Transaction> = getTransaction(
    type,
    status,
    ticketNumber,
    saleTicketNumber
  );

  return Mock.of<ISQSEvent<Transaction>>({
    Records: [
      {
        body: selected_body,
      },
    ],
  });
}

describe("TransactionService - record - ", () => {
  let box: SinonSandbox;
  let get_first: object | undefined;
  let get_second: object | undefined;
  let invoke_record: SinonStub;
  let get_bin_stub: DynamoBinFetch | undefined;
  let clock: SinonFakeTimers;

  function prepareTest(
    transaction: RecordTransactionRequest,
    returnQuery: boolean = false,
    returnSubsQuery: boolean = false
  ): {
    dynamo_put: SinonStub<
      [object, string, (string | undefined)?],
      Observable<boolean>
    >;
    dynamo_query: SinonStub<
      [
        string,
        IndexEnum,
        string,
        string,
        {
          FilterExpression?: string;
          ExpressionAttributeNames?: Record<string, string>;
          ExpressionAttributeValues?: Record<string, any>;
        }?
      ],
      Observable<unknown[]>
    >;
    service: ITransactionService;
    event: IAPIGatewayEvent<RecordTransactionRequest>;
    spy: SinonSpy;
    dynamo_get_item: SinonStub<
      [string, object],
      Observable<object | undefined>
    >;
  } {
    const dynamo_put: SinonStub<
      [object, string, (string | undefined)?],
      Observable<boolean>
    > = box.stub(DynamoGateway.prototype, "put").returns(of(true));
    const dynamo_query: SinonStub<
      [
        string,
        IndexEnum,
        string,
        string,
        {
          FilterExpression?: string;
          ExpressionAttributeNames?: Record<string, string>;
          ExpressionAttributeValues?: Record<string, any>;
        }?
      ],
      Observable<unknown[]>
    > = box
      .stub(DynamoGateway.prototype, "query")
      .onFirstCall()
      .returns(of(returnQuery ? [Mock.of<RecordTransactionRequest>()] : []))
      .onSecondCall()
      .returns(
        of(
          returnSubsQuery
            ? [{ subscriptionId: "1343", ticketNumber: "13343" }]
            : []
        )
      );
    const dynamo_get_item: SinonStub<
      [string, object],
      Observable<object | undefined>
    > = box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(
        of({ deferred: { graceMonths: "01", creditType: "02", months: 6 } })
      )
      .onSecondCall()
      .returns(of(get_first))
      .onThirdCall()
      .returns(of(get_second))
      .returns(of({ country: "Ecuador" }));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IAPIGatewayEvent<RecordTransactionRequest> = Mock.of<
      IAPIGatewayEvent<RecordTransactionRequest>
    >({
      body: transaction,
    });
    const spy: SinonSpy = box.spy();

    return { dynamo_put, dynamo_query, service, event, spy, dynamo_get_item };
  }

  beforeEach(async () => {
    box = createSandbox();
    clock = useFakeTimers();
    invoke_record = box
      .stub()
      .onFirstCall()
      .returns(of(get_bin_stub))
      .onSecondCall()
      .returns(
        of({
          body: {
            merchantId: "sdfdsfwe2",
            processorType: ProcessorTypeEnum.TRADITIONAL,
          },
        })
      )
      .returns(of(true));
    rollbarInstance(box);
    CONTAINER.snapshot();
    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invoke_record,
      })
    );
    process.env.MERCHANT_WITH_RECORD_API = "1111111";
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
    get_first = undefined;
    get_second = undefined;
    get_bin_stub = undefined;
    clock.restore();
  });
  it("test record - success with card transaction", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "1111",
        paymentBrand: "Visa",
        transactionId: lorem.word(),
      });
    const { dynamo_put, service, event, spy } = prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put.args[0][0]).to.be.eql({
          card_type: "credit",
          country: "Ecuador",
          created: 1514664690000,
          credit_type: "02",
          grace_months: "01",
          last_four_digits: transaction.lastFourDigitsOfCard,
          merchant_id: "sdfdsfwe2",
          number_of_months: 6,
          payment_brand: "Visa",
          processor_id: "1111",
          processor_type: ProcessorTypeEnum.GATEWAY,
          sync_mode: "api",
          transaction_id: transaction.transactionId,
        });
        expect(invoke_record).to.have.been.calledTwice;
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });

  it("test record - search with ticketNumber", (done: Mocha.Done) => {
    const ticket_number: string = "697123";
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "1111",
        paymentBrand: "Visa",
        ticketNumber: ticket_number,
        transactionId: lorem.word(),
      });
    const { dynamo_put, service, event, spy, dynamo_query } =
      prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_query.args[1][1]).to.be.eql("ticketNumberIndex");
        expect(dynamo_query.args[1][2]).to.be.eql("ticketNumber");
        expect(dynamo_query.args[1][3]).to.be.eql(ticket_number);
        expect(dynamo_put.args[0][0]).to.be.eql({
          ticket_number,
          card_type: "credit",
          country: "Ecuador",
          created: 1514664690000,
          credit_type: "02",
          grace_months: "01",
          last_four_digits: transaction.lastFourDigitsOfCard,
          merchant_id: "sdfdsfwe2",
          number_of_months: 6,
          payment_brand: "Visa",
          processor_id: "1111",
          processor_type: ProcessorTypeEnum.GATEWAY,
          sync_mode: "api",
          transaction_id: transaction.transactionId,
        });
        expect(invoke_record).to.have.been.calledTwice;
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });
  it("test record - search with transactionReference when ticketNumber is empty", (done: Mocha.Done) => {
    const transaction_reference = "123-456-123";
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "1111",
        paymentBrand: "Visa",
        ticketNumber: "",
        transactionId: lorem.word(),
        transactionReference: transaction_reference,
      });
    const { dynamo_put, service, event, spy, dynamo_query } =
      prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_query.args[1][1]).to.be.eql("transactionReferenceIndex");
        expect(dynamo_query.args[1][2]).to.be.eql("transactionReference");
        expect(dynamo_query.args[1][3]).to.be.eql(transaction_reference);
        expect(dynamo_put.args[0][0]).to.be.eql({
          transaction_reference,
          card_type: "credit",
          country: "Ecuador",
          created: 1514664690000,
          credit_type: "02",
          grace_months: "01",
          last_four_digits: transaction.lastFourDigitsOfCard,
          merchant_id: "sdfdsfwe2",
          number_of_months: 6,
          payment_brand: "Visa",
          processor_id: "1111",
          processor_type: ProcessorTypeEnum.GATEWAY,
          sync_mode: "api",
          transaction_id: transaction.transactionId,
        });
        expect(invoke_record).to.have.been.calledTwice;
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });

  it("test record - not save in card and not call subscriptionRecord", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "1111",
        transactionId: lorem.word(),
      });
    const { dynamo_put, service, event, spy } = prepareTest(
      transaction,
      false,
      true
    );

    service.record(event).subscribe({
      complete: (): void => {
        expect(invoke_record).to.have.calledTwice;
        expect(dynamo_put).to.have.not.been.called;
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });

  it("test record - timeout error", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "1111",
        transactionId: lorem.word(),
      });
    const { service, event, dynamo_get_item } = prepareTest(transaction);

    process.env.EXTERNAL_TIMEOUT = "110";
    dynamo_get_item.onSecondCall().returns(of({}).pipe(delay(210)));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: dynamo_get_item,
      })
    );

    service.record(event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.getStatusCode()).to.be.equal(400);
        expect(err.getMessage()).to.be.equal(
          "La operación cayó en timeout, por favor inténtelo de nuevo"
        );
        done();
      },
    });
    clock.tick(5000);
    clock.tick(110);
    process.env.EXTERNAL_TIMEOUT = undefined;
  });

  it("test record - success with card transaction falsy transactionReference", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "1111",
        transactionId: lorem.word(),
      });
    const { dynamo_put, service, event, spy } = prepareTest(transaction);

    set(transaction, "transactionReference", null);

    service.record(event).subscribe({
      complete: (): void => {
        expect(invoke_record).to.have.been.calledTwice;
        expect(dynamo_put.args[0][0]).not.to.haveOwnProperty(
          "transaction_reference"
        );
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });

  it("test record - success with subscription transaction", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "1111",
        transactionId: lorem.word(),
      });
    const { dynamo_put, service, event } = prepareTest(transaction);

    event.body.subscriptionId = "123123123";
    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put).to.not.have.called;
        expect(invoke_record).to.be.calledWithMatch(match.any, {
          merchantId: match.any,
          subscriptionId: event.body.subscriptionId,
        });
        done();
      },
      error: done,
    });
    clock.tick(5000);
  });

  it("test record - success when the merchant dont have record API service", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "2222",
        transactionId: lorem.word(),
      });
    const { service: service, event: event } = prepareTest(transaction);

    service.record(event).subscribe({
      next: (response: object): void => {
        expect(response).to.be.eql({ status: "OK" });

        done();
      },
    });
    clock.tick(5000);
  });

  it("test record - not aurus last four digits", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "1111",
        transactionId: lorem.word(),
      });
    const { dynamo_put, service, event, spy } = prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put.args[0][0])
          .haveOwnProperty("last_four_digits")
          .to.be.eql(transaction.lastFourDigitsOfCard);
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });

  it("test record - not process record with special merchants", (done: Mocha.Done) => {
    process.env.MERCHANT_WITH_RECORD_API = "1111111";
    process.env.MERCHANT_WITHOUT_RECORD_API = "2222,111,4444";

    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        lastFourDigitsOfCard: "9876",
        merchantId: "2222",
        transactionId: lorem.word(),
        transactionReference: "234565-342",
      });
    const {
      dynamo_put,
      service: service,
      event: event,
    } = prepareTest(transaction);

    service.record(event).subscribe({
      next: (response: object): void => {
        expect(dynamo_put).to.not.have.called;
        expect(response).to.be.eql({ status: "OK" });
        done();
      },
    });
    clock.tick(5000);
  });

  it("test record - success with metadata from aurus tables", (done: Mocha.Done) => {
    get_first = {
      TRANSACTION_METADATA: "{}",
    };
    get_second = {
      SUBSCRIPTION_METADATA: "{}",
    };
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        approvedTransactionAmount: 112,
        dateAndTimeTransaction: "30122017201130",
        merchantId: "1111111",
        Metadata: {
          qwerty: "lorem",
        },
        ticketNumber: lorem.word(),
        transactionId: "1324",
      });
    const { dynamo_put, service, event, spy } = prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put.getCall(0).args[0]).to.be.have.property(
          "approved_transaction_amount"
        );
        expect(spy).to.be.calledOnce.and.calledWithExactly({ status: "OK" });
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });
  it("test record - success with existing transaction", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>();
    const { dynamo_put, service, event, spy } = prepareTest(transaction, true);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put).to.not.be.called;
        expect(spy).to.be.calledOnce.and.calledWithExactly({ status: "OK" });
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });
  it("test record - success with empty string on fields", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        extraTaxes: "",
        merchantId: "1111111",
        numberOfMonths: 0,
        partner: "transunion",
        saleTicketNumber: "",
        ticketNumber: "",
        transactionId: lorem.word(),
      });

    get_bin_stub = {
      bank: "TEST BANK",
      bin: "1234",
      brand: "Test",
      info: {
        type: "DEBIT",
      },
      processor: "test",
    };

    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(of(get_bin_stub))
          .onSecondCall()
          .returns(
            of({
              body: {
                merchantId: "22222",
                processorType: ProcessorTypeEnum.TRADITIONAL,
              },
            })
          )
          .returns(of(true)),
      })
    );

    const { dynamo_put, service, event, spy } = prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(spy).to.be.calledOnce.and.calledWithExactly({ status: "OK" });
        expect(dynamo_put.args[0][0]).to.be.eql({
          card_type: "debit",
          country: "Ecuador",
          created: 1514664690000,
          credit_type: "02",
          grace_months: "01",
          merchant_id: "22222",
          number_of_months: 6,
          partner: "transunion",
          payment_brand: "Test",
          processor_id: "1111111",
          processor_type: ProcessorTypeEnum.GATEWAY,
          sync_mode: "api",
          transaction_id: transaction.transactionId,
        });
        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });
  it("test record - success with empty saleTicketNumber", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        dateAndTimeTransaction: "30122017201130",
        merchantId: "1111111",
        paymentBrand: "Visa",
        saleTicketNumber: "",
        transactionId: lorem.word(),
      });

    box.stub(DynamoGateway.prototype, "query").returns(of([]));
    const dynamo_put: SinonStub<
      [object, string, (string | undefined)?],
      Observable<boolean>
    > = box.stub(DynamoGateway.prototype, "put").returns(of(true));

    box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(of({}))
      .onSecondCall()
      .returns(of(get_first))
      .onThirdCall()
      .returns(of(get_second))
      .returns(of({ country: "Ecuador" }));

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IAPIGatewayEvent<RecordTransactionRequest> = Mock.of<
      IAPIGatewayEvent<RecordTransactionRequest>
    >({
      body: transaction,
    });
    const spy: SinonSpy = box.spy();

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put.args[0][0]).to.be.eql({
          card_type: "credit",
          country: "Ecuador",
          created: 1514664690000,
          merchant_id: "sdfdsfwe2",
          payment_brand: "Visa",
          processor_id: "1111111",
          processor_type: ProcessorTypeEnum.GATEWAY,
          sync_mode: "api",
          transaction_id: transaction.transactionId,
        });

        done();
      },
      error: done,
      next: spy,
    });
    clock.tick(5000);
  });
  it("test record - error K003", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest =
      Mock.of<RecordTransactionRequest>({
        merchantId: "1111",
        transactionId: lorem.word(),
      });

    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(of(get_bin_stub))
          .onSecondCall()
          .returns(of(undefined))
          .returns(of(true)),
      })
    );

    box.stub(DynamoGateway.prototype, "query").returns(of([]));
    box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(of(undefined))
      .onSecondCall()
      .returns(of(get_bin_stub))
      .onThirdCall()
      .returns(of(get_first))
      .onCall(3)
      .returns(of(get_second))
      .onCall(4)
      .returns(of(undefined));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IAPIGatewayEvent<RecordTransactionRequest> = Mock.of<
      IAPIGatewayEvent<RecordTransactionRequest>
    >({
      body: transaction,
    });
    const spy: SinonSpy = box.spy();

    service.record(event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq("K003");
        done();
      },
      next: spy,
    });
    clock.tick(5000);
  });
});

describe("Transaction Service - sync - ", () => {
  let box: SinonSandbox;
  let service_stub: ITransactionService;
  let sync_transaction_mock: object;
  let put_events_stub: SinonStub;
  let event: IDynamoDbEvent<SyncTransactionStream>;
  let event_sqs: ISQSEvent<CardTrxFailed>;
  let card_fetch: CardTrxFailed;

  function mockDynamoStream(eventName: DynamoEventNameEnum) {
    event = Mock.of<IDynamoDbEvent<SyncTransactionStream>>({
      Records: [
        Mock.of<IDynamoRecord<SyncTransactionStream>>({
          eventName,
          dynamodb: Mock.of<IDynamoElement<SyncTransactionStream>>({
            NewImage: sync_transaction_mock,
          }),
        }),
      ],
    });
  }

  beforeEach(async () => {
    card_fetch = {
      description: "description",
      message: "message",
      priority: "critical",
      transaction: {
        transactionReference: "transactionreference",
      },
    };
    sync_transaction_mock = {
      approved_transaction_amount: 112,
      bin_card: "424242",
      card_type: "DEBIT",
      country: "Ecuador",
      created: 1514664690000,
      foreign_card: false,
      last_four_digits: "19876",
      merchant_id: "1111111",
      metadata: {
        qwerty: "lorem",
        value: {
          id: "12012012",
        },
      },
      original_bin: "4364024727",
      payment_brand: "MasterCard",
      processor_id: "1111111",
      processor_name: "Qwerty Processor",
      recap: "12345",
      response_text:
        "Lorem ipsum dolor sit amet, id euismod inermis copiosae sit. No officiis philosophia quo. Duo ad dicam nostro",
      secure_reason_code: FAKE_CODE,
      security: {
        partner: ["transunion", "sift"],
        whitelist: true,
      },
      subscription_metadata: {
        asdfg: "ipsum",
      },
      transaction_id: lorem.word(),
      transaction_status: "APPROVAL",
      transaction_type: "PREAUTHORIZATION",
    };

    event_sqs = Mock.of<ISQSEvent<CardTrxFailed>>({
      Records: [
        Mock.of<ISQSRecord<CardTrxFailed>>({
          body: Mock.of<CardTrxFailed>(card_fetch),
        }),
      ],
    });

    box = createSandbox();
    CONTAINER.snapshot();
    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<DynamoBinFetch>({
              info: {
                country: {
                  alpha2: ISO_CODE,
                  name: COUNTRY_BIN,
                  numeric: "218",
                },
              },
            })
          )
        ),
      })
    );
    put_events_stub = box.stub().returns(of(true));
    CONTAINER.rebind(IDENTIFIERS.EventBridgeGateway).toConstantValue(
      Mock.of<IEventBridgeGateway>({
        putEvent: put_events_stub,
      })
    );
    rollbarInstance(box);
    process.env.MERCHANT_WITH_RECORD_API = "1111111";
    mockDynamoStream(DynamoEventNameEnum.INSERT);
    service_stub = CONTAINER.get(IDENTIFIERS.TransactionService);
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test sync, success with partner validator", (done: Mocha.Done) => {
    service_stub.syncRedshift(event).subscribe({
      next: (data: boolean) => {
        expect(data).to.be.eql(true);
        done();
      },
    });
  });

  it("test sync elastic, success with a bad last four digit value and so log response text", (done: Mocha.Done) => {
    service_stub.syncTransactions(event).subscribe({
      next: (data: boolean) => {
        expect(data).to.be.eql(true);
        expect(put_events_stub).to.be.calledOnce;
        expect(
          put_events_stub.args[0][0].payload.dynamodb.NewImage
            .secure_reason_code
        ).to.be.equal(FAKE_CODE);
        done();
      },
    });
  });

  it("test sync elastic, not should sync to EventBridge with REMOVE event", (done: Mocha.Done) => {
    mockDynamoStream(DynamoEventNameEnum.REMOVE);
    service_stub.syncTransactions(event).subscribe({
      next: (data: boolean) => {
        expect(data).to.be.eql(true);
        expect(put_events_stub).to.be.not.called;
        done();
      },
    });
  });

  it("test sync billing, success with otp information", (done: Mocha.Done) => {
    service_stub.syncBilling(event).subscribe({
      next: (data: boolean) => {
        expect(data).to.be.eql(true);
        done();
      },
    });
  });

  it("test save card trx failed, success sent transaction reference to lambda sendOpsCustomAlert", (done: Mocha.Done) => {
    service_stub.saveCardTrxFailed(event_sqs).subscribe({
      complete: (): void => {
        done();
      },
    });
  });
});

function mockProcessor(processor: DynamoProcessorFetch, sinonStub: SinonStub) {
  processor.processor_type = ProcessorTypeEnum.AGGREGATOR;
  processor.category_model = CategoryTypeEnum.COLLECTION;

  CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
  CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
    Mock.of<IDynamoGateway>({
      put: sinonStub,
    })
  );
}

describe("Transaction Service - processRecord", () => {
  const msg_trx = "Transacción rechazada";

  let box: SinonSandbox;
  let processor: DynamoProcessorFetch;
  let rollbar_critical_stub: SinonStub;
  let event: ChargesCardRequest;
  let authorizer_context: AuthorizerContext;
  let aurus_response: AurusResponse;
  let dynamo_response: DynamoTokenFetch;
  let dynamo_merchant: DynamoMerchantFetch;
  let put_stub: SinonStub;
  const card_request: ChargesCardRequest = {
    amount: {
      currency: "USD",
      ice: 1,
      iva: 1,
      subtotalIva: 1,
      subtotalIva0: 0,
    },
    contactDetails: {
      documentNumber: "12312",
      documentType: "qweq",
    },
    deferred: {
      creditType: "04",
      graceMonths: "4",
      months: 6,
    },
    token: "234",
  };

  function mockParameters() {
    event = Mock.of<ChargesCardRequest>(card_request);
    authorizer_context = Mock.of<AuthorizerContext>({
      credentialAlias: "credentialAlias",
      credentialId: "credential_id",
      credentialMetadata: { origin: "test", data: "test" },
      customerMerchantId: "customerMerchant_id",
      merchantId: "merchant_id",
      publicMerchantId: "publicMerchantId",
      ownerId: "owner_id",
    });
    aurus_response = Mock.of<AurusResponse>({
      approved_amount: "10",
      recap: "12345",
      response_text: "Transacción aprobada.",
      ticket_number: "1230987654",
      transaction_details: {
        approvalCode: "1234",
        binCard: "123456",
        cardHolderName: "Juan Piwaves",
        cardType: "",
        conciliationId: "1234|debit",
        lastFourDigitsOfCard: "1234",
        merchantName: "Merchant",
        processorBankName: "Bank",
        processorName: "Processor",
      },
      transaction_id: "123",
    });

    dynamo_response = Mock.of<DynamoTokenFetch>({
      "3ds": {
        authentication: true,
        detail: {
          cavv: "1222",
          eci: "122",
          specificationVersion: 12,
          veresEnrolled: "122",
          xid: "11",
        },
      },
      amount: 100,
      bin: "438108",
      binInfo: {
        bank: "Bco. Pichincha",
        bin: "438108",
        brand: "VISA",
        consortiumName: "testing",
        processor: "",
      },
      created: 120120103013,
      currency: "USD",
      id: "",
      ip: "0.0.0.0",
      lastFourDigits: "4242",
      maskedCardNumber: "438108xxxx4242",
      merchantId: "",
      secureId: "123455",
      secureService: "3dsecure",
      settlement: 1,
      vaultToken: "34242",
    });

    dynamo_merchant = {
      commission: false,
      contactPerson: "person",
      deferredOptions: true,
      email: "mail",
      merchant_id: "123",
      merchant_name: "Merchant",
      merchantCategory: "merchantCategoryTest",
      multi_merchant: true,
      private_id: "pid",
      public_id: "id",
      sift_science: {
        SandboxAccountId: "sai",
        SandboxApiKey: "apk",
        SiftScore: 22,
      },
      socialReason: "socialReasonTest",
      taxId: "324234",
    };
  }

  beforeEach(() => {
    box = createSandbox();
    put_stub = box.stub().returns(of(true));
    processor = Mock.of<DynamoProcessorFetch>({
      acquirer_bank: "Banco Del Pacifico",
      commerce_code: "555",
      private_id: "434",
      processor_type: "traditional",
      public_id: "323",
    });
    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({})
    );

    rollbar_critical_stub = box.stub();

    CONTAINER.bind(CORE_ID.RollbarInstance).toConstantValue(Mock.of());
    CONTAINER.unbind(CORE_ID.RollbarInstance);
    CONTAINER.bind(CORE_ID.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        critical: rollbar_critical_stub,
        warn: rollbar_critical_stub,
        warning: box.stub(),
      })
    );
    mockParameters();
    CONTAINER.snapshot();
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function mockGatewaysForTransbank(
    getItemStub: SinonStub,
    putSub: SinonStub,
    plccInfo: { flag: string; brand: string } = { flag: "0", brand: "Prosa" },
    invokeStub: SinonStub = getItemStub
  ): Observable<Transaction> {
    aurus_response.transaction_details.processorName = ProcessorEnum.TRANSBANK;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: getItemStub,
        put: putSub,
      })
    );

    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invokeStub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    return service.processRecord({
      plccInfo,
      processor,
      aurusChargeResponse: aurus_response,
      authorizerContext: authorizer_context,
      country: "Ecuador",
      error: undefined,
      merchantId: "123",
      merchantName: "Merchant",
      requestEvent: event,
      ruleInfo: { ip: "0.0.0.0" },
      saleTicketNumber: undefined,
      tokenInfo: dynamo_response,
    });
  }

  function expectTrxErrorK322(putStub: SinonStub, done: Done) {
    return {
      complete: (): void => {
        expect(putStub).to.be.calledOnce;
        done();
      },
      error: done,
      next: (trx: Transaction): void => {
        expect(trx.response_code).to.be.eql("K322");
        expect(trx).to.haveOwnProperty("rules");
        expect(get(trx, "rules.length")).to.be.eqls(1);
        expect(putStub.args[0][0]).to.have.property("secure_code");
        expect(putStub.args[0][0]).to.have.property("secure_message");
        expect(putStub.args[0][0]).to.have.property("secure_reason_code");
        expect(trx).to.not.have.all.keys("secure_code", "secure_message");
      },
    };
  }

  it("happy path", (done: Mocha.Done) => {
    process.env.CLARO_EC_MERCHANTS =
      "10123114675870618479151614455398,20000000106533736000";

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    dynamo_response.binInfo!.info = {
      country: {
        alpha2: "CountryCode",
        name: "CountryName",
      },
    };

    set(event, "subscriptionTrigger", "someSubscriptionTrigger");
    set(event, "provider", "kushki");
    set(aurus_response, "account_type", "test");
    set(dynamo_response, "secureService", "3dsecure");
    set(event, "usrvOrigin", UsrvOriginEnum.COMMISSION);

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: aurus_response,
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: "direct",
        integrationMethod: WebpayIntegrationTypeEnum.REST,
        merchant: dynamo_merchant,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: event,
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: dynamo_response,
        trxRuleMetadata: {
          rules: [
            {
              code: WarningSecurityEnum.K327,
              message: "procesador",
            },
          ],
        },
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          const put_args = put_stub.args[0][0];

          expect(put_stub).to.be.calledOnce;
          expect(put_args)
            .to.haveOwnProperty("social_reason")
            .to.be.eq(dynamo_merchant.socialReason);
          expect(put_args)
            .to.haveOwnProperty("rules")
            .to.be.eqls([
              {
                code: "000",
                message: "Autenticación exitosa",
              },
            ]);
          expect(put_args)
            .to.haveOwnProperty("category_merchant")
            .to.be.eq(dynamo_merchant.merchantCategory);
          expect(put_args)
            .to.haveOwnProperty("tax_id")
            .to.be.eq(dynamo_merchant.taxId);
          expect(put_args)
            .to.haveOwnProperty("card_country_code")
            .to.be.eq(dynamo_response.binInfo?.info?.country?.alpha2);
          expect(put_args)
            .to.haveOwnProperty("card_country")
            .to.be.eq(dynamo_response.binInfo?.info?.country?.name);
          expect(box.stub(rollbar.prototype, "critical")).to.have.been.not
            .called;
          expect(put_stub).to.be.calledWithMatch({
            country: "Ecuador",
            foreign_card: true,
          });
          expect(put_stub.args[0][0].consortium_name).to.be.equal("testing");
          expect(put_stub.args[0][0].integration_method).to.be.equal(
            WebpayIntegrationTypeEnum.REST
          );
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          );
          expect(trx.payment_brand).to.be.eq("Visa");
          expect(get(trx, "security.id")).to.be.eq("123455");
          expect(get(trx, "security.service")).to.be.eq("3dsecure");
          expect(get(trx, "security.3ds.cavv")).to.be.eq("1222");
          expect(get(trx, "security.3ds.eci")).to.be.eq("122");
          expect(get(trx, "security.3ds.specificationVersion")).to.be.eq(12);
          expect(get(trx, "security.3ds.veresEnrolled")).to.be.eq("122");
          expect(get(trx, "security.3ds.xid")).to.be.eq("11");
          expect(trx.action).to.be.undefined;
          expect(trx).to.not.have.property("social_reason");
          expect(trx).to.not.have.property("category_merchant");
          expect(trx).to.not.have.property("tax_id");
          expect(trx).to.not.have.property("card_country_code");
          expect(trx).to.not.have.property("card_country");
        },
      });
  });

  it("should save transaction with mccCode", (done: Mocha.Done) => {
    process.env.CLARO_EC_MERCHANTS = "10123114675870618479151614455398";

    processor.sub_mcc_code = "1234";

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: aurus_response,
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: undefined,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: event,
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: dynamo_response,
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          expect(box.stub(rollbar.prototype, "critical")).to.have.been.not
            .called;
          expect(put_stub).to.be.calledWithMatch({
            country: "Ecuador",
            foreign_card: true,
            mccCode: "1234",
          });
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(get(trx, "mccCode")).to.be.eq("1234");
          expect(trx.action).to.be.undefined;
        },
      });
  });

  it("should save transaction with buy_order", (done: Mocha.Done) => {
    process.env.CLARO_EC_MERCHANTS = "10123114675870618479151614455398";

    const pre_auth_trx: Transaction = Mock.of<Transaction>({
      approval_code: "650552",
      approved_transaction_amount: 5,
      bin_card: "438108",
      buy_order: "107680",
      card_holder_name: "CEDENO GILSON",
      created: 1539186862000,
      currency_code: "USD",
      iva_value: 0.54,
      last_four_digits: "1652",
      maskedCardNumber: "123456xxxxxx1234",
      merchant_id: "10123113252892681113149503222945",
      merchant_name: "Tuenti USSD",
      payment_brand: "Visa",
      processor_bank_name: "BANCO INTERNACIONAL",
      processor_id: "10123113252892681113149503222945",
      processor_name: CREDIMATIC,
      recap: "834234",
      request_amount: 5,
      subtotal_iva: 4.46,
      subtotal_iva0: 0,
      sync_mode: "online",
      ticket_number: "182834286453603435",
      transaction_id: "109182834286453627",
      transaction_status: "APPROVAL",
      transaction_type: "capture",
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    aurus_response.maskedCardNumber = "12345678xxxx1234";

    service
      .processRecord({
        processor,
        aurusChargeResponse: aurus_response,
        authorizerContext: authorizer_context,
        country: "Chile",
        error: undefined,
        integration: undefined,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: event,
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: dynamo_response,
        transaction: pre_auth_trx,
        trxType: "capture",
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          expect(put_stub).to.be.calledOnce;
          expect(put_stub).to.be.calledWithMatch({
            buy_order: "107680",
          });
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(get(trx, "buy_order")).to.be.eq("107680");
        },
      });
  });

  it("should put otp in action", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    event.channel = ChannelEnum.OTP_CHANNEL;

    service
      .processRecord({
        processor,
        aurusChargeResponse: aurus_response,
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: event,
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: dynamo_response,
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          expect(box.stub(rollbar.prototype, "critical")).to.have.been.not
            .called;
          expect(put_stub).to.be.calledWithMatch({
            action: TransactionActionEnum.OTP,
          });
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.action).to.be.equal(TransactionActionEnum.OTP);
        },
      });
  });

  it("should put subscription in action", (done: Mocha.Done) => {
    authorizer_context = {
      ...authorizer_context,
      kushkiMetadata: {
        origin: TransactionActionEnum.SUBSCRIPTION,
        ownerMerchantId: "",
      },
    };

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: aurus_response,
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: undefined,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: event,
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: dynamo_response,
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          expect(box.stub(rollbar.prototype, "critical")).to.have.been.not
            .called;
          expect(put_stub).to.be.calledWithMatch({
            action: TransactionActionEnum.SUBSCRIPTION,
          });
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.action).to.be.equal(TransactionActionEnum.SUBSCRIPTION);
        },
      });
  });

  it("When card brand is different from visa or mastercard, it should call accountInfo lambda and update deferred-bins table", (done: Mocha.Done) => {
    const get_item_stub: SinonStub = box.stub().returns(of());
    const invoke_stub: SinonStub = box.stub().returns(
      of({
        info: {
          type: "credit",
        },
      })
    );

    mockGatewaysForTransbank(
      get_item_stub,
      put_stub,
      undefined,
      invoke_stub
    ).subscribe({
      complete: () => {
        expect(invoke_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledTwice;
        done();
      },
    });
  });

  it("When card brand is visa, it should not call accountInfo lambda or update deferred-bins table", (done: Mocha.Done) => {
    const get_item_stub: SinonStub = box.stub().returns(of());
    const plcc_info: { flag: string; brand: string } = {
      flag: "0",
      brand: "Visa",
    };
    const invoke_stub: SinonStub = box.stub().returns(of());

    mockGatewaysForTransbank(
      get_item_stub,
      put_stub,
      plcc_info,
      invoke_stub
    ).subscribe({
      complete: () => {
        expect(invoke_stub).not.to.be.called;
        expect(put_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("Should return true when query a bin that exist", (done: Mocha.Done) => {
    const get_item_stub: SinonStub = box.stub().returns(
      of({
        bank: "Test bank",
        bin: "1234",
        brand: "VISA",
        info: {
          type: "credit",
        },
        processor: "Processor",
      })
    );

    mockGatewaysForTransbank(get_item_stub, put_stub).subscribe({
      complete: () => {
        expect(get_item_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledTwice;
        done();
      },
    });
  });
  it("When transbank transaction and no bin_card should not update bin info", (done: Mocha.Done) => {
    const get_item_stub: SinonStub = box.stub().returns(
      of({
        bank: "Test bank",
        bin: "1234",
        brand: "VISA",
        info: {
          type: "credit",
        },
        processor: "Processor",
      })
    );

    dynamo_response = Mock.of<DynamoTokenFetch>({
      "3ds": {
        authentication: true,
        detail: {
          cavv: "1222",
          eci: "122",
          specificationVersion: 12,
          veresEnrolled: "1232",
          xid: "11",
        },
      },
      amount: 100,
      bin: "",
      binInfo: {
        bank: "Banco Mundial",
        bin: "",
        brand: "VISA",
        consortiumName: "testing",
        processor: "",
      },
      created: 120120103013,
      currency: "USD",
      id: "",
      ip: "0.0.0.0",
      lastFourDigits: "4242",
      maskedCardNumber: "4328xxxx4242",
      merchantId: "",
      secureId: "123455",
      secureService: "3dsecure",
      settlement: 1,
      vaultToken: "342422",
    });
    mockGatewaysForTransbank(get_item_stub, put_stub).subscribe({
      complete: () => {
        expect(get_item_stub).not.to.be.called;
        expect(put_stub).to.be.calledOnce;
        done();
      },
    });
  });
  it("Should return true when query a bin that exist and it is equal", (done: Mocha.Done) => {
    const get_item_stub: SinonStub = box.stub().returns(
      of({
        bank: "My bank",
        bin: "123456",
        brand: "VISA",
        info: {
          type: "debit",
        },
        processor: "My Processor",
      })
    );

    mockGatewaysForTransbank(get_item_stub, put_stub).subscribe({
      complete: () => {
        expect(get_item_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("Should return undefined when query a bin that doesn't exist", (done: Mocha.Done) => {
    const get_item_stub: SinonStub = box.stub().returns(of(undefined));

    mockGatewaysForTransbank(get_item_stub, put_stub).subscribe({
      complete: () => {
        expect(get_item_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("should save transaction but not throw rollbar critical for convertedAmount", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          processor_transaction_id: "processor_transaction_id",
          purchase_Number: "purchase_number",
          recap: "12345",
          ticket_number: "1230987654",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Tony Montana",
            cardType: "",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "UF",
            extraTaxes: {
              agenciaDeViaje: 0,
              iac: 0,
              propina: 0,
              tasaAeroportuaria: 0,
            },
            ice: 0,
            iva: 1,
            subtotalIva: 10,
            subtotalIva0: 0,
          },
          contactDetails: {
            documentNumber: "12312",
            documentType: "qweq",
          },
          deferred: {
            creditType: "04",
            graceMonths: "4",
            months: 6,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 11,
          bin: "438108",
          binInfo: {
            bank: "Banco. Nacional",
            bin: "438108",
            brand: "VISA",
            processor: "",
          },
          convertedAmount: {
            currency: "CLP",
            totalAmount: 315587,
          },
          created: 120120103013,
          currency: "CLP",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
        }),
      })
      .subscribe({
        complete: (): void => {
          expect(rollbar_critical_stub).to.have.not.been.called;
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.payment_brand).to.be.eq("Visa");
          expect(get(trx, "security.id")).to.be.eq("123455");
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          );
          expect(get(trx, "security.service")).to.be.eq("2345");
        },
      });
  });

  it("should save transaction with convertedAmount when is capture", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "12345",
          ticket_number: "1230987654",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Tony Stark",
            cardType: "",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: undefined,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<CaptureCardRequest>({
          contactDetails: {
            documentNumber: "12312",
            documentType: "qweq",
          },
          deferred: {
            creditType: "04",
            graceMonths: "4",
            months: 6,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 11,
          bin: "438108",
          binInfo: {
            bank: "Bco. Nacional",
            bin: "438108",
            brand: "VISA",
            processor: "",
          },
          convertedAmount: {
            currency: "CLP",
            totalAmount: 315587,
          },
          created: 120120103013,
          currency: "CLP",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.payment_brand).to.be.eq("Visa");
          expect(put_stub).to.be.calledOnce;
          expect(put_stub).calledWithMatch({
            preauth_transaction_reference: trx.transaction_reference,
          });
          expect(rollbar_critical_stub).to.have.not.been.called;
          done();
        },
      });
  });

  it("should save transaction and throw rollbar critical for different amount", (done: Mocha.Done) => {
    process.env.THRESHOLD_AMOUNT = "0.03";

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "100",
          recap: "12345",
          ticket_number: "1230987654",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Tony Stark",
            cardType: "",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            ice: 1,
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
          contactDetails: {
            documentNumber: "12312",
            documentType: "qweq",
          },
          deferred: {
            creditType: "04",
            graceMonths: "4",
            months: 6,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "438108",
          binInfo: {
            bank: "Bco. Nacional",
            bin: "438108",
            brand: "VISA",
            processor: "",
          },
          created: 120120103013,
          currency: "CLP",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(rollbar_critical_stub).to.have.been.called;
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.payment_brand).to.be.eq("Visa");
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          );
        },
      });
  });

  it("if error 228 it should delete ticket_number", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "12345",
          ticket_number: "1230987654",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Arcoiris",
            cardType: "",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        authorizerContext: authorizer_context,
        country: "Colombia",
        error: new AurusError("228", "Unreachable processor"),
        integration: undefined,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            ice: 1,
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
          contactDetails: {
            documentNumber: "12312",
            documentType: "qweq",
          },
          deferred: {
            creditType: "04",
            graceMonths: "4",
            months: 6,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "438108",
          binInfo: {
            bank: "Bco. Pichincha",
            bin: "438108",
            brand: "VISA",
            info: {
              country: {
                name: "Colombia",
              },
            },
            processor: "",
          },
          created: 120120103013,
          currency: "USD",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          expect(put_stub).to.be.calledWithMatch({
            country: "Colombia",
            foreign_card: false,
          });
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(get(trx, "ticket_number")).to.be.undefined;
        },
      });
  });

  it("if error 500 it shouldnt have a ticket number an obtain some data from token info", (done: Mocha.Done) => {
    const rs_text: string = "Procesador inalcanzable";

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "0",
          recap: "",
          response_code: "500",
          response_text: rs_text,
          ticket_number: undefined,
          transaction_details: undefined,
          transaction_id: "1590785570539853200",
        }),
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: new AurusError("500", rs_text),
        integration: undefined,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        processor: { ...processor, processorName: ProcessorEnum.DATAFAST },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            ice: 1,
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
          contactDetails: {
            documentNumber: "12312",
            documentType: "qweq",
          },
          deferred: {
            creditType: "04",
            graceMonths: "4",
            months: 6,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "438108",
          binInfo: {
            bank: "Bco. Del Austro",
            bin: "438108",
            brand: "VISA",
            processor: "",
          },
          created: 120120103013,
          currency: "USD",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
          transactionReference: "127b438b-a5b7-43b3-b8d1-ad97bb92793d",
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(get(trx, "ticket_number")).to.be.undefined;
          expect(get(trx, "response_text")).to.be.eqls(rs_text);
        },
      });
  });

  it("if error K006 is in response", (done: Mocha.Done) => {
    process.env.CLARO_EC_MERCHANTS =
      "10123114675870618479151614455398,20000000106533736000";

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "12345",
          ticket_number: "1230987654",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Arcoiris",
            cardType: "",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Test Processor",
          },
          transaction_id: "123",
        }),
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: new AurusError("K006", "Test generic error", {
          processorCode: "DF02",
          processorName: "Test Processor",
        }),
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: "transunion",
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            ice: 1,
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
          contactDetails: {
            documentNumber: "12312",
            documentType: "qweq",
          },
          deferred: {
            creditType: "04",
            graceMonths: "4",
            months: 6,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: true,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "438108",
          binInfo: {
            bank: "Banco Pichincha",
            bin: "438108",
            brand: "VISA",
            info: {
              country: {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                name: null,
              },
            },
            processor: "",
          },
          created: 120120103013,
          currency: "USD",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "20000000106533736000",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
        }),
        trxType: "CHARGE",
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(get(trx, "ticket_number")).to.be.not.undefined;
        },
      });
  });

  it("if error was homologated it shouldn't throw rollbar warning", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    const aurus_response_mock: AurusResponse = {
      approved_amount: "10",
      recap: "12345",
      response_code: "K006",
      response_text: "message",
      ticket_number: "1230987654",
      transaction_details: {
        approvalCode: "1234",
        binCard: "123456",
        cardHolderName: "Juan",
        cardType: "",
        isDeferred: "",
        lastFourDigitsOfCard: "1234",
        merchantName: "Merchant",
        processorBankName: "Bank",
        processorName: "Transbank Processor",
      },
      transaction_id: "123",
      transaction_reference: "12314",
    };

    service
      .processRecord({
        processor,
        aurusChargeResponse: aurus_response_mock,
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: new AurusError("006", "Test generic error", {
          processorCode: "-5",
          processorName: "Transbank Processor",
        }),
        integration: undefined,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            ice: 1,
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
          contactDetails: {
            documentNumber: "12312",
            documentType: "qweq",
          },
          deferred: {
            creditType: "04",
            graceMonths: "4",
            months: 6,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "438108",
          binInfo: {
            bank: "Banco Pichincha",
            bin: "438108",
            brand: "VISA",
            processor: "",
          },
          created: 120120103013,
          currency: "USD",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(get(trx, "ticket_number")).to.be.not.undefined;
        },
      });
  });

  it("happy path, Master Card", (done: Mocha.Done) => {
    mockProcessor(processor, put_stub);

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          ticket_number: "1235672839",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Piwaveeeee",
            cardType: "MASTERCARD",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: authorizer_context,
        country: "Colombia",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: undefined,
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
        }),
        ruleInfo: {},
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "436402",
          created: 12139931921,
          currency: "USD",
          id: "12120000102192",
          lastFourDigits: "1111",
          maskedCardNumber: "436402XXXX1111",
          merchantId: "12129139193",
        }),
        trxType: "preauthorization",
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.payment_brand).to.be.eq(MASTER_CARD);
          expect(get(trx, "processor_type")).to.be.equal(
            "aggregator_collection"
          );
        },
      });
  });

  it("happy path, with commerce_code on processor", (done: Mocha.Done) => {
    mockProcessor(processor, put_stub);

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          ticket_number: "1235672839",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Piwave",
            cardType: "MASTERCARD",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: authorizer_context,
        country: "Colombia",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: undefined,
        processor: { ...processor, processor_merchant_id: "8348743787834" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
        }),
        ruleInfo: {},
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "436402",
          created: 12139931921,
          currency: "USD",
          id: "12120000102192",
          lastFourDigits: "1111",
          maskedCardNumber: "436402XXXX1111",
          merchantId: "12129139193",
        }),
        trxType: "preauthorization",
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.payment_brand).to.be.eq(MASTER_CARD);
          expect(get(trx, "processor_type")).to.be.equal(
            "aggregator_collection"
          );
          expect(trx.processor_merchant_id).to.be.eq("8348743787834");
        },
      });
  });

  it("happy path, processor type is not defined", (done: Mocha.Done) => {
    unset(processor, "processor_type");

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          ticket_number: "1235672839",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Piwavadasde",
            cardType: "MASTERCARD",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: authorizer_context,
        country: "Colombia",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          body: {
            amount: {
              currency: "USD",
              iva: 1,
              subtotalIva: 1,
              subtotalIva0: 0,
            },
          },
          requestContext: {},
        }),
        ruleInfo: {},
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "436402",
          created: 12139931921,
          currency: "USD",
          id: "12120000102192",
          lastFourDigits: "1111",
          maskedCardNumber: "436402XXXX1111",
          merchantId: "12129139193",
        }),
        trxType: "preauthorization",
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(get(trx, "processor_type")).to.be.equal("aggregator_formal");
        },
      });
  });

  it("should add 0 before datafast deferred", (done: Mocha.Done) => {
    processor.processor_type = ProcessorTypeEnum.AGGREGATOR;
    processor.category_model = CategoryTypeEnum.COLLECTION;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          ticket_number: "1235672839",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Piwavecito",
            cardType: "MASTERCARD",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: ProcessorEnum.DATAFAST,
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: authorizer_context,
        country: "Colombia",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: undefined,
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
          deferred: {
            creditType: "03",
          },
        }),
        ruleInfo: {},
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "436402",
          created: 12139931921,
          currency: "USD",
          id: "12120000102192",
          lastFourDigits: "1111",
          maskedCardNumber: "436402XXXX1111",
          merchantId: "12129139193",
        }),
        trxType: "charge",
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx).to.not.be.undefined;
          expect(trx.payment_brand).to.be.eq(MASTER_CARD);
          expect(get(trx, "processor_type")).to.be.equal(
            "aggregator_collection"
          );
        },
      });
  });

  it("Process with extra taxes  - success ", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "34562",
          ticket_number: "1239372612",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Lopez",
            cardType: "",
            isDeferred: "N",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            extraTaxes: {
              propina: 13,
            },
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: "123",
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          binInfo: {
            bank: "",
            brand: "",
            processor: "string",
          },
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void =>
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          ),
      });
  });

  it("Process with extra taxes  - success - no processor info", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "34562",
          ticket_number: "1239372612",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Perez",
            cardType: "VISA",
            isDeferred: "N",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: Mock.of<AuthorizerContext>({
          credentialId: "credential_id",
          merchantId: "merchant_id",
        }),
        country: "Colombia",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "MerchantTest",
        partner: undefined,
        plccInfo: undefined,
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            extraTaxes: {
              propina: 13,
            },
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void =>
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          ),
      });
  });
  it("Process with extra taxes  - success - send error code  ", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "234",
          ticket_number: "1237391348",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Perez",
            cardType: "VISA",
            isDeferred: "Y",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: Mock.of<AuthorizerContext>({
          credentialId: "credential_id",
          merchantId: "merchant_id",
        }),
        country: "Ecuador",
        error: new AurusError("0001", "Prueba Error"),
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            extraTaxes: {
              propina: 13,
            },
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: "123",
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void =>
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          ),
      });
  });
  it("Process with KushkiError  - success - send error code  ", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().callsFake(
          (data: object, table: string) =>
            new Observable((observable: Observer<boolean>): void => {
              observable.next(put_stub(data, table));
              observable.complete();
            })
        ),
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "123",
          ticket_number: "1231234567",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "John Doe",
            cardType: "VISA",
            isDeferred: "Y",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: Mock.of<AuthorizerContext>({
          credentialAlias: "credential_alias",
          credentialId: "credentila_id",
          merchantId: "merchant_id",
          privateMerchantId: "private_merchant_id",
          publicMerchantId: "public_merchant_id",
        }),
        country: "Colombia",
        error: new KushkiError(ERRORS.E021, msg_trx, {
          responseCode: "customCode",
          responseText: "customText",
        }),
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: "123",
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.response_code).to.be.eql("K322");
          expect(trx.response_text).to.be.eql("customText");
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          );
        },
      });
  });

  it("Process with K322 KushkiError - should save trx rule response rules[]", (done: Mocha.Done) => {
    CONTAINER.rebind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "4",
          recap: "11111",
          ticket_number: "1234567",
          transaction_details: {
            approvalCode: "1234456",
            binCard: "123450",
            cardHolderName: "Max Powers",
            cardType: "MASTERCARD",
            isDeferred: "Y",
            lastFourDigitsOfCard: "4567",
            merchantName: "MercadoNegro",
            processorBankName: "BancoNegro",
            processorName: "ProcesadorNegro",
          },
          transaction_id: "12345666",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: Mock.of<AuthorizerContext>({
          credentialAlias: "",
          credentialId: "",
          merchantId: "",
          privateMerchantId: "",
          publicMerchantId: "",
        }),
        country: "Colombia",
        error: new KushkiError(ERRORS.E322, msg_trx, {
          rules: [{ code: "001", message: "MaxAmount Exceeded" }],
        }),
        integration: "direct",
        merchantId: "123",
        merchantName: "MercadoNegro",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            iva: 2,
            subtotalIva: 2,
            subtotalIva0: 0,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: "345",
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 4,
          bin: "123450",
          created: 12129300001212,
          currency: "USD",
          id: "3434343434",
          lastFourDigits: "4444",
          maskedCardNumber: "436402XXXX6666",
          merchantId: "666666666666",
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.response_code).to.be.eql("K322");
          expect(trx).to.haveOwnProperty("rules");
          expect(get(trx, "rules.length")).to.be.eqls(1);
        },
      });
  });

  describe("When process with K322 KushkiError", () => {
    let rule_error: string;

    it("should save trx rule response and mapping errors K326", () => {
      rule_error = "K326";
    });

    it("should save trx rule response and mapping errors K325", () => {
      rule_error = "K325";
    });

    afterEach((done: Mocha.Done) => {
      CONTAINER.rebind<IDynamoGateway>(
        IDENTIFIERS.DynamoGateway
      ).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
        })
      );

      const service: ITransactionService = CONTAINER.get(
        IDENTIFIERS.TransactionService
      );

      service
        .processRecord({
          processor,
          aurusChargeResponse: aurus_response,
          authorizerContext: authorizer_context,
          country: "Colombia",
          error: new KushkiError(ERRORS.E322, msg_trx, {
            rules: [
              {
                code: rule_error,
                message: "Autenticación fallida - Clave incorrecta",
              },
            ],
            security3Ds: {
              code: "101",
              message: "Declined. The request is missing one or more fields.",
            },
          }),
          integration: "direct",
          merchantId: dynamo_merchant.public_id,
          merchantName: dynamo_merchant.merchant_name,
          partner: undefined,
          plccInfo: { flag: "0", brand: "Visa" },
          requestEvent: event,
          ruleInfo: undefined,
          saleTicketNumber: "123",
          siftValidation: undefined,
          tokenInfo: dynamo_response,
          trxType: undefined,
          whitelist: undefined,
        })
        .subscribe(expectTrxErrorK322(put_stub, done));
    });
  });

  it("Should save context fields into dynamo transactions table", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "123",
          ticket_number: "1231234567",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "John Doe",
            cardType: "VISA",
            isDeferred: "Y",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        authorizerContext: Mock.of<AuthorizerContext>({
          credentialAlias: "merchantalias",
          credentialId: "123456789",
          credentialMetadata: { data: "to", origin: "from" },
          merchantId: "merchant_id",
          privateMerchantId: "private_merchant_id",
          publicCredentialId: "12jf3j1d310d31b",
          publicMerchantId: "public_merchant_id",
        }),
        country: "Colombia",
        error: new KushkiError(
          ERRORS.E066,
          "Las credenciales no son correctas o no coinciden.",
          {
            responseCode: "customCode",
            responseText: "customText",
          }
        ),
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "USD",
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 0,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: "123",
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe((transaction: Transaction) => {
        expect(transaction.response_code).to.be.eql("K066");
        expect(transaction.response_text).to.be.eql(
          "Las credenciales no son correctas o no coinciden."
        );
        expect(transaction.credential_id).to.be.eq("123456789");
        expect(transaction.credential_alias).to.be.eq("merchantalias");
        expect(transaction.credential_metadata).to.be.deep.eq({
          data: "to",
          origin: "from",
        });
        expect(transaction.public_credential_id).to.be.eq("12jf3j1d310d31b");
        done();
      });
  });
  it("Procesord Record interest_amount", (done: Mocha.Done) => {
    process.env.CLARO_EC_MERCHANTS =
      "12345678901234567890123456789012,20000344912741293922";

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "12345",
          ticket_number: "1230987654",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Piwave",
            cardType: "",
            conciliationId: "1234|debit",
            interestAmount: "2.26",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: "direct",
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: { ...event, originalFullResponse: true },
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: dynamo_response,
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe((transaction: Transaction) => {
        expect(transaction).to.be.jsonSchema(
          JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
        );
        expect(transaction.interest_amount).to.be.eq(2.26);
        expect(transaction.plcc).to.be.eq(false);
        done();
      });
  });

  it("Process record insert with object deferred and save transaction", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord({
        processor,
        aurusChargeResponse: Mock.of<AurusResponse>({
          approved_amount: "10",
          processor_transaction_id: "processor_transaction_id",
          purchase_Number: "purchase_number",
          recap: "12345",
          ticket_number: "1230987654",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Tony Montana",
            cardType: "",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        authorizerContext: authorizer_context,
        country: "Ecuador",
        error: undefined,
        integration: undefined,
        merchantId: "123",
        merchantName: "Merchant",
        partner: undefined,
        plccInfo: { flag: "0", brand: "Visa" },
        requestEvent: Mock.of<ChargesCardRequest>({
          amount: {
            currency: "UF",
            extraTaxes: {
              agenciaDeViaje: 0,
              iac: 0,
              propina: 0,
              tasaAeroportuaria: 0,
            },
            ice: 0,
            iva: 1,
            subtotalIva: 10,
            subtotalIva0: 0,
          },
          contactDetails: {
            documentNumber: "12312",
            documentType: "qweq",
          },
          deferred: {
            creditType: "04",
            graceMonths: "4",
            months: 6,
          },
        }),
        ruleInfo: undefined,
        saleTicketNumber: undefined,
        siftValidation: undefined,
        tokenInfo: Mock.of<DynamoTokenFetch>({
          amount: 11,
          bin: "438108",
          binInfo: {
            bank: "Banco. Nacional",
            bin: "438108",
            brand: "VISA",
            processor: "",
          },
          convertedAmount: {
            currency: "CLP",
            totalAmount: 315587,
          },
          created: 120120103013,
          currency: "CLP",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
        }),
        trxType: undefined,
        whitelist: undefined,
      })
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.deferred.months).to.be.eq(6);
          expect(trx.deferred.graceMonths).to.be.eq("4");
          expect(trx.deferred.creditType).to.be.eq("04");
        },
      });
  });
});

describe("Transaction Service - processVoidRecord", () => {
  let box: SinonSandbox;
  let put_stub: SinonStub;
  let service: ITransactionService;
  let void_card_event: IAPIGatewayEvent<
    VoidBody,
    VoidCardPath,
    null,
    AuthorizerContext,
    VoidCardHeader
  >;
  let charge_trx: Transaction;

  beforeEach(() => {
    void_card_event = Mock.of<
      IAPIGatewayEvent<
        VoidBody,
        VoidCardPath,
        null,
        AuthorizerContext,
        VoidCardHeader
      >
    >({
      pathParameters: {
        ticketNumber: "123456789",
      },
      requestContext: {},
    });

    charge_trx = Mock.of<Transaction>({
      amount: {
        currency: "USD",
        ice: 0,
        iva: 0.54,
        subtotalIva: 4.46,
        subtotalIva0: 0,
      },
      approval_code: "650552",
      approved_transaction_amount: 5,
      bin_card: "438108",
      card_holder_name: "CEDENO GILSON",
      created: 1539186862000,
      currency_code: "USD",
      ice_value: 0,
      iva_value: 0.54,
      last_four_digits: "1652",
      merchant_id: "10123113252892681113149503222945",
      merchant_name: "Tuenti USSD",
      payment_brand: "Visa",
      processor_bank_name: "0032~BANCO INTERNACIONAL",
      processor_id: "10123113252892681113149503222945",
      processor_name: CREDIMATIC,
      recap: "834234",
      request_amount: 5,
      response_code: "000",
      response_text: "Transacción aprobada",
      subtotal_iva: 4.46,
      subtotal_iva0: 0,
      sync_mode: "online",
      ticket_number: "182834286453603435",
      token: "ATap4D101231UYOv3L132528bdlOUaPW",
      transaction_details: {
        binCard: "438108",
        cardType: "Visa",
        isDeferred: "N",
        processorBankName: "0032~BANCO INTERNACIONAL",
      },
      transaction_id: "109182834286453627",
      transaction_status: "APPROVAL",
      transaction_type: "SALE",
    });
    box = createSandbox();
    put_stub = box.stub().returns(of(true));
    CONTAINER.snapshot();
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    rollbarInstance(box);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );
    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({})
    );
  });
  afterEach(() => {
    runRestoreDependencies(box);
  });

  it("test processVoidRecord - happy path", (done: Mocha.Done) => {
    charge_trx.processor_channel = "crypto";
    service = CONTAINER.get(IDENTIFIERS.TransactionService);
    service.processVoidRecord(void_card_event, charge_trx).subscribe({
      next: (trx: Transaction): void => {
        expect(put_stub).to.be.calledOnce;
        expect(trx.sale_ticket_number).to.eql(
          void_card_event.pathParameters.ticketNumber
        );
        expect(put_stub.args[0][0].processor_name).to.be.equal(
          charge_trx.processor_name
        );
        expect(put_stub.args[0][0].processor_channel).to.be.equal(
          charge_trx.processor_channel
        );
        done();
      },
    });
  });

  it("should map successfully metadata and externalReferenceId", (done: Mocha.Done) => {
    const void_event_test = Mock.of<
      IAPIGatewayEvent<
        VoidBody,
        VoidCardPath,
        null,
        AuthorizerContext,
        VoidCardHeader
      >
    >({
      body: {
        metadata: {
          id: "123",
        },
        externalReferenceId: "1234-4567",
      },
      pathParameters: {
        ticketNumber: "123456789",
      },
      requestContext: {},
    });

    service = CONTAINER.get(IDENTIFIERS.TransactionService);
    service.processVoidRecord(void_event_test, charge_trx).subscribe({
      next: (trx: Transaction): void => {
        expect(put_stub).to.be.calledOnce;
        expect(trx.sale_ticket_number).to.eql(
          void_card_event.pathParameters.ticketNumber
        );
        expect(put_stub.args[0][0].processor_name).to.be.equal(
          charge_trx.processor_name
        );
        expect(put_stub.args[0][0].processor_channel).to.be.equal(
          charge_trx.processor_channel
        );
        expect(put_stub.args[0][0].external_reference_id).to.be.equal(
          "1234-4567"
        );
        expect(put_stub.args[0][0].metadata).to.contains({
          id: "123",
        });
        done();
      },
    });
  });

  it("test processVoidRecord with MccCode - happy path", (done: Mocha.Done) => {
    charge_trx.mccCode = "1234";
    service = CONTAINER.get(IDENTIFIERS.TransactionService);
    service.processVoidRecord(void_card_event, charge_trx).subscribe({
      next: (trx: Transaction): void => {
        expect(put_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].mccCode).to.be.eql("1234");
        expect(trx.sale_ticket_number).to.eql(
          void_card_event.pathParameters.ticketNumber
        );
        done();
      },
    });
  });
});

describe("CardService - saveCardTrxsSQS", () => {
  process.env.THRESHOLD_AMOUNT = "0.05";
  let service: ITransactionService;
  let box: SinonSandbox;
  let lambda_stub: SinonStub;
  let sqs_put_stub: SinonStub;
  let card_stub: SinonStub;
  let put_dynamo_stub: SinonStub;

  beforeEach(() => {
    createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    put_dynamo_stub = box.stub().returns(of(true));
    gTokenDynamo = Mock.of<TokenDynamo>({
      amount: 1112,
      binInfo: {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        processor: "Credimatic",
      },
    });

    gTokenDynamo.binInfo = {
      bank: "Pichincha",
      bin: "123456",
      brand: "VISA",
      info: {
        type: "debit",
      },
      processor: "Credimatic",
    };
    dynamoBinding(put_dynamo_stub, box);
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    card_stub = box.stub().returns(of(gAurusResponse));
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: card_stub,
        preAuthorization: card_stub,
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = lambdaStubTransactionRule(box);
    lambdaServiceBinding(lambda_stub);
    sqs_put_stub = box.stub().returns(of(true));
    CONTAINER.rebind(IDENTIFIERS.SQSGateway).toConstantValue(
      Mock.of<ISQSGateway>({
        put: sqs_put_stub,
      })
    );
  });

  afterEach(() => {
    runRestoreDependencies(box);
  });

  it("should save a capture transaction approval with SQS", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CAPTURE,
      TransactionStatusEnum.APPROVAL,
      "",
      ""
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub);
        done();
      },
    });
  });

  it("should save a capture transaction declined with SQS", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CAPTURE,
      TransactionStatusEnum.DECLINED,
      "",
      ""
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub);
        done();
      },
    });
  });

  it("should save a charge transaction approval with SQS", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.APPROVAL,
      "1234567989",
      "1122334455"
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub);
        done();
      },
    });
  });

  it("should save a charge transaction declined with SQS", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.DECLINED,
      "1234567989",
      "1122334455"
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub);
        done();
      },
    });
  });

  it("should save a preauthorization transaction approval with SQS", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.PREAUTHORIZATION,
      TransactionStatusEnum.APPROVAL,
      "1234567989",
      ""
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub);
        done();
      },
    });
  });

  it("should save a preauthorization transaction declined with SQS", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.PREAUTHORIZATION,
      TransactionStatusEnum.DECLINED,
      "1234567989",
      ""
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub);
        done();
      },
    });
  });

  it("should send event to subscriptions attempts sqs when trx it's declined with subscription validation and rules comes with K322", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.DECLINED,
      "4321234321234432",
      "1234321343212"
    );

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, true);
    set(sqs_event.Records[0].body, "rules", [
      { code: "K322", message: "Rule description" },
    ]);

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).to.be.calledOnce;
        expect(sqs_put_stub.lastCall.lastArg).to.contains({
          code: "K322",
          description: "Rule description",
          message: SubscriptionAttemptMessageEnum.K322,
        });
        done();
      },
    });
  });

  it("should send event to subscriptions attempts sqs when trx it's declined with subscription validation should send createSubscriptionMetadata", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.DECLINED,
      "4321234321234432",
      "1234321343212"
    );

    const subscription_metadata: object = {
      dayOfMonth: 17,
      dayOfWeek: "?",
      endDate: 1727222400,
      expiryMonth: "XX",
      expiryYear: "XX",
      ip: "177.242.193.82",
      month: "*",
      periodicity: "monthly",
      planName: "Premium",
      startDate: 1681689600,
      token: "921c3aed98fb47c9b0664254711cb6d0",
      userAgent: "PostmanRuntime/7.32.2",
    };

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, true);
    set(sqs_event.Records[0].body, "rules", [
      { code: "K322", message: "Rule description example" },
    ]);

    set(
      sqs_event.Records[0].body,
      "createSubscriptionMetadata",
      subscription_metadata
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).to.be.calledOnce;
        expect(sqs_put_stub.lastCall.lastArg).to.contains({
          ...subscription_metadata,
        });
        done();
      },
    });
  });

  it("should send event to subscriptions attempts sqs when trx it's declined with subscription validation and rules comes with K322 but with no message on rule", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.DECLINED,
      "4321534321234432",
      "2334321343212"
    );

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, true);
    set(sqs_event.Records[0].body, "rules", [{ code: "K322" }]);

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).to.be.calledOnce;
        expect(sqs_put_stub.lastCall.lastArg).to.contains({
          code: "K322",
          description:
            SubscriptionAttemptMessageEnum.DEFAULT_MESSAGE_SECURITY_RULE,
          message: SubscriptionAttemptMessageEnum.K322,
        });
        done();
      },
    });
  });

  it("should send event to subscriptions attempts sqs when trx it's declined with subscription validation and rules is not on event", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.DECLINED,
      "4321534321234432",
      "2334321343212"
    );

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, true);
    set(sqs_event.Records[0].body, "rules", []);
    set(sqs_event.Records[0].body, "response_text", "Test response text");

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).to.be.calledOnce;
        expect(sqs_put_stub.lastCall.lastArg).to.contains({
          code: "006",
          description: "Test response text",
          message: SubscriptionAttemptMessageEnum.K006,
        });
        done();
      },
    });
  });

  it("should send event to subscriptions attempts sqs when trx it's declined with subscription validation and rules is not on event and response_code is empty", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.DECLINED,
      "4321534321234432",
      "2334321343212"
    );

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, true);
    set(sqs_event.Records[0].body, "response_text", "");
    set(sqs_event.Records[0].body, "rules", []);

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).to.be.calledOnce;
        expect(sqs_put_stub.lastCall.lastArg).to.contains({
          code: "006",
          description:
            SubscriptionAttemptMessageEnum.DEFAULT_MESSAGE_PROCESSOR_ERROR,
          message: SubscriptionAttemptMessageEnum.K006,
        });
        done();
      },
    });
  });

  it("should not send event to subscription attempts sqs when transaction it's approval", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.APPROVAL,
      "1234567982349",
      "112223334455"
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).not.be.called;
        done();
      },
    });
  });

  it("should not send event to subscription attempts sqs when transaction it's declined subscription validation it's false", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.DECLINED,
      "1234567982349",
      "112223334455"
    );

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, false);

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).not.be.called;
        done();
      },
    });
  });

  it("should send event to subscription attempts sqs when createSubscriptionMetadata.subscriptionStatus is declined", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.APPROVAL,
      "1234567982349",
      "112223334455"
    );
    const attempt_id: string = "1234567890";

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, true);
    set(sqs_event.Records[0].body, "createSubscriptionMetadata", {
      attemptId: attempt_id,
      rules: [
        { code: "K322", message: "Error por monto superior al permitido" },
      ],
      subscriptionStatus: TransactionStatusEnum.DECLINED,
    });

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).to.be.calledOnce;
        expect(sqs_put_stub.lastCall.lastArg).to.contains({
          code: "K322",
          description: "Error por monto superior al permitido",
          id: attempt_id,
          message: SubscriptionAttemptMessageEnum.K322,
        });
        expect(put_dynamo_stub).to.be.calledOnce;
        expect(put_dynamo_stub.args[0][0]).not.to.haveOwnProperty(
          "createSubscriptionMetadata"
        );
        expect(put_dynamo_stub.args[0][0]).to.haveOwnProperty(
          "transaction_status",
          TransactionStatusEnum.APPROVAL
        );
        done();
      },
    });
  });

  it("should send event to subscription attempts sqs when createSubscriptionMetadata.subscriptionStatus is declined and rules comes as null", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.APPROVAL,
      "1234567982349",
      "112223334455"
    );
    const attempt_id: string = "1234567890";

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, true);
    set(sqs_event.Records[0].body, "createSubscriptionMetadata", {
      attemptId: attempt_id,
      rules: [null],
      subscriptionStatus: TransactionStatusEnum.DECLINED,
    });

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).to.be.calledOnce;
        expect(sqs_put_stub.lastCall.lastArg).to.contains({
          code: "006",
          description: "sadbcvbs",
          id: attempt_id,
          message: SubscriptionAttemptMessageEnum.K006,
        });
        expect(put_dynamo_stub).to.be.calledOnce;
        expect(put_dynamo_stub.args[0][0]).not.to.haveOwnProperty(
          "createSubscriptionMetadata"
        );
        expect(put_dynamo_stub.args[0][0]).to.haveOwnProperty(
          "transaction_status",
          TransactionStatusEnum.APPROVAL
        );
        done();
      },
    });
  });

  it("should not send event to subscription attempts sqs when createSubscriptionMetadata.subscriptionStatus is APPROVAL", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<Transaction> = captureEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.APPROVAL,
      "1234567982349",
      "112223334455"
    );

    set(sqs_event.Records[0].body, METADATA_SUBS_VALIDATION_PATH, true);
    set(sqs_event.Records[0].body, "createSubscriptionMetadata", {
      attemptId: "12345678",
      rules: [],
      subscriptionStatus: TransactionStatusEnum.APPROVAL,
    });

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveCardTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(sqs_put_stub).not.to.be.called;
        expect(put_dynamo_stub).to.be.calledOnce;
        expect(put_dynamo_stub.args[0][0]).not.to.haveOwnProperty(
          "createSubscriptionMetadata"
        );
        done();
      },
    });
  });
});

describe("CardService - saveChargesTrxsSQS", () => {
  process.env.THRESHOLD_AMOUNT = "0.05";
  let service: ITransactionService;
  let box: SinonSandbox;
  let lambda_stub: SinonStub;
  let put: SinonStub;

  beforeEach(() => {
    createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    put = box.stub().returns(of(true));

    dynamoBinding(put, box);

    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = lambdaStubTransactionRule(box);
    lambdaServiceBinding(lambda_stub);
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function chargesEventsSQS(
    type: string,
    status: string,
    ticketNumber: string,
    saleTicketNumber: string
  ): ISQSEvent<SQSChargesInput> {
    const selected_body: Partial<SQSChargesInput> = {
      charge: {
        test: 123,
      },
      merchant: {
        ...gMerchantFetch,
        sift_science: {
          ProdApiKey: "4343434",
        },
      },
      // tslint:disable-next-line:no-object-literal-type-assertion
      token: <DynamoTokenFetch>{
        ...gTokenDynamo,
        currency: "USD",
        sessionId: "3454353",
        userId: "34343",
      },
      transaction: getTransaction(type, status, ticketNumber, saleTicketNumber),
    };

    return Mock.of<ISQSEvent<SQSChargesInput>>({
      Records: [
        {
          body: selected_body,
        },
      ],
    });
  }

  it("should save a capture transaction approval with SQS", (done: Mocha.Done) => {
    const sqs_event: ISQSEvent<SQSChargesInput> = chargesEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.APPROVAL,
      "234234",
      ""
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveChargesTrxsSQS(sqs_event).subscribe({
      error: done,
      next: (): void => {
        expect(put);
        done();
      },
    });
  });

  it("should save a capture transaction approval with SQS where is in MERCHANT_MIGRATE_IDS", (done: Mocha.Done) => {
    gMerchantFetch.public_id = "test-sift";
    process.env.MERCHANT_MIGRATE_IDS = "test-sift,test2";
    const sqs_event: ISQSEvent<SQSChargesInput> = chargesEventsSQS(
      TransactionRuleTypeEnum.CHARGE,
      TransactionStatusEnum.APPROVAL,
      "234234",
      ""
    );

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    service.saveChargesTrxsSQS(sqs_event).subscribe({
      complete: (): void => {
        expect(lambda_stub).to.have.been.calledOnce;
        done();
      },
      error: done,
    });
  });
});

describe("Transaction Service - buildTransactionObject", () => {
  process.env.THRESHOLD_AMOUNT = "0.05";
  let service: ITransactionService;
  let box: SinonSandbox;
  let lambda_stub: SinonStub;
  const path_secure_identity: string = "tokenInfo.securityIdentity[0]";
  const path_secure_identity_info: string =
    "tokenInfo.securityIdentity[0].info";

  beforeEach(() => {
    createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);

    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = lambdaStubTransactionRule(box);
    lambdaServiceBinding(lambda_stub);
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function getDefaultKushkiInfo(): IKushkiInfo {
    return {
      manager: ManagementValuesEnum.API,
      managerId: ManagementIdEnum.DP002,
      methodId: PaymentMethodsIdsEnum.KM001,
      methodName: PaymentMethodsNamesEnum.CARD,
      platformId: PlatformsCodesEnum.KP001,
      platformName: PlatformsNamesEnum.API,
      platformVersion: PlatformsVersionEnum.LATEST,
    };
  }

  function callBuildFn(event: SaveCardTransactionsEvent): Transaction {
    return service.buildTransactionObject({
      aurusChargeResponse: event.aurusChargeResponse,
      authorizerContext: event.authorizerContext,
      country: event.country,
      error: event.error,
      integration: event.integration,
      isAft: true,
      merchantId: event.merchantId,
      merchantName: event.merchantName,
      partner: event.partner,
      plccInfo: event.plccInfo,
      processor: event.processor,
      requestEvent: event.requestEvent,
      ruleInfo: event.ruleInfo,
      saleTicketNumber: event.saleTicketNumber,
      siftValidation: event.siftValidation,
      tokenInfo: event.tokenInfo,
      trxRuleResponse: get(event, "trxRuleResponse"),
      trxType: event.trxType,
      validateSiftTrxRule: get(event, "validateSiftTrxRule"),
      whitelist: event.whitelist,
    });
  }

  function buildEvent(error: boolean): SaveCardTransactionsEvent {
    return chargeEventStatus(
      error ? TransactionStatusEnum.DECLINED : null,
      "1234567989",
      ""
    );
  }

  it("should build a transaction successfully with status APPROVAL", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event = buildEvent(false);

    set(event, PROCESSOR_NAME_PATH, ProcessorEnum.KUSHKI);

    const response = callBuildFn(event);

    expect(response.transaction_status).to.be.eq(
      TransactionStatusEnum.APPROVAL
    );
    expect(response.ticket_number).to.be.eq("1234567989");
    expect(response.indicator_3ds).to.be.eq("F");
  });

  it("should build a transaction successfully with merchant_data field when merchantData authorizer context is not object", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event: SaveCardTransactionsEvent = buildEvent(false);

    set(event, PROCESSOR_NAME_PATH, ProcessorEnum.KUSHKI);
    set(
      event,
      "authorizerContext.merchantData",
      `{"mcc":"5933","merchantCategory":"Medium"}`
    );
    set(event, "requestEvent.platformName", "API");

    const response = callBuildFn(event);

    expect(response.merchant_data).to.be.eql({
      channel: "API",
      mcc: "5933",
      merchantCategory: "Medium",
    });
  });

  it("should build a declined transaction when there's an error", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event = buildEvent(true);

    set(event, PROCESSOR_NAME_PATH, ProcessorEnum.KUSHKI);

    const response = callBuildFn(event);

    expect(response.transaction_status).to.be.eq(
      TransactionStatusEnum.DECLINED
    );
  });

  it("builds a transaction object and there's a valid saleTicketNumber", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event = buildEvent(false);

    event.saleTicketNumber = "1234";
    const response = callBuildFn(event);

    expect(response.sale_ticket_number).to.be.eq("1234");
  });

  it("should build a valid transaction object when there's a valid ruleInfo", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event = buildEvent(false);

    event.ruleInfo = {
      processor: ProcessorEnum.DATAFAST,
    };
    const response = callBuildFn(event);

    expect(get(response, "processor")).to.be.eq(ProcessorEnum.DATAFAST);
  });

  it("should build a valid transaction object when there's a valid partner", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event = buildEvent(false);
    const partner_value = "some-partner";

    event.partner = partner_value;
    const response = callBuildFn(event);

    expect(get(response, "security.partner")[0]).to.be.eq([partner_value][0]);
  });

  it("build a transaction object even when there's no processor", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event = buildEvent(false);

    event.processor = undefined;
    const response = callBuildFn(event);

    expect(response.processor_id).to.be.undefined;
  });

  it("should build a transaction object with 3dsMpi field in security object when threeDomainSecure object exists", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event = buildEvent(false);

    event.requestEvent.threeDomainSecure = {
      cavv: "123",
      eci: "123",
      specificationVersion: "1.1.0",
    };
    const response = callBuildFn(event);

    expect(response.rules).to.be.eqls([
      {
        code: SuccessfulAuthentication3DSEnum.OK_CODE,
        message: SuccessfulAuthentication3DSEnum.OK_EXTERNAL_MESSAGE,
      },
    ]);
    expect(response.security).to.deep.includes({
      "3dsMpi": "Merchant",
    });
  });

  it("Should build a transaction object with security 3ds info when trx type is capture and token has 3ds fields", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    const event: SaveCardTransactionsEvent = buildEvent(false);
    const secureIdTest: string = "321-321-321";
    const secureServiceTest: string = "3dsecure";
    const eciTest: string = "02";
    const specVersionTest: number = 2;

    event.trxType = TransactionRuleTypeEnum.CAPTURE;
    event.tokenInfo.secureId = secureIdTest;
    event.tokenInfo.secureService = secureServiceTest;
    event.tokenInfo["3ds"] = {
      authentication: true,
      detail: {
        eci: eciTest,
        specificationVersion: specVersionTest,
      },
    };

    const response = callBuildFn(event);

    expect(response).to.deep.includes({
      secureId: secureIdTest,
      secureService: secureServiceTest,
    });
    expect(response.security).to.deep.includes({
      "3ds": {
        eci: eciTest,
        specificationVersion: specVersionTest,
      },
    });
  });

  it("should set traceability info with default KushkiInfo when this object doesn't exists in token info, this for charge transaction", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);

    set(event, "trxRuleResponse", {});
    const response: Transaction = callBuildFn(event);

    expect(response).to.be.deep.includes({
      kushkiInfo: getDefaultKushkiInfo(),
      securityIdentity: [],
    });
  });

  it("should set traceability info with default KushkiInfo when this object doesn't exists in token info, this for subscription transaction", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);

    set(event, "trxRuleResponse", {});
    set(event, "requestEvent.subscriptionId", "123456");
    const response: Transaction = callBuildFn(event);

    expect(response).to.be.deep.includes({
      kushkiInfo: getDefaultKushkiInfo(),
      securityIdentity: [],
    });
  });

  it("should set traceability info with same KushkiInfo object and update securityIdentity object when this fields exist in token and partner exists, this for transunion", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);

    set(event, "trxRuleResponse", {
      rules: {
        rules: [{ code: RejectedTransactionEnum.K322, message: "TransUnion" }],
      },
    });
    set(event, "partner", "transunion");
    event.tokenInfo = {
      ...event.tokenInfo,
      kushkiInfo: getDefaultKushkiInfo(),
      securityIdentity: [
        {
          identityCategory: IdentityCategoryEnum.IDENTIFICATION_VERIFICATION,
          identityCode: IdentityCodeEnum.SI004,
          partnerName: PartnerNameEnum.TRANSUNION,
        },
      ],
    };

    const response: Transaction = callBuildFn(event);

    expect(response).to.be.deep.includes({
      kushkiInfo: {
        ...event.tokenInfo.kushkiInfo,
      },
      securityIdentity: [
        {
          ...get(event, path_secure_identity),
          info: {
            ...get(event, path_secure_identity_info),
            status: TransactionStatusEnum.DECLINED,
          },
        },
      ],
    });
  });

  it("should map rules, secure_message and secure_code fields when transaction rule response has rules field", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);

    set(event, "trxRuleResponse", {
      rules: {
        rules: [{ code: "K320", message: "AL_CARD_HOLDER_NAME" }],
      },
    });

    const response: Transaction = callBuildFn(event);

    expect(response).to.be.haveOwnProperty(
      "rules",
      get(event, "trxRuleResponse.rules.rules", [])
    );
    expect(response).to.be.haveOwnProperty("secure_code", "K320");
    expect(response).to.be.haveOwnProperty(
      "secure_message",
      "AL_CARD_HOLDER_NAME"
    );
  });

  it("should set traceability info with same KushkiInfo object and update securityIdentity object when this fields exist in token and partner exists, this when sift is validated on charge and has 3ds validation", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);

    set(event, "trxRuleResponse", {
      rules: {
        rules: [{ code: TRX_OK_RESPONSE_CODE, message: "SiftScience" }],
      },
    });
    event.siftValidation = true;
    event.tokenInfo = {
      ...event.tokenInfo,
      kushkiInfo: getDefaultKushkiInfo(),
      secureId: "1234-abcd",
      secureService: PartnerValidatorEnum.THREEDS,
      securityIdentity: [
        {
          identityCategory: IdentityCategoryEnum.IDENTIFICATION_VERIFICATION,
          identityCode: IdentityCodeEnum.SI006,
          partnerName: PartnerNameEnum.SIFT_SCIENCE,
        },
      ],
    };
    const response: Transaction = callBuildFn(event);

    expect(response).to.be.deep.includes({
      kushkiInfo: {
        ...event.tokenInfo.kushkiInfo,
      },
      securityIdentity: [
        {
          ...get(event, path_secure_identity),
          info: {
            ...get(event, path_secure_identity_info),
            status: TransactionStatusEnum.APPROVAL,
          },
        },
        {
          identityCategory: IdentityCategoryEnum.CHALLENGER,
          identityCode: IdentityCodeEnum.SI001,
          info: {
            status: TransactionStatusEnum.APPROVAL,
          },
          partnerName: PartnerNameEnum.THREE_DS,
        },
      ],
    });
  });

  it("should set traceability info with same KushkiInfo object and update securityIdentity object when this fields exist in token and partner exists, this when sift is validated on trx-rule and has KushkiOTP validation", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);

    set(event, "trxRuleResponse", {
      rules: {
        rules: [{ code: TRX_OK_RESPONSE_CODE, message: "SiftScience" }],
      },
    });
    set(event, "validateSiftTrxRule", true);
    event.tokenInfo = {
      ...event.tokenInfo,
      kushkiInfo: getDefaultKushkiInfo(),
      secureId: "1234-abcd",
      secureService: PartnerValidatorEnum.OTP,
      securityIdentity: [
        {
          identityCategory: IdentityCategoryEnum.IDENTIFICATION_VERIFICATION,
          identityCode: IdentityCodeEnum.SI006,
          partnerName: PartnerNameEnum.SIFT_SCIENCE,
        },
      ],
    };

    const response: Transaction = callBuildFn(event);

    expect(response).to.be.deep.includes({
      kushkiInfo: {
        ...event.tokenInfo.kushkiInfo,
      },
      securityIdentity: [
        {
          ...get(event, path_secure_identity),
          info: {
            ...get(event, path_secure_identity_info),
            status: TransactionStatusEnum.APPROVAL,
          },
        },
        {
          identityCategory: IdentityCategoryEnum.CHALLENGER,
          identityCode: IdentityCodeEnum.SI002,
          info: {
            status: TransactionStatusEnum.APPROVAL,
          },
          partnerName: PartnerNameEnum.KUSHKI,
        },
      ],
    });
  });

  it("should set traceability info with same KushkiInfo object and update securityIdentity object when this fields exist in token and partner exists, this for KushkiOTP", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);

    event.tokenInfo = {
      ...event.tokenInfo,
      kushkiInfo: getDefaultKushkiInfo(),
      secureId: "1234-abcd",
      secureService: PartnerValidatorEnum.OTP,
      securityIdentity: [
        {
          identityCategory: IdentityCategoryEnum.IDENTIFICATION_VERIFICATION,
          identityCode: IdentityCodeEnum.SI006,
          partnerName: PartnerNameEnum.SIFT_SCIENCE,
        },
        {
          identityCategory: IdentityCategoryEnum.TOKEN,
          identityCode: IdentityCodeEnum.SI001,
          partnerName: PartnerNameEnum.KUSHKI,
        },
      ],
    };

    const response: Transaction = callBuildFn(event);

    expect(response).to.be.deep.includes({
      kushkiInfo: {
        ...event.tokenInfo.kushkiInfo,
      },
      securityIdentity: [
        {
          ...get(event, path_secure_identity),
        },
        {
          ...get(event, "tokenInfo.securityIdentity[1]"),
        },
        {
          identityCategory: IdentityCategoryEnum.CHALLENGER,
          identityCode: IdentityCodeEnum.SI002,
          info: {
            status: TransactionStatusEnum.APPROVAL,
          },
          partnerName: PartnerNameEnum.KUSHKI,
        },
      ],
    });
  });

  it("should set traceability info with same KushkiInfo object and update securityIdentity object for KushkiOTP", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);

    set(
      event,
      "error",
      new KushkiError(ERRORS.E322, "OTP no validated", {
        baseMessage: "Otp not validated",
        rules: [
          {
            code: RejectedSecureServiceCodes.K326,
            message: "Autenticación fallida - Error de autenticación",
          },
        ],
      })
    );
    event.tokenInfo = {
      ...event.tokenInfo,
      kushkiInfo: getDefaultKushkiInfo(),
      secureId: "1234-abcd",
      secureService: PartnerValidatorEnum.OTP,
      securityIdentity: [
        {
          identityCategory: IdentityCategoryEnum.IDENTIFICATION_VERIFICATION,
          identityCode: IdentityCodeEnum.SI006,
          partnerName: PartnerNameEnum.SIFT_SCIENCE,
        },
        {
          identityCategory: IdentityCategoryEnum.TOKEN,
          identityCode: IdentityCodeEnum.SI001,
          partnerName: PartnerNameEnum.KUSHKI,
        },
      ],
    };

    const response: Transaction = callBuildFn(event);

    expect(response).to.be.deep.includes({
      kushkiInfo: {
        ...event.tokenInfo.kushkiInfo,
      },
      securityIdentity: [
        {
          ...get(event, path_secure_identity),
        },
        {
          ...get(event, "tokenInfo.securityIdentity[1]"),
        },
        {
          identityCategory: IdentityCategoryEnum.CHALLENGER,
          identityCode: IdentityCodeEnum.SI002,
          info: {
            status: TransactionStatusEnum.DECLINED,
          },
          partnerName: PartnerNameEnum.KUSHKI,
        },
      ],
    });
  });

  it("should build transaction with createSubscriptionMetadata when that field exists on request", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);
    const create_subscriptio_metadata_mock: CreateSubscriptionMetadata = {
      attemptId: "1234567890",
      rules: [
        { code: "K322", message: "Error Monto excede los 50 PEN para MC" },
      ],
      subscriptionStatus: TransactionStatusEnum.DECLINED,
    };

    event.requestEvent = {
      ...event.requestEvent,
      createSubscriptionMetadata: create_subscriptio_metadata_mock,
    };

    const response: Transaction = callBuildFn(event);

    expect(response).to.haveOwnProperty("createSubscriptionMetadata");
    expect(response).to.be.deep.includes({
      createSubscriptionMetadata: create_subscriptio_metadata_mock,
    });
  });

  it("when aurusChargeResponse has transaction_details.messageFields then message_fields must be in the root", () => {
    const messageFields: MessageFields = { f38: "123456", f39: "00" };

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);
    set(event, "aurusChargeResponse.transaction_details", { messageFields });
    const response: Transaction = callBuildFn(event);
    expect(response).to.haveOwnProperty("message_fields");
  });

  it("when aurusChargeResponse has restricted field then message_fields must be in the root", () => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event: SaveCardTransactionsEvent = buildEvent(false);
    set(event, "aurusChargeResponse.restricted", false);
    const response: Transaction = callBuildFn(event);
    expect(response).to.haveOwnProperty("message_fields");
  });

  it("should map a transaction object with the 'externalReferenceId' field when it was present in the event request", () => {
    const dummyExternalId: string = "abdc-1234-external-sample";
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const event = buildEvent(false);
    event.requestEvent = {
      ...event.requestEvent,
      externalReferenceId: dummyExternalId,
    };
    const response = callBuildFn(event);
    expect(response.external_reference_id).to.equal(dummyExternalId);
  });
});

describe("Transaction Service - saveDeclineTrx", () => {
  let sandbox: SinonSandbox;
  let put_stub: SinonStub;
  let get_stub: SinonStub;
  let query_stub: SinonStub;
  let request: SaveDeclineTrxRequest;
  let dynamo_token: DynamoTokenFetch;
  let service: ITransactionService;
  let bin_info: DynamoBinFetch;
  let invoke_lambda_stub: SinonStub;
  let transaction_expected: Transaction;

  function prepareSchemas(): void {
    bin_info = {
      bank: "Bank Name",
      bin: "424242",
      brand: "VISA",
      info: {
        country: {
          alpha2: "EC",
          name: "Ecuador",
        },
        type: "debit",
      },
      processor: "Processor",
    };

    dynamo_token = {
      amount: 10,
      bin: "424242",
      binInfo: { ...bin_info },
      cardHolderName: "Test",
      created: 123456,
      credentialInfo: {
        alias: "Test Merchant",
        credentialId: "123123",
      },
      currency: "USD",
      id: "1234567890",
      ip: "127.0.0.1",
      lastFourDigits: "4242",
      maskedCardNumber: "424242XXXXXX4242",
      merchantId: "1234567890",
      transactionReference: "abcd-1234",
      vaultToken: "vault123123",
    };

    request = {
      bin: "424242",
      cardHolderName: "Test",
      country: "Colombia",
      lastFourDigits: "4242",
      maskedCreditCard: "424242XXXXXX4242",
      merchantId: "1234567890",
      merchantName: "Test Name",
      paymentBrand: "VISA",
      processorId: "1020304050",
      processorName: "Name Processor",
      processorType: "aggregator_gateway",
      requestAmount: "10",
      rules: [
        {
          code: "K326",
          message: "Autenticación fallida - Abandono",
        },
      ],
      secureId: "1234-abcd",
      security: {
        "3ds": {
          specificationVersion: "1.0.2",
          veresEnrolled: "B",
        },
        id: "b9ffa005-da32-4341-9b63-8ff5965f2fc1",
        message: "Otp not validated",
        service: "KushkiOTP",
      },
    };

    transaction_expected = Mock.of<Transaction>({
      approved_transaction_amount: 0,
      card_country: get(bin_info, "info.country.name", ""),
      card_country_code: get(bin_info, "info.country.alpha2", ""),
      card_type: get(bin_info, "info.type", ""),
      country: get(request, "country", ""),
      ice_value: 0,
      issuing_bank: get(bin_info, "bank", ""),
      iva_value: 0,
      merchant_name: get(request, "merchantName", ""),
      payment_brand: get(request, "paymentBrand", ""),
      plcc: false,
      processor_id: get(request, "processorId", ""),
      processor_name: get(request, "processorName", ""),
      processor_type: get(request, "processorType", ""),
      request_amount: Number(get(request, "requestAmount", 0)),
      response_code: RejectedTransactionEnum.K322,
      response_text: ERROR_REJECTED_TRANSACTION,
      secure_code: get(request, "rules[0].code", ""),
      secure_message: get(request, "rules[0].message", ""),
      subtotal_iva: 0,
      sync_mode: TransactionSyncModeEnum.ONLINE,
      transaction_status: TransactionStatusEnum.DECLINED,
    });

    put_stub = sandbox.stub().returns(of(true));
    query_stub = sandbox.stub().returns(of([dynamo_token]));
    get_stub = sandbox.stub().returns(of({ merchant_name: "name" }));
    invoke_lambda_stub = sandbox.stub().returns(of({}));
  }

  function mockDynamoGateway(): void {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_stub,
        put: put_stub,
        query: query_stub,
      })
    );
  }

  function mockLambdaGateway(): void {
    CONTAINER.unbind(CORE_ID.LambdaGateway);
    CONTAINER.bind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invoke_lambda_stub,
      })
    );
  }

  beforeEach(() => {
    sandbox = createSandbox();
    CONTAINER.snapshot();

    prepareSchemas();
    mockDynamoGateway();
    mockLambdaGateway();
    rollbarInstance(sandbox);
  });

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
  });

  const test_token_charge = (
    done: Mocha.Done,
    saveRequest: SaveDeclineTrxRequest,
    trxExpected: Transaction,
    assertExpectations: (putStub: SinonStub) => void = (_) => undefined
  ) => {
    dynamo_token.isDeferred = true;

    mockDynamoGateway();
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    service.saveDeclineTrx(saveRequest).subscribe({
      next: (res: boolean) => {
        expect(query_stub).to.calledOnceWith(
          match.any,
          match.any,
          "secureId",
          saveRequest.secureId
        );
        expect(invoke_lambda_stub).to.not.called;
        expect(put_stub).to.calledOnce.calledWithMatch(
          {
            ...trxExpected,
            bin_card: dynamo_token.bin,
            card_holder_name: get(dynamo_token, "cardHolderName", ""),
            credential_alias: get(dynamo_token, "credentialInfo.alias"),
            credential_id: get(dynamo_token, "credentialInfo.credentialId"),
            currency_code: get(dynamo_token, "currency", ""),
            foreign_card: true,
            ip: get(dynamo_token, "ip", ""),
            last_four_digits: get(dynamo_token, "lastFourDigits", ""),
            maskedCardNumber: get(dynamo_token, "maskedCardNumber", ""),
            merchant_id: get(dynamo_token, "merchantId"),
            merchant_name: "name",
            subtotal_iva0: Number(get(dynamo_token, "amount", 0)),
            token: get(dynamo_token, "id"),
            transaction_type: TransactionTypeEnum.DEFFERED,
          },
          match.any
        );
        expect(put_stub.args[0][0]).to.haveOwnProperty("transaction_details");
        expect(put_stub.args[0][0]).to.haveOwnProperty("security");
        expect(put_stub.args[0][0]).to.haveOwnProperty("rules");
        expect(put_stub.args[0][0]).to.haveOwnProperty("amount");
        expect(put_stub.args[0][0]).to.haveOwnProperty("created").to.not.be
          .undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty("merchant_id").to.not.be
          .undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty("transaction_id").to.not
          .be.undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty("transaction_reference")
          .to.not.be.undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty("token").to.not.be
          .undefined;
        expect(res).to.be.true;
        assertExpectations(put_stub);
        done();
      },
    });
  };

  it("should set traceability info when saveDeclinedTrx is called and workflow comes from 3ds declined token request", (done: Mocha.Done) => {
    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    const version_three_ds: string = "2.0.1";

    set(request, "secureService", PartnerValidatorEnum.THREEDS);
    set(request, "kushkiInfo", {
      authorizer: "credential",
      platformId: "KP007",
      platformVersion: "1.34.0",
      resource: "/card",
    });
    set(request, "transactionType", "token");
    set(request, "security", {
      "3ds": {
        specificationVersion: version_three_ds,
        veresEnrolled: "N",
      },
    });

    service.saveDeclineTrx(request).subscribe({
      next: (res: boolean) => {
        expect(put_stub).to.have.been.calledOnce;
        expect(put_stub.args[0][0]).to.haveOwnProperty("securityIdentity");
        expect(put_stub.args[0][0]).to.haveOwnProperty("kushkiInfo");
        expect(
          get(put_stub.args[0][0], "securityIdentity", [])
        ).to.be.deep.equals([
          {
            identityCategory: "TOKEN",
            identityCode: "SI001",
            info: { status: "DECLINED" },
            partnerName: "KUSHKI",
          },
          {
            identityCategory: "CHALLENGER",
            identityCode: "SI001",
            info: { status: "DECLINED", version: version_three_ds },
            partnerName: "3DS",
          },
        ]);
        expect(res).to.be.true;
        done();
      },
    });
  });

  it("should build and save transaction with token info when token exists", (done: Mocha.Done) => {
    request.transactionCardId = "121213233-121214-4565-4565-2434543";
    set(request, "security.3ds.reasonCode", "427");
    set(request, "security.3ds.message", "3DS error");

    set(transaction_expected, "secure_reason_code", "427");
    set(transaction_expected, "secure_message", "3DS error");

    test_token_charge(done, request, transaction_expected, (_: SinonStub) => {
      expect(put_stub.args[0][0]).not.to.haveOwnProperty("subscriptionTrigger");
      expect(put_stub.args[0][0]).to.haveOwnProperty("transactionCardId");
    });
  });

  it("should save transaction with subscriptionTrigger as onDemand when transaction type was subscription on demand", (done: Mocha.Done) => {
    request = {
      ...request,
      transactionType: SubscriptionTrxTypeEnum.SUBSCRIPTION_ONDEMAND_TOKEN,
    };
    transaction_expected = {
      ...transaction_expected,
      subscriptionTrigger: SubscriptionTriggerEnum.ON_DEMAND,
    };
    test_token_charge(
      done,
      request,
      transaction_expected,
      (putStub: SinonStub) => {
        expect(putStub.args[0][0]).to.haveOwnProperty("subscriptionTrigger");
        expect(put_stub.args[0][0]).to.not.haveOwnProperty("transactionCardId");
      }
    );
  });

  it("should get data from binInfo, build and save transaction when the token doesn't exist", (done: Mocha.Done) => {
    request.country = "Ecuador";
    unset(request, "merchantId");

    query_stub = sandbox.stub().returns(of([]));
    invoke_lambda_stub = sandbox.stub().returns(of(bin_info));

    mockDynamoGateway();
    mockLambdaGateway();

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );
    unset(transaction_expected, "country");
    unset(transaction_expected, "last_four_digits");
    unset(transaction_expected, "credential_alias");
    unset(transaction_expected, "credential_id");
    unset(transaction_expected, "ip");
    unset(transaction_expected, "merchant_name");
    unset(transaction_expected, "vault_token");
    unset(transaction_expected, "secure_code");
    unset(transaction_expected, "secure_message");
    service.saveDeclineTrx(request).subscribe({
      next: (res: boolean) => {
        expect(query_stub).to.calledOnceWith(
          match.any,
          match.any,
          "secureId",
          request.secureId
        );
        expect(invoke_lambda_stub).to.calledOnce;
        expect(put_stub).to.calledOnce.calledWithMatch(
          {
            ...transaction_expected,
            bin_card: request.bin,
            card_holder_name: get(request, "cardHolderName", ""),
            currency_code: get(request, "currency", ""),
            foreign_card: false,
            maskedCardNumber: get(request, "maskedCreditCard", ""),
            merchant_name: "name",
            subtotal_iva0: Number(get(request, "requestAmount", 0)),
            transaction_type: TransactionTypeEnum.SALE,
          },
          match.any
        );
        expect(put_stub.args[0][0]).to.haveOwnProperty("transaction_details");
        expect(put_stub.args[0][0]).to.haveOwnProperty("security");
        expect(put_stub.args[0][0]).to.haveOwnProperty("rules");
        expect(put_stub.args[0][0]).to.haveOwnProperty("amount");
        expect(put_stub.args[0][0]).to.haveOwnProperty("created").to.not.be
          .undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty("transaction_id").to.not
          .be.undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty("transaction_reference")
          .to.not.be.undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty("token").to.be.undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty("merchant_id").to.be
          .undefined;

        expect(res).to.be.true;
        done();
      },
    });
  });

  it("should throw error an error 002 when doesn't exist bin info", (done: Mocha.Done) => {
    query_stub = sandbox.stub().returns(of([]));
    invoke_lambda_stub = sandbox.stub().returns(of(undefined));

    mockDynamoGateway();
    mockLambdaGateway();

    service = CONTAINER.get<ITransactionService>(
      IDENTIFIERS.TransactionService
    );

    service.saveDeclineTrx(request).subscribe({
      error: (error: KushkiError) => {
        expect(query_stub).to.calledOnce;
        expect(error.getMessage()).to.be.equal(ERRORS.E002.message);
        expect(error.code).to.be.contains("002");
        expect(put_stub).to.not.calledOnce;
        done();
      },
    });
  });
});

function runRestoreDependencies(box: SinonSandbox) {
  box.restore();
  CONTAINER.restore();
}
