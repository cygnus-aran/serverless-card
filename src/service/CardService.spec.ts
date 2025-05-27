/**
 * Card Service Unit test
 */
import { Tracer } from "@aws-lambda-powertools/tracer";
import {
  AurusError,
  DynamoEventNameEnum,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE,
  IDynamoDbEvent,
  IDynamoElement,
  IDynamoRecord,
  ILambdaGateway,
  IRequestContext,
  KushkiError,
} from "@kushki/core";
import {
  IdentityCategoryEnum,
  IdentityCodeEnum,
  OriginIdEnum,
  OriginValuesEnum,
  PartnerNameEnum,
} from "@kushki/core/lib/infrastructure/DataFormatterCatalogEnum";
import {
  IDataFormatter,
  IKushkiInfo,
  IRootResponse,
  ISecurityIdentity,
  ISecurityIdentityRequest,
} from "@kushki/core/lib/repository/IDataFormatter";
import { Context } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { expect, use } from "chai";
import * as chaiJsonSchema from "chai-json-schema";
import { IDENTIFIERS } from "constant/Identifiers";
import { PAYLOAD } from "constant/Resources";
import { SNSGateway } from "gateway/SNSGateway";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ChannelEnum } from "infrastructure/ChannelEnum";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { DeferredNamesEnum } from "infrastructure/DeferredNameEnum";
import { EnvironmentEnum } from "infrastructure/EnvironmentEnum";
import { ERRORS, WarningSecurityEnum } from "infrastructure/ErrorEnum";
import { IEventBusDetail } from "infrastructure/IEventBusDetail";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { PartnerValidatorEnum } from "infrastructure/SecureIdentityEnum";
import { StatusMerchantDeferredOptionEnum } from "infrastructure/StatusMerchantDeferredOptionEnum";
import { SubscriptionTriggerEnum } from "infrastructure/SubscriptionEnum";
import { TokensEnum, TokenTypeEnum } from "infrastructure/TokenTypeEnum";
import { TransactionKindEnum } from "infrastructure/TransactionKindEnum";
import { TransactionModeEnum } from "infrastructure/TransactionModeEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import {
  DeclinedAuthentication3DSEnum,
  TransactionStatusEnum,
} from "infrastructure/TransactionStatusEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { TransbankTransactionTypeEnum } from "infrastructure/TransbankTransactionTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, isUndefined, set, unset } from "lodash";
import { beforeEach, describe, Done } from "mocha";
import * as moment from "moment";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { ICardGateway } from "repository/ICardGateway";
import { ICardService } from "repository/ICardService";
import { IContext } from "repository/IContext";
import { DynamoQueryResponse, IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import { ISandboxGateway } from "repository/ISandboxGateway";
import { ISNSGateway } from "repository/ISNSGateway";
import { ISQSGateway } from "repository/ISQSGateway";
import {
  ITransactionService,
  ProcessRecordRequest,
} from "repository/ITransactionService";
import rollbar = require("rollbar");
import { Observable, Observer, of, throwError } from "rxjs";
import { delay, map, mapTo, switchMap } from "rxjs/operators";
import { CardService } from "service/CardService";
import { TransactionService } from "service/TransactionService";
import { createSandbox, match, SinonSandbox, SinonSpy, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { ThreeDSTokenInfoRequest } from "types/3ds_token_info_request";
import {
  AccountValidationRequest,
  SubMerchant,
} from "types/account_validation_request";
import { SubMerchantDynamo } from "types/acq_validate_account_request";
import { Amount } from "types/amount";
import { AurusResponse, TransactionDetails } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { BinInfo } from "types/bin_info";
import { BinParameters } from "types/bin_parameters";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargeBackRequest } from "types/chargeback_request";
import { ChargebackTransaction } from "types/chargeback_transaction";
import { ChargesCardRequest } from "types/charges_card_request";
import { ChargesCardResponse } from "types/charges_card_response";
import { ConvertionResponse } from "types/convertion_response";
import { CreateDefaultServicesRequest } from "types/create_card_request";
import { DirectIntegrationProcessorIds } from "types/direct_integration_merchant_ids";
import {
  DeferredOption,
  DynamoMerchantFetch,
} from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { GetDeferredResponse } from "types/get_deferred_response";
import { HierarchyConfig } from "types/hierarchy_config";
import { KushkiAcqVars } from "types/kushki_acq_vars";
import {
  LambdaTransactionRuleBodyResponse,
  LambdaTransactionRuleResponse,
} from "types/lambda_transaction_rule_response";
import { ReauthorizationRequest } from "types/reauthorization_request";
import { IDeferredResponse } from "types/remote/deferred_response";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { SandboxChargeResponse } from "types/sandbox_charge_response";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import { SiftScienceWorkflowsResponse } from "types/sift_science_workflows_response";
import { SubscriptionDynamo } from "types/subscription_dynamo";
import { SubscriptionTransactionDynamo } from "types/subscription_transaction_dynamo";
import { TokenDynamo } from "types/token_dynamo";
import {
  CardInfo,
  TokensCardBody,
  TransactionRuleInfo,
} from "types/tokens_card_body";
import { Transaction } from "types/transaction";
import { TransactionDynamo } from "types/transaction_dynamo";
import { UnifiedCaptureRequest } from "types/unified_capture_request";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { AcqCardResponse } from "types/validate_account_lambda_response";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { VoidCardRequest } from "types/void_card_request";
import { WebhookSignatureResponse } from "types/webhook_signature_response";
import { TokenlessChargeCardBody } from "types/tokenless_charge_card_body";
import { DirectMerchantEnabledEnum } from "infrastructure/DirectMerchantEnabledEnum";
import { PaymentSubMethodTypeEnum } from "infrastructure/PaymentMethodEnum";
import { ChargebackPath } from "types/chargeback_path";
import { ERRORS_ACQ } from "infrastructure/ErrorAcqEnum";

use(sinonChai);

use(chaiJsonSchema);
const BAD_BINS: string = "444088,475395,422249";
const HEADER_NAME: string = "PRIVATE-MERCHANT-ID";
const UNREACHABLE: string = "this line must be unreachable";
const CHARGE_MID: string = "2000000001291929192";
const TRANSACTION_CARD_ID: string = "5b0ecb03-83be-4d4c-91c0-41760ea95e39";
const MERCHANT_COUNTRY: string = "Ecuador";
const X_FORWARDED_FOR: string = "X-FORWARDED-FOR";
const COLOMBIAN_PROCESSORS: string[] = [
  "Redeban Processor",
  "Credibanco Processor",
];
const ECUADORIAN_PROCESSORS: string[] = [
  "Credimatic Processor",
  "Datafast Processor",
];
const DIRECT_INTEGRATION_PROCESSOR_IDS =
  '{"niubiz":"1234,111,333,2000000001291929192"}';

process.env.AFT_MCC = '["6051"]';
const DIRECT_INTEGRATION_BINS = '{"123456789":"11111,2222,3333,4444"}';
const DIRECT_INTEGRATION_BINS_ALL = '{"123456789":"all"}';
const CREATE_REQUEST: CreateDefaultServicesRequest = { merchantId: "32332" };
let gChargesRequest: ChargesCardRequest;
let gChargesResponse: ChargesCardResponse;
let gCaptureRequest: CaptureCardRequest;
let gAurusResponse: AurusResponse;
let gMerchantFetch: DynamoMerchantFetch;
let gProcessorFetch: DynamoProcessorFetch;
let gBinFetch: DynamoBinFetch;
let gSiftScienceGetWorkflowsResponse: SiftScienceWorkflowsResponse;
let gTransaction: Transaction;
let gsTransaction: SubscriptionDynamo;
let dynamoResponse: DynamoQueryResponse<Transaction>;
let g2Transaction: Transaction;
let g3Transaction: Transaction;
let gSiftScienceDecisionResponse: SiftScienceDecisionResponse;
const HEADER: string = "PUBLIC-MERCHANT-ID";
const UNREACHABLE_PROCESSOR: string = "Unreachable Processor";
const PROCESSOR_NOT_FOUND: string = "processor not found";
const TRX_RULE_PROCESSOR: string = "usrv-transaction-rule-processor";
const BIN_PATH: string = "binInfo.bin";
const PAYMENT_METHOD_BODY_PATH: string = "body.paymentMethod";
const BIN_BRAN: string = "binInfo.brand";
const DETAIL_CONSORTIUM_NAME: string = "details.consortiumName";
const DEFERRED_MONTHS_PATH: string = "deferred.months";
const BIN_INFO_PATH: string = "binInfo.info.type";
const TRANSBANK_IDS: string = "5656,5480,all";
const SIFT_SCORE_PATH: string = "merchant.siftScience.SiftScore";
const NO_ADMIN_VOID_PATH: string = "/card/v1/admin/charges/1234567890/refund";
const CONTEXT_HIERARCHY_CONFIG: object = {
  processing: {
    businessRules: "200000000345046",
    deferred: "200000000345046",
    processors: "200000000345046",
    securityRules: "200000000345046",
  },
  rootId: "3000abc0001",
};
const PATH_HIERARCHY_CONFIG: string =
  "requestContext.authorizer.hierarchyConfig";
const TEST_TIME_LIMITS: string =
  '{"REFUND_TIME_LIMIT":{"default":120, "col_dom":120}}';
let gInvokeFunctionStub: SinonStub;
let gTokenDynamo: TokenDynamo;
let gLambdaContext: Context;
let gGetItemStub: SinonStub;
let gReauthorizationRequest: ReauthorizationRequest;
let gUnifiedTrxRequest: UnifiedChargesPreauthRequest;
let gChargeRequest: UnifiedChargesPreauthRequest;
let rollbar_stub: SinonStub;

function checkTimeoutError(err: KushkiError, done: Mocha.Done) {
  expect(err.getStatusCode()).to.be.equal(400);
  expect(err.getMessage()).to.be.equal(ERRORS.E027.message);
  done();
}

function rollbarInstance(box: SinonSandbox): void {
  rollbar_stub = box.stub();
  CONTAINER.bind(CORE.RollbarInstance).toConstantValue(Mock.of());
  CONTAINER.unbind(CORE.RollbarInstance);
  CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
    Mock.of<rollbar>({
      critical: box.stub(),
      warn: box.stub(),
      warning: rollbar_stub,
    })
  );
}

function mockSQSGateway(putStub: SinonStub): void {
  CONTAINER.unbind(IDENTIFIERS.SQSGateway);
  CONTAINER.bind(IDENTIFIERS.SQSGateway).toConstantValue(
    Mock.of<ISQSGateway>({
      put: putStub,
    })
  );
}

function chargesEvent(
  fullResponse: boolean = false,
  country: string = MERCHANT_COUNTRY
): IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext> {
  return Mock.of<
    IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  >({
    body: { ...gChargesRequest, fullResponse },
    headers: { HEADER_NAME: "123455799754313" },
    requestContext: Mock.of<IRequestContext<AuthorizerContext>>({
      authorizer: {
        credentialAlias: "credentialAlias",
        credentialId: "credential_id",
        credentialMetadata: { origin: "test", data: "test" },
        merchantCountry: country,
        merchantId: CHARGE_MID,
        publicMerchantId: "publicMerchantId",
        sandboxEnable: true,
      },
    }),
  });
}

function createEvent(
  country: string = MERCHANT_COUNTRY
): IAPIGatewayEvent<
  CreateDefaultServicesRequest,
  null,
  null,
  AuthorizerContext
> {
  return Mock.of<
    IAPIGatewayEvent<
      CreateDefaultServicesRequest,
      null,
      null,
      AuthorizerContext
    >
  >({
    body: { ...CREATE_REQUEST },
    headers: { HEADER_NAME: "1234557" },
    requestContext: Mock.of<IRequestContext<AuthorizerContext>>({
      authorizer: {
        credentialAlias: "credentialAlias",
        credentialId: "credentialId",
        credentialMetadata: { origin: "test", data: "test" },
        merchantCountry: country,
        merchantId: CHARGE_MID,
        privateMerchantId: "privateMerchantId",
        publicMerchantId: "publicMerchantId",
        sandboxEnable: true,
      },
    }),
  });
}

function chargesEventUndefined(
  fullResponse: boolean = false,
  country: string = MERCHANT_COUNTRY
): IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext> {
  return Mock.of<
    IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  >({
    body: { ...gChargesRequest, fullResponse },
    headers: { HEADER_NAME: "123455799754313" },
    requestContext: Mock.of<IRequestContext<AuthorizerContext>>({
      authorizer: {
        credentialAlias: "credentialAlias",
        credentialId: "credential_id",
        credentialMetadata: { origin: "test", data: "test" },
        merchantCountry: country,
        merchantId: "16663",
        publicMerchantId: "publicMerchantId",
        sandboxEnable: true,
      },
    }),
  });
}

// tslint:disable-next-line:max-func-body-length
function mockUnifiedChargesRequest(
  fullResponse: boolean = false,
  country: string = MERCHANT_COUNTRY
): void {
  gUnifiedTrxRequest = Mock.of<UnifiedChargesPreauthRequest>({
    fullResponse,
    "3ds": {},
    amount: {
      currency: CurrencyEnum.USD,
      iva: 12,
      subtotalIva: 100,
      subtotalIva0: 1000.04,
      totalAmount: 1112.04,
    },
    authorizerContext: {
      credentialAlias: "credentialAliasUnified",
      credentialId: "credential_idUnified",
      credentialMetadata: { origin: "testU", data: "testU" },
      merchantCountry: country,
      merchantId: CHARGE_MID,
      publicMerchantId: "publicMerchantIdUnified",
      sandboxEnable: true,
    },
    binInfo: {
      bank: "Pichincha",
      bin: "123456",
      brand: "VISA",
      processor: "Credimatic",
    },
    cardHolderName: "Test cardholdername",
    channel: "test channel",
    contactDetails: {
      documentNumber: "1009283738",
      documentType: "CC",
      email: "test@test.com",
      firstName: "Diego",
      lastName: "Cadena",
      phoneNumber: "777777777",
    },
    count: 0,
    credentialId: "testCredentialId",
    cvv: "123",
    deferred: {
      creditType: "1",
      graceMonths: "1",
      months: 1,
    },
    expiryMonth: "01",
    expiryYear: "29",
    failOverSubscription: undefined,
    failOverToken: "dsfuysdfhgd765",
    ignoreWarnings: true,
    ip: "testIp",
    isDeferred: false,
    isSubscriptionCharge: false,
    lastFourDigits: "1234",
    maskedCardNumber: "565754XXXXXX7878",
    merchant: {
      country: "Ecuador",
      deferredOptions: [],
      merchantId: "merchantTest",
      merchantName: "merchantName",
      sandboxEnable: false,
      siftScience: {
        ProdAccountId: "jkakfdj9094",
        ProdApiKey: "0023409",
        SandboxAccountId: "lsdlsdf09",
        SandboxApiKey: "092340",
        SiftScore: 1000,
      },
      taxId: "taxIdTest",
      whiteList: false,
    },
    merchantCountry: "Ecuador",
    metadata: {
      ksh_subscriptionValidation: false,
    },
    orderDetails: {
      billingDetails: {
        address: "Eloy Alfaro 139",
        city: "Quito",
        country: "Ecuador",
        name: "Diego ",
        phone: "+593222222",
        region: "Pichincha",
        zipCode: "170402",
      },
      shippingDetails: {
        address: "Eloy Alfaro 139 y Catalina Aldaz",
        city: "Quito",
        country: "Ecuador",
        name: "Diego Cadena",
        phone: "",
        region: "Pichincha",
        zipCode: "170402",
      },
      siteDomain: "tuebook.com",
    },
    paymentBrand: "Master Card",
    periodicity: undefined,
    plccMetadataId: "test plccMetadataId",
    productDetails: {
      product: [
        {
          id: "198952AB",
          price: 6990000,
          quantity: 1,
          sku: "10101042",
          title: "eBook Digital Services",
        },
        {
          id: "198953AB",
          price: 9990000,
          quantity: 1,
          sku: "004834GQ",
          title: "eBook Virtual Selling",
        },
      ],
    },
    secureId: "test secureiD",
    secureService: "test secureService",
    sellerUserId: "fakeSellerUserID",
    sessionId: "test sessionId",
    settlement: 123,
    subMetadataId: "test subMetadataId",
    subscriptionId: "",
    tokenCreated: new Date().valueOf(),
    tokenCurrency: CurrencyEnum.USD,
    tokenId: "testTokenId",
    tokenObject: {
      amount: 1112.04,
    },
    tokenType: TokenTypeEnum.TRANSACTION,
    transactionKind: TransactionKindEnum.CARD,
    transactionReference: "testtransactionReference",
    transactionType: TransactionRuleTypeEnum.CHARGE,
    userAgent: "testUserAgent",
    userId: "testUserId",
    usrvOrigin: UsrvOriginEnum.CARD,
    vaultToken: "testvaultToken",
  });
  gChargeRequest = Mock.of<UnifiedChargesPreauthRequest>({
    fullResponse,
    "3ds": {},
    amount: {
      currency: CurrencyEnum.USD,
      iva: 12,
      subtotalIva: 100,
      subtotalIva0: 1000.04,
      totalAmount: 1112.04,
    },
    authorizerContext: {
      credentialAlias: "credentialAliasUnified",
      credentialId: "credential_idUnified",
      credentialMetadata: { origin: "testU", data: "testU" },
      merchantCountry: country,
      merchantId: CHARGE_MID,
      publicMerchantId: "publicMerchantIdUnified",
      sandboxEnable: true,
    },
    binInfo: {
      bank: "Pichincha",
      bin: "123456",
      brand: "VISA",
      processor: "Credimatic",
    },
    cardHolderName: "Test cardholdername",
    channel: "test channel",
    contactDetails: {
      documentNumber: "1009283738",
      documentType: "CC",
      email: "test@test.com",
      firstName: "Diego",
      lastName: "Cadena",
      phoneNumber: "777777777",
    },
    count: 0,
    credentialId: "testCredentialId",
    cvv: "123",
    deferred: {
      creditType: "1",
      graceMonths: "1",
      months: 1,
    },
    expiryMonth: "01",
    expiryYear: "29",
    failOverSubscription: undefined,
    failOverToken: "dsfuysdfhgd765",
    ignoreWarnings: true,
    ip: "testIp",
    isDeferred: false,
    isSubscriptionCharge: false,
    lastFourDigits: "1234",
    maskedCardNumber: "565754XXXXXX7878",
    merchant: {
      country: "Ecuador",
      deferredOptions: [],
      merchantId: "merchantTest",
      merchantName: "merchantName",
      sandboxEnable: false,
      siftScience: {
        ProdAccountId: "jkakfdj9094",
        ProdApiKey: "0023409",
        SandboxAccountId: "lsdlsdf09",
        SandboxApiKey: "092340",
        SiftScore: 1000,
      },
      taxId: "taxIdTest",
      whiteList: false,
    },
    merchantCountry: "Ecuador",
    metadata: {
      ksh_subscriptionValidation: false,
    },
    orderDetails: {
      billingDetails: {
        address: "Miami",
        city: "Quito",
        country: "Ecuador",
        name: "Ricardo Cl",
        phone: "+0999999",
        region: "Pichincha",
        zipCode: "170528",
      },
      shippingDetails: {
        address: "Eloy Alfaro 139 y Catalina Aldaz",
        city: "Quito",
        country: "Ecuador",
        name: "Diego Cadena",
        phone: "",
        region: "Pichincha",
        zipCode: "170402",
      },
      siteDomain: "tuebook.com",
    },
    paymentBrand: "Master Card",
    periodicity: undefined,
    plccMetadataId: "test plccMetadataId",
    productDetails: {
      product: [
        {
          id: "198952AB",
          price: 6990000,
          quantity: 1,
          sku: "10101042",
          title: "eBook Digital Services",
        },
        {
          id: "198953AB",
          price: 9990000,
          quantity: 1,
          sku: "004834GQ",
          title: "eBook Virtual Selling",
        },
      ],
    },
    secureId: "test secureiD",
    secureService: "test secureService",
    sellerUserId: "fakeSellerUserID",
    sessionId: "test sessionId",
    settlement: 123,
    sqsFlag: "aurusReponse",
    subMetadataId: "test subMetadataId",
    subscriptionId: "",
    tokenCreated: new Date().valueOf(),
    tokenCurrency: CurrencyEnum.USD,
    tokenId: "testTokenId",
    tokenObject: {
      amount: 1112.04,
    },
    tokenType: TokenTypeEnum.TRANSACTION,
    transactionKind: TransactionKindEnum.CARD,
    transactionReference: "testtransactionReference",
    transactionType: TransactionRuleTypeEnum.CHARGE,
    userAgent: "testUserAgent",
    userId: "testUserId",
    usrvOrigin: UsrvOriginEnum.CARD,
    vaultToken: "testvaultToken",
  });
}

function reauthEvent(
  fullResponse: string = "v1",
  country: string = MERCHANT_COUNTRY
): IAPIGatewayEvent<ReauthorizationRequest, null, null, AuthorizerContext> {
  return Mock.of<
    IAPIGatewayEvent<ReauthorizationRequest, null, null, AuthorizerContext>
  >({
    body: { ...gReauthorizationRequest, fullResponse },
    headers: { HEADER_NAME: "123455799754313" },
    requestContext: Mock.of<IRequestContext<AuthorizerContext>>({
      authorizer: {
        credentialAlias: "credentialAlias",
        credentialId: "credential_id",
        credentialMetadata: { origin: "test", data: "test" },
        merchantCountry: country,
        merchantId: CHARGE_MID,
        publicMerchantId: "publicMerchantId",
        sandboxEnable: true,
      },
    }),
  });
}

function chargesCardResponse(): Transaction {
  return {
    approval_code: "reprehenderit do minim",
    approved_amount: "cupidatat occaecat nulla",
    approved_transaction_amount: 123,
    bin_card: "2323",
    binCard: "occaecat eu exercitation",
    card_holder_name: "Duis officia",
    customer_merchant_id: "merchant1",
    consortium_name: "testing",
    created: Number(new Date()),
    currency_code: "USD",
    email: "test@test2.com",
    isDeferred: "id tempor ipsum qui",
    issuing_bank: "Bco. Pichincha",
    iva_value: 1,
    last_four_digits: "do",
    merchant_id: "irure exercitation deserunt sed",
    merchant_name: "Excepteur",
    payment_brand: "aute",
    processor_bank_name: "Excepteur",
    processor_id: "Excepteur",
    processor_name: "Excepteur",
    recap: "12345",
    request_amount: 23,
    response_code: "263",
    response_text: "incididunt ipsum ullamco exercitation",
    security: [
      {
        partner: "transunion",
      },
    ],
    subtotal_iva: 1,
    subtotal_iva0: 1,
    sync_mode: "api",
    ticket_number: "07874520255",
    transaction_id: "exercittion ",
    transaction_reference: "84383487834",
    transaction_status: "00000",
    transaction_type: "exercitation ",
  };
}

function chargesError(
  service: ICardService,
  mockChargesEvent: IAPIGatewayEvent<
    ChargesCardRequest,
    null,
    null,
    AuthorizerContext
  >,
  done: Mocha.Done
): void {
  service.charges(mockChargesEvent, gLambdaContext).subscribe({
    error: (error: KushkiError): void => {
      expect(error.code).to.be.eql("K004");
      done();
    },
    next: (): void => {
      done(UNREACHABLE);
    },
  });
}

function getSubMerchant(): SubMerchantDynamo {
  return {
    address: "address",
    city: "city",
    code: "code",
    countryAns: "countryAns",
    facilitatorName: "facilitatorName",
    idAffiliation: "idAffiliation",
    idCompany: "idCompany",
    idFacilitator: "idFacilitator",
    mcc: "mcc",
    socialReason: "socialReason",
    softDescriptor: "softDescriptor",
    zipCode: "zipCode",
  };
}

// tslint:disable-next-line: max-func-body-length
function createSchemas(): void {
  gChargesRequest = Mock.of<ChargesCardRequest>({
    amount: {
      currency: CurrencyEnum.USD,
      iva: 12,
      subtotalIva: 100,
      subtotalIva0: 1000.04,
    },
    subMerchant: { city: "Quito", socialReason: "socialk" },
    token: "923y419hddsh02",
    tokenId: "asdad",
  });
  gReauthorizationRequest = Mock.of<ReauthorizationRequest>({
    ticketNumber: "azxczxcb",
  });
  gChargesResponse = Mock.of<ChargesCardResponse>({
    ticketNumber: "ticket",
  });
  gCaptureRequest = Mock.of<CaptureCardRequest>({
    ticketNumber: "azxczxcb",
  });
  gAurusResponse = Mock.of<AurusResponse>({
    approved_amount: "czxczx",
    binCard: "12345678",
    creditType: "VN",
    recap: "sadads",
    response_code: "asdcxva",
    response_text: "sadbcvbs",
    ticket_number: "asasdass",
    transaction_details: {
      approvalCode: "q2eqeq",
      binCard: "12345678",
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
  gSiftScienceGetWorkflowsResponse = Mock.of<SiftScienceWorkflowsResponse>({});
  gSiftScienceDecisionResponse = Mock.of<SiftScienceDecisionResponse>({});
  gTransaction = Mock.of<Transaction>({
    approval_code: "21321",
    approved_transaction_amount: 344,
    bin_card: "333333",
    card_country: "cardCountry",
    card_country_code: "EC593",
    card_holder_name: "name",
    category_merchant: "merchantCategoryTest",
    consortium_name: "consortium_name",
    country: "Ecuador",
    created: new Date().getTime(),
    credential_alias: "123",
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
    social_reason: "socialReasonTest",
    subMerchant: getSubMerchant(),
    subtotal_iva: 5,
    subtotal_iva0: 2,
    sync_mode: "api",
    tax_id: "324234",
    ticket_number: "11111",
    transaction_id: "2333333",
    transaction_reference: "98398328932",
    transaction_status: TransactionStatusEnum.APPROVAL,
    transaction_type: TransactionTypeEnum.CAPTURE,
  });
  g2Transaction = Mock.of<Transaction>({
    created: 1,
    transaction_reference: "fake transaction 2",
  });
}

function voidSuccess(
  service: ICardService,
  event: IAPIGatewayEvent<
    VoidCardRequest | null,
    VoidCardPath,
    null,
    AuthorizerContext,
    VoidCardHeader
  >,
  next: SinonSpy,
  done: Mocha.Done
): void {
  service
    .chargeDeleteGateway(event, {
      ...gLambdaContext,
      credentialValidationBlock: "",
    })
    .subscribe({
      next,
      complete: (): void => {
        expect(next).to.be.calledOnce.calledWithMatch({
          ticketNumber: gTransaction.ticket_number,
        });
        done();
      },
      error: done,
    });
}

function voidSuccessWithMcc(
  service: ICardService,
  event: IAPIGatewayEvent<
    VoidCardRequest | null,
    VoidCardPath,
    null,
    AuthorizerContext,
    VoidCardHeader
  >,
  done: Mocha.Done,
  lambdaStub: SinonStub,
  transactionStub: SinonStub
): void {
  service
    .chargeDeleteGateway(event, {
      ...gLambdaContext,
      credentialValidationBlock: "",
    })
    .subscribe({
      error: done,
      next: (response: object): void => {
        expect(lambdaStub.getCall(1).args[1].body.mccCode).to.be.equal("1234");
        expect(transactionStub.args[0][1].mccCode).to.be.equal("1234");
        expect(response).not.to.have.ownProperty("mccCode");
        expect(response).not.to.have.ownProperty("sub_mcc_code");
        expect(response).not.to.have.ownProperty("subMccCode");
        done();
      },
    });
}

function chargeSuccessNoBinInfo(
  service: ICardService,
  lambdaStub: SinonStub,
  workflowsStub: SinonStub,
  done: Mocha.Done
): void {
  service
    .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
    .subscribe({
      error: done,
      next: (data: object): void => {
        expect(lambdaStub.getCall(0).args[1]).to.have.property("body");
        expect(data).to.have.property("ticketNumber");
        expect(lambdaStub.getCall(0).args[1].body)
          .to.have.property("detail")
          .and.have.property("bank", "");
        expect(workflowsStub).to.be.calledOnce;
        done();
      },
    });
}

function successUnifiedChargefullResponse(
  service: ICardService,
  mockChargesRequest: UnifiedChargesPreauthRequest,
  done: Mocha.Done,
  processStub: SinonStub
): void {
  service
    .unifiedChargesOrPreAuth(mockChargesRequest, gLambdaContext)
    .subscribe({
      complete: (): void => {
        expect(processStub).to.be.called;
        done();
      },
      error: done,
      next: (data: object): void => {
        expect(data).not.to.have.deep.nested.property(DETAIL_CONSORTIUM_NAME);
        expect(data).to.have.property("details").and.have.property("binInfo");
        expect(data).to.not.have.property("acquirerBank");
      },
    });
}

function successUnifiedChargeAurusResponse(
  service: ICardService,
  mockChargesRequest: UnifiedChargesPreauthRequest,
  done: Mocha.Done,
  processStub: SinonStub
): void {
  service
    .unifiedChargesOrPreAuth(mockChargesRequest, gLambdaContext)
    .subscribe({
      complete: (): void => {
        expect(processStub).to.be.called;
        done();
      },
      error: done,
      next: (data: object): void => {
        expect(data).to.have.property("transaction_id");
        expect(data).to.not.have.property("acquirerBank");
      },
    });
}

function successUnifiedPreAuthorizationFullResponse(
  service: ICardService,
  mockChargeRequest: UnifiedChargesPreauthRequest,
  done: Mocha.Done,
  processStub: SinonStub
): void {
  service.unifiedChargesOrPreAuth(mockChargeRequest, gLambdaContext).subscribe({
    complete: (): void => {
      expect(processStub).to.be.called;
      done();
    },
    error: done,
    next: (data: object): void => {
      expect(data).to.have.property("details").and.have.property("binInfo");
      expect(data)
        .to.have.property("details")
        .and.have.property("metadata")
        .and.deep.equal(undefined);
      expect(data).to.not.have.property("acquirerBank");
    },
  });
}

function dynamoBinding(put: SinonStub, box: SinonSandbox): void {
  gGetItemStub = box
    .stub()
    .onFirstCall()
    .returns(of(gMerchantFetch))
    .onSecondCall()
    .returns(of(gProcessorFetch))
    .onCall(2)
    .returns(of(gBinFetch));

  CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
    Mock.of<IDynamoGateway>({
      put,
      getItem: gGetItemStub,
      queryReservedWord: box.stub().returns(of([])),
      updateTokenValue: box.stub().returns(of(gTokenDynamo)),
      updateValues: box.stub().returns(of(true)),
    })
  );
}

function transactionServiceBinding(buildTransactionStub: SinonStub): void {
  CONTAINER.bind<ITransactionService>(
    IDENTIFIERS.TransactionService
  ).toConstantValue(
    Mock.of<ITransactionService>({
      buildTransactionObject: buildTransactionStub,
    })
  );
}

function mockAntifraudBindSiftFlow(box: SinonSandbox): void {
  const workflows_stub: SinonStub = box
    .stub()
    .returns(of(gSiftScienceGetWorkflowsResponse));
  const transaction_stub: SinonStub = box.stub().returns(of(true));

  CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
  CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
    Mock.of<IAntifraudGateway>({
      getWorkflows: workflows_stub,
      transaction: transaction_stub,
    })
  );
}

function antifraudBindSiftFlow(workflowsStub: SinonStub): void {
  CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
    Mock.of<IAntifraudGateway>({
      getWorkflows: workflowsStub,
    })
  );
}

function validateCharge(
  data: object,
  lambdaStub: SinonStub,
  cardStub: SinonStub,
  processStub: SinonStub,
  done: Mocha.Done,
  calledTwice?: boolean,
  validateSift?: boolean
): void {
  expect(data).to.have.property("ticketNumber", gAurusResponse.ticket_number);
  expect(lambdaStub.args[0][1].body.merchantCountry).to.be.equal("Ecuador");

  if (validateSift)
    expect(lambdaStub.args[0][1].body.detail.sellerUserId).to.be.equal(
      "fakeSellerUserID"
    );

  if (calledTwice) expect(lambdaStub).to.be.calledTwice;
  else expect(lambdaStub).to.be.calledOnce;
  expect(cardStub).to.be.calledWith(match.any);
  expect(lambdaStub).to.be.calledWith(
    match.any,
    match.has(
      "body",
      match.has(
        "detail",
        match
          .has("bin")
          .and(match.has("country"))
          .and(match.has("isCreditCard"))
          .and(match.has("ip"))
          .and(match.has("lastFourDigits"))
          .and(match.has("maskedCardNumber"))
      )
    )
  );
  const request: ProcessRecordRequest = processStub.args[0][0];

  expect(request.ruleInfo).to.haveOwnProperty("ip");
  done();
}

function validateMonitorFields(
  data: object,
  put: SinonStub,
  done: Mocha.Done,
  error?: boolean,
  chargeOrPreauth?: boolean,
  tokenDynamo?: TokenDynamo
) {
  let index = 0;
  let token_dynamo_mock = gTokenDynamo;

  if (error) index = 0;
  if (tokenDynamo) token_dynamo_mock = tokenDynamo;

  const put_args = put.args[index][1];

  expect(data).to.not.have.property("social_reason");
  expect(data).to.not.have.property("category_merchant");
  expect(data).to.not.have.property("tax_id");
  if (chargeOrPreauth) {
    expect(data).to.not.have.property("card_country_code");
    expect(data).to.not.have.property("card_country");
    expect(put_args)
      .to.haveOwnProperty("card_country_code")
      .to.be.eq(token_dynamo_mock.binInfo?.info?.country?.alpha2);
    expect(put_args)
      .to.haveOwnProperty("card_country")
      .to.be.eq(token_dynamo_mock.binInfo?.info?.country?.name);
  }
  done();
}

function lambdaServiceBinding(lambdaStub: SinonStub): void {
  CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeFunction: lambdaStub,
    })
  );
}

function lambdaServiceBindingWithAsync(
  lambdaStub: SinonStub,
  asyncStub: SinonStub
): void {
  CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeAsyncFunction: asyncStub,
      invokeFunction: lambdaStub,
    })
  );
}

function lambdaStubTransactionRule(
  box: SinonSandbox,
  processor?: ProcessorEnum
): SinonStub {
  return box.stub().returns(
    of(
      Mock.of<{ body: LambdaTransactionRuleResponse }>({
        body: {
          currencyCode: CurrencyEnum.USD,
          externalSubscription: false,
          privateId: gProcessorFetch.private_id,
          processor: processor ? processor : ProcessorEnum.DATAFAST,
          publicId: gProcessorFetch.public_id,
          serviceProvider: {
            facilitatorName: "facilitatorName",
            visa: {
              companyId: "456",
              payfactId: "123",
            },
          },
        },
      })
    )
  );
}

function dynamoBindSiftFlow(put: SinonStub, box: SinonSandbox): void {
  CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
    Mock.of<IDynamoGateway>({
      put,
      getItem: box
        .stub()
        .onFirstCall()
        .returns(of(gMerchantFetch))
        .onSecondCall()
        .returns(
          of(
            Mock.of<TokenDynamo>({
              amount: 1112,
              merchantId: CHARGE_MID,
              sessionId: "123",
              userId: "123",
            })
          )
        )
        .onThirdCall()
        .returns(of(gProcessorFetch))
        .returns(of(gMerchantFetch)),
      queryReservedWord: box.stub().returns(of([])),
    })
  );
}

function lambdaGateway(box: SinonSandbox, response: object): void {
  gInvokeFunctionStub = box.stub().returns(of(response));
  CONTAINER.unbind(CORE.LambdaGateway);
  CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeFunction: gInvokeFunctionStub,
    })
  );
}

function sandboxInit(box: SinonSandbox): void {
  CONTAINER.unbind(IDENTIFIERS.SandboxGateway);
  CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
    Mock.of<ISandboxGateway>({
      captureTransaction: box.stub().returns(of({})),
      chargesTransaction: box.stub().returns(of({})),
      tokensTransaction: box.stub().returns(of({})),
    })
  );
}

function expectCurrencyError(err: KushkiError, done: Mocha.Done): void {
  expect(err.code).to.be.eql("K055");
  expect(err.getMessage()).to.be.eql(ERRORS.E055.message);
  done();
}

beforeEach(() => {
  process.env.DIRECT_INTEGRATION_BINS = DIRECT_INTEGRATION_BINS;
});

describe("CardService - Void", () => {
  process.env.BAD_BINS = BAD_BINS;
  process.env.ENABLE_VALIDATE_TRX_EXPIRATION_TIME = "true";
  let service: ICardService;
  let box: SinonSandbox;
  let void_stub: SinonStub;
  let process_void_stub: SinonStub;
  let processor_dynamo: DynamoProcessorFetch;
  let void_cold: SinonStub;
  let merchant_dynamo: DynamoMerchantFetch;
  let call_lambda_stub: SinonStub;

  function prepareVoidContainers(
    trx: Transaction[] = [gTransaction],
    country?: string,
    bodyMcc?: object
  ): void {
    call_lambda_stub = box
      .stub()
      .onFirstCall()
      .returns(
        of({
          body:
            bodyMcc === undefined
              ? {
                  ...gProcessorFetch,
                  processorName:
                    country === CountryEnum.MEXICO ? ProcessorEnum.PROSA : "",
                }
              : bodyMcc,
        })
      )
      .onSecondCall()
      .returns(
        of({
          body: {
            ticketNumber: gTransaction.ticket_number,
            transactionId: gTransaction.transaction_id,
          },
        })
      )
      .onThirdCall()
      .returns(of(gBinFetch));
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: call_lambda_stub,
      })
    );
    processor_dynamo = Mock.of<DynamoProcessorFetch>({
      acquirer_bank: "Banco Pacifico1",
      private_id: "34345",
      public_id: "123123",
    });

    merchant_dynamo = Mock.of<DynamoMerchantFetch>({
      contactPerson: "Juan Perez",
      country: "Colombia",
      email: "jose@gmail.com",
    });
    gsTransaction = Mock.of<SubscriptionDynamo>({
      merchantId: "mid456",
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(merchant_dynamo))
          .onSecondCall()
          .returns(of(processor_dynamo))
          .onThirdCall()
          .returns(of(gBinFetch)),
        put: box.stub().returns(of(true)),
        query: box
          .stub()
          .onCall(0)
          .returns(of(trx))
          .onCall(1)
          .returns(of([gsTransaction]))
          .returns(of(trx)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    void_cold = box.stub();
    process_void_stub = box.stub().callsFake(() =>
      of(1).pipe(
        map(() => {
          void_cold();

          return gTransaction;
        })
      )
    );
    CONTAINER.bind(IDENTIFIERS.TransactionService).toConstantValue(
      Mock.of<ITransactionService>({
        processVoidRecord: process_void_stub,
      })
    );
  }

  function mockChargeDeleteGtwDynamo(): void {
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(merchant_dynamo))
          .onSecondCall()
          .returns(of(processor_dynamo))
          .onThirdCall()
          .returns(of(gBinFetch)),
        put: box.stub().returns(of(true)),
        query: box
          .stub()
          .onCall(0)
          .returns(of([gTransaction]))
          .onCall(1)
          .returns(of([gsTransaction]))
          .returns(of([])),
        updateValues: box.stub().returns(of(true)),
      })
    );
  }

  function mockVoidLambdaInvocation(isReceivable: boolean) {
    call_lambda_stub = box
      .stub()
      .onFirstCall()
      .returns(
        of({
          body: {
            isReceivable,
          },
        })
      )
      .onSecondCall()
      .returns(
        of({
          body: gProcessorFetch,
        })
      )
      .onThirdCall()
      .returns(
        of({
          body: {
            ticketNumber: gTransaction.ticket_number,
            transactionId: gTransaction.transaction_id,
          },
        })
      )
      .onCall(3)
      .returns(of(gBinFetch));
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: call_lambda_stub,
      })
    );
  }

  function mockVoidLambdaInvocationForTransactionValidation(
    isReceivable: boolean
  ) {
    call_lambda_stub = box
      .stub()
      .onFirstCall()
      .returns(
        of({
          body: {
            expirationConsoleDay: {
              dateResult: moment().add(10, "day").format("YYYY/MM/DD"),
            },
          },
        })
      )
      .onSecondCall()
      .returns(
        of({
          body: {
            isReceivable,
          },
        })
      )
      .onThirdCall()
      .returns(of({ body: "test" }));
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: call_lambda_stub,
      })
    );
  }

  function mockLambdaInvocation(): SinonStub {
    const lambda_invocation: SinonStub = box
      .stub()
      .returns(of({ ticketNumber: gTransaction.ticket_number }));

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_invocation,
      })
    );

    return lambda_invocation;
  }

  function initChargeDeleteEvent(body: VoidCardRequest | null = null): {
    event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >;
    next: SinonSpy;
  } {
    const event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    > = Mock.of<
      IAPIGatewayEvent<
        VoidCardRequest | null,
        VoidCardPath,
        null,
        AuthorizerContext,
        VoidCardHeader
      >
    >({
      body,
      headers: Mock.of<VoidCardHeader>(),
      path: "/card/v1/admin/charges/123456",
      pathParameters: {
        ticketNumber: "1234567890123456",
      },
      requestContext: {
        authorizer: {
          merchantId: gTransaction.merchant_id,
        },
      },
    });

    event.headers[HEADER_NAME] = "12345678";
    const next: SinonSpy = box.spy();

    return { event, next };
  }

  function mockPartialVoidData(
    country: string,
    currency: string,
    processorChannel?: string,
    processorName?: string
  ): void {
    process.env.ASYNC_VOID_LAMBDA = "usrv-card-chargeback-test-voidTrigger";
    prepareVoidContainers([gTransaction], country);
    gTransaction.currency_code = currency;
    gTransaction.country = country;
    gTransaction.processor_channel = processorChannel;
    gTransaction.processor_name = isUndefined(processorName)
      ? gTransaction.processor_name
      : processorName;
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);

    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of({ ...merchant_dynamo, country }))
          .onSecondCall()
          .returns(
            of({
              ...gProcessorFetch,
              processor_name:
                country === CurrencyEnum.MXN ? ProcessorEnum.PROSA : "",
            })
          ),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
        updateValues: box.stub().returns(of(true)),
      })
    );
  }

  function initChargebackEvent(): {
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >;
    next: SinonSpy;
  } {
    const event: IAPIGatewayEvent<
      ChargeBackRequest,
      VoidCardPath,
      null,
      AuthorizerContext
    > = Mock.of<
      IAPIGatewayEvent<ChargeBackRequest, VoidCardPath, null, AuthorizerContext>
    >({
      body: { emails: ["example@mail.com"], paymentMethod: "card" },
      headers: Mock.of<VoidCardHeader>(),
      pathParameters: {
        ticketNumber: "1234567890123456",
      },
      requestContext: {
        authorizer: {
          credentialAlias: "121",
          credentialId: "1212",
          credentialMetadata: { test: "121" },
          merchantId: gTransaction.merchant_id,
          publicCredentialId: "121",
        },
      },
    });

    event.headers[HEADER_NAME] = "12345678";
    const next: SinonSpy = box.spy();

    return { event, next };
  }

  function mockLambdaInvokeForCharge(): SinonStub {
    const lambda_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub,
      })
    );
    return lambda_stub;
  }

  function asserVoidPartialCentralAmericaCountries(
    country: CountryEnum,
    done: Mocha.Done,
    forceRefund: boolean,
    partialVoid: boolean
  ): void {
    mockPartialVoidData(country, "USD");

    const amount_request: VoidCardRequest = {
      amount: {
        currency: "USD",
        iva: 0,
        subtotalIva: 340,
        subtotalIva0: 0,
      },
    };

    const { event } = initChargeDeleteEvent(amount_request);

    box.stub(Tracer.prototype, "putAnnotation");

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        assertVoidPartial(response, forceRefund, partialVoid);
      },
    });
  }

  beforeEach(() => {
    createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    rollbarInstance(box);
    CONTAINER.bind(CORE.LambdaContext).toConstantValue(
      Mock.of<Context>({
        getRemainingTimeInMillis: box.stub().returns(300),
      })
    );
    sandboxInit(box);
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    void_stub = box.stub().returns(of(gAurusResponse));
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        voidTransaction: void_stub,
      })
    );
    merchant_dynamo = {
      contactPerson: "",
      country: "Narnia",
      email: "",
      merchant_name: "asd",
      private_id: "",
      public_id: "",
      sift_science: {},
    };
  });

  dynamoResponse = Mock.of<DynamoQueryResponse<Transaction>>({
    items: [],
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function assertVoidPartial(
    response: object,
    forceRefund: boolean,
    partialVoid: boolean
  ): void {
    expect(get(response, "ticketNumber")).equal(gTransaction.ticket_number);
    expect(call_lambda_stub.getCall(1).args[1].body.forceRefund).to.be.eq(
      forceRefund
    );
    expect(call_lambda_stub.getCall(1).args[1].body.partialVoid).to.be.eq(
      partialVoid
    );
  }

  function assertPartialVoidMX(processor: string, done: Mocha.Done) {
    gTransaction.processor_name = processor;
    gTransaction.created = new Date().getTime();
    process.env.KUSHKI_ADQUIRER_VARS = TEST_TIME_LIMITS;
    mockPartialVoidData(CountryEnum.MEXICO, CurrencyEnum.MXN);

    const amount_request: VoidCardRequest = {
      amount: {
        currency: CurrencyEnum.MXN,
        iva: 0,
        subtotalIva: 342,
        subtotalIva0: 0,
      },
    };
    const { event } = initChargeDeleteEvent(amount_request);

    box.stub(Tracer.prototype, "putAnnotation");

    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        assertVoidPartial(response, false, true);
      },
    });
  }

  describe("getValidNumber", () => {
    it("builds a valid bin from a set of possible fields", () => {
      const tests: { input: object; output: string }[] = [
        {
          input: { binInfo: { originalBinFullLength: "bin1" } },
          output: "bin1",
        },
        {
          input: { binInfo: { bin: "bin2" } },
          output: "bin2",
        },
        {
          input: { maskedCardNumber: "123456XXXXXX6798" },
          output: "123456",
        },
        {
          input: { maskedCardNumber: "" },
          output: "",
        },
        {
          input: { maskedCardNumber: "bin4" },
          output: "BIN4",
        },
      ];

      tests.forEach((test) => {
        expect(CardService.getValidBinNumber(test.input)).to.be.equal(
          test.output
        );
      });
    });
  });

  describe("createDefaultServices", () => {
    let sandbox: SinonSandbox;
    let trace: SinonStub;

    function mockLambdaGateway(invokeStub: SinonStub): void {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: invokeStub,
        })
      );
    }

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
      CONTAINER.snapshot();
      trace = box.stub(Tracer.prototype, "putAnnotation");
    });

    afterEach(() => {
      box.restore();
      CONTAINER.restore();
      trace.restore();
    });

    it("test createDefaultServices - Happy Path", (done: Mocha.Done) => {
      const signature = Mock.of<WebhookSignatureResponse>({
        body: { publicId: "12347" },
        webhookSignature: "1234567",
      });

      const test: SinonStub = sandbox.stub().returns(of(signature));

      mockLambdaGateway(test);

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.createDefaultServices(createEvent()).subscribe({
        next: (data: object): void => {
          expect(get(data, "status")).to.be.eqls(200);
          expect(get(data, "activeServices")).to.exist;
          expect(get(data, "activeServices")).to.be.eqls(["smartlinks"]);
          expect(get(data, "conditions")).to.exist;
          expect(get(data, "cards")).to.exist;
          expect(get(data, "cards")).to.be.eqls(["VISA", "MASTERCARD"]);
          expect(get(data, "validationCharges")).to.exist;
          done();
        },
      });
    });

    it("should return error when semaphore is not updated", (done: Mocha.Done) => {
      const default_stub: SinonStub = sandbox
        .stub()
        .throws(new Error("Any Error"));

      mockLambdaGateway(default_stub);
      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.createDefaultServices(createEvent()).subscribe({
        error: (err) => {
          expect(err).to.be.instanceOf(KushkiError);
          expect(err).to.not.be.undefined;
          done();
        },
      });
    });
  });

  describe("chargeBack", () => {
    it("test chargeBack - Happy Path", (done: Mocha.Done) => {
      dynamoResponse.items.push(gTransaction);

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );
      const lambda_invoke_stub: SinonStub = mockLambdaInvokeForCharge();

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        next,
        complete: (): void => {
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "emails"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "country",
            "Ecuador"
          );
          expect(lambda_invoke_stub).to.have.been.calledOnce;
          expect(next).to.be.calledOnce.and.calledWithMatch(true);
          done();
        },
        error: done,
      });
    });

    it("test chargeBack - a transactionCardId should be sent to chargeback lambda invoke", (done: Mocha.Done) => {
      dynamoResponse.items.pop();
      dynamoResponse.items.push({
        ...gTransaction,
        transactionCardId: "kushki-id",
      });

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );
      const lambda_invoke_stub: SinonStub = mockLambdaInvokeForCharge();

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        complete: (): void => {
          expect(lambda_invoke_stub).to.have.been.calledOnce;
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "transactionCardId",
            "kushki-id"
          );
          done();
        },
      });
    });

    it("should use the value of getDynamoMerchant field country", (done: Mocha.Done) => {
      dynamoResponse.items.pop();
      dynamoResponse.items.push(gTransaction);

      delete gTransaction.country;
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );
      const lambda_invoke_stub: SinonStub = mockLambdaInvokeForCharge();

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        next,
        complete: (): void => {
          expect(lambda_invoke_stub).to.have.been.calledOnce;
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "emails"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "country",
            "Narnia"
          );
          expect(next).to.be.calledOnce.and.calledWithMatch(true);
          done();
        },
        error: done,
      });
    });

    it("test chargeBack - transaction with webhooksChargeback ", (done: Mocha.Done) => {
      const webhooks_chargeback: {
        urls: string[];
        events?: (
          | "initialized"
          | "pending"
          | "review"
          | "approval"
          | "declined"
          | "failed"
          | "expired"
        )[];
        headers?: {
          label: string;
          value: string;
        }[];
      }[] = [
        {
          urls: ["https://webhook.com"],
          events: ["initialized"],
          headers: [
            {
              label: "test",
              value: "1",
            },
          ],
        },
      ];

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);

      dynamoResponse.items.pop();
      dynamoResponse.items.push({
        ...gTransaction,
        webhooksChargeback: webhooks_chargeback,
      });

      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );
      const lambda_invoke_stub: SinonStub = mockLambdaInvokeForCharge();

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        complete: (): void => {
          expect(lambda_invoke_stub).to.have.been.calledOnce;
          expect(lambda_invoke_stub.args[0][1].body.webhooks).to.be.eql(
            webhooks_chargeback
          );
          done();
        },
      });
    });

    it("test chargeBack - with error", (done: Mocha.Done) => {
      dynamoResponse.items.pop();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K020");
          done();
        },
      });
    });

    it("Should throw error when payment method is card_present and transaction does not exist", (done: Mocha.Done) => {
      process.env.IS_ECOMMERCE_ENABLE = "false";

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
        })
      );

      const lambda_invoke_stub: SinonStub = box
        .stub()
        .onFirstCall()
        .returns(
          of({
            body: {
              items: [],
            },
          })
        )
        .onSecondCall()
        .returns(of(true));

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_invoke_stub,
        })
      );

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      set(
        event,
        PAYMENT_METHOD_BODY_PATH,
        PaymentSubMethodTypeEnum.CARD_PRESENT
      );

      service.chargeBack(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K020");
          done();
        },
      });
    });

    it("Should execute chargeback successfully when payment method is card_present", (done: Mocha.Done) => {
      process.env.USRV_STAGE = "qa";
      dynamoResponse.items.push(gTransaction);

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );

      const lambda_invoke_stub: SinonStub = box
        .stub()
        .onFirstCall()
        .returns(
          of({
            body: {
              items: [
                {
                  acquirer_bank: "Kushki",
                  amount: {
                    iva: 20,
                    subtotal_iva: 380,
                    subtotal_iva0: 0,
                    tip: 0,
                    currency: "MXN",
                    extra_taxes: {},
                  },
                  approval_code: "246809",
                  approved_transaction_amount: 40,
                  bin_card: "512280XX",
                  card_country: "MEX",
                  client_transaction_id: "2b9f2bee-5c60-4f1f-b5f8-9d4e5393900e",
                  country: "Mexico",
                  created: 1697661733618,
                  foreign_card: false,
                  issuing_bank: "BAJIO",
                  last_four_digits: "2838",
                  masked_credit_card: "491647XXXXXX2838",
                  mcc: "7361",
                  merchant_id: "20000000106258153000",
                  merchant_name: "Mabe MX",
                  metadata: null,
                  payment_brand: "VISA",
                  payment_method: "card",
                  request_amount: 400,
                  ticket_number: "458818068804235264",
                  transaction_id: "171057205040911329",
                  transaction_reference: "2ce2c92a-3f1c-4971-9ae4-fa412bd26265",
                  transaction_status: "APPROVAL",
                  transaction_type: "SALE",
                },
              ],
            },
          })
        )
        .onSecondCall()
        .returns(of(true));

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_invoke_stub,
        })
      );

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      set(
        event,
        PAYMENT_METHOD_BODY_PATH,
        PaymentSubMethodTypeEnum.CARD_PRESENT
      );

      service.chargeBack(event).subscribe({
        next,
        complete: (): void => {
          expect(lambda_invoke_stub).to.have.been.calledTwice;
          expect(lambda_invoke_stub.args[0][0]).to.be.eqls(
            "usrv-acq-pos-analytics-qa-getTransactionByReference"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "transaction_reference"
          );
          expect(lambda_invoke_stub.args[1][1].body).to.haveOwnProperty(
            "emails"
          );
          expect(lambda_invoke_stub.args[1][1].body).to.haveOwnProperty(
            "country",
            "Mexico"
          );
          expect(lambda_invoke_stub.args[1][1].body).to.haveOwnProperty(
            "paymentSubmethodType",
            event.body.paymentMethod
          );
          expect(next).to.be.calledOnce.and.calledWithMatch(true);
          done();
        },
        error: done,
      });
    });

    it("Should execute chargeback successfully when payment method is CARD VPC", (done: Mocha.Done) => {
      process.env.USRV_STAGE = "qa";
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of({ items: gTransaction })),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );

      const lambda_invoke_stub: SinonStub = box
        .stub()
        .onFirstCall()
        .returns(
          of({
            body: {
              items: [
                {
                  ticketNumber: "458818068804235264",
                  transaction_reference: "2ce2c92a-3f1c-4971-9ae4-fa412bd26265",
                  parsed_total_authorized_amount: 200,
                  bin_type: "",
                  subtotal_iva_amount: 380,
                  subtotal_iva0_amount: 0,
                  kushki_response_description: "description",
                  bin_card: "512280XX",
                  kushki_transaction_type: "kushki_transaction_type",
                  authorization_code: "authorization_code",
                  transaction_status: "APPROVAL",
                  sync_mode_type: "sync_mode_type",
                  currency_code_iso_code: "ECU",
                  merchant_info_id: "123456789010",
                  merchant_category_code: "5593",
                  public_id: "1213878",
                  card_holder_name: "mb",
                  last_four_digits: "2838",
                  franchise: "VISA",
                  sale_ticket_number: "1111111",
                  sale_transaction_reference: "2222222",
                  parsed_source_amount: 200,
                  iva_value: 15,
                  created_timestamp: 1697661733618,
                  kushki_merchant_name: "kushki_merchant_name",
                  processor_name: "processor_name",
                  grace_months: "2",
                  credit_type: "credit_type",
                  acquirer_bank: "acquirer_bank",
                  card_acceptor_id: "card_acceptor_id",
                  bin_country_name: "Ecuador",
                  bin_country_code: "ECU",
                  tax_id: "123",
                  processor_type: "processor_type",
                  payment_method: "card",
                  account_number: "12312312",
                  terminal_id: "1231123",
                  country: "Ecuador",
                  bin_bank_name: "bank",
                  foreign_card_indicator: false,
                },
              ],
            },
          })
        )
        .onSecondCall()
        .returns(of(true));

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_invoke_stub,
        })
      );

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      set(event, PAYMENT_METHOD_BODY_PATH, PaymentSubMethodTypeEnum.CARD_VPC);

      service.chargeBack(event).subscribe({
        next,
        complete: (): void => {
          expect(lambda_invoke_stub).to.have.been.calledTwice;
          expect(lambda_invoke_stub.args[0][0]).to.be.eqls(
            "usrv-acq-incoming-qa-getVpcTransaction"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "transaction_reference"
          );
          expect(lambda_invoke_stub.args[1][1].body).to.haveOwnProperty(
            "emails"
          );
          expect(lambda_invoke_stub.args[1][1].body).to.haveOwnProperty(
            "country",
            "Ecuador"
          );
          expect(lambda_invoke_stub.args[1][1].body).to.haveOwnProperty(
            "paymentSubmethodType",
            event.body.paymentMethod
          );
          expect(next).to.be.calledOnce.and.calledWithMatch(true);
          done();
        },
        error: done,
      });
    });

    it("Should throw error when payment method is CARD VPC but vpc transaction is not found and IS_ECOMMERCE_ENABLE is false", (done: Mocha.Done) => {
      process.env.USRV_STAGE = "qa";
      process.env.IS_ECOMMERCE_ENABLE === "false";
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of({ items: gTransaction })),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );

      const lambda_invoke_stub: SinonStub = box
        .stub()
        .onFirstCall()
        .returns(
          of({
            body: { statusCode: 500 },
          })
        )
        .onSecondCall()
        .returns(of(true));

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_invoke_stub,
        })
      );

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      set(event, PAYMENT_METHOD_BODY_PATH, PaymentSubMethodTypeEnum.CARD_VPC);

      service.chargeBack(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K020");
          done();
        },
      });
    });
  });

  describe("chargeDeleteGateway", () => {
    process.env.LAMBDA_VALUES = '{"CALL_VALIDATE_RECEIVABLE":"true"}';
    process.env.KUSHKI_ADQUIRER_VARS = "{}";

    beforeEach(() => {
      process.env.IS_ECOMMERCE_ENABLE = "false";
    });

    afterEach(() => {
      delete process.env.IS_ECOMMERCE_ENABLE;
      delete process.env.LAMBDA_ECOMM_CARD_CHARGE_DELETE_GATEWAY_ARN;
      delete process.env.LAMBDA_ECOMM_CARD_CHARGEBACK_ARN;
    });

    it("void a transaction with mccCode , success", (done: Mocha.Done) => {
      prepareVoidContainers([gTransaction], undefined, {
        ...gProcessorFetch,
        processorName: ProcessorEnum.PROSA,
        subMccCode: "1234",
      });
      const { event } = initChargeDeleteEvent();

      process.env.USRV_STAGE = "uat";

      set(merchant_dynamo, "sandboxEnable", true);
      gsTransaction = Mock.of<SubscriptionDynamo>({
        merchantId: "mid456",
      });

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(processor_dynamo))
            .onThirdCall()
            .returns(of(gBinFetch)),
          put: box.stub().returns(of(true)),
          query: box
            .stub()
            .onCall(0)
            .returns(of([gTransaction]))
            .onCall(1)
            .returns(of([gsTransaction]))
            .onCall(2)
            .returns(of([gTransaction]))
            .onCall(3)
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      voidSuccessWithMcc(
        service,
        event,
        done,
        call_lambda_stub,
        process_void_stub
      );
    });

    it("should return an error when type is a void of a void", (done: Mocha.Done) => {
      gTransaction.transaction_type = "VOID";
      gTransaction.processor_merchant_id = "666";
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      call_lambda_stub = box
        .stub()
        .onFirstCall()
        .throws(new Error(PROCESSOR_NOT_FOUND))
        .onSecondCall()
        .returns(
          of({
            body: {
              ticketNumber: gTransaction.ticket_number,
              transactionId: gTransaction.transaction_id,
            },
          })
        )
        .onThirdCall()
        .returns(of(gBinFetch));
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: call_lambda_stub,
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K020");
          done();
        },
      });
    });

    it("should return an code error 041 when type transaction is a reauth of a void", (done: Mocha.Done) => {
      gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K041");
          done();
        },
      });
    });

    it("void a transaction, success", (done: Mocha.Done) => {
      prepareVoidContainers();
      const { event, next } = initChargeDeleteEvent();

      event.path = "/card/v1/admin/charges/1234567890";
      mockVoidLambdaInvocation(false);
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      voidSuccess(service, event, next, done);
    });

    it("void a transaction in sandbox , success", (done: Mocha.Done) => {
      prepareVoidContainers();
      const { event, next } = initChargeDeleteEvent();

      process.env.USRV_STAGE = "uat";

      set(merchant_dynamo, "sandboxEnable", true);

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(processor_dynamo))
            .onThirdCall()
            .returns(of(gBinFetch)),
          put: box.stub().returns(of(true)),
          query: box
            .stub()
            .onCall(0)
            .returns(of([gTransaction]))
            .onCall(1)
            .returns(of([gTransaction]))
            .onCall(2)
            .returns(of([gTransaction]))
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      voidSuccess(service, event, next, done);
    });

    it("test chargeBack - Happy Path", (done: Mocha.Done) => {
      dynamoResponse.items.pop();
      dynamoResponse.items.push(gTransaction);

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );
      const lambda_invoke_stub: SinonStub = mockLambdaInvokeForCharge();

      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        next,
        complete: (): void => {
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "emails"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "credentialAlias"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "credentialId"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "credentialMetadata"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "publicCredentialId"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "country",
            "Ecuador"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "subMerchant"
          );
          expect(lambda_invoke_stub).to.have.been.calledOnce;
          expect(next).to.be.calledOnce.and.calledWithMatch(true);
          done();
        },
        error: done,
      });
    });

    it("should not have subMerchant when is not in the associate payment", (done: Mocha.Done) => {
      unset(gTransaction, "subMerchant");

      dynamoResponse.items.pop();
      dynamoResponse.items.push(gTransaction);

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );
      const lambda_invoke_stub: SinonStub = mockLambdaInvokeForCharge();

      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        next,
        complete: (): void => {
          expect(lambda_invoke_stub.args[0][1].body).not.to.haveOwnProperty(
            "subMerchant"
          );
          expect(lambda_invoke_stub).to.have.been.calledOnce;
          expect(next).to.be.calledOnce.and.calledWithMatch(true);
          done();
        },
        error: done,
      });
    });

    it("test chargeBack - Happy Path sending new fields", (done: Mocha.Done) => {
      set(merchant_dynamo, "socialReason", "social reason test");
      set(merchant_dynamo, "merchantCategory", "merch category test");
      set(merchant_dynamo, "taxId", "taxId test");

      set(gTransaction, "card_country", "card_country test");
      set(gTransaction, "card_country_code", "card country code test");

      dynamoResponse.items.pop();
      dynamoResponse.items.push(gTransaction);

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: box.stub().returns(of(merchant_dynamo)),
          querySimple: box.stub().returns(of(dynamoResponse)),
          queryTransactionByTicketNumber: box
            .stub()
            .returns(of(dynamoResponse)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");
      const lambda_invoke_stub: SinonStub = mockLambdaInvokeForCharge();

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        next,
        complete: (): void => {
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "emails"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "socialReason",
            "social reason test"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "categoryMerchant",
            "merch category test"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "taxId",
            "taxId test"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "card_country",
            "card_country test"
          );
          expect(lambda_invoke_stub.args[0][1].body).to.haveOwnProperty(
            "card_country_code",
            "card country code test"
          );

          expect(lambda_invoke_stub).to.have.been.calledOnce;
          expect(next).to.be.calledOnce.and.calledWithMatch(true);
          done();
        },
        error: done,
      });
    });

    it("should invoke chargeBack legacy when not exist in ecomm account", (done: Mocha.Done) => {
      const lambda_chargeback: string =
        "arn:aws:lambda:us-east-1:898055745207:function:usrv-card-chargeBack";

      process.env.IS_ECOMMERCE_ENABLE = "true";
      process.env.LAMBDA_ECOMM_CARD_CHARGEBACK_ARN = lambda_chargeback;

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          queryTransactionByTicketNumber: box.stub().returns(
            of(
              Mock.of<DynamoQueryResponse<Transaction>>({
                items: [],
              })
            )
          ),
          querySimple: box.stub().returns(
            of(
              Mock.of<DynamoQueryResponse<Transaction>>({
                items: [],
              })
            )
          ),
        })
      );
      const lambda_invoke_stub: SinonStub = mockLambdaInvokeForCharge();

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargebackEvent();

      service.chargeBack(event).subscribe({
        next,
        complete: (): void => {
          expect(lambda_invoke_stub.args[0][0]).equal(lambda_chargeback);
          expect(next).to.be.calledOnce.and.calledWithMatch(true);
          done();
        },
        error: done,
      });
    });

    it("void a transaction from subscription with fullResponse", (done: Mocha.Done) => {
      prepareVoidContainers([]);
      const lambda_invocation: SinonStub = mockLambdaInvocation();
      const amount_requested: object = {
        currency: "COP",
        iva: 0,
        subtotalIva: 344,
        subtotalIva0: 0,
      };

      mockChargeDeleteGtwDynamo();
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargeDeleteEvent(amount_requested);

      event.body = { amount: <Amount>amount_requested, fullResponse: true };
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          next,
          complete: (): void => {
            expect(lambda_invocation).to.be.calledWith(match.any, {
              amount: amount_requested,
              credentialInfo: {
                alias: "",
                credentialId: "",
                metadata: "",
                publicCredentialId: "",
              },
              fullResponse: true,
              path: event.path,
              ticketNumber: event.pathParameters.ticketNumber,
            });
            expect(next).to.be.calledWithExactly({
              ticketNumber: gTransaction.ticket_number,
            });
            done();
          },
          error: done,
        });
    });
    it("void a transaction with empty body and transaction currency code UF", (done: Mocha.Done) => {
      gTransaction.approved_transaction_amount = 100;
      gTransaction.currency_code = "UF";
      prepareVoidContainers();

      const { event } = initChargeDeleteEvent(null);

      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);

      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          complete: done,
          error: done,
          next: (response: object): void => {
            expect(get(response, "ticketNumber")).equal(
              gTransaction.ticket_number
            );
          },
        });
    });

    it("When path is different from adminVoidPath and isReceivable is true, it must return an error", (done: Mocha.Done) => {
      gTransaction.processor_name = ProcessorEnum.KUSHKI;
      gTransaction.country = CountryEnum.MEXICO;

      const { event } = initChargeDeleteEvent(null);

      prepareVoidContainers();
      event.path = NO_ADMIN_VOID_PATH;
      mockVoidLambdaInvocationForTransactionValidation(true);

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          error: (error: KushkiError) => {
            expect(call_lambda_stub.args[1][0]).to.includes(
              "usrv-dispersions-primary-validateReceivable"
            );
            expect(error.code).to.be.equals("K150");
            done();
          },
        });
    });

    it("When transaction verification expiration is not valid should return error", (done: Mocha.Done) => {
      gTransaction.processor_name = ProcessorEnum.KUSHKI;
      gTransaction.country = CountryEnum.MEXICO;
      gTransaction.created = 123242342;

      const { event } = initChargeDeleteEvent(null);

      prepareVoidContainers();
      event.path = NO_ADMIN_VOID_PATH;
      mockVoidLambdaInvocationForTransactionValidation(true);

      box.stub(Date, "now").returns(Number(new Date(18407365200000)));
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          error: (error: KushkiError) => {
            expect(call_lambda_stub).to.be.calledOnce;
            expect(call_lambda_stub.args[0][0]).to.be.eqls(
              "usrv-refund-conciliation-primary-getProcessorConfiguration"
            );
            expect(
              call_lambda_stub.args[0][1].queryStringParameters.dateToVerify
            ).to.be.equal("1970/01/02");
            expect(
              call_lambda_stub.args[0][1].queryStringParameters.processorName
            ).to.be.equal(ProcessorEnum.KUSHKI);
            expect(error.code).to.be.equals("K050");
            done();
          },
        });
    });

    it("When path is different from adminVoidPath and isReceivable is true but different than Mexico and kushki acq, it must return success", (done: Mocha.Done) => {
      gTransaction.processor_name = ProcessorEnum.PROSA;
      gTransaction.country = CountryEnum.MEXICO;

      const { event } = initChargeDeleteEvent(null);

      prepareVoidContainers();
      event.path = NO_ADMIN_VOID_PATH;
      mockVoidLambdaInvocationForTransactionValidation(true);
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          next: (res) => {
            expect(res).to.have.property("ticketNumber");
            done();
          },
        });
    });

    it(
      "Should return success and call once lambda_stub when path is different from adminVoidPath and" +
        "CALL_VALIDATE_RECEIVABLE is not exist and processor_name and country are different than kushki acq and Mexico",
      (done: Mocha.Done) => {
        process.env.LAMBDA_VALUES = "{}";
        gTransaction.processor_name = ProcessorEnum.PROSA;
        gTransaction.country = CountryEnum.ECUADOR;
        const { event } = initChargeDeleteEvent(null);

        prepareVoidContainers();
        event.path = NO_ADMIN_VOID_PATH;
        box.stub(Tracer.prototype, "putAnnotation");

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service
          .chargeDeleteGateway(event, {
            ...gLambdaContext,
            credentialValidationBlock: "",
          })
          .subscribe({
            next: (res) => {
              expect(call_lambda_stub).to.be.calledOnce;
              expect(res).to.have.property("ticketNumber");
              done();
            },
          });
      }
    );

    it(
      "Should return success and call once lambda_stub when path is different from adminVoidPath and" +
        "CALL_VALIDATE_RECEIVABLE is false and processor_name and country are different than kushki acq and Mexico",
      (done: Mocha.Done) => {
        process.env.LAMBDA_VALUES = '{"CALL_VALIDATE_RECEIVABLE":"false"}';
        gTransaction.processor_name = ProcessorEnum.PROSA;
        gTransaction.country = CountryEnum.ECUADOR;

        const { event } = initChargeDeleteEvent(null);

        prepareVoidContainers();
        event.path = NO_ADMIN_VOID_PATH;
        box.stub(Tracer.prototype, "putAnnotation");

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service
          .chargeDeleteGateway(event, {
            ...gLambdaContext,
            credentialValidationBlock: "",
          })
          .subscribe({
            next: (res) => {
              expect(call_lambda_stub).to.be.calledOnce;
              expect(res).to.have.property("ticketNumber");
              done();
            },
          });
      }
    );

    it(
      "Should return an K150 Error when path a is different from adminVoidPath and " +
        "CALL_VALIDATE_RECEIVABLE is true and isReceivable is true",
      (done: Mocha.Done) => {
        process.env.LAMBDA_VALUES = '{"CALL_VALIDATE_RECEIVABLE":"true"}';
        gTransaction.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.country = CountryEnum.MEXICO;

        const { event } = initChargeDeleteEvent(null);

        prepareVoidContainers();
        event.path = NO_ADMIN_VOID_PATH;
        mockVoidLambdaInvocationForTransactionValidation(true);

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service
          .chargeDeleteGateway(event, {
            ...gLambdaContext,
            credentialValidationBlock: "",
          })
          .subscribe({
            error: (error: KushkiError) => {
              expect(call_lambda_stub.args[1][0]).to.includes(
                "validateReceivable"
              );
              expect(error.code).to.be.equals("K150");
              done();
            },
          });
      }
    );

    it("When path is different from adminVoidPath and isReceivable is false, it must run the previous flow", (done: Mocha.Done) => {
      const { event } = initChargeDeleteEvent(null);

      prepareVoidContainers();
      event.path = NO_ADMIN_VOID_PATH;
      mockVoidLambdaInvocationForTransactionValidation(false);

      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          next: (response: object) => {
            expect(get(response, "ticketNumber")).equal(
              gTransaction.ticket_number
            );
            expect(call_lambda_stub.args[1][0]).to.includes(
              "usrv-dispersions-primary-validateReceivable"
            );
            expect(call_lambda_stub).to.be.calledTwice;
            done();
          },
        });
    });

    it("When the path is similar to adminVoidPath, it must not check pending values", (done: Mocha.Done) => {
      const { event } = initChargeDeleteEvent(null);

      prepareVoidContainers();
      mockVoidLambdaInvocation(false);
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          next: (response: object) => {
            expect(get(response, "ticketNumber")).equal(
              gTransaction.ticket_number
            );
            expect(call_lambda_stub).to.not.be.called;
            done();
          },
        });
    });

    it("When transaction is empty, it try to invoke subsDelete", (done: Mocha.Done) => {
      const { event } = initChargeDeleteEvent(null);

      prepareVoidContainers();
      event.path = NO_ADMIN_VOID_PATH;
      mockVoidLambdaInvocationForTransactionValidation(false);

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: box
            .stub()
            .onFirstCall()
            .returns(of([]))
            .onSecondCall()
            .returns(
              of([
                {
                  processorName: "BillPocket Processor",
                  cardCountry: "Mexico",
                },
              ])
            ),
          getItem: box.stub().returns(of(merchant_dynamo)),
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          complete: done,
          next: () => {
            expect(call_lambda_stub).to.be.calledThrice;
            expect(call_lambda_stub.getCall(2).args[0]).to.be.eql(
              "usrv-subscriptions-primary-subscriptionChargesDelete"
            );
          },
        });
    });

    it("should throw 052 error when void subscription exceeds the time limit", (done: Mocha.Done) => {
      const { event } = initChargeDeleteEvent(null);

      prepareVoidContainers();
      mockVoidLambdaInvocationForTransactionValidation(false);

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: box
            .stub()
            .onFirstCall()
            .returns(of([]))
            .onSecondCall()
            .returns(
              of([
                {
                  cardCountry: "Mexico",
                  created: moment().subtract(3, "years").valueOf(),
                  processorName: "BillPocket Processor",
                },
              ])
            ),
          getItem: box.stub().returns(of(merchant_dynamo)),
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          error: (err: KushkiError): void => {
            expect(call_lambda_stub).to.not.called;
            expect(rollbar_stub).to.calledOnce;
            expect(err.code).to.includes("K052");
            expect(err.getMessage()).to.equal(ERRORS.E052.message);
            done();
          },
        });
    });

    it("When transaction verification expiration don´t enable should not invoke lambda getProcessorConfiguration", (done: Mocha.Done) => {
      process.env.ENABLE_VALIDATE_TRX_EXPIRATION_TIME = "false";
      process.env.KUSHKI_ADQUIRER_VARS = TEST_TIME_LIMITS;
      gTransaction.processor_name = ProcessorEnum.KUSHKI;
      gTransaction.country = CountryEnum.MEXICO;
      gTransaction.created = new Date().getTime();

      const { event } = initChargeDeleteEvent(null);

      box.stub(Date, "now").returns(Number(new Date(18407365200000)));

      prepareVoidContainers();
      event.path = NO_ADMIN_VOID_PATH;
      mockVoidLambdaInvocationForTransactionValidation(true);
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          complete: done,
          next: () => {
            expect(call_lambda_stub).to.be.calledOnce;
          },
        });
    });

    it("When transaction is Colombia domestic with Kushki processor and exceeds 120 days should throw error K052", (done: Mocha.Done) => {
      const exceeded_date: Date = new Date();

      exceeded_date.setDate(exceeded_date.getDate() - 121);

      process.env.KUSHKI_ADQUIRER_VARS = TEST_TIME_LIMITS;
      gTransaction.processor_name = ProcessorEnum.KUSHKI;
      gTransaction.created = exceeded_date.getTime();
      gTransaction.card_country = CountryEnum.COLOMBIA;

      const { event } = initChargeDeleteEvent(null);

      prepareVoidContainers();
      event.path = "/card/v1/admin/charges/1234567890";
      mockVoidLambdaInvocationForTransactionValidation(true);

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          complete: done,
          error: (err: KushkiError): void => {
            expect(err.code).to.be.eq("K052");
            expect(rollbar_stub).to.not.have.been.called;
            done();
          },
        });
    });
  });

  describe("chargeDelete", () => {
    process.env.ENV_VARS = '{"maxDaysRefunds":730}';
    afterEach(() => {
      unset(process.env, "EXTERNAL_TIMEOUT");
    });

    it("test request void existing trx void - success - with card type ", (done: Mocha.Done) => {
      gTransaction.card_type = "credit";
      gTransaction.processor_channel = "crypto";
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box.stub().onFirstCall().returns(of(merchant_dynamo)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(call_lambda_stub.getCall(1).args[1].body.cardType).to.be.eq(
            "credit"
          );
          expect(get(response, "ticketNumber")).equal(
            gTransaction.ticket_number
          );
        },
      });
    });

    it("Test should call lambda void when transaction_type is preAuth and processor_name is MC Processor", (done: Mocha.Done) => {
      gTransaction.card_type = "credit";
      gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
      gTransaction.processor_name = ProcessorEnum.MCPROCESSOR;
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box.stub().onFirstCall().returns(of(merchant_dynamo)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        next: (): void => {
          expect(call_lambda_stub).to.be.calledTwice;
          expect(call_lambda_stub.args[1][1].body.processorName).to.be.equal(
            ProcessorEnum.MCPROCESSOR
          );
          done();
        },
      });
    });

    it("Test should call lambda void when transaction_type is preAuth and processor_name is Fis Processor", (done: Mocha.Done) => {
      gTransaction.card_type = "credit";
      gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
      gTransaction.processor_name = ProcessorEnum.FIS;

      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box.stub().onFirstCall().returns(of(merchant_dynamo)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        next: (): void => {
          expect(call_lambda_stub).to.be.calledTwice;
          expect(call_lambda_stub.args[1][1].body.processorName).to.be.equal(
            ProcessorEnum.FIS
          );
          expect(call_lambda_stub.args[1][1].body.transactionType).to.be.equal(
            TransactionTypeEnum.PREAUTH
          );
          done();
        },
      });
    });

    it("Test should call lambda void when transaction_type is preAuth and processor_name is Transbank with integrationMethod mall", (done: Mocha.Done) => {
      gTransaction.card_type = "credit";
      gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
      gTransaction.processor_name = ProcessorEnum.TRANSBANK;
      gTransaction.integration_method = TransbankTransactionTypeEnum.MALL;
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box.stub().onFirstCall().returns(of(merchant_dynamo)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        next: (): void => {
          expect(call_lambda_stub).to.be.calledTwice;
          expect(call_lambda_stub.args[1][1].body.processorName).to.be.equal(
            ProcessorEnum.TRANSBANK
          );
          expect(call_lambda_stub.args[1][1].body.transactionType).to.be.equal(
            TransactionTypeEnum.PREAUTH
          );
          expect(
            call_lambda_stub.args[1][1].body.integrationMethod
          ).to.be.equal(TransbankTransactionTypeEnum.MALL);
          done();
        },
      });
    });

    it("Test should not call lambda void when transaction_type is preAuth and processor_name is Transbank with integrationMethod rest ", (done: Mocha.Done) => {
      gTransaction.card_type = "credit";
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box.stub().onFirstCall().returns(of(merchant_dynamo)),
          query: box
            .stub()
            .onFirstCall()
            .returns(
              of([
                {
                  ...gTransaction,
                  integrationMethod: TransbankTransactionTypeEnum.REST,
                  processor_name: ProcessorEnum.TRANSBANK,
                  transaction_type: TransactionTypeEnum.PREAUTH,
                },
              ])
            )
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError) => {
          expect(call_lambda_stub).not.to.be.called;
          expect(err.code).to.be.equal("K020");
          done();
        },
      });
    });

    it("test request void existing trx void - success - without card type ", (done: Mocha.Done) => {
      delete gTransaction.card_type;
      gTransaction.processor_merchant_id = "666";
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      call_lambda_stub = box
        .stub()
        .onFirstCall()
        .throws(new Error(PROCESSOR_NOT_FOUND))
        .onSecondCall()
        .returns(
          of({
            body: {
              ticketNumber: gTransaction.ticket_number,
              transactionId: gTransaction.transaction_id,
            },
          })
        )
        .onThirdCall()
        .returns(of(gBinFetch));
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: call_lambda_stub,
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(call_lambda_stub.getCall(1).args[1].body.cardType).to.be
            .undefined;
          expect(
            call_lambda_stub.getCall(1).args[1].body.processorMerchantId
          ).to.be.eqls("666");
          expect(get(response, "ticketNumber")).equal(
            gTransaction.ticket_number
          );
        },
      });
    });

    it("void a transaction - with error", (done: Mocha.Done) => {
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: box.stub().returns(of([{ merchant_id: "123" }])),
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K020");
          done();
        },
      });
    });

    it("happy path void a transaction without full response ", (done: Mocha.Done) => {
      prepareVoidContainers();
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      box.stub(Tracer.prototype, "putAnnotation");

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(response)
            .haveOwnProperty("ticketNumber")
            .equal(gTransaction.ticket_number);
        },
      });
    });

    it("happy path void a transaction with externalReferenceId in response", (done: Mocha.Done) => {
      prepareVoidContainers();
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();
      set(event, "body.externalReferenceId", "1234-5678-9012");
      set(event, "body.metadata", { key1: "value1" });
      set(event, "body.fullResponse", "v2");

      box.stub(Tracer.prototype, "putAnnotation");

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(get(response, "details.externalReferenceId")).equal(
            "1234-5678-9012"
          );
        },
      });
    });

    it("happy path void a transaction with recap", (done: Mocha.Done) => {
      delete gTransaction.card_type;
      gTransaction.processor_merchant_id = "666";
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      call_lambda_stub = box
        .stub()
        .onFirstCall()
        .throws(new Error(PROCESSOR_NOT_FOUND))
        .onSecondCall()
        .returns(
          of({
            body: {
              ticketNumber: gTransaction.ticket_number,
              transactionId: gTransaction.transaction_id,
            },
          })
        )
        .onThirdCall()
        .returns(of(gBinFetch));
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: call_lambda_stub,
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        next: (_: object): void => {
          expect(call_lambda_stub.args[1][1].body)
            .haveOwnProperty("recap")
            .equal(gTransaction.recap);
          done();
        },
      });
    });

    it("void a transaction from subscription", (done: Mocha.Done) => {
      prepareVoidContainers([]);
      mockLambdaInvocation();
      const { event, next } = initChargeDeleteEvent();

      mockChargeDeleteGtwDynamo();
      service = CONTAINER.get(IDENTIFIERS.CardService);

      if (event.body !== null) delete event.body.fullResponse;
      voidSuccess(service, event, next, done);
    });

    it("void a transaction from subscription with empty body", (done: Mocha.Done) => {
      prepareVoidContainers([]);
      const lambda_invocation: SinonStub = mockLambdaInvocation();

      mockChargeDeleteGtwDynamo();
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargeDeleteEvent();

      event.body = null;
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          next,
          complete: (): void => {
            expect(lambda_invocation).to.be.calledOnce.calledWith(match.any, {
              amount: {},
              credentialInfo: {
                alias: "",
                credentialId: "",
                metadata: "",
                publicCredentialId: "",
              },
              fullResponse: false,
              path: event.path,
              ticketNumber: event.pathParameters.ticketNumber,
            });
            done();
          },
          error: done,
        });
    });

    it("must throw error 027 for timeout", (done: Mocha.Done) => {
      process.env.EXTERNAL_TIMEOUT = "10";
      prepareVoidContainers([]);
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(processor_dynamo))
            .onThirdCall()
            .returns(of(gBinFetch)),
          put: box.stub().returns(of(true)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of({}).pipe(delay(11))),
        })
      );
      mockLambdaInvocation();
      const amount_requested: object = {
        currency: "COP",
        iva: 0,
        subtotalIva: 344,
        subtotalIva0: 0,
      };

      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event, next } = initChargeDeleteEvent(amount_requested);

      event.body = { amount: <Amount>amount_requested, fullResponse: true };
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          next,
          error: (err: KushkiError): void => {
            expect(err.code).to.be.equal("K027");
            expect(err.getMessage()).to.be.equal(ERRORS.E027.message);
            done();
          },
        });
    });

    it("must throw error if amount object has wrong data types for props", (done: Mocha.Done) => {
      prepareVoidContainers([]);

      const void_request: object = {
        amount: {
          currency: "COP",
          iva: "0",
          subtotalIva: -344.99,
          subtotalIva0: 0,
        },
      };
      const { event, next } = initChargeDeleteEvent(void_request);

      mockChargeDeleteGtwDynamo();
      service = CONTAINER.get(IDENTIFIERS.CardService);

      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          next,
          error: (err: KushkiError): void => {
            expect(err.code).to.be.eql("K001");
            done();
          },
        });
    });

    it("should invoke chargeDeleteGateway legacy when not exist in ecomm account", (done: Mocha.Done) => {
      const lambda_charge_delete_gateway: string =
        "arn:aws:lambda:us-east-1:898055745207:function:usrv-card-chargeDeleteGateway";

      process.env.IS_ECOMMERCE_ENABLE = "true";
      process.env.LAMBDA_ECOMM_CARD_CHARGE_DELETE_GATEWAY_ARN =
        lambda_charge_delete_gateway;
      call_lambda_stub = box.stub().returns(
        of({
          body: {
            details: {
              acquirerBank: "Kushki Peru",
              saleTicketNumber: "794586442463486493",
              amount: {
                subtotalIva0: 220,
                ice: 0,
                currency: "PEN",
                isDeferred: false,
                iva: 0,
                subtotalIva: 0,
              },
              approvalCode: "000000",
              approvedTransactionAmount: 220,
              binInfo: {
                bank: "Banco de Bogota S.A.",
                binCard: "531122",
                lastFourDigits: "2112",
                type: "credit",
              },
              cardHolderName: "Test",
              created: 1717451100000,
              merchantId: "20000000106932187000",
              merchantName: "branchWymanStamm256",
              paymentBrand: "Mastercard",
              processorBankName: "0032~BANCO INTERNACIONAL",
              requestAmount: 220,
              responseCode: "000",
              responseText: "Transacción aprobada",
              transactionId: "1717451136860740216",
              transactionStatus: "INITIALIZED",
              transactionType: "VOID",
            },
            ticketNumber: "661717451136861932",
            transactionReference: "a56b36e1-82b5-4e16-a8a1-09c141db7311",
          },
        })
      );
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: box.stub().returns(of([])),
        })
      );
      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: call_lambda_stub,
        })
      );
      const void_request: object = {
        amount: {
          currency: "COP",
          iva: "0",
          subtotalIva: -344.99,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(void_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          next: (resp: object): void => {
            expect(call_lambda_stub.args[0][0]).equal(
              lambda_charge_delete_gateway
            );
            expect(get(resp, "details.transactionStatus", "")).equal(
              "INITIALIZED"
            );
            done();
          },
        });
    });

    it("should return error when chargeDeleteGateway legacy return error", (done: Mocha.Done) => {
      const lambda_charge_delete_gateway: string =
        "arn:aws:lambda:us-east-1:898055745207:function:usrv-card-chargeDeleteGateway";

      process.env.IS_ECOMMERCE_ENABLE = "true";
      process.env.LAMBDA_ECOMM_CARD_CHARGE_DELETE_GATEWAY_ARN =
        lambda_charge_delete_gateway;
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: box.stub().returns(of([])),
        })
      );
      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().throws(new Error("Any Error")),
        })
      );
      const void_request: object = {
        amount: {
          currency: "COP",
          iva: "0",
          subtotalIva: -344.99,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(void_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .chargeDeleteGateway(event, {
          ...gLambdaContext,
          credentialValidationBlock: "",
        })
        .subscribe({
          error: (err: KushkiError | Error) => {
            expect(err).to.be.instanceOf(Error);
            expect(err).to.not.be.undefined;
            done();
          },
        });
    });

    it.skip("void a transaction, error K003", (done: Mocha.Done) => {
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(undefined)),
          query: box.stub().returns(of([gTransaction])),
        })
      );
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      CONTAINER.bind(IDENTIFIERS.TransactionService).toConstantValue(
        Mock.of<ITransactionService>({
          processVoidRecord: box.stub().returns(of(gTransaction)),
        })
      );
      const { event, next } = initChargeDeleteEvent();

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        next,
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eql("K003");
          done();
        },
      });
    });

    it("void a transaction, success - fullResponse with binInfo", (done: Mocha.Done) => {
      const { event } = initChargeDeleteEvent({ fullResponse: true });
      const card_type: string = "DEBIT";

      gTransaction.sale_ticket_number = "119304520711880252";
      gTransaction.vault_token = "lkjafISFD8984==";
      gBinFetch.info = { ...gBinFetch.info, type: card_type };
      prepareVoidContainers();
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(response)
            .to.have.property("details")
            .and.have.property("binInfo");
          expect(response)
            .to.have.property("details")
            .and.have.not.property("vaultToken");
          expect(response).not.to.have.deep.nested.property(
            DETAIL_CONSORTIUM_NAME
          );
          expect(response).to.not.have.property("security");
        },
      });
    });

    it("test request void existing trx void - timeout error", (done: Mocha.Done) => {
      gTransaction.card_type = "credit";
      process.env.EXTERNAL_TIMEOUT = "100";

      call_lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(
          of({
            body: gProcessorFetch,
          }).pipe(delay(110))
        );

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: call_lambda_stub,
        })
      );

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box.stub().onFirstCall().returns(of(merchant_dynamo)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const { event } = initChargeDeleteEvent();

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          checkTimeoutError(err, done);
        },
      });

      process.env.EXTERNAL_TIMEOUT = undefined;
    });

    it("void a transaction, success - fullResponse without binInfo", (done: Mocha.Done) => {
      const { event, next } = initChargeDeleteEvent({ fullResponse: true });
      const ticket: string = gTransaction.ticket_number;

      gBinFetch.info = undefined;
      gTransaction.acquirer_bank = "Banco Pacifico";
      prepareVoidContainers();
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        next,
        complete: (): void => {
          expect(next).to.be.calledOnce.and.calledWithMatch({
            details: {
              acquirerBank: gTransaction.acquirer_bank,
              binInfo: { bank: null, type: null },
            },
            ticketNumber: ticket,
          });
          expect(next).to.not.have.property("security");
          done();
        },
        error: done,
      });
    });

    it("void a transaction, success - Credomatic Processor", (done: Mocha.Done) => {
      const { event } = initChargeDeleteEvent({ fullResponse: true });

      gTransaction.processor_name = ProcessorEnum.CREDOMATIC;
      prepareVoidContainers([gTransaction]);
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(response)
            .to.have.nested.property("details.processorName")
            .and.to.equal(ProcessorEnum.CREDOMATIC);
        },
      });
    });

    it("void a transaction, success - fullResponse V2", (done: Mocha.Done) => {
      const { event } = initChargeDeleteEvent({ fullResponse: "v2" });
      const card_type: string = "DEBIT";

      gTransaction.sale_ticket_number = "119304520711880252";
      gTransaction.transaction_reference = "1234567890";
      gTransaction.email = "test@mail.com";
      gBinFetch.info = { ...gBinFetch.info, type: card_type };
      prepareVoidContainers();
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(response)
            .to.have.property("transactionReference")
            .and.to.equal("1234567890");
          expect(response).to.have.nested.property(
            "details.contactDetails.email"
          );
          expect(response).to.not.have.property("security");
        },
      });
    });

    it("void a transaction, AurusError from Wrapper", (done: Mocha.Done) => {
      const { event, next } = initChargeDeleteEvent();
      const trx_details: TransactionDetails = {
        approvalCode: "102005",
        binCard: "455983",
        cardHolderName: "",
        cardType: "VISA",
        isDeferred: "N",
        lastFourDigitsOfCard: "7726",
        merchantName: "Superintendecia de Notariado",
        processorBankName: "000051~Davivienda",
        processorName: COLOMBIAN_PROCESSORS[0],
      };
      const wrapper_error: AurusError = new AurusError("333", "wrapper error", {
        ...trx_details,
      });

      prepareVoidContainers();
      void_stub.throws(wrapper_error);
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        next,
        complete: done,
        error: (err: AurusError): void => {
          const metadata: AurusResponse = <AurusResponse>err.getMetadata();

          expect(err.code).to.eq(wrapper_error.code);
          expect(metadata.response_code).to.eq(wrapper_error.code);
          expect(metadata.response_text).to.eq(err.getMessage());
          expect(metadata.transaction_details).to.eql(trx_details);
          done();
        },
      });
    });

    it("test request partial void existing trx void, with amount equal to transaction amount - success ", (done: Mocha.Done) => {
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );
      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 344,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(get(response, "ticketNumber")).contains(
            gTransaction.ticket_number
          );
        },
      });
    });

    it("should throw error when trx void partial is aft and processor channel crypto", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.COLOMBIA, "COP", "crypto");

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 300,
          subtotalIva0: 0,
        },
      };
      const { event, next } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        next,
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eql("K041");
          done();
        },
      });
    });

    it("should throw error when partial void reAuth transaction is sent", (done: Mocha.Done) => {
      gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
      gTransaction.processor_name = ProcessorEnum.KUSHKI;
      mockPartialVoidData(CountryEnum.COLOMBIA, "COP", ProcessorEnum.KUSHKI);

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 300,
          subtotalIva0: 0,
        },
      };
      const { event, next } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        next,
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eql("K041");
          done();
        },
      });
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for colombia ", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.COLOMBIA, "COP");

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          assertVoidPartial(response, true, false);
        },
      });
    });

    it("when the request voidChargeRequest include webhooks object, should call lambda with webhook body successful", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.PERU, "PEN");
      const url_path: string = "https://urls1.com";
      const amount_request: VoidCardRequest = {
        amount: {
          currency: "PEN",
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
        webhooks: [
          {
            urls: [url_path],
          },
        ],
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: (): void => {
          expect(
            call_lambda_stub.getCall(1).args[1].body.webhooks[0].urls[0]
          ).to.be.equal(url_path);
          done();
        },
      });
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for usa ", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.USA, "USD");

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "USD",
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          assertVoidPartial(response, true, false);
        },
      });
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for peru ", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.PERU, "PEN");

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "PEN",
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");
      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          assertVoidPartial(response, true, false);
        },
      });
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for Costa Rica", (done: Mocha.Done) => {
      asserVoidPartialCentralAmericaCountries(
        CountryEnum.COSTA_RICA,
        done,
        true,
        false
      );
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for Panamá", (done: Mocha.Done) => {
      asserVoidPartialCentralAmericaCountries(
        CountryEnum.PANAMA,
        done,
        true,
        false
      );
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for Guatemala", (done: Mocha.Done) => {
      asserVoidPartialCentralAmericaCountries(
        CountryEnum.GUATEMALA,
        done,
        true,
        false
      );
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for Honduras", (done: Mocha.Done) => {
      asserVoidPartialCentralAmericaCountries(
        CountryEnum.HONDURAS,
        done,
        true,
        false
      );
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for Nicaragua", (done: Mocha.Done) => {
      asserVoidPartialCentralAmericaCountries(
        CountryEnum.NICARAGUA,
        done,
        true,
        false
      );
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for El Salavador", (done: Mocha.Done) => {
      asserVoidPartialCentralAmericaCountries(
        CountryEnum.EL_SALVADOR,
        done,
        true,
        false
      );
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for chile ", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.CHILE, "CLP");

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "CLP",
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          assertVoidPartial(response, false, true);
        },
      });
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for Mexico ", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.MEXICO, CurrencyEnum.MXN);

      const amount_request: VoidCardRequest = {
        amount: {
          currency: CurrencyEnum.MXN,
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          assertVoidPartial(response, true, true);
        },
      });
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for Mexico ACQ", (done: Mocha.Done) => {
      assertPartialVoidMX("Kushki Acquirer Processor", done);
    });

    it("test request partial void existing trx void, with amount less than transaction amount - success for Prosa Processor", (done: Mocha.Done) => {
      assertPartialVoidMX("Prosa Processor", done);
    });

    it("test request partial when amount empty for Mexico ", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.MEXICO, CurrencyEnum.MXN);
      const { event } = initChargeDeleteEvent(null);

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          assertVoidPartial(response, false, false);
        },
      });
    });

    it("test request partial void existing trx void, with amount less than transaction amount - fails because pending amount is already 0 ", (done: Mocha.Done) => {
      prepareVoidContainers();
      gTransaction.pendingAmount = 0;

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
        })
      );

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K023");
          done();
        },
      });
    });

    it("test request partial void existing trx void, with amount equal than transaction amount - success ", (done: Mocha.Done) => {
      prepareVoidContainers();
      gTransaction.approved_transaction_amount = 200;

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 200,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(get(response, "ticketNumber")).to.be.eql(
            gTransaction.ticket_number
          );
        },
      });
    });

    it("test request partial void existing trx void, with amount is greater than pending amount - fails ", (done: Mocha.Done) => {
      prepareVoidContainers();
      gTransaction.pendingAmount = 200;

      set(merchant_dynamo, "country", "");
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 350,
          subtotalIva0: 0,
        },
      };

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
        })
      );

      const { event } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K023");
          done();
        },
      });
    });

    it("test request partial void existing trx void, with pending amount than transaction amount - success ", (done: Mocha.Done) => {
      prepareVoidContainers();
      gTransaction.pendingAmount = 200;

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 40,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(get(response, "ticketNumber")).eql(gTransaction.ticket_number);
        },
      });
    });

    it("test request partial void of not available country must return error E041 ", (done: Mocha.Done) => {
      gTransaction.currency_code = CurrencyEnum.USD;
      prepareVoidContainers();
      set(merchant_dynamo, "country", "not allowed country");
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      const amount_request: VoidCardRequest = {
        amount: {
          currency: CurrencyEnum.USD,
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K041");
          done();
        },
      });
    });

    it("Test chargeDelete error when Country is not available ", (done: Mocha.Done) => {
      mockPartialVoidData("TestLand", CurrencyEnum.USD);
      const amount_request: VoidCardRequest = {
        amount: {
          currency: CurrencyEnum.USD,
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K041");
          done();
        },
      });
    });

    it("Test chargeDelete error when Processor is not available ", (done: Mocha.Done) => {
      mockPartialVoidData(
        "Chile",
        CurrencyEnum.USD,
        undefined,
        ProcessorEnum.DATAFAST
      );
      const amount_request: VoidCardRequest = {
        amount: {
          currency: CurrencyEnum.USD,
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K041");
          done();
        },
      });
    });

    it("test request partial must throw error E038 if pendingAmount is >=0 and amount of event is null", (done: Mocha.Done) => {
      gTransaction.pendingAmount = 20;
      gTransaction.approved_transaction_amount = 100;
      prepareVoidContainers();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(merchant_dynamo))
            .onSecondCall()
            .returns(of(gProcessorFetch)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      const { event } = initChargeDeleteEvent();

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K038");
          done();
        },
      });
    });

    it("test request partial must throw error E039 if amount of event is 0", (done: Mocha.Done) => {
      gTransaction.pendingAmount = 20;
      gTransaction.approved_transaction_amount = 100;
      prepareVoidContainers();
      const amount_request: VoidCardRequest = {
        amount: {
          currency: "COP",
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K039");
          done();
        },
      });
    });

    it("test request partial should fail if currency from requested void is not equal to currency code of sale transaction", (done: Mocha.Done) => {
      mockPartialVoidData(CountryEnum.CHILE, "UF");

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "CLP",
          iva: 0,
          subtotalIva: 342,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K042");
          done();
        },
      });
    });

    it("test request partial should send converted amount CLP if currency from requested void is UF", (done: Mocha.Done) => {
      set(gTransaction, "converted_amount.totalAmount", 574138);
      set(gTransaction, "request_amount", 20);
      set(gTransaction, "approved_transaction_amount", 574138);
      set(gTransaction, "amount", {
        iva: 20,
      });
      mockPartialVoidData(CountryEnum.CHILE, "UF");

      const amount_request: VoidCardRequest = {
        amount: {
          currency: "UF",
          iva: 0,
          subtotalIva: 10,
          subtotalIva0: 0,
        },
      };
      const { event } = initChargeDeleteEvent(amount_request);

      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(get(response, "ticketNumber")).to.be.equal(
            gTransaction.ticket_number
          );
        },
      });
    });

    it("test request full should send converted amount CLP if currency from requested void is UF with success", (done: Mocha.Done) => {
      const amount_request: VoidCardRequest = {
        amount: {
          currency: "UF",
          iva: 0,
          subtotalIva: 20,
          subtotalIva0: 0,
        },
      };

      set(gTransaction, "approved_transaction_amount", 574138);
      set(gTransaction, "amount", {
        iva: 20,
      });
      set(gTransaction, "converted_amount.totalAmount", 574138);
      set(gTransaction, "request_amount", 20);
      mockPartialVoidData(CountryEnum.CHILE, "UF");
      box.stub(Tracer.prototype, "putAnnotation");

      service = CONTAINER.get(IDENTIFIERS.CardService);

      const { event } = initChargeDeleteEvent(amount_request);

      service.chargeDelete(event).subscribe({
        complete: done,
        error: done,
        next: (response: object): void => {
          expect(get(response, "ticketNumber")).equal(
            gTransaction.ticket_number
          );
          expect(call_lambda_stub.args[1][1].body.convertedAmount).eqls({
            currency: "CLP",
            totalAmount: 574138,
          });
        },
      });
    });

    it("Should throw error K052 when transaction is not with Kushki processor and exceeds 730 days ", (done: Mocha.Done) => {
      const { event } = initChargeDeleteEvent();
      const exceeded_date: Date = new Date();

      exceeded_date.setDate(exceeded_date.getDate() - 731);
      gTransaction.created = exceeded_date.getTime();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box.stub().onFirstCall().returns(of(merchant_dynamo)),
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction])),
          updateValues: box.stub().returns(of(true)),
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.chargeDelete(event).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K052");
          expect(rollbar_stub).to.have.been.calledOnce;
          expect(rollbar_stub.args[0][0]).to.equal(
            `time limit exceeded, max days: 730 days since trx: 731`
          );
          done();
        },
      });
    });
  });
});

describe("CardService - Tokenless", () => {
  let sandbox: SinonSandbox;
  let event_body_mock: TokenlessChargeCardBody;
  let tokenless_charge_event_mock: IAPIGatewayEvent<
    TokenlessChargeCardBody,
    null,
    null,
    AuthorizerContext
  >;

  function mockDynamoGateway(stubs: Partial<IDynamoGateway>): void {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>(stubs)
    );
  }

  function mockSQSGateway(stubs: Partial<ISQSGateway>): void {
    CONTAINER.unbind(IDENTIFIERS.SQSGateway);
    CONTAINER.bind(IDENTIFIERS.SQSGateway).toConstantValue(
      Mock.of<ISQSGateway>(stubs)
    );
  }

  function mockLambdaGateway(stubs: Partial<ILambdaGateway>): void {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>(stubs)
    );
  }

  function getTokenlessChargeEvent(): IAPIGatewayEvent<
    TokenlessChargeCardBody,
    null,
    null,
    AuthorizerContext
  > {
    event_body_mock = Mock.of<TokenlessChargeCardBody>({
      accountType: "CR",
      binInfo: {},
      cardInfo: {
        bin: "123456",
        cardHolderName: "Jeff",
        lastFourDigits: "1234",
        maskedCardNumber: "424242XXXXXX1234",
      },
      isDeferred: false,
      transactionCardId: TRANSACTION_CARD_ID,
      amount: { currency: "USD", subtotalIva: 10, subtotalIva0: 10 },
      vaultToken: "vaultToken",
      citMit: "C101",
      externalSubscriptionID: "testExternalSubscriptionID",
      transactionMode: "initialRecurrence",
    });

    return Mock.of<
      IAPIGatewayEvent<TokenlessChargeCardBody, null, null, AuthorizerContext>
    >({
      body: event_body_mock,
      requestContext: {
        authorizer: {
          credentialAlias: "test",
          credentialId: "test",
          credentialMetadata: {},
        },
      },
    });
  }

  function getConversionResponse(): ConvertionResponse {
    return Mock.of<ConvertionResponse>({
      body: {
        convertedCurrency: CurrencyEnum.CLP,
        newAmount: 28000,
      },
    });
  }

  function getTransactionRuleBasicResponse(
    transactionRule?: Partial<LambdaTransactionRuleResponse>
  ): LambdaTransactionRuleBodyResponse {
    return {
      body: Mock.of<LambdaTransactionRuleResponse>({
        ...transactionRule,
        currencyCode: CurrencyEnum.USD,
        processor: ProcessorEnum.KUSHKI,
        publicId: "publicId",
      }),
    };
  }

  function getLambdaContext(): Context {
    return Mock.of<Context>({
      getRemainingTimeInMillis: sandbox.stub().returns(600000),
    });
  }

  function getMerchantDynamo(
    merchantDynamo?: Partial<DynamoMerchantFetch>
  ): DynamoMerchantFetch {
    return Mock.of<DynamoMerchantFetch>({
      ...merchantDynamo,
      commission: false,
      contactPerson: "contact",
      deferredOptions: false,
      email: "email test",
      merchant_name: "merchant_name",
      merchantCategory: "merchantCategory",
      private_id: "private_id",
      public_id: "public_id",
      taxId: "324234",
    });
  }

  function setEnvVars(
    directIntegrationsBins?: string,
    direcIntegrationProcessorIDs?: string
  ): void {
    const bins: string = directIntegrationsBins
      ? directIntegrationsBins
      : DIRECT_INTEGRATION_BINS_ALL;
    const processors: string = direcIntegrationProcessorIDs
      ? direcIntegrationProcessorIDs
      : JSON.stringify({
          kushki: "all",
        });

    process.env.DIRECT_INTEGRATION_BINS = bins;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = processors;
  }

  function beforeEachInitializations() {
    sandbox = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(sandbox);
    process.env.USRV_STAGE = EnvironmentEnum.QA;
    delete process.env.BAD_BINS;
    tokenless_charge_event_mock = getTokenlessChargeEvent();
    setEnvVars();
  }

  function afterEachRestores() {
    sandbox.restore();
    CONTAINER.restore();
    unset(process, "env.DIRECT_INTEGRATION_BINS");
    unset(process, "env.DIRECT_INTEGRATION_PROCESSOR_IDS");
    unset(process, "env.EXTERNAL_TIMEOUT");
  }

  describe("CardService - TokenlessCharge", () => {
    function testTokenlessChargeServiceSuccess(
      nextAssertions: (data: object) => void
    ): void {
      const lambda_context: Context = getLambdaContext();
      const service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);

      sandbox
        .stub(service, "unifiedChargesOrPreAuth")
        .returns(of({ response: "test" }));

      service
        .tokenlessCharge(tokenless_charge_event_mock, lambda_context)
        .subscribe({
          next: nextAssertions,
        });
    }

    function testTokenlessChargeServiceError(
      errorAssertions: (err: KushkiError) => void
    ): void {
      const lambda_context: Context = getLambdaContext();
      const service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);

      service
        .tokenlessCharge(tokenless_charge_event_mock, lambda_context)
        .subscribe({
          error: errorAssertions,
        });
    }

    beforeEach(() => {
      CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
      beforeEachInitializations();
    });

    afterEach(() => afterEachRestores());

    describe("success", () => {
      beforeEach(() => {
        beforeEachInitializations();
      });
      afterEach(() => afterEachRestores());

      it("should run with kushki acq provider and hierarchy config", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
          put: sandbox.stub().returns(of(true)),
        };
        delete event_body_mock.citMit;
        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(of(getTransactionRuleBasicResponse())),
        };
        const hierarchy_config: HierarchyConfig = {
          processing: { deferred: "deferred_id" },
        };
        tokenless_charge_event_mock.requestContext.authorizer.hierarchyConfig =
          JSON.stringify(hierarchy_config);

        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        testTokenlessChargeServiceSuccess((data: object) => {
          expect(dynamoStubs.put).to.be.calledOnce;
          expect(dynamoStubs.getItem).to.be.calledTwice;
          expect(lambdaStubs.invokeFunction).to.be.calledOnce;
          expect(data).to.not.be.empty;
          done();
        });
      });

      it("should be executed with Kushki procurement provider, and other transaction mode", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
          put: sandbox.stub().returns(of(true)),
        };

        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(of(getTransactionRuleBasicResponse())),
        };

        event_body_mock.transactionMode = TransactionModeEnum.VALIDATE_CARD;
        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        testTokenlessChargeServiceSuccess((data: object) => {
          expect(dynamoStubs.put).to.be.calledOnce;
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(lambdaStubs.invokeFunction).to.be.calledOnce;
          expect(data).to.not.be.empty;
          done();
        });
      });

      it("should run whith kushki acq provider and execute failover", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
          put: sandbox.stub().returns(of(true)),
        };
        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(
              of(
                getTransactionRuleBasicResponse({
                  failOverProcessor: {
                    processor: ProcessorEnum.KUSHKI,
                    publicId: "publicIdFailOver",
                    privateId: "privateIDFailOver",
                  },
                })
              )
            ),
        };

        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        testTokenlessChargeServiceSuccess((data: object) => {
          expect(dynamoStubs.put).to.be.calledOnce;
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(lambdaStubs.invokeFunction).to.be.calledOnce;
          expect(data).to.not.be.empty;
          done();
        });
      });
      it("should run whith kushki acq provider and execute failover with error", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
          put: sandbox.stub().returns(of(true)),
        };
        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(
              of(
                getTransactionRuleBasicResponse({
                  failOverProcessor: {
                    processor: ProcessorEnum.VISANET,
                    publicId: "publicIdFailOver",
                    privateId: "privateIDFailOver",
                  },
                })
              )
            ),
        };

        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        testTokenlessChargeServiceSuccess((data: object) => {
          expect(dynamoStubs.put).to.be.calledOnce;
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(lambdaStubs.invokeFunction).to.be.calledTwice;
          expect(data).to.not.be.empty;
          done();
        });
      });

      it("should call conversion lambda only once when currency is UF", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
          put: sandbox.stub().returns(of(true)),
        };

        const trx_rule_response: LambdaTransactionRuleBodyResponse =
          getTransactionRuleBasicResponse();

        trx_rule_response.body.currencyCode = CurrencyEnum.CLP;

        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(of(getConversionResponse()))
            .onSecondCall()
            .returns(of(trx_rule_response)),
        };

        tokenless_charge_event_mock = getTokenlessChargeEvent();
        tokenless_charge_event_mock.body.amount.currency = CurrencyEnum.UF;

        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        testTokenlessChargeServiceSuccess((data: object) => {
          expect(dynamoStubs.put).to.be.calledOnce;
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(lambdaStubs.invokeFunction).to.be.calledTwice;
          expect(data).to.not.be.empty;
          done();
        });
      });
    });

    describe("errors", () => {
      let sqsStubs: Partial<ISQSGateway>;

      beforeEach(() => {
        beforeEachInitializations();
        sqsStubs = {
          put: sandbox.stub().returns(of(true)),
        };
        mockSQSGateway(sqsStubs);
      });

      afterEach(() => afterEachRestores());

      it("should return an error when the request has citMit and does not have externalSubscriptionID and transactionMode", (done: Mocha.Done) => {
        delete event_body_mock.transactionMode;
        delete event_body_mock.externalSubscriptionID;

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(err.code).to.be.eql("K001");
          expect(sqsStubs.put).to.not.be.called;
          done();
        });
      });

      it("should return an error when the request has citMit and has externalSubscriptionID but is empty", (done: Mocha.Done) => {
        delete event_body_mock.transactionMode;
        set(event_body_mock, "externalSubscriptionID", "");

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(err.code).to.be.eql("K001");
          expect(sqsStubs.put).to.not.be.called;
          done();
        });
      });

      it("should return an error when the request has siMit, has externalSubscriptionID, and has transactionMode equal to initialRecurrence and amount < 0", (done: Mocha.Done) => {
        event_body_mock.amount = {
          subtotalIva: 0,
          subtotalIva0: 0,
          iva: 0,
        };
        event_body_mock.transactionMode =
          TransactionModeEnum.INITIAL_RECURRENCE;

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(err.code).to.be.eql("K001");
          expect(sqsStubs.put).to.not.be.called;
          done();
        });
      });

      it("should return error when request have citMit, have externalSubscriptionID, have transactionMode equals subsequentRecurrence and amount < 0", (done: Mocha.Done) => {
        event_body_mock.amount = {
          subtotalIva: 0,
          subtotalIva0: 0,
          iva: 0,
        };
        event_body_mock.transactionMode =
          TransactionModeEnum.SUBSEQUENT_RECURRENCE;

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(err.code).to.be.eql("K001");
          expect(sqsStubs.put).to.not.be.called;
          done();
        });
      });

      it("should return error when request have citMit, have externalSubscriptionID, have transactionMode equals validateCard and amount < 0", (done: Mocha.Done) => {
        event_body_mock.amount = {
          subtotalIva: 0,
          subtotalIva0: 0,
          iva: 0,
        };
        event_body_mock.transactionMode = TransactionModeEnum.VALIDATE_CARD;

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(err.code).to.be.eql("K001");
          expect(sqsStubs.put).to.not.be.called;
          done();
        });
      });

      it("should return error when request transaction mode is account validation and amount is not 0 and save transaction", (done: Mocha.Done) => {
        delete event_body_mock.citMit;

        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
        };
        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(of(getTransactionRuleBasicResponse())),
        };

        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);
        event_body_mock.amount = {
          subtotalIva: 100,
          subtotalIva0: 100,
          iva: 100,
        };
        event_body_mock.transactionMode =
          TransactionModeEnum.ACCOUNT_VALIDATION;
        set(event_body_mock, "binInfo.country.name", "EC");

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(lambdaStubs.invokeFunction).to.be.calledOnce;
          expect(sqsStubs.put).to.be.called;
          expect(err.code).to.be.eql("K001");
          done();
        });
      });
      it("should return error when transaction is not allowed with cvv2 adn and save transaction", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
        };
        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(of(getTransactionRuleBasicResponse({ omitCVV: false }))),
        };

        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        set(event_body_mock, "binInfo.info.country.name", "EC");
        set(event_body_mock, "binInfo.invalid", true);

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(lambdaStubs.invokeFunction).to.be.calledOnce;
          expect(sqsStubs.put).to.be.calledOnce;
          expect(err.code).to.be.eql("K015");
          done();
        });
      });
      it("should return error when transaction rule response with handled error and save transaction", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
        };
        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .throws(new KushkiError(ERRORS.E322, ERRORS.E322.message)),
        };

        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(lambdaStubs.invokeFunction).to.be.calledOnce;
          expect(err.code).to.be.eql("K322");
          expect(sqsStubs.put).to.be.calledOnce;
          done();
        });
      });
      it("should return error when get merchant has timeout", (done: Mocha.Done) => {
        process.env.EXTERNAL_TIMEOUT = "10";

        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox
            .stub()
            .returns(of(getMerchantDynamo()).pipe(delay(20))),
        };

        mockDynamoGateway(dynamoStubs);

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(err.code).to.be.eql("K027");
          expect(sqsStubs.put).to.not.be.called;
          done();
        });
      });
      it("should return error when is recurrent transaction without initial reference", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
          put: sandbox.stub().returns(of(true)),
        };
        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(of(getTransactionRuleBasicResponse())),
        };

        event_body_mock.transactionMode =
          TransactionModeEnum.SUBSEQUENT_RECURRENCE;
        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        testTokenlessChargeServiceError((err: KushkiError) => {
          expect(dynamoStubs.put).to.be.calledOnce;
          expect(dynamoStubs.getItem).to.be.calledOnce;
          expect(lambdaStubs.invokeFunction).to.be.calledOnce;
          expect(sqsStubs.put).to.not.be.calledOnce;
          expect(err.code).to.be.eql("K053");
          done();
        });
      });
    });
  });
  describe("CardService - TokenlessPreAuthorizariont", () => {
    function testTokenlessPreAuthorizationServiceSuccess(
      nextAssertions: (data: object) => void
    ): void {
      const lambda_context: Context = getLambdaContext();
      const service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);

      sandbox
        .stub(service, "unifiedChargesOrPreAuth")
        .returns(of({ response: "test" }));

      service
        .tokenlessPreAuthorization(tokenless_charge_event_mock, lambda_context)
        .subscribe({
          next: nextAssertions,
        });
    }

    beforeEach(() => {
      CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
      beforeEachInitializations();
    });

    afterEach(() => afterEachRestores());

    describe("success", () => {
      beforeEach(() => {
        beforeEachInitializations();
      });
      afterEach(() => afterEachRestores());

      it("should run with kushki acq provider and hierarchy config", (done: Mocha.Done) => {
        const dynamoStubs: Partial<IDynamoGateway> = {
          getItem: sandbox.stub().returns(of(getMerchantDynamo())),
          put: sandbox.stub().returns(of(true)),
        };
        delete event_body_mock.citMit;
        const lambdaStubs: Partial<ILambdaGateway> = {
          invokeFunction: sandbox
            .stub()
            .onFirstCall()
            .returns(of(getTransactionRuleBasicResponse())),
        };
        const hierarchy_config: HierarchyConfig = {
          processing: { deferred: "deferred_id" },
        };
        tokenless_charge_event_mock.requestContext.authorizer.hierarchyConfig =
          JSON.stringify(hierarchy_config);

        mockLambdaGateway(lambdaStubs);
        mockDynamoGateway(dynamoStubs);

        testTokenlessPreAuthorizationServiceSuccess((data: object) => {
          expect(dynamoStubs.put).to.be.calledOnce;
          expect(dynamoStubs.getItem).to.be.calledTwice;
          expect(lambdaStubs.invokeFunction).to.be.calledOnce;
          expect(data).to.not.be.empty;
          done();
        });
      });
    });
  });
});

describe("CardService - Tokens", () => {
  let service: ICardService;
  let sandbox: SinonSandbox;

  let card_info_mock: CardInfo;
  let bin_info_mock: DynamoBinFetch;
  let transaction_rule_mock: TransactionRuleInfo;
  let body_mock: TokensCardBody;
  let authorizer_mock: AuthorizerContext;
  let convertion_response_mock: ConvertionResponse;
  let tokens_event_mock: IAPIGatewayEvent<
    TokensCardBody,
    null,
    null,
    AuthorizerContext
  >;
  let tracer: SinonStub;
  let data_formatter_response_mock: IRootResponse;
  let data_formatter_stub: SinonStub;

  function mockProviderService(
    tokenStub: SinonStub,
    variantStub: CardProviderEnum
  ): void {
    CONTAINER.unbind(IDENTIFIERS.ProviderService);
    CONTAINER.bind(IDENTIFIERS.ProviderService).toConstantValue(
      Mock.of<IProviderService>({
        tokens: tokenStub,
        variant: variantStub,
      })
    );
  }

  function mockDynamoGateway(putStub: SinonStub): void {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: sandbox.stub().onFirstCall().returns(of(gMerchantFetch)),
        put: putStub,
      })
    );
  }

  function mockLambdaGateway(invokeFunctionStub: SinonStub): void {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invokeFunctionStub,
      })
    );
  }

  function mockDataFormatterGateway(dataFormatterStub: SinonStub): void {
    CONTAINER.unbind(CORE.DataFormatter);
    CONTAINER.bind(CORE.DataFormatter).toConstantValue(
      Mock.of<IDataFormatter>({
        dataFormatter: dataFormatterStub,
      })
    );
  }

  function createSchemasTokensMethod(): void {
    card_info_mock = Mock.of<CardInfo>({
      bin: "424242",
      cardHolderName: "Juan Puertas",
      lastFourDigits: "4242",
      maskedCardNumber: "424242XXXXXX4242",
    });

    bin_info_mock = Mock.of<DynamoBinFetch>({
      bank: "BancoKushki",
      bin: "424242",
      brand: "MASTERCARD",
      info: {
        bank: { name: "name" },
        brand: "brand",
        country: {
          currency: "COP",
          latitude: 12,
          longitude: 13,
        },
        number: { length: 1 },
        prepaid: false,
        scheme: "schema",
        type: "credit",
      },
      processor: "NA",
    });

    transaction_rule_mock = Mock.of<TransactionRuleInfo>({
      currencyCode: CurrencyEnum.USD,
      processor: ProcessorEnum.DATAFAST,
      publicId: "publicId",
    });

    body_mock = Mock.of<TokensCardBody>({
      accountType: "CR",
      binInfo: bin_info_mock,
      cardInfo: card_info_mock,
      isDeferred: false,
      totalAmount: 100,
      transactionCardId: TRANSACTION_CARD_ID,
      transactionRuleInfo: transaction_rule_mock,
      vaultToken: "vaultToken",
    });

    authorizer_mock = Mock.of<AuthorizerContext>({
      country: CountryEnum.ECUADOR,
      merchantId: "123455799754313",
      merchantName: "merchantName",
      sandboxEnable: false,
    });
    convertion_response_mock = Mock.of<ConvertionResponse>({
      body: {
        convertedCurrency: CurrencyEnum.CLP,
        newAmount: 400,
      },
    });
    tokens_event_mock = Mock.of<
      IAPIGatewayEvent<TokensCardBody, null, null, AuthorizerContext>
    >({
      body: body_mock,
      headers: {
        [HEADER]: "98765432134",
        [X_FORWARDED_FOR]: "127.0.0.1, 2.2.2.2",
        ["USER-AGENT"]: "PostmanRuntime",
      },
      requestContext: {
        authorizer: authorizer_mock,
      },
    });
    data_formatter_response_mock = Mock.of<IRootResponse>({
      kushkiInfo: {
        manager: "pruebas",
        managerId: "pruebas",
        methodId: "methodId",
        methodName: "methodName",
        platformId: "platformId",
        platformName: "platformName",
        platformVersion: "platformVersion",
      },
      securityIdentity: [
        {
          identityCategory: "identityCategory",
          identityCode: "identityCode",
          partnerName: "partnerName",
        },
      ],
    });
  }

  function testSandboxToken(
    data: object,
    putStub: SinonStub,
    tokenStub,
    done: Mocha.Done,
    dataFormatterStub: SinonStub
  ): void {
    const put_stub_args: SinonStub = putStub.args[0][0];

    testSaveTraceabilityData([PartnerValidatorEnum.KUSHKI], dataFormatterStub);

    expect(data).to.have.property("token");
    expect(tokenStub).to.be.calledOnce;
    expect(tokenStub).to.be.calledWithMatch({
      mid: transaction_rule_mock.publicId,
    });
    expect(putStub).to.be.calledOnce;
    expect(put_stub_args).to.haveOwnProperty("kushkiInfo");
    expect(put_stub_args).to.haveOwnProperty("securityIdentity");

    done();
  }

  function testSaveTraceabilityData(
    expectedTokens: string[],
    dataFormatterStub: SinonStub,
    status: string = TransactionStatusEnum.PENDING
  ): void {
    const all_security_identities: ISecurityIdentityRequest[] =
      dataFormatterStub.args[0][0].securityIdentity;
    const has_error: boolean = all_security_identities.some(
      (item: ISecurityIdentityRequest) => !expectedTokens.includes(item.partner)
    );
    const formatter_stub_args: SinonStub = dataFormatterStub.args[0][0];

    expect(formatter_stub_args).to.haveOwnProperty("kushkiInfo");
    expect(formatter_stub_args).to.haveOwnProperty("securityIdentity");
    expect(has_error).to.be.false;

    if (!expectedTokens.includes(PartnerValidatorEnum.THREEDS)) return;

    const three_ds_request: ISecurityIdentityRequest | undefined =
      all_security_identities.find(
        (item) => item.partner === PartnerValidatorEnum.THREEDS
      );

    expect(three_ds_request).to.haveOwnProperty("info");
    expect(get(three_ds_request, "info"))
      .to.haveOwnProperty("status")
      .to.be.equal(status);
    expect(get(three_ds_request, "info")).to.haveOwnProperty("version");
  }

  beforeEach(() => {
    sandbox = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(sandbox);
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    createSchemasTokensMethod();
    data_formatter_stub = sandbox.stub().returns(data_formatter_response_mock);
    mockDataFormatterGateway(data_formatter_stub);
    process.env.USRV_STAGE = EnvironmentEnum.QA;
    delete process.env.BAD_BINS;
    tracer = sandbox.stub(Tracer.prototype, "putAnnotation");
  });

  afterEach(() => {
    sandbox.restore();
    tracer.restore();
    CONTAINER.restore();
  });

  function testTransbankWithDirectIntegration(
    done: Mocha.Done,
    isALL?: boolean
  ): void {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      transbank: isALL ? "all" : "66666666,111111,5555",
    });
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "4334zsaasas" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      processor: ProcessorEnum.TRANSBANK,
      publicId: "66666666",
    };
    body_mock = {
      ...body_mock,
      transactionRuleInfo: transaction_rule_mock,
    };
    authorizer_mock = {
      ...authorizer_mock,
      merchantId: "2000000001291929192",
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.TRANSBANK);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub.args[0][0].processorName).to.be.equal(
          ProcessorEnum.TRANSBANK
        );
        testSaveTraceabilityData(
          [PartnerValidatorEnum.TRANSBANK],
          data_formatter_stub
        );
        done();
      },
    });
  }

  function testNiubizWithDirectIntegration(
    done: Mocha.Done,
    isALL?: boolean
  ): void {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      niubiz: isALL ? "all" : "66666666,111111,5555",
    });
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      integration: "direct",
      processor: ProcessorEnum.NIUBIZ,
      publicId: "66666666",
    };
    body_mock = {
      ...body_mock,
      transactionRuleInfo: transaction_rule_mock,
    };
    authorizer_mock = {
      ...authorizer_mock,
      merchantId: "2000000001291929192",
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.NIUBIZ);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub.args[0][0].processorName).to.be.equal(
          ProcessorEnum.NIUBIZ
        );
        testSaveTraceabilityData(
          [PartnerValidatorEnum.KUSHKI],
          data_formatter_stub
        );
        done();
      },
    });
  }

  it("call tokens with sandbox", (done: Mocha.Done) => {
    const token_reponse: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    authorizer_mock = {
      ...authorizer_mock,
      hierarchyConfig: {
        processing: {
          test: "",
        },
      },
      sandboxEnable: true,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse, CardProviderEnum.SANDBOX);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (response: object): void => {
        testSandboxToken(
          response,
          put_stub,
          token_reponse,
          done,
          data_formatter_stub
        );
      },
    });
  });

  it("should return error when tokens is called and currency is different from processor currency", (done: Mocha.Done) => {
    const token_reponse: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    authorizer_mock = {
      ...authorizer_mock,
      hierarchyConfig: {
        processing: {
          test: "",
        },
      },
      sandboxEnable: true,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    set(
      tokens_event_mock,
      "body.transactionRuleInfo.currencyCode",
      CurrencyEnum.MXN
    );

    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse, CardProviderEnum.SANDBOX);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      error: (err: KushkiError): void => {
        expectCurrencyError(err, done);
      },
    });
  });

  it("should throw error when transactionMode is AccountValidation and totalAmount is not 0", (done: Mocha.Done) => {
    const token_reponse: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: true,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    tokens_event_mock.body.transactionMode =
      TransactionModeEnum.ACCOUNT_VALIDATION;
    tokens_event_mock.body.totalAmount = 10;
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse, CardProviderEnum.SANDBOX);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eql("K001");
        done();
      },
    });
  });

  it("should process tokens with sandbox when totalAmount is not present in the event", (done: Mocha.Done) => {
    const token_reponse: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: true,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    tokens_event_mock.body.transactionMode = TokensEnum.SUBSEQUENT_RECURRENCE;
    unset(tokens_event_mock, "body.totalAmount");
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse, CardProviderEnum.SANDBOX);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        testSandboxToken(
          data,
          put_stub,
          token_reponse,
          done,
          data_formatter_stub
        );
      },
    });
  });

  it("call tokens with sandbox and bin 8 characters", (done: Mocha.Done) => {
    const token_reponse: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: true,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };

    tokens_event_mock.body.binInfo.binType = 8;
    tokens_event_mock.body.cardInfo.bin = "12345678910";
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse, CardProviderEnum.SANDBOX);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (tokenResponse: object): void => {
        testSandboxToken(
          tokenResponse,
          put_stub,
          token_reponse,
          done,
          data_formatter_stub
        );
      },
    });
  });

  it("call tokens when it´s credibank and stage is different of production then provider is sandbox", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.CI;
    const token_reponse: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    set(
      tokens_event_mock,
      "body.transactionRuleInfo.processor",
      ProcessorEnum.CREDIBANCO
    );
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse, CardProviderEnum.SANDBOX);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (tokenData: object): void => {
        testSandboxToken(
          tokenData,
          put_stub,
          token_reponse,
          done,
          data_formatter_stub
        );
      },
    });
  });

  it("call tokens with timeout error in getItem", (done: Mocha.Done) => {
    process.env.EXTERNAL_TIMEOUT = "100";
    const token_reponse: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: true,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: sandbox
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch).pipe(delay(110))),
        put: sandbox.stub().returns(of(true)),
      })
    );
    mockProviderService(token_reponse, CardProviderEnum.SANDBOX);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      error: (err: KushkiError): void => {
        checkTimeoutError(err, done);
      },
    });
  });

  it("call tokens without sandbox", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: {
        ...tokens_event_mock.body,
        cvv: "123",
      },
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        const put_stub_args: SinonStub = put_stub.args[0][0];

        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS],
          data_formatter_stub
        );
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].sendCvv).to.be.eql(true);
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub).to.be.calledWithMatch({
          merchantId: transaction_rule_mock.publicId,
          vaultToken: body_mock.vaultToken,
        });
        expect(put_stub_args).to.haveOwnProperty("kushkiInfo");
        expect(put_stub_args).to.haveOwnProperty("securityIdentity");
        done();
      },
    });
  });

  it("call tokens with contactDetails optional object and make put to dynamo when country brazil", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    gMerchantFetch = {
      ...gMerchantFetch,
      country: CountryEnum.BRAZIL,
    };

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: {
        ...tokens_event_mock.body,
        contactDetails: {
          documentNumber: "string",
          documentType: "string",
          email: "test email",
          firstName: "test name",
          lastName: "test last name",
          phoneNumber: "string",
        },
        cvv: "123",
      },
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        const put_stub_args: SinonStub = put_stub.args[0][0];

        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS],
          data_formatter_stub
        );
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].contactDetails).to.exist;
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub).to.be.calledWithMatch({
          merchantId: transaction_rule_mock.publicId,
          vaultToken: body_mock.vaultToken,
        });
        expect(put_stub_args).to.haveOwnProperty("kushkiInfo");
        expect(put_stub_args).to.haveOwnProperty("securityIdentity");
        done();
      },
    });
  });
  it("call tokens with contactDetails optional object and don't make put to dynamo when country != brazil", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    gMerchantFetch = {
      ...gMerchantFetch,
      country: CountryEnum.COLOMBIA,
    };

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: {
        ...tokens_event_mock.body,
        contactDetails: {
          documentNumber: "string",
          documentType: "string",
          email: "test email",
          firstName: "test name",
          lastName: "test last name",
          phoneNumber: "string",
        },
        cvv: "123",
      },
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        const put_stub_args: SinonStub = put_stub.args[0][0];

        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS],
          data_formatter_stub
        );
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].contactDetails).not.to.exist;
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub).to.be.calledWithMatch({
          merchantId: transaction_rule_mock.publicId,
          vaultToken: body_mock.vaultToken,
        });
        expect(put_stub_args).to.haveOwnProperty("kushkiInfo");
        expect(put_stub_args).to.haveOwnProperty("securityIdentity");
        done();
      },
    });
  });
  it("call tokens without contactDetails optional object and don't make put to dynamo when country != brazil", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjdskdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    gMerchantFetch = {
      ...gMerchantFetch,
      country: CountryEnum.COLOMBIA,
    };

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: {
        ...tokens_event_mock.body,
        cvv: "123",
      },
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (): void => {
        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS],
          data_formatter_stub
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].contactDetails).not.to.exist;
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub).to.be.calledWithMatch({
          merchantId: transaction_rule_mock.publicId,
          vaultToken: body_mock.vaultToken,
        });
        done();
      },
    });
  });

  it("when tokens is called with expiry year and expiry month, it will save in dynamo those fields", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: {
        ...tokens_event_mock.body,
        cardInfo: {
          ...tokens_event_mock.body.cardInfo,
          expiryMonth: "12",
          expiryYear: "25",
        },
      },
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      complete: (): void => {
        expect(put_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].expiryMonth).to.eql("12");
        expect(put_stub.args[0][0].expiryYear).to.eql("25");
        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS],
          data_formatter_stub
        );
        done();
      },
    });
  });

  it("call tokens with niubiz and exist merchantId in DIRECT_INTEGRATION_PROCESSOR_IDS env", (done: Mocha.Done) => {
    testNiubizWithDirectIntegration(done);
  });

  it("call tokens with niubiz and not exist merchantId in DIRECT_INTEGRATION_PROCESSOR_IDS env", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS =
      DIRECT_INTEGRATION_PROCESSOR_IDS;
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      processor: ProcessorEnum.NIUBIZ,
    };
    body_mock = {
      ...body_mock,
      transactionRuleInfo: transaction_rule_mock,
    };
    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub.args[0][0].processorName).to.be.equal(
          ProcessorEnum.NIUBIZ
        );
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS],
          data_formatter_stub
        );
        done();
      },
    });
  });

  it("call tokens with transbank and exist merchantId in DIRECT_INTEGRATION_PROCESSOR_IDS env", (done: Mocha.Done) => {
    testTransbankWithDirectIntegration(done);
  });
  it("call tokens with transbank and exist merchantId in DIRECT_INTEGRATION_PROCESSOR_IDS is setup to all Transbank processors", (done: Mocha.Done) => {
    testTransbankWithDirectIntegration(done, true);
  });
  it("call tokens with transbank and not exist merchantId in DIRECT_INTEGRATION_PROCESSOR_IDS env", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      transbank: "2389293832",
    });
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      processor: ProcessorEnum.TRANSBANK,
    };
    body_mock = {
      ...body_mock,
      transactionRuleInfo: transaction_rule_mock,
    };
    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub.args[0][0].processorName).to.be.equal(
          ProcessorEnum.TRANSBANK
        );
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS],
          data_formatter_stub
        );
        done();
      },
    });
  });

  it("call tokens with visanet and integration is direct", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      integration: "direct",
      processor: ProcessorEnum.VISANET,
      publicId: "11111222222",
    };
    body_mock = {
      ...body_mock,
      transactionRuleInfo: transaction_rule_mock,
    };
    authorizer_mock = {
      ...authorizer_mock,
      merchantId: "2000000001291929192",
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.NIUBIZ);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub.args[0][0].processorName).to.be.equal(
          ProcessorEnum.VISANET
        );
        testSaveTraceabilityData(
          [PartnerValidatorEnum.KUSHKI],
          data_formatter_stub
        );
        done();
      },
    });
  });

  it("call tokens with visanet and not exist merchantId in DIRECT_INTEGRATION_PROCESSOR_IDS env", (done: Mocha.Done) => {
    process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      niubiz: `11111222222,666,1234`,
      visanet: `11111222222,666,1234`,
    });
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdn" }));

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      processor: ProcessorEnum.VISANET,
      publicId: "6666",
    };
    body_mock = {
      ...body_mock,
      transactionRuleInfo: transaction_rule_mock,
    };
    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(token_reponse_stub).to.be.calledOnce;
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(put_stub).to.be.calledOnce;
        expect(token_reponse_stub.args[0][0].processorName).to.be.equal(
          ProcessorEnum.VISANET
        );
        done();
      },
    });
  });

  it("call tokens with UF currency", (done: Mocha.Done) => {
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdb" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));
    const convertion_response_stub: SinonStub = sandbox
      .stub()
      .returns(of(convertion_response_mock));

    body_mock = {
      ...body_mock,
      currency: CurrencyEnum.UF,
      transactionRuleInfo: {
        ...transaction_rule_mock,
        currencyCode: CurrencyEnum.CLP,
      },
    };
    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);
    mockLambdaGateway(convertion_response_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(convertion_response_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledWithMatch({
          convertedAmount: {
            currency: convertion_response_mock.body.convertedCurrency,
            totalAmount: convertion_response_mock.body.newAmount,
          },
        });
        done();
      },
    });
  });
  it("call tokens with cybersource response", (done: Mocha.Done) => {
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdb" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));
    const convertion_response_stub: SinonStub = sandbox
      .stub()
      .returns(of(convertion_response_mock));

    body_mock = {
      ...body_mock,
      currency: CurrencyEnum.UF,
    };

    body_mock.transactionRuleInfo.cybersource = {
      authentication: true,
      detail: {
        acsURL: "internet.csa",
        authenticationTransactionId: "12314123123",
        paReq: "U",
        specificationVersion: "V1.0.2",
      },
    };
    body_mock.transactionRuleInfo.secureId =
      "6b01924b-eeeb-4ad5-b317-567c9410cf17";
    body_mock.transactionRuleInfo.secureService = "3dsecure";
    body_mock.transactionRuleInfo.currencyCode = CurrencyEnum.CLP;

    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
    };

    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);
    mockLambdaGateway(convertion_response_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(
          Object.prototype.hasOwnProperty.call(data, "security")
        ).to.be.eql(true);
        expect(get(data, "secureId")).to.be.eql(
          "6b01924b-eeeb-4ad5-b317-567c9410cf17"
        );
        expect(get(data, "secureService")).to.be.eql("3dsecure");
        expect(get(data, "security.authRequired")).to.be.eql(true);
        expect(get(data, "security.acsURL")).to.be.eql("internet.csa");
        expect(get(data, "security.paReq")).to.be.eql("U");
        expect(get(data, "security.authenticationTransactionId")).to.be.eql(
          "12314123123"
        );
        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS, PartnerValidatorEnum.THREEDS],
          data_formatter_stub
        );
        done();
      },
    });
  });

  it("call tokens with 3ds configuration", (done: Mocha.Done) => {
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakj" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      cybersource: {
        authentication: true,
        detail: {
          eci: "eci",
        },
      },
      secureService: "3dsecure",
    };
    body_mock = {
      ...body_mock,
      transactionRuleInfo: transaction_rule_mock,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
    };

    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(put_stub.args[0][0]["3ds"]).to.be.not.undefined;
        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS, PartnerValidatorEnum.THREEDS],
          data_formatter_stub
        );
        done();
      },
    });
  });

  it("call tokens with credentialInfo", (done: Mocha.Done) => {
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdb" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));
    const convertion_response_stub: SinonStub = sandbox
      .stub()
      .returns(of(convertion_response_mock));

    body_mock = {
      ...body_mock,
      currency: CurrencyEnum.UF,
    };
    authorizer_mock = {
      ...authorizer_mock,
      credentialAlias: "Test",
      credentialId: "123456",
      credentialMetadata: { data: "info" },
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    set(
      tokens_event_mock,
      "body.transactionRuleInfo.currencyCode",
      CurrencyEnum.CLP
    );
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);
    mockLambdaGateway(convertion_response_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].credentialInfo).to.be.not.undefined;
        expect(put_stub.args[0][0].credentialInfo.alias).to.be.not.undefined;
        expect(put_stub.args[0][0].credentialInfo.credentialId).to.be.not
          .undefined;
        expect(put_stub.args[0][0].credentialInfo.metadata).to.be.not.undefined;
        done();
      },
    });
  });

  it("call tokens with failover and with transactionCardId field present in the vaultToken middleware, it must be saved in tokens table", (done: Mocha.Done) => {
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdc" }));
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock.processor = ProcessorEnum.CREDIMATIC;
    transaction_rule_mock = {
      ...transaction_rule_mock,
      integration: "direct",
      failOverProcessor: {
        privateId: "privateId",
        processor: ProcessorEnum.CREDIMATIC,
        publicId: "publicId",
      },
    };
    body_mock = {
      ...body_mock,
      transactionCardId: TRANSACTION_CARD_ID,
      transactionRuleInfo: transaction_rule_mock,
    };
    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.CREDIMATIC);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledTwice;
        expect(put_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].failoverToken).to.be.not.undefined;
        expect(put_stub.args[0][0]).to.haveOwnProperty(
          "transactionCardId",
          TRANSACTION_CARD_ID
        );
        expect(data).to.not.haveOwnProperty("transactionCardId");
        done();
      },
    });
  });

  it("call tokens with failover error", (done: Mocha.Done) => {
    const token_reponse_stub: SinonStub = sandbox
      .stub()
      .onFirstCall()
      .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasdc" }))
      .onSecondCall()
      .throws("error");
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock.processor = ProcessorEnum.CREDIMATIC;
    transaction_rule_mock = {
      ...transaction_rule_mock,
      integration: "direct",
      failOverProcessor: {
        privateId: "privateId",
        processor: ProcessorEnum.DATAFAST,
        publicId: "publicId",
      },
    };
    body_mock = {
      ...body_mock,
      transactionCardId: TRANSACTION_CARD_ID,
      transactionRuleInfo: transaction_rule_mock,
    };
    authorizer_mock = {
      ...authorizer_mock,
      sandboxEnable: false,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };
    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.CREDIMATIC);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      error: (err: KushkiError): void => {
        expect(err).not.to.be.null;
        done();
      },
    });
  });

  it("call tokens with error 007", (done: Mocha.Done) => {
    process.env.BAD_BINS = "434343";

    card_info_mock = {
      ...card_info_mock,
      bin: "434343",
    };
    body_mock = {
      ...body_mock,
      cardInfo: card_info_mock,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
    };

    mockDynamoGateway(sandbox.stub());

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eql("K007");
        done();
      },
    });
  });

  it("call tokens with error 025", (done: Mocha.Done) => {
    card_info_mock = {
      ...card_info_mock,
      bin: "042424",
    };
    body_mock = {
      ...body_mock,
      cardInfo: card_info_mock,
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
    };

    mockDynamoGateway(sandbox.stub());

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eql("K025");
        done();
      },
    });
  });

  it("call tokens with error 015", (done: Mocha.Done) => {
    card_info_mock = {
      ...card_info_mock,
      bin: "042424",
    };
    body_mock = {
      ...body_mock,
      cardInfo: card_info_mock,
    };

    tokens_event_mock = {
      ...tokens_event_mock,
      body: {
        ...body_mock,
      },
    };

    set(tokens_event_mock, "body.binInfo.invalid", true);
    set(tokens_event_mock, "body.transactionRuleInfo.omitCVV", false);

    mockDynamoGateway(sandbox.stub());

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eql("K015");
        done();
      },
    });
  });

  it("call tokens with special character in cardHolderName and extra fields", (done: Mocha.Done) => {
    process.env.BAD_BINS = "434343";
    const token_reponse_stub: SinonStub = sandbox.stub().returns(
      of({
        settlement: "settlement",
        token: "cxvxcvhjkshjkdashdaksdhakjsdasdd",
      })
    );
    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    card_info_mock = {
      ...card_info_mock,
      cardHolderName: "Alonso� Núñez1新道",
    };
    transaction_rule_mock = {
      ...transaction_rule_mock,
      secureId: "secureId",
      secureService: "secureService",
    };
    body_mock = {
      ...body_mock,
      cardInfo: card_info_mock,
      sessionId: "sessionId",
      transactionRuleInfo: transaction_rule_mock,
      userId: "userId",
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
    };

    unset(tokens_event_mock, "body.binInfo");
    unset(tokens_event_mock, "headers");

    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        expect(put_stub.args[0][0].cardHolderName).to.be.equal("Alonso Nunez1");
        expect(put_stub).to.be.calledWithMatch({
          secureId: transaction_rule_mock.secureId,
          secureService: transaction_rule_mock.secureService,
          sessionId: body_mock.sessionId,
          userId: body_mock.userId,
        });
        testSaveTraceabilityData(
          [PartnerValidatorEnum.AURUS],
          data_formatter_stub
        );
        done();
      },
    });
  });

  it("when call tokens with authValidation field and callbackUrl, then return object with token and url fields", (done: Mocha.Done) => {
    process.env.BAD_BINS = "434343";
    const token_reponse_stub: SinonStub = sandbox.stub().returns(
      of({
        token: "cxvxcvhjkshjkdashdaksdhakjsdasdd",
      })
    );

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      cybersourceApiValidation: true,
    };
    authorizer_mock = {
      ...authorizer_mock,
      merchantId: "2000000001291929192",
      publicCredentialId: "asd213dasd12gkrm23",
    };

    body_mock = {
      ...body_mock,
      authValidation: "url",
      binInfo: bin_info_mock,
      callbackUrl: "https://callback.test",
      sessionId: "sessionId",
      transactionRuleInfo: transaction_rule_mock,
      userId: "userId",
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };

    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(Object.prototype.hasOwnProperty.call(data, "url")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(put_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("when call tokens with authValidation equal to iframe and callbackUrl, then return object with token and url with authValidation=iframe", (done: Mocha.Done) => {
    process.env.SECURE_VALIDATION_URL = "http://secure-validation.test";
    process.env.BAD_BINS = "434343";
    const token_reponse_stub: SinonStub = sandbox.stub().returns(
      of({
        token: "cxvxcvhjkshjkdashdaksdhakjsdasdd",
      })
    );

    const put_stub: SinonStub = sandbox.stub().returns(of(true));

    transaction_rule_mock = {
      ...transaction_rule_mock,
      cybersourceApiValidation: true,
    };
    authorizer_mock = {
      ...authorizer_mock,
      merchantId: "2000000001291929192",
      publicCredentialId: "asd213dasd12gkrm23",
    };

    body_mock = {
      ...body_mock,
      authValidation: "iframe",
      binInfo: bin_info_mock,
      callbackUrl: "https://callback.test",
      sessionId: "sessionId",
      transactionRuleInfo: transaction_rule_mock,
      userId: "userId",
    };
    tokens_event_mock = {
      ...tokens_event_mock,
      body: body_mock,
      requestContext: {
        authorizer: authorizer_mock,
      },
    };

    mockDynamoGateway(put_stub);
    mockProviderService(token_reponse_stub, CardProviderEnum.AURUS);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(tokens_event_mock).subscribe({
      next: (data: object): void => {
        const url = new URL(get(data, "url", ""));
        const authValidation = url.searchParams.get("authValidation") || "";
        expect(Object.prototype.hasOwnProperty.call(data, "token")).to.be.eql(
          true
        );
        expect(Object.prototype.hasOwnProperty.call(data, "url")).to.be.eql(
          true
        );
        expect(token_reponse_stub).to.be.calledOnce;
        expect(authValidation).to.be.eq("iframe");
        expect(put_stub).to.be.calledOnce;
        done();
      },
    });
  });
});

describe("CardService - Charges", () => {
  process.env.THRESHOLD_AMOUNT = "0.05";
  let service: ICardService;
  let box: SinonSandbox;
  let card_stub: SinonStub;
  let lambda_stub: SinonStub;
  let put: SinonStub;
  let process_stub: SinonStub;
  let build_transaction: SinonStub;
  let put_sqs_stub: SinonStub;
  let cybersource_detail: object;
  let hierarchy_config: HierarchyConfig;
  let tracer: SinonStub;
  let token_fis_dynamo: TokenDynamo;

  function mockProviderService(
    tokenStub: SinonStub | undefined,
    chargeStub: SinonStub | undefined,
    variantStub: CardProviderEnum,
    preAuthStub?: SinonStub
  ): void {
    CONTAINER.unbind(IDENTIFIERS.ProviderService);
    CONTAINER.bind(IDENTIFIERS.ProviderService).toConstantValue(
      Mock.of<IProviderService>({
        charge: chargeStub,
        preAuthorization: preAuthStub,
        reAuthorization: preAuthStub,
        tokens: tokenStub,
        variant: variantStub,
      })
    );
  }

  function mockReauthService() {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gMerchantFetch])),
        put: box.stub().returns(of(true)),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
      })
    );

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub
          .onFirstCall()
          .returns(
            of(
              Mock.of<{ body: LambdaTransactionRuleResponse }>({
                body: {
                  privateId: gProcessorFetch.private_id,
                  processor: ProcessorEnum.KUSHKI,
                  publicId: gProcessorFetch.public_id,
                },
              })
            )
          )
          .onSecondCall()
          .returns(
            of(
              Mock.of<{ body }>({
                body: {
                  response_code: "200",
                  transaction_status: "approve",
                },
              })
            )
          ),
      })
    );

    // tslint:disable-next-line:no-duplicate-string
    process.env.DIRECT_INTEGRATION_BINS = DIRECT_INTEGRATION_BINS_ALL;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      kushki: `${gProcessorFetch.public_id},22222,4321`,
    });
  }

  function buildNextExpect(done: Mocha.Done): (data: object) => void {
    return (data: object): void => {
      validateCharge(data, lambda_stub, card_stub, build_transaction, done);
    };
  }

  function commonExpect(done: Mocha.Done): void {
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: done,
        next: buildNextExpect(done),
      });
  }

  function mockEnvAcqVars(switchIntDeferred: boolean): void {
    const ksk_acq_vars: KushkiAcqVars = {
      CAPTURE_PERCENTAGE: 10,
      LAMBDA_CAPTURE: "usrv-card-acq-test-capture",
      LAMBDA_CHARGE: "usrv-card-acq-test-charge",
      LAMBDA_PREAUTHORIZATION: "usrv-card-acq-test-preauth",
      LAMBDA_REAUTHORIZATION: "usrv-card-acq-test-reauth",
      SWITCH_INT_DEFERRED: switchIntDeferred,
      TABLE_TIMEOUTS: "usrv-card-test-timeoutTransactions",
      TIMEOUT: "500",
    };

    process.env.KUSHKI_ADQUIRER_VARS = JSON.stringify(ksk_acq_vars);
  }

  function assertCountriesAlwaysDeferred(
    country: string,
    done: Mocha.Done
  ): void {
    delete gTokenDynamo.secureId;
    gTokenDynamo.merchantId = CHARGE_MID;
    delete gChargesRequest.secureService;
    gChargesRequest.deferred = {
      creditType: "",
      graceMonths: "",
      months: 3,
    };
    gAurusResponse.ticket_number = "07874520255";
    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of({ ...gMerchantFetch, country, deferredOptions: [] }))
      .onSecondCall()
      .returns(of(gTokenDynamo))
      .onThirdCall()
      .returns(of(gProcessorFetch))
      .onCall(3)
      .returns(of(gBinFetch));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
      })
    );
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    commonExpect(done);
  }

  function billpocketMock(provider: CardProviderEnum): void {
    delete gUnifiedTrxRequest.secureId;
    delete gUnifiedTrxRequest.secureService;
    gAurusResponse.ticket_number = "07874520255";
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            apiKey: "1111111111",
            currencyCode: CurrencyEnum.USD,
            privateId: gProcessorFetch.private_id,
            processor: ProcessorEnum.BILLPOCKET,
            publicId: gProcessorFetch.public_id,
          },
        })
      )
    );

    process.env.BILLPOCKET_MERCHANTS = `${gProcessorFetch.public_id}`;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      billpocket: `${gProcessorFetch.public_id},1111,1234`,
      niubiz: "1234,444,6666",
    });
    lambdaServiceBinding(lambda_stub);
    mockProviderService(undefined, card_stub, provider);
  }

  function kushkiAcqMock(
    provider: CardProviderEnum,
    subMccCode?: string
  ): void {
    delete gTokenDynamo.secureId;
    delete gChargesRequest.secureService;
    gAurusResponse.ticket_number = "07874520255";
    gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
    gTokenDynamo.merchantId = CHARGE_MID;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      kushki: `${gProcessorFetch.public_id},1111,1234`,
      niubiz: "1234,444,666, 7777",
    });

    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            subMccCode,
            apiKey: "1111111111",
            currencyCode: CurrencyEnum.USD,
            privateId: gProcessorFetch.private_id,
            processor: ProcessorEnum.KUSHKI,
            publicId: gProcessorFetch.public_id,
          },
        })
      )
    );

    lambdaServiceBinding(lambda_stub);
    mockProviderService(undefined, card_stub, provider);
  }

  function assertCardAndPreAuthWith3DS(): void {
    expect(build_transaction).to.be.called;

    const request: ProcessRecordRequest = build_transaction.args[0][0];

    expect(Object.prototype.hasOwnProperty.call(request.tokenInfo, "3ds"));
    expect(request.tokenInfo["3ds"]?.detail).to.be.eql(cybersource_detail);
  }

  function assertCardAndPreAuthWithout3DS(): void {
    expect(build_transaction).to.be.called;
    const request: ProcessRecordRequest = build_transaction.args[0][0];

    expect(request.tokenInfo).not.to.be.haveOwnProperty("3ds");
  }

  function assertCommonCharges(
    eventCharge: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    >,
    done: Done
  ) {
    service.charges(eventCharge, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => {
        expect(get(data, "ticketNumber")).to.be.eqls("07874520255");
        expect(get(data, "transactionReference")).to.be.eqls("84383487834");
        done();
      },
    });
  }

  function validateAlreadyTokenError(
    errorResponse: AurusError,
    done: Mocha.Done
  ) {
    expect(errorResponse.code).to.be.eq("577");
    expect(put_sqs_stub).to.be.calledOnce;
    done();
  }

  function mockEnvVars(): void {
    const env_vars: KushkiAcqVars = {
      CAPTURE_PERCENTAGE: 10,
      LAMBDA_CAPTURE: "fake-capture",
      LAMBDA_CHARGE: "fake-charge",
      LAMBDA_PREAUTHORIZATION: "fake-lambda-preauth",
      LAMBDA_REAUTHORIZATION: "fake-reauth",
      SWITCH_INT_DEFERRED: false,
      TABLE_TIMEOUTS: "fake",
      TIMEOUT: "0",
    };

    process.env.KUSHKI_ADQUIRER_VARS = JSON.stringify(env_vars);
  }

  beforeEach(() => {
    mockEnvAcqVars(false);
    createSchemas();
    mockEnvVars();
    box = createSandbox();
    CONTAINER.snapshot();
    process.env.LAMBDA_RULE = TRX_RULE_PROCESSOR;
    rollbarInstance(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    put = box.stub().returns(of(true));
    gTokenDynamo = Mock.of<TokenDynamo>({
      amount: 1112,
      binInfo: {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        processor: "Credimatic",
      },
      created: new Date().valueOf(),
      id: "923y419hddsh02",
      merchantId: CHARGE_MID,
      sendCvv: true,
    });

    token_fis_dynamo = Mock.of<TokenDynamo>({
      amount: 1112,
      binInfo: {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        processor: "Credimatic",
      },
      contactDetails: {
        documentNumber: "1009283738",
        documentType: "CC",
        email: "",
        firstName: "Jordan",
        lastName: "Zapata",
        phoneNumber: "+59398873464",
      },
      created: new Date().valueOf(),
      id: "923y419hddsh02",
      merchantId: CHARGE_MID,
      sendCvv: true,
    });

    cybersource_detail = {
      acsURL: "test.com",
      authenticationTransactionId: "123",
      cavv: "1212",
      commerceIndicator: "121",
      eci: "s121da",
      paReq: "121",
      paresStatus: "1212",
      proxyPan: "1212",
      specificationVersion: 1212,
      ucafCollectionIndicator: "231",
      veresEnrolled: "1212",
      xid: "1212",
    };

    gTokenDynamo.binInfo = {
      bank: "Pichincha",
      bin: "123456",
      brand: "VISA",
      info: {
        type: "debit",
      },
      processor: "Credimatic",
    };

    hierarchy_config = {
      processing: {
        businessRules: "200000000345044",
        deferred: "200000000345043",
        processors: "200000000345043",
        securityRules: "200000000345045",
      },
      rootId: "3000abc0001",
    };

    dynamoBinding(put, box);

    gLambdaContext = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(600000),
    });

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    gChargesResponse.approvalCode = "PRUEBA";
    card_stub = box.stub().returns(of(gAurusResponse));
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: card_stub,
        getAurusToken: box.stub().returns(
          of({
            token: "token55",
          })
        ),
        preAuthorization: card_stub,
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = lambdaStubTransactionRule(box);
    lambdaServiceBinding(lambda_stub);
    process_stub = box.stub().returns(of(chargesCardResponse()));
    build_transaction = box.stub().returns(chargesCardResponse());
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    transactionServiceBinding(build_transaction);
    process.env.MERCHANT_IDS_TUENTI = "merchantTuenti,16663";

    put_sqs_stub = box.stub().returns(of(true));
    mockSQSGateway(put_sqs_stub);
    tracer = box.stub(Tracer.prototype, "putAnnotation");
  });

  afterEach(() => {
    tracer.restore();
    box.restore();
    CONTAINER.restore();
  });

  it("charges - success mapping extra taxes- IVAagenciaDeViaje", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(chargesEvent(), done);
  });

  it("charges - success contactDetail- token", (done: Mocha.Done) => {
    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(token_fis_dynamo))
      .onSecondCall()
      .returns(of(gMerchantFetch))
      .onCall(2)
      .returns(of(gProcessorFetch))
      .onCall(3)
      .returns(of(gBinFetch));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().returns(of(gTokenDynamo)),
        updateValues: box.stub().returns(of(true)),
      })
    );

    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    service = CONTAINER.get(IDENTIFIERS.CardService);

    set(gChargesRequest, "contactDetails", {
      documentNumber: "1009283738",
      documentType: "CC",
      email: "jordan.zapata@kushkipagos.com",
      firstName: "Jordan",
      lastName: "Zapata",
      phoneNumber: "+593988734644",
    });
    assertCommonCharges(chargesEvent(false, CountryEnum.BRAZIL), done);
  });

  it("charges - success contactDetail undefined- token", (done: Mocha.Done) => {
    token_fis_dynamo = Mock.of<TokenDynamo>({
      amount: 1112,
      binInfo: {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        processor: "Credimatic",
      },
      created: new Date().valueOf(),
      id: "923y419hddsh02",
      merchantId: CHARGE_MID,
      sendCvv: true,
    });

    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(token_fis_dynamo))
      .onSecondCall()
      .returns(of(gMerchantFetch))
      .onCall(2)
      .returns(of(gProcessorFetch))
      .onCall(3)
      .returns(of(gBinFetch));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().returns(of(gTokenDynamo)),
        updateValues: box.stub().returns(of(true)),
      })
    );

    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    service = CONTAINER.get(IDENTIFIERS.CardService);

    set(gChargesRequest, "contactDetails", {
      documentNumber: "1009283738",
      documentType: "CC",
      email: "jordan.zapata@kushkipagos.com",
      firstName: "Jordan",
      lastName: "Zapata",
      phoneNumber: "+593988734644",
    });
    assertCommonCharges(chargesEvent(false, CountryEnum.BRAZIL), done);
  });

  it("charges - normalize firstName on contactDetails and citmit", (done: Mocha.Done) => {
    const charge_details: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();
    const name_bolded: string = "𝑴𝒐𝒓𝒂𝒏 𝑩𝒂𝒍𝒂𝒏𝒅𝒓𝒂";
    const name_flat: string = "Moran Balandra";

    unset(charge_details, "body.amount.currency");
    charge_details.body.citMit = "C101";
    charge_details.body.externalSubscriptionID = "testExternalSubscriptionID";
    set(charge_details, "body.contactDetails.firstName", name_bolded);
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charge_details, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => {
        expect(get(data, "ticketNumber")).to.be.eqls("07874520255");
        expect(get(data, "transactionReference")).to.be.eqls("84383487834");
        expect(
          card_stub.args[0][0].event.contactDetails.firstName
        ).not.to.be.eq(name_bolded);
        expect(card_stub.args[0][0].event.contactDetails.firstName).to.be.eq(
          name_flat
        );
        done();
      },
    });
  });

  it("should get hierarchy merchant when hierarchyConfig.processing.deferred of authorizer is not empty", (done: Mocha.Done) => {
    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(gMerchantFetch))
      .onSecondCall()
      .returns(of(gMerchantFetch))
      .onCall(2)
      .returns(of(gProcessorFetch))
      .onCall(3)
      .returns(of(gBinFetch));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().returns(of(gTokenDynamo)),
        updateValues: box.stub().returns(of(true)),
      })
    );
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charges_event.requestContext.authorizer.hierarchyConfig =
      JSON.stringify(hierarchy_config);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charges_event, gLambdaContext).subscribe({
      error: done,
      next: (_: object): void => {
        expect(gGetItemStub.args[0][1]).to.be.eql({
          public_id: hierarchy_config.processing?.deferred,
        });
        expect(gGetItemStub.args[1][1]).to.be.eql({
          public_id: charges_event.requestContext.authorizer.merchantId,
        });
        done();
      },
    });
  });

  it("should send traceability info to sqs", (done: Mocha.Done) => {
    const kushki_info_data: {
      kushkiInfo: object;
      securityIdentity: object[];
    } = {
      kushkiInfo: {
        manager: "API",
        managerId: "DP002",
        methodId: "KM001",
        methodName: "CARD",
        platformId: "KP001",
        platformName: "API",
        platformVersion: "latest",
      },
      securityIdentity: [
        {
          identityCategory: "IDENTIFICATION_VERIFICATION",
          identityCode: "SI006",
          partnerName: "SIFTSCIENCE",
        },
      ],
    };

    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(gMerchantFetch))
      .onSecondCall()
      .returns(of(gMerchantFetch))
      .onCall(2)
      .returns(of(gProcessorFetch))
      .onCall(3)
      .returns(of(gBinFetch));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box
          .stub()
          .returns(of({ ...gTokenDynamo, ...kushki_info_data })),
        updateValues: box.stub().returns(of(true)),
      })
    );
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent(true);

    charges_event.requestContext.authorizer.hierarchyConfig =
      JSON.stringify(hierarchy_config);

    build_transaction = box.stub().returns({
      ...chargesCardResponse(),
      kushki_info: kushki_info_data.kushkiInfo,
      security_identity: kushki_info_data.securityIdentity,
    });
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    transactionServiceBinding(build_transaction);
    mockSQSGateway(put_sqs_stub);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charges_event, gLambdaContext).subscribe({
      error: done,
      next: (response: object): void => {
        expect(get(response, "details")).to.not.haveOwnProperty("kushkiInfo");
        expect(get(response, "details")).to.not.haveOwnProperty(
          "securityIdentity"
        );
        expect(build_transaction.args[0][0]).to.haveOwnProperty(
          "trxRuleResponse"
        );
        expect(build_transaction).calledWithMatch({
          ...match.any,
          tokenInfo: {
            kushkiInfo: kushki_info_data.kushkiInfo,
            securityIdentity: kushki_info_data.securityIdentity,
          },
        });
        expect(put_sqs_stub).calledWithMatch(match.any, {
          transaction: {
            kushki_info: kushki_info_data.kushkiInfo,
            security_identity: kushki_info_data.securityIdentity,
          },
        });
        done();
      },
    });
  });

  it("should not get hierarchy merchant when hierarchyConfig.processing.deferred of authorizer is empty", (done: Mocha.Done) => {
    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(gMerchantFetch))
      .onSecondCall()
      .returns(of(gMerchantFetch))
      .onCall(2)
      .returns(of(gProcessorFetch))
      .onCall(3)
      .returns(of(gBinFetch));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().returns(of(gTokenDynamo)),
        updateValues: box.stub().returns(of(true)),
      })
    );
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charges_event, gLambdaContext).subscribe({
      error: done,
      next: (_: object): void => {
        expect(gGetItemStub.args[0][1]).to.be.eql({
          public_id: charges_event.requestContext.authorizer.merchantId,
        });
        done();
      },
    });
  });

  it("charges - token is undefined", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);

    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(gMerchantFetch))
      .onSecondCall()
      .returns(of(gProcessorFetch))
      .onCall(2)
      .returns(of(gBinFetch));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().returns(of(undefined)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(chargesEventUndefined(), done);
  });

  it("charges - token is already used", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);

    const error: AWSError = {
      name: "ConditionalCheckFailedException",
      message: "fail",
      code: "error",
      time: new Date(),
    };

    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(gMerchantFetch))
      .onSecondCall()
      .returns(of(gProcessorFetch))
      .onCall(2)
      .returns(of(gBinFetch));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().throws(error),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEventUndefined(), gLambdaContext).subscribe({
      error: (errorResponse: AurusError) => {
        validateAlreadyTokenError(errorResponse, done);
      },
      next: done,
    });
  });

  it("charges - error updating token", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);

    const error = new Error("error test");

    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(gMerchantFetch))
      .onSecondCall()
      .returns(of(gProcessorFetch))
      .onCall(2)
      .returns(of(gBinFetch));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().throws(error),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEventUndefined(), gLambdaContext).subscribe({
      error: (errorResponse) => {
        expect(errorResponse.message).to.be.eq("error test");
        expect(put_sqs_stub).not.to.be.called;
        done();
      },
      next: done,
    });
  });

  it("charges - token is already used get empty", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);

    const error: AWSError = {
      name: "ConditionalCheckFailedException",
      message: "fail",
      code: "error",
      time: new Date(),
    };

    gGetItemStub = box
      .stub()
      .onFirstCall()
      .returns(of(gMerchantFetch))
      .onSecondCall()
      .returns(of(undefined))
      .onCall(2)
      .returns(of(gProcessorFetch))
      .onCall(3)
      .returns(of(gBinFetch));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: gGetItemStub,
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().onFirstCall().throws(error),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    const request_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEventUndefined();

    request_event.requestContext.authorizer.merchantId = "1234";

    service.charges(request_event, gLambdaContext).subscribe({
      error: (errorResponse: AurusError) => {
        validateAlreadyTokenError(errorResponse, done);
      },
      next: done,
    });
  });

  it("Charges - When merchant dynamo is undefined, should return error KSH004", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box.stub().onFirstCall().returns(of(undefined)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent(), gLambdaContext).subscribe({
      error: (err: KushkiError): void => {
        expect(err.getMessage()).to.be.equal(ERRORS.E004.message);
        expect(err.code).to.be.contain("004");
        done();
      },
    });
  });

  it("Charges - When initialRecurrenceReference is undefined and transactionMode = SUBSEQUENT_RECURRENCE, should return error KSH053", (done: Mocha.Done) => {
    gTokenDynamo.transactionMode = TransactionModeEnum.SUBSEQUENT_RECURRENCE;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent(), gLambdaContext).subscribe({
      error: (err: KushkiError): void => {
        expect(err.getMessage()).to.be.equal(ERRORS.E053.message);
        expect(err.code).to.be.contain("053");
        done();
      },
    });
  });

  it("Charges - When obtain token from dynamo and it has the transactionCardId field, it must be present in the input request to the method unifiedChargesOrPreAuth", (done: Mocha.Done) => {
    gTokenDynamo.transactionCardId = TRANSACTION_CARD_ID;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent(), gLambdaContext).subscribe({
      next: (data: object): void => {
        expect(data).not.to.haveOwnProperty("transactionCardId");
        done();
      },
    });
  });

  it("Charges - When transaction types us a deferred charge and a deferred options are empty, should return error KSH028", (done: Mocha.Done) => {
    gChargesRequest.months = 3;
    delete gMerchantFetch.deferredOptions;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent(), gLambdaContext).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.contain("028");
        expect(err.getMessage()).to.be.equal(ERRORS.E028.message);
        done();
      },
    });
  });

  it("charges - throw error for expired token", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 0);
    gUnifiedTrxRequest.amount.currency = "USD";
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.tokenCreated = 1232324;
    gUnifiedTrxRequest.lastFourDigits = "4783";
    gUnifiedTrxRequest.tokenId = "";

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gProcessorFetch))
          .returns(of(gMerchantFetch)),
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().returns(of(undefined)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent(), gLambdaContext).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("577");
        expect(build_transaction).to.be.calledOnce;
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  it("charges - should fail if env var IS_ACTIVE_OCT is false and event.route is oct path", (done: Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = { ...chargesEvent(), path: "/card/v1/crypto/oct" };

    process.env.IS_ACTIVE_OCT = "false";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event, gLambdaContext).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K041");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  it("charges - should fail if externalSubscription from processor is false, and externalSubscriptionID is in request", (done: Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    mock_charges_event.body.externalSubscriptionID =
      "externalSubscriptionIDTest";
    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = lambdaStubTransactionRule(box, ProcessorEnum.KUSHKI);
    lambdaServiceBinding(lambda_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event, gLambdaContext).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K555");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  it("charges - success with ksh_subscriptionValidation ", (done: Mocha.Done) => {
    const token_reponse: SinonStub = box.stub().returns(
      of({
        sessionId: "123123",
        token: "sandbox_token",
        userId: "123123123",
      })
    );

    mockProviderService(token_reponse, card_stub, CardProviderEnum.AURUS);
    delete gTokenDynamo.secureId;
    gTokenDynamo.merchantId = CHARGE_MID;
    delete gChargesRequest.secureService;
    gChargesRequest.metadata = {
      ksh_subscriptionValidation: true,
    };
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(chargesEvent(), done);
  });

  it("charges - success with Channel OTP", (done: Mocha.Done) => {
    const token_reponse: SinonStub = box.stub().returns(
      of({
        sessionId: "123123",
        token: "sandbox_token",
        userId: "123123123",
      })
    );

    mockProviderService(token_reponse, card_stub, CardProviderEnum.AURUS);
    gTokenDynamo.merchantId = CHARGE_MID;
    gChargesRequest.channel = ChannelEnum.OTP_CHANNEL;
    gChargesRequest.metadata = {
      ksh_subscriptionValidation: true,
    };
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(chargesEvent(), done);
  });

  it("charges merchant id list - success", (done: Mocha.Done) => {
    const event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    event.requestContext.authorizer.merchantId = "merchantTuenti";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(event, done);
  });

  it("charges - success deferred", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charges_event.body.months = 1;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(chargesEvent(), done);
  });

  it("charges - success deferred different merchantId", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charges_event.requestContext.authorizer.hierarchyConfig =
      JSON.stringify(hierarchy_config);
    charges_event.body.months = 1;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(charges_event, done);
  });

  it("charges - success deferred undefined merchantId", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    hierarchy_config = {
      processing: {
        businessRules: "200000000345044",
        processors: "200000000345043",
        securityRules: "200000000345045",
      },
      rootId: "3000abc0001",
    };
    charges_event.requestContext.authorizer.hierarchyConfig =
      JSON.stringify(hierarchy_config);
    charges_event.body.months = 1;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(charges_event, done);
  });

  it("charges - success deferred equal merchantId", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    hierarchy_config = {
      processing: {
        businessRules: "200000000345044",
        deferred: "2000000001291929192",
        processors: "200000000345043",
        securityRules: "200000000345045",
      },
      rootId: "3000abc0001",
    };

    charges_event.requestContext.authorizer.hierarchyConfig =
      JSON.stringify(hierarchy_config);

    charges_event.body.months = 2;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(charges_event, done);
  });

  it("charges - success deferred months", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charges_event.body.months = 0;
    set(gChargesRequest, "deferred.months", 2);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(chargesEvent(), done);
  });

  it("Should respond with a hierarchyConfig object when it is called in lambda charge ", (done: Mocha.Done) => {
    const charge_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charge_event.body.fullResponse = true;
    charge_event.requestContext.authorizer.hierarchyConfig = JSON.stringify(
      CONTEXT_HIERARCHY_CONFIG
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charge_event, gLambdaContext).subscribe({
      error: done,
      next: (): void => {
        expect(lambda_stub).to.be.calledOnce;
        expect(lambda_stub.args[0][1].body.hierarchyConfig).to.be.deep.equals(
          JSON.parse(get(charge_event, PATH_HIERARCHY_CONFIG, "{}").toString())
        );
        done();
      },
    });
  });

  it("Should decline trx when lambda charge is called with threeDomainSecure object with bad data", (done: Mocha.Done) => {
    gChargesRequest.threeDomainSecure = {
      cavv: "1234567890",
      eci: "05",
      specificationVersion: "1.0.0",
    };
    set(gTokenDynamo, "binInfo.brand", "VISA");
    const charge_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charge_event.body.fullResponse = true;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charge_event, gLambdaContext).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).contains("001");
        expect(build_transaction.args[0][0].error).to.not.be.undefined;
        expect(put_sqs_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("Should decline trx when lambda charge is called with threeDomainSecure object with data is not secure and acceptRisk as false or doesn't exists", (done: Mocha.Done) => {
    gChargesRequest.threeDomainSecure = {
      cavv: "1234567890123456789012345678",
      eci: "07",
      specificationVersion: "1.0.2",
    };

    const charge_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charge_event.body.fullResponse = true;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charge_event, gLambdaContext).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).contains("322");
        expect(err.getMetadata()).to.deep.contains({
          rules: [
            {
              code: DeclinedAuthentication3DSEnum.ERROR_CODE,
              message: DeclinedAuthentication3DSEnum.ERROR_MESSAGE,
            },
          ],
        });
        expect(build_transaction.args[0][0].error).to.not.be.undefined;
        expect(put_sqs_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("Should approve trx when lambda charge is called with threeDomainSecure object with data is not secure but acceptRisk as true", (done: Mocha.Done) => {
    gChargesRequest.threeDomainSecure = {
      acceptRisk: true,
      cavv: "1234567890123456789012345678",
      eci: "07",
      specificationVersion: "1.0.2",
    };

    const charge_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charge_event.body.fullResponse = true;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charge_event, gLambdaContext).subscribe({
      next: (): void => {
        expect(build_transaction.args[0][0].error).to.be.undefined;
        expect(put_sqs_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("Should approve trx when lambda charge is called with threeDomainSecure object with data is secure", (done: Mocha.Done) => {
    gChargesRequest.threeDomainSecure = {
      cavv: "1234567890123456789012345678",
      eci: "05",
      specificationVersion: "1.0.2",
    };

    const charge_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    charge_event.body.fullResponse = true;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charge_event, gLambdaContext).subscribe({
      next: (): void => {
        expect(put_sqs_stub).to.be.calledOnce;
        expect(build_transaction.args[0][0].error).to.be.undefined;
        done();
      },
    });
  });

  it("When submerchant sends omitCryptoCurrency, it should be sent to franchise and in the sqs payload to be saved in dynamo", (done: Mocha.Done) => {
    gChargesRequest.subMerchant = {
      address: "alpallana",
      city: "Quito",
      code: "1022",
      countryAns: "1233",
      idAffiliation: "1234",
      mcc: "5012",
      softDescriptor: "12332",
      zipCode: "593",
      omitCryptoCurrency: true,
    };

    const charge_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(charge_event, gLambdaContext).subscribe({
      next: (): void => {
        expect(put_sqs_stub).to.be.calledOnce;
        expect(put_sqs_stub.args[0][1].charge.subMerchant).to.have.ownProperty(
          "omitCryptoCurrency"
        );

        done();
      },
    });
  });

  it("charges - success subscription validation", (done: Mocha.Done) => {
    mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
    const charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    set(charges_event, "body.metadata.ksh_subscriptionValidation", true);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertCommonCharges(chargesEvent(), done);
  });

  it("preauth - success", (done: Mocha.Done) => {
    mockProviderService(
      undefined,
      undefined,
      CardProviderEnum.AURUS,
      card_stub
    );
    const requestEvent: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();
    requestEvent.body.subMerchant!.omitCryptoCurrency = true;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.preAuthorization(requestEvent, gLambdaContext).subscribe({
      error: done,
      next: (res: object): void => {
        expect(get(res, "ticketNumber")).to.be.eqls("07874520255");
        expect(get(res, "transactionReference")).to.be.eqls("84383487834");
        expect(build_transaction.args[0][0].tokenInfo.sendCvv).to.be.true;
        expect(card_stub.args[0][0].event.subMerchant.omitCryptoCurrency).to.be
          .true;
        done();
      },
    });
  });

  it("Should respond with a hierarchyConfig object when it is called in preauth", (done: Mocha.Done) => {
    const preauth_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    preauth_event.requestContext.authorizer.hierarchyConfig = JSON.stringify(
      CONTEXT_HIERARCHY_CONFIG
    );
    mockProviderService(
      undefined,
      undefined,
      CardProviderEnum.AURUS,
      card_stub
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.preAuthorization(preauth_event, gLambdaContext).subscribe({
      error: done,
      next: (): void => {
        expect(lambda_stub).to.be.calledOnce;
        expect(lambda_stub.args[0][1].body.hierarchyConfig).to.be.deep.equals(
          JSON.parse(get(preauth_event, PATH_HIERARCHY_CONFIG, "{}").toString())
        );
        done();
      },
    });
  });

  describe("CardService - Unified Charge success", () => {
    beforeEach(() => {
      mockEnvAcqVars(false);
      createSchemas();
      box = createSandbox();
      CONTAINER.snapshot();
      process.env.LAMBDA_RULE = TRX_RULE_PROCESSOR;
      rollbarInstance(box);
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      put = box.stub().returns(of(true));
      gTokenDynamo = Mock.of<TokenDynamo>({
        amount: 1112,
        binInfo: {
          bank: "Pichincha",
          bin: "123456",
          brand: "VISA",
          processor: "Credimatic",
        },
      });

      cybersource_detail = {
        acsURL: "test.com",
        authenticationTransactionId: "123",
        cavv: "1212",
        commerceIndicator: "121",
        eci: "s121da",
        paReq: "121",
        paresStatus: "1212",
        proxyPan: "1212",
        specificationVersion: 1212,
        ucafCollectionIndicator: "231",
        veresEnrolled: "1212",
        xid: "1212",
      };

      gTokenDynamo.binInfo = {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        info: {
          type: "debit",
        },
        processor: "Credimatic",
      };
      dynamoBinding(put, box);

      process.env.IVA_VALUES = `{ "USD": 0.12, "COP": 0.19, "CLP": 0.19, "UF": 0.19, "PEN": 0.18, "MXN": 0.16 }`;
      gLambdaContext = Mock.of<Context>({
        getRemainingTimeInMillis: box.stub().returns(600000),
      });

      CONTAINER.unbind(IDENTIFIERS.CardGateway);
      gChargesResponse.approvalCode = "PRUEBA";
      card_stub = box.stub().returns(of(gAurusResponse));
      CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
        Mock.of<ICardGateway>({
          chargesTransaction: card_stub,
          getAurusToken: box.stub().returns(
            of({
              token: "token",
            })
          ),
          preAuthorization: card_stub,
        })
      );
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = lambdaStubTransactionRule(box);
      lambdaServiceBindingWithAsync(lambda_stub, box.stub().returns(of(true)));
      process_stub = box.stub().returns(of(chargesCardResponse()));
      build_transaction = box.stub().returns(chargesCardResponse());
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);
      mockUnifiedChargesRequest();
      put_sqs_stub = box.stub().returns(of(true));
      mockSQSGateway(put_sqs_stub);
      mockAntifraudBindSiftFlow(box);
    });

    afterEach(() => {
      box.restore();
      CONTAINER.restore();
    });

    function commonExpectChargeSuccess(done: Mocha.Done): void {
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(lambda_stub).to.be.callCount(1);
            validateCharge(
              data,
              lambda_stub,
              card_stub,
              build_transaction,
              done
            );
          },
        });
    }

    function prepareChargeUnifiedByProcessorTest(
      done: Mocha.Done,
      transactionRuleProcessor: ProcessorEnum,
      expectedServiceCall: CardProviderEnum,
      integration: string
    ): void {
      delete gUnifiedTrxRequest.secureId;
      delete gUnifiedTrxRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              integration,
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: transactionRuleProcessor,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      CONTAINER.unbind(CORE.LambdaGateway);
      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, expectedServiceCall);
    }

    function commonExpectDeferredError(
      done: Mocha.Done,
      isBrazil?: boolean
    ): void {
      const expected_code = isBrazil ? "001" : "322";

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.code).contains(expected_code);
            done();
          },
          next: buildNextExpect(done),
        });
    }

    function assertChargeDeferredError(
      request: UnifiedChargesPreauthRequest,
      done: Done
    ) {
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.unifiedChargesOrPreAuth(request, gLambdaContext).subscribe({
        error: (err: KushkiError): void => {
          expect(err.getStatusCode()).to.be.equal(ERRORS.E322.statusCode);
          expect(lambda_stub).to.be.calledOnce;
          done();
        },
      });
    }

    function unifiedChargeTraceabilityDataExpected(
      kushkiInfoRequest: object,
      kushkiInfoExpected: object,
      securityIdentityRequest: ISecurityIdentity[],
      securityIdentityExpected: ISecurityIdentity[],
      done: Mocha.Done
    ) {
      const security_identity: ISecurityIdentity[] = [
        ...securityIdentityRequest,
      ];
      const kushki_info: IKushkiInfo = {
        manager: "API",
        managerId: "DP002",
        methodId: "KM001",
        methodName: "CARD",
        platformId: "KP001",
        platformName: "API",
        platformVersion: "0.0.1",
        ...kushkiInfoRequest,
      };

      gAurusResponse.ticket_number = "07874520255";
      set(gUnifiedTrxRequest, "tokenObject.kushkiInfo", kushki_info);
      set(
        gUnifiedTrxRequest,
        "tokenObject.securityIdentity",
        security_identity
      );

      const token_response: SinonStub = box
        .stub()
        .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));

      mockProviderService(token_response, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data: object): void => {
            const expected_data: object = {
              kushkiInfo: {
                ...kushki_info,
                ...kushkiInfoExpected,
              },
              securityIdentity: [
                ...security_identity,
                ...securityIdentityExpected,
              ],
            };

            expect(put.args[0][0]).to.deep.contains(expected_data);
            expect(build_transaction).to.be.calledWithMatch({
              tokenInfo: { ...expected_data },
            });
            expect(data).to.have.property(
              "ticketNumber",
              gAurusResponse.ticket_number
            );
            done();
          },
        });
    }

    it("unified charge card - success.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      unset(gTokenDynamo, "lastFourDigits");
      unset(gTokenDynamo, "maskedCardNumber");
      gUnifiedTrxRequest.merchant.whiteList = true;
      delete gUnifiedTrxRequest.vaultToken;

      commonExpectChargeSuccess(done);
    });

    it("unified charge card - success with transaction rule in request", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.transactionRuleResponse = {
        body: Mock.of<LambdaTransactionRuleResponse>({
          currencyCode: CurrencyEnum.USD,
          privateId: gProcessorFetch.private_id,
          processor: ProcessorEnum.VISANET,
          publicId: gProcessorFetch.public_id,
        }),
      };

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(lambda_stub).to.be.callCount(0);
            expect(data).to.have.property(
              "ticketNumber",
              gAurusResponse.ticket_number
            );
            done();
          },
        });
    });

    it("unified charge card - success with tokenless request", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.isTokenless = true;
      gUnifiedTrxRequest.convertedAmount = {
        currency: "CLP",
        iva: 512704,
        subtotalIva: 2698443,
        subtotalIva0: 0,
      };
      gUnifiedTrxRequest.convertionResponse = {
        body: { convertedCurrency: "CLP", newAmount: 3211147 },
      };

      gUnifiedTrxRequest.transactionRuleResponse = {
        body: Mock.of<LambdaTransactionRuleResponse>({
          currencyCode: CurrencyEnum.CLP,
        }),
      };

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (): void => {
            expect(lambda_stub).to.be.callCount(0);
            done();
          },
        });
    });

    it("should process a unified charge request successfully with 3ds data retrieved from the request", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        kushki: "2389293832",
      });
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.KUSHKI,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );
      CONTAINER.unbind(CORE.LambdaGateway);
      lambdaServiceBindingWithAsync(lambda_stub, box.stub().returns(of(true)));
      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.threeDomainSecure = {
        "3dsIndicator": "1.0",
        authenticationData: "hO2FyZGluYWxjb21tZXJjZWF1dGg",
        cavv: "1234567890123456789012345678901234567890",
        directoryServer: "f38e6947-5388-41a6-bca4-b49723c1a437",
        eci: "00",
        specificationVersion: "1.0.0",
        ucaf: "01",
        xid: "",
      };
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      unset(gTokenDynamo, "lastFourDigits");
      unset(gTokenDynamo, "maskedCardNumber");
      gUnifiedTrxRequest.merchant.whiteList = true;

      commonExpectChargeSuccess(done);
    });

    it("unified charge card UF - success.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.amount.currency = CurrencyEnum.UF;
      gUnifiedTrxRequest.tokenCurrency = CurrencyEnum.UF;
      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.merchant.country = CountryEnum.PANAMA;
      gUnifiedTrxRequest.provider = CardProviderEnum.TRANSBANK_WEBPAY;
      set(gUnifiedTrxRequest, BIN_INFO_PATH, "credit");
      unset(gTokenDynamo, "lastFourDigits");
      unset(gTokenDynamo, "maskedCardNumber");
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        transbank: TRANSBANK_IDS,
      });
      const lambda_conversion_mock = Mock.of<ConvertionResponse>({
        body: {
          convertedCurrency: CurrencyEnum.CLP,
          newAmount: 28000,
        },
      });
      const process_response: Transaction = chargesCardResponse();

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(of(lambda_conversion_mock))
        .onSecondCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                currencyCode: CurrencyEnum.CLP,
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.TRANSBANK,
                publicId: "7798",
                subMccCode: "2345",
              },
            })
          )
        );
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.TRANSBANK);
      process_response.processor_name = ProcessorEnum.TRANSBANK;
      process_response.converted_amount = {
        amount: {
          currency: "CLP",
          ice: 0,
          iva: 0,
          subtotalIva: 65780160,
          subtotalIva0: 0,
          totalAmount: 65780160,
        },
        currency: "CLP",
        totalAmount: 65780160,
      };
      process_stub = box.stub().returns(of(process_response));
      build_transaction = box.stub().returns(process_response);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(lambda_stub).to.be.calledTwice;
            expect(data).to.have.property(
              "ticketNumber",
              gAurusResponse.ticket_number
            );
            done();
          },
        });
    });

    it("unified charge card Deferred - error E322.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.merchant.country = CountryEnum.PANAMA;
      gUnifiedTrxRequest.deferred = {
        creditType: "01",
        graceMonths: "2",
        months: 3,
      };
      gUnifiedTrxRequest.merchant.deferredOptions = [
        {
          bank: ["test_bank_1", "test_bank_3"],
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["1", "2"],
        },
      ];
      unset(gTokenDynamo, "lastFourDigits");
      unset(gTokenDynamo, "maskedCardNumber");
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        credomatic: "5,all",
      });

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.CREDOMATIC,
                publicId: "7798",
                subMccCode: "2345",
              },
            })
          )
        );
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.CREDOMATIC);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);
      assertChargeDeferredError(gUnifiedTrxRequest, done);
    });

    it("should return error when unifiedChargesOrPreAuth is called and converted currency is different from processor currency", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.amount.currency = CurrencyEnum.UF;
      gUnifiedTrxRequest.tokenCurrency = CurrencyEnum.UF;
      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.merchant.country = CountryEnum.PANAMA;
      gUnifiedTrxRequest.provider = CardProviderEnum.TRANSBANK_WEBPAY;
      set(gUnifiedTrxRequest, BIN_INFO_PATH, "credit");
      unset(gTokenDynamo, "lastFourDigits");
      unset(gTokenDynamo, "maskedCardNumber");
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        transbank: TRANSBANK_IDS,
      });
      const lambda_conversion_mock = Mock.of<ConvertionResponse>({
        body: {
          convertedCurrency: CurrencyEnum.CLP,
          newAmount: 28000,
        },
      });
      const process_response: Transaction = chargesCardResponse();

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(of(lambda_conversion_mock))
        .onSecondCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                currencyCode: CurrencyEnum.COP,
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.TRANSBANK,
                publicId: "7798",
                subMccCode: "2345",
              },
            })
          )
        );
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.TRANSBANK);
      process_response.processor_name = ProcessorEnum.TRANSBANK;
      process_response.converted_amount = {
        amount: {
          currency: "CLP",
          ice: 0,
          iva: 0,
          subtotalIva: 65780160,
          subtotalIva0: 0,
          totalAmount: 65780160,
        },
        currency: "CLP",
        totalAmount: 65780160,
      };
      process_stub = box.stub().returns(of(process_response));
      build_transaction = box.stub().returns(process_response);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expectCurrencyError(err, done);
          },
        });
    });

    it("should return success when unifiedChargesOrPreAuth is called, currency is not converted and matches processor currency", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.amount.currency = CurrencyEnum.USD;
      gUnifiedTrxRequest.tokenCurrency = CurrencyEnum.USD;
      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.merchant.country = CountryEnum.PANAMA;
      gUnifiedTrxRequest.provider = CardProviderEnum.TRANSBANK_WEBPAY;
      set(gUnifiedTrxRequest, BIN_INFO_PATH, "credit");
      unset(gTokenDynamo, "lastFourDigits");
      unset(gTokenDynamo, "maskedCardNumber");
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        transbank: TRANSBANK_IDS,
      });
      const process_response: Transaction = chargesCardResponse();

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                currencyCode: CurrencyEnum.USD,
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.TRANSBANK,
                publicId: "7798",
                subMccCode: "2345",
              },
            })
          )
        );
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.TRANSBANK);
      process_response.processor_name = ProcessorEnum.TRANSBANK;
      process_response.converted_amount = {
        amount: {
          currency: "USD",
          ice: 0,
          iva: 0,
          subtotalIva: 65780160,
          subtotalIva0: 0,
          totalAmount: 65780160,
        },
        currency: "USD",
        totalAmount: 65780160,
      };
      process_stub = box.stub().returns(of(process_response));
      build_transaction = box.stub().returns(process_response);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).to.have.property(
              "ticketNumber",
              gAurusResponse.ticket_number
            );
            expect(lambda_stub).to.be.calledOnce;
            done();
          },
        });
    });

    it("unified charge card Deferred - no error.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.merchant.country = CountryEnum.PANAMA;
      gUnifiedTrxRequest.deferred = {
        creditType: "01",
        graceMonths: "2",
        months: 2,
      };
      gUnifiedTrxRequest.merchant.deferredOptions = [
        {
          bank: ["test_bank_1", "test_bank_3"],
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["1", "2"],
        },
      ];
      unset(gTokenDynamo, "lastFourDigits");
      unset(gTokenDynamo, "maskedCardNumber");
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        credomatic: "5,all",
      });

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                currencyCode: CurrencyEnum.USD,
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.CREDOMATIC,
                publicId: "7798",
                subMccCode: "2345",
              },
            })
          )
        );
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.CREDOMATIC);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data: object): void => {
            expect(lambda_stub).to.be.calledOnce;
            expect(data).to.have.property(
              "ticketNumber",
              gAurusResponse.ticket_number
            );
            done();
          },
        });
    });

    it("unified charge card Deferred no months grace - error E322.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.merchant.country = CountryEnum.PANAMA;
      gTokenDynamo.merchantId = CHARGE_MID;
      gChargesRequest.deferred = {
        creditType: "",
        graceMonths: "3",
        months: 2,
      };
      gUnifiedTrxRequest.merchant.deferredOptions = [
        {
          bank: ["test_bank_1", "test_bank_3"],
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["8", "7"],
        },
      ];

      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        credomatic: "5480,all",
      });

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.CREDOMATIC,
                publicId: "77898",
                subMccCode: "29345",
              },
            })
          )
        );
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.CREDOMATIC);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);
      assertChargeDeferredError(gUnifiedTrxRequest, done);
    });

    it("unified charge card Deferred - no deferred options", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.merchant.country = CountryEnum.PANAMA;

      gUnifiedTrxRequest.merchant.deferredOptions = [];
      unset(gTokenDynamo, "lastFourDigits");
      unset(gTokenDynamo, "maskedCardNumber");
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        credomatic: "5656,7798,5480,all",
      });

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.CREDOMATIC,
                publicId: "7798",
                subMccCode: "2345",
              },
            })
          )
        );
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.CREDOMATIC);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);
      assertChargeDeferredError(gUnifiedTrxRequest, done);
    });

    it("unified charge subscription - success.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.isSubscriptionCharge = true;
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      gUnifiedTrxRequest.merchant.whiteList = true;
      delete gUnifiedTrxRequest.vaultToken;

      commonExpectChargeSuccess(done);
    });

    it("should return error K017 when unified charge subscription transaction has expired card and save trx", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.isSubscriptionCharge = true;
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      gUnifiedTrxRequest.merchant.whiteList = true;
      gUnifiedTrxRequest.expiryYear = "10";
      const token_reponse_stub: SinonStub = box
        .stub()
        .returns(of({ token: "4334zsaasas" }));

      mockProviderService(
        token_reponse_stub,
        card_stub,
        CardProviderEnum.AURUS
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.code).to.be.eql("K017");
            expect(put_sqs_stub).to.have.been.calledOnce;
            done();
          },
        });
    });

    it("unified charge subscription plcc flag 1 metadata - success.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.isSubscriptionCharge = true;
      gUnifiedTrxRequest.plccMetadataId = "12333";
      gUnifiedTrxRequest.subMetadataId = "";
      gUnifiedTrxRequest.cvv = undefined;
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      set(gUnifiedTrxRequest, "binInfo.bin", "EC");
      delete gUnifiedTrxRequest.vaultToken;

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                currencyCode: CurrencyEnum.USD,
                plcc: "1",
                privateId: gProcessorFetch.private_id,
                processor: gProcessorFetch.processor_name,
                publicId: gProcessorFetch.public_id,
                subMccCode: "2345",
              },
            })
          )
        )
        .onSecondCall()
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              bin: "EC",
            })
          )
        )
        .onThirdCall()
        .returns(
          of(
            Mock.of<{ body: { plcc: boolean } }>({
              body: {
                plcc: true,
              },
            })
          )
        );
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).to.have.property(
              "ticketNumber",
              gAurusResponse.ticket_number
            );
            expect(lambda_stub).to.be.calledTwice;
            done();
          },
        });
    });

    it("unified charge subscription with expired subs.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.isSubscriptionCharge = true;
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      gUnifiedTrxRequest.merchant.whiteList = true;
      gUnifiedTrxRequest.expiryYear = "10";

      box = createSandbox();
      put = box
        .stub()
        .onFirstCall()
        .returns(of(true))
        .onSecondCall()
        .throws("error");

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      dynamoBinding(put, box);
      const token_reponse_stub: SinonStub = box
        .stub()
        .returns(of({ token: "4334zsaasas" }));

      mockProviderService(
        token_reponse_stub,
        card_stub,
        CardProviderEnum.AURUS
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error).not.to.be.null;
            done();
          },
        });
    });

    it("unified subscription on demand with expired sub.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.isSubscriptionCharge = true;
      gUnifiedTrxRequest.merchant.whiteList = true;
      gUnifiedTrxRequest.expiryYear = "10";
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      gUnifiedTrxRequest.subscriptionTrigger =
        SubscriptionTriggerEnum.ON_DEMAND;
      gUnifiedTrxRequest.authorizerContext.hierarchyConfig = "{}";
      gUnifiedTrxRequest.isDeferred = true;

      box = createSandbox();
      put = box
        .stub()
        .onFirstCall()
        .returns(of(true))
        .onSecondCall()
        .throws("error");

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      dynamoBinding(put, box);
      const token_reponse_stub: SinonStub = box
        .stub()
        .returns(of({ token: "4334zsaasas" }));

      mockProviderService(
        token_reponse_stub,
        card_stub,
        CardProviderEnum.AURUS
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error).not.to.be.null;
            done();
          },
        });
    });

    it("unified charge subscription plcc flag 0 metadata - success.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.isSubscriptionCharge = true;
      delete gUnifiedTrxRequest.plccMetadataId;
      delete gUnifiedTrxRequest.subMetadataId;
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      delete gUnifiedTrxRequest.vaultToken;

      lambda_stub = box
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                currencyCode: CurrencyEnum.USD,
                plcc: "1",
                privateId: gProcessorFetch.private_id,
                processor: gProcessorFetch.processor_name,
                publicId: gProcessorFetch.public_id,
                subMccCode: "2345",
              },
            })
          )
        )
        .onSecondCall()
        .returns(
          of(
            Mock.of<DynamoBinFetch>({
              bin: "COL",
            })
          )
        )
        .onThirdCall()
        .returns(
          of(
            Mock.of<{ body: { plcc: boolean } }>({
              body: {
                plcc: false,
              },
            })
          )
        );

      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(lambda_stub).to.be.calledTwice;
            expect(data).to.not.be.equal(undefined);
            done();
          },
        });
    });

    it("unified charge commission - success.", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.isSubscriptionCharge = true;
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.COMMISSION;
      gUnifiedTrxRequest.merchant.commission = {
        commission: {
          deferred: 0,
          fixAmount: 11,
          iva: 0,
          merchantId: CHARGE_MID,
          merchantName: "merchant test",
          variableAmount: 11,
        },
        country: "",
        enable: true,
        merchantName: "merchant test",
        publicId: "string",
        sandboxEnable: false,
      };

      const token_reponse: SinonStub = box
        .stub()
        .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));

      mockProviderService(token_reponse, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data: object): void => {
            expect(data).to.have.property(
              "ticketNumber",
              gAurusResponse.ticket_number
            );
            done();
          },
        });
    });

    it("should set merchantData transaction rule processor request when it is a subscription and merchantData of authorizerContext is string", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.isSubscriptionCharge = true;
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.COMMISSION;
      set(
        gUnifiedTrxRequest,
        "authorizerContext.merchantData",
        `{"mcc":"5933","merchantCategory":"Medium"}`
      );
      gUnifiedTrxRequest.merchant.commission = {
        commission: {
          deferred: 0,
          fixAmount: 11,
          iva: 0,
          merchantId: CHARGE_MID,
          merchantName: "merchant mb",
          variableAmount: 11,
        },
        country: "",
        enable: true,
        merchantName: "merchant mb",
        publicId: "string",
        sandboxEnable: false,
      };

      const token_reponse: SinonStub = box
        .stub()
        .returns(of({ token: "cxvxcvhjkshjkdashdaksdhakjsdasda" }));

      mockProviderService(token_reponse, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data: object): void => {
            expect(get(data, "ticketNumber", "")).not.to.be.empty;
            done();
          },
        });
    });

    it("should set traceability data in new token when is a subscription trx", (done: Mocha.Done) => {
      const security_identity: ISecurityIdentity[] = [
        {
          identityCategory: IdentityCategoryEnum.TOKEN,
          identityCode: IdentityCodeEnum.SI002,
          info: { status: "APPROVAL" },
          partnerName: PartnerNameEnum.AURUS,
        },
      ];
      const kushki_info: object = {
        origin: OriginValuesEnum.SUBSCRIPTION,
        originId: OriginIdEnum.OG002,
      };

      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;

      unifiedChargeTraceabilityDataExpected(
        {},
        kushki_info,
        [],
        security_identity,
        done
      );
    });

    it("should set traceability data in new token when is a subscription validation trx", (done: Mocha.Done) => {
      const security_identity: ISecurityIdentity[] = [
        {
          identityCategory: IdentityCategoryEnum.TOKEN,
          identityCode: IdentityCodeEnum.SI002,
          partnerName: PartnerNameEnum.AURUS,
        },
      ];
      const kushki_info: object = {
        origin: OriginValuesEnum.SUBSCRIPTION_VALIDATION,
        originId: OriginIdEnum.OG003,
      };

      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.metadata = {
        ksh_subscriptionValidation: true,
      };

      unifiedChargeTraceabilityDataExpected(
        {},
        kushki_info,
        security_identity,
        [],
        done
      );
    });

    it("should set traceability data in new token when is an otp trx", (done: Mocha.Done) => {
      const security_identity: ISecurityIdentity[] = [
        {
          identityCategory: IdentityCategoryEnum.TOKEN,
          identityCode: IdentityCodeEnum.SI002,
          partnerName: PartnerNameEnum.AURUS,
        },
      ];
      const kushki_info: object = {
        origin: OriginValuesEnum.OTP,
        originId: OriginIdEnum.OG001,
      };

      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.TRX_RULE;

      unifiedChargeTraceabilityDataExpected(
        {},
        kushki_info,
        security_identity,
        [],
        done
      );
    });

    it("should set traceability data in new token and not add origin in kushkiInfo when this data is in the request", (done: Mocha.Done) => {
      const kushki_info: object = {
        origin: OriginValuesEnum.OTP,
        originId: OriginIdEnum.OG001,
      };
      const security_identity: ISecurityIdentity[] = [
        {
          identityCategory: IdentityCategoryEnum.TOKEN,
          identityCode: IdentityCodeEnum.SI001,
          partnerName: PartnerNameEnum.KUSHKI,
        },
      ];

      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.TRX_RULE;
      unifiedChargeTraceabilityDataExpected(
        kushki_info,
        {},
        security_identity,
        [],
        done
      );
    });

    it("should set traceability data in new token and not add origin in kushkiInfo when request from commission", (done: Mocha.Done) => {
      const security_identity: ISecurityIdentity[] = [
        {
          identityCategory: IdentityCategoryEnum.TOKEN,
          identityCode: IdentityCodeEnum.SI002,
          info: { status: "APPROVAL" },
          partnerName: PartnerNameEnum.AURUS,
        },
      ];

      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.usrvOrigin = UsrvOriginEnum.COMMISSION;
      unifiedChargeTraceabilityDataExpected(
        {},
        {},
        [],
        security_identity,
        done
      );
    });

    it("unified charge - gets a timeout when save charges", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;

      process.env.EXTERNAL_TIMEOUT = "10";

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: box.stub().returns(of(true).pipe(delay(11))),
          queryReservedWord: box.stub().onFirstCall().returns(of([])),
        })
      );

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      const wrapper_error: KushkiError = new KushkiError(
        ERRORS.E027,
        ERRORS.E027.message,
        {
          processor_code: "000",
          processor_text: "Timeout error",
        }
      );

      put_sqs_stub.returns(throwError(wrapper_error));

      mockSQSGateway(put_sqs_stub);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            checkTimeoutError(err, done);
          },
        });

      process.env.EXTERNAL_TIMEOUT = undefined;
    });

    it("it should store the code and message when the successful response of the transaction-rule in unifiedCharge", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();

      const code_k327: string = "K327";
      const message_charge: string = "some message in charge";

      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(gMerchantFetch))
            .onSecondCall()
            .returns(of(gTokenDynamo))
            .onThirdCall()
            .returns(of(gProcessorFetch))
            .returns(of(gMerchantFetch)),
          put: box.stub().returns(of(true)),
          queryReservedWord: box.stub().onFirstCall().returns(of([])),
        })
      );

      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              metadata: {
                rules: [
                  {
                    code: code_k327,
                    message: message_charge,
                  },
                ],
              },
            },
          })
        )
      );
      CONTAINER.unbind(CORE.LambdaGateway);
      lambdaServiceBinding(lambda_stub);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      CONTAINER.bind<ITransactionService>(IDENTIFIERS.TransactionService).to(
        TransactionService
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data): void => {
            expect(data);
            done();
          },
        });

      process.env.EXTERNAL_TIMEOUT = undefined;
    });

    it("unified charge - success | siftscience fields", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            validateCharge(
              data,
              lambda_stub,
              card_stub,
              build_transaction,
              done,
              undefined,
              true
            );
          },
        });
    });

    describe("CardService - reAuthorization", () => {
      it("Should respond with a hierarchyConfig object when it is called in reauth", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;
        process.env.USRV_STAGE = EnvironmentEnum.QA;
        gReauthorizationRequest.amount = {
          currency: "USD",
          extraTaxes: {
            airportTax: 12,
            iac: 1,
            ice: 1,
            tip: 1,
            travelAgency: 1,
          },
          iva: 1,
          subtotalIva: 1,
          subtotalIva0: 1,
        };
        gAurusResponse.response_code = "200";
        gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
        gTransaction.processor_merchant_id = "666";
        gTransaction.currency_code = CurrencyEnum.USD;

        mockReauthService();
        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );
        const reauth_event: IAPIGatewayEvent<
          ReauthorizationRequest,
          null,
          null,
          AuthorizerContext
        > = reauthEvent();

        reauth_event.requestContext.authorizer.hierarchyConfig = JSON.stringify(
          CONTEXT_HIERARCHY_CONFIG
        );
        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauth_event, gLambdaContext).subscribe({
          next: (): void => {
            expect(lambda_stub).to.be.calledOnce;
            expect(
              lambda_stub.args[0][1].body.hierarchyConfig
            ).to.be.deep.equals(
              JSON.parse(get(reauth_event, PATH_HIERARCHY_CONFIG, "{}"))
            );
            done();
          },
        });
      });

      it("Success reAuthorization - when processor is kushki and response is fullresponse and hierarchyConfig null", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;

        gReauthorizationRequest.amount = {
          currency: "USD",
          extraTaxes: {
            airportTax: 12,
            iac: 1,
            ice: 1,
            tip: 1,
            travelAgency: 1,
          },
          iva: 1,
          subtotalIva: 1,
          subtotalIva0: 1,
        };
        gAurusResponse.response_code = "200";
        gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
        gTransaction.processor_merchant_id = "666";
        gTransaction.currency_code = CurrencyEnum.USD;
        gTransaction.sequence_created = 1619530504;
        gTransaction.accumulated_amount = 20;

        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );
        mockReauthService();
        const reauth_event: IAPIGatewayEvent<
          ReauthorizationRequest,
          null,
          null,
          AuthorizerContext
        > = reauthEvent("v1");

        set(reauth_event, "requestContext.authorizer.hierarchyConfig", null);

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauth_event, gLambdaContext).subscribe({
          next: (data: object): void => {
            expect(data).to.have.property("ticketNumber");
            expect(
              lambda_stub.args[0][1].body.hierarchyConfig
            ).to.be.deep.equals({});
            done();
          },
        });
      });

      it("Success reAuthorization - when processor is kushki and merchant doesnt exist", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;
        process.env.USRV_STAGE = "primary";

        gReauthorizationRequest.amount = {
          currency: "USD",
          extraTaxes: {
            airportTax: 12,
            iac: 1,
            ice: 1,
            tip: 1,
            travelAgency: 1,
          },
          iva: 1,
          subtotalIva: 1,
          subtotalIva0: 1,
        };
        gAurusResponse.response_code = "200";
        gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
        gTransaction.processor_merchant_id = "666";
        gTransaction.currency_code = CurrencyEnum.USD;

        mockReauthService();
        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent("v1"), gLambdaContext).subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).to.have.property("ticketNumber");
            expect(data).to.have.property("details");
            done();
          },
        });
      });

      it("Success reAuthorization - when processor is kushki and response is not fullresponse", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;

        gReauthorizationRequest.amount = {
          currency: "USD",
          extraTaxes: {
            airportTax: 12,
            iac: 1,
            ice: 1,
            tip: 1,
            travelAgency: 1,
          },
          iva: 1,
          subtotalIva: 1,
          subtotalIva0: 1,
        };
        gAurusResponse.response_code = "000";
        gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
        gTransaction.processor_merchant_id = "666";
        gTransaction.currency_code = CurrencyEnum.USD;

        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );
        mockReauthService();

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent("v2"), gLambdaContext).subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).to.have.property("ticketNumber");
            done();
          },
        });
      });

      it("Success reAuthorization - when processor is kushki and response is other", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;

        gAurusResponse.response_code = "200";
        gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
        gTransaction.processor_merchant_id = "666";
        gTransaction.currency_code = CurrencyEnum.PEN;

        gReauthorizationRequest.amount = {
          currency: "PEN",
          extraTaxes: {
            airportTax: 10,
            iac: 0,
            ice: 0,
            tip: 0,
            travelAgency: 0,
          },
          iva: 0,
          subtotalIva: 10,
          subtotalIva0: 10,
        };

        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );
        mockReauthService();

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service
          .reAuthorization(reauthEvent("other"), gLambdaContext)
          .subscribe({
            error: done,
            next: (data: object): void => {
              expect(data).to.have.property("ticketNumber");
              done();
            },
          });
      });

      it("reAuthorization - E041 error getOriginalTransaction with transaction unavailable", (done: Mocha.Done) => {
        gTransaction.available = false;
        CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
        CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
          Mock.of<IDynamoGateway>({
            query: box
              .stub()
              .onFirstCall()
              .returns(of([gTransaction]))
              .onSecondCall()
              .returns(of([])),
          })
        );
        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent("none"), gLambdaContext).subscribe({
          error: (err: KushkiError): void => {
            expect(err.getMessage()).to.be.equal(ERRORS.E041.message);
            done();
          },
        });
      });

      it("reAuthorization - E004 error getOriginalTransaction return undefined", (done: Mocha.Done) => {
        CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
        CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
          Mock.of<IDynamoGateway>({
            query: box
              .stub()
              .onFirstCall()
              .returns(of([]))
              .onSecondCall()
              .returns(of([])),
          })
        );
        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent("none"), gLambdaContext).subscribe({
          error: (err: KushkiError): void => {
            expect(err.getMessage()).to.be.equal(ERRORS.E004.message);
            done();
          },
        });
      });

      it("reAuthorization - E041 error getOriginalTransaction in type", (done: Mocha.Done) => {
        gTransaction.transaction_type = TransactionTypeEnum.VOID;
        CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
        CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
          Mock.of<IDynamoGateway>({
            query: box
              .stub()
              .onFirstCall()
              .returns(of([gTransaction]))
              .onSecondCall()
              .returns(of([])),
          })
        );
        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent(), gLambdaContext).subscribe({
          error: (err: KushkiError): void => {
            expect(err.getMessage()).to.be.equal(ERRORS.E041.message);
            done();
          },
        });
      });

      it("reAuthorization - E041 error processor not kushki", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;

        gTransaction.processor_merchant_id = "666";
        gProcessorFetch.processor_name = ProcessorEnum.PROSA;
        gTransaction.processor_name = ProcessorEnum.PROSA;
        gTransaction.transaction_type = TransactionTypeEnum.REAUTH;

        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );

        CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
        CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
          Mock.of<IDynamoGateway>({
            query: box
              .stub()
              .onFirstCall()
              .returns(of([gTransaction]))
              .onSecondCall()
              .returns(of([])),
          })
        );

        CONTAINER.unbind(CORE.LambdaGateway);
        CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
          Mock.of<ILambdaGateway>({
            invokeFunction: box.stub().returns(
              of(
                Mock.of<{ body: LambdaTransactionRuleResponse }>({
                  body: {
                    privateId: gProcessorFetch.private_id,
                    processor: ProcessorEnum.PROSA,
                    publicId: gProcessorFetch.public_id,
                  },
                })
              )
            ),
          })
        );

        gReauthorizationRequest.amount = {
          currency: CurrencyEnum.COP,
          extraTaxes: {
            airportTax: 12,
            iac: 1,
            ice: 1,
            tip: 1,
            travelAgency: 1,
          },
          iva: 1,
          subtotalIva: 1,
          subtotalIva0: 1,
        };

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent("v2"), gLambdaContext).subscribe({
          error: (err: KushkiError): void => {
            expect(err.getMessage()).to.be.equal(ERRORS.E041.message);
            done();
          },
        });
      });

      it("reAuthorization - when processor is Kushki and throw a KushkiError should return catch and save processor code and message", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;

        gReauthorizationRequest.amount = {
          currency: CurrencyEnum.COP,
          extraTaxes: {
            airportTax: 12,
            iac: 1,
            ice: 1,
            tip: 1,
            travelAgency: 1,
          },
          iva: 1,
          subtotalIva: 1,
          subtotalIva0: 1,
        };
        gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
        gTransaction.processor_merchant_id = "666";

        const wrapper_error: KushkiError = new KushkiError(
          ERRORS.E500,
          ERRORS.E500.message,
          {
            processor_code: "201",
            processor_text: "Error en el procesador",
          }
        );

        card_stub = box.stub().returns(throwError(wrapper_error));
        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );

        mockReauthService();

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent("v1"), gLambdaContext).subscribe({
          error: (error: AurusError): void => {
            expect(error).to.be.not.null;
            done();
          },
        });
      });

      it("reAuthorization - when processor is Kushki and throw a KushkiError should return catch and save processor code and message test with 505 error", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;

        gReauthorizationRequest.amount = {
          currency: CurrencyEnum.COP,
          extraTaxes: {
            airportTax: 12,
            iac: 1,
            ice: 1,
            tip: 1,
            travelAgency: 1,
          },
          iva: 1,
          subtotalIva: 1,
          subtotalIva0: 1,
        };
        gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.processor_name = ProcessorEnum.KUSHKI;
        gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
        gTransaction.processor_merchant_id = "666";
        gTransaction.transaction_status = TransactionStatusEnum.APPROVAL;
        gTransaction.response_code = "999";
        gTransaction.response_text = "TEST";

        const wrapper_error: KushkiError = new KushkiError(
          ERRORS_ACQ.E505,
          ERRORS_ACQ.E505.message,
          {
            restricted: true,
            response_text: "My response text",
            processor_code: "123",
            response_code: "228",
            messageFields: {
              f38: "5555",
            },
          }
        );

        card_stub = box.stub().returns(throwError(wrapper_error));
        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );

        mockReauthService();

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent("v1"), gLambdaContext).subscribe({
          error: (error: AurusError): void => {
            expect(error).to.be.not.null;
            done();
          },
        });
      });

      it("reAuthorization - when processor Niubiz and throw a Error should catch and return the error.", (done: Mocha.Done) => {
        delete gTokenDynamo.secureId;
        gTokenDynamo.merchantId = CHARGE_MID;
        delete gChargesRequest.secureService;

        gReauthorizationRequest.amount = {
          currency: CurrencyEnum.COP,
          extraTaxes: {
            airportTax: 12,
            iac: 1,
            ice: 1,
            tip: 1,
            travelAgency: 1,
          },
          iva: 1,
          subtotalIva: 1,
          subtotalIva0: 1,
        };
        gProcessorFetch.processor_name = ProcessorEnum.NIUBIZ;
        gTransaction.processor_name = ProcessorEnum.NIUBIZ;
        gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
        gTransaction.processor_merchant_id = "666";

        const message_error: string = "e.getMetadata is not a function";
        const wrapper_error: Error = new Error(message_error);

        card_stub = box.stub().returns(throwError(wrapper_error));
        mockProviderService(
          undefined,
          card_stub,
          CardProviderEnum.KUSHKI,
          card_stub
        );

        mockReauthService();

        service = CONTAINER.get(IDENTIFIERS.CardService);
        service.reAuthorization(reauthEvent("v1"), gLambdaContext).subscribe({
          error: (err: Error): void => {
            expect(err.message).to.be.equal(message_error);
            done();
          },
        });
      });
    });

    it("reAuthorization - should throw E042 error when currency is not valid", (done: Mocha.Done) => {
      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      delete gChargesRequest.secureService;

      gReauthorizationRequest.amount = {
        currency: "USD",
        extraTaxes: {
          airportTax: 12,
          iac: 1,
          ice: 1,
          tip: 1,
          travelAgency: 1,
        },
        iva: 1,
        subtotalIva: 1,
        subtotalIva0: 1,
      };
      gTransaction.processor_merchant_id = "666";
      gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
      gTransaction.processor_name = ProcessorEnum.KUSHKI;
      gTransaction.transaction_type = TransactionTypeEnum.REAUTH;
      gTransaction.currency_code = CurrencyEnum.MXN;

      mockProviderService(
        undefined,
        card_stub,
        CardProviderEnum.KUSHKI,
        card_stub
      );

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([])),
        })
      );

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of(
              Mock.of<{ body: LambdaTransactionRuleResponse }>({
                body: {
                  privateId: gProcessorFetch.private_id,
                  processor: ProcessorEnum.KUSHKI,
                  publicId: gProcessorFetch.public_id,
                },
              })
            )
          ),
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.reAuthorization(reauthEvent("v2"), gLambdaContext).subscribe({
        error: (err: KushkiError): void => {
          expect(err.getMessage()).to.be.equal(ERRORS.E042.message);
          done();
        },
      });
    });

    it("unified charge for Claro merchants don't block with amount more than threshold- success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      process.env.CLARO_EC_MERCHANTS =
        "10123114675870618479151614455398,20000000106533736000";
      gMerchantFetch.public_id = "10123114675870618479151614455398";
      gTokenDynamo.amount = 1084;
      gChargesRequest.amount = {
        extraTaxes: {
          agenciaDeViaje: 12,
          iac: 10,
          propina: 20,
          tasaAeroportuaria: 10,
        },
        ice: 2,
        iva: 10,
        subtotalIva: 20,
        subtotalIva0: 1000.08,
      };
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      gTokenDynamo.merchantId = CHARGE_MID;
      commonExpect(done);
    });

    it("unified charge - thrown 026 error if is credibanco error", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gAurusResponse.transaction_details.approvalCode = "000000";
      gAurusResponse.transaction_details.processorName =
        ProcessorEnum.CREDIBANCO;
      gAurusResponse.approved_amount = "0.00";
      gTokenDynamo.merchantId = CHARGE_MID;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.code).contains("026");
            done();
          },
        });
    });

    it("should decline trx when unifiedChargesOrPreAuth is called with threeDomainSecure object with MC bad data", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      set(gUnifiedTrxRequest, "threeDomainSecure", {
        ucaf: "123",
      });
      set(
        gUnifiedTrxRequest,
        "tokenObject.binInfo.brand",
        CardBrandEnum.MASTERCARD
      );
      delete gUnifiedTrxRequest.secureId;
      delete gUnifiedTrxRequest.secureService;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.code).contains("001");
            expect(put_sqs_stub).to.be.calledOnce;
            expect(build_transaction.args[0][0].error).to.not.be.undefined;
            done();
          },
        });
    });

    it("should approve trx when unifiedChargesOrPreAuth is called with threeDomainSecure object with MC secure data", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      set(gUnifiedTrxRequest, "threeDomainSecure", {
        collectionIndicator: "0",
        eci: "01",
        specificationVersion: "1.0.2",
        ucaf: "1234456",
      });
      set(
        gUnifiedTrxRequest,
        "tokenObject.binInfo.brand",
        CardBrandEnum.MASTERCARD
      );
      delete gUnifiedTrxRequest.secureId;
      delete gUnifiedTrxRequest.secureService;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (): void => {
            expect(put_sqs_stub).to.be.calledOnce;
            expect(build_transaction.args[0][0]).to.deep.contains({
              error: undefined,
            });
            done();
          },
        });
    });

    it("unified charge - success with deferredOptions ", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gChargesRequest.secureService;
      gUnifiedTrxRequest.merchant.country = CountryEnum.COLOMBIA;
      gUnifiedTrxRequest.transactionType = TransactionRuleTypeEnum.DEFERRED;
      gChargesRequest.deferred = {
        creditType: "",
        graceMonths: "",
        months: 3,
      };
      gAurusResponse.ticket_number = "07874520255";
      gTokenDynamo.merchantId = CHARGE_MID;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      commonExpect(done);
    });

    it("unified charge - success with deferredOptions for Chile ", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      assertCountriesAlwaysDeferred("Chile", done);
    });

    it("unified charge - success with deferredOptions for Colombia ", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      assertCountriesAlwaysDeferred("Colombia", done);
    });

    it("unified charge with visanet processor - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();

      gTokenDynamo.amount = 1112;
      gTokenDynamo.bin = "123456";
      gTokenDynamo.ip = "1.1.1.1";
      gTokenDynamo.lastFourDigits = "1234";
      gTokenDynamo.maskedCardNumber = "123456XXXXXX1234";
      gTokenDynamo.binInfo = {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        info: {
          type: "credit",
        },
        processor: "Credimatic",
      };
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";

      const put_spy: SinonSpy = box.spy();
      const put_stub: SinonStub = box
        .stub()
        .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

      gProcessorFetch.processor_code = "00002";
      gProcessorFetch.processor_name = ProcessorEnum.VISANET;

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
          queryReservedWord: box.stub().returns(of([])),
        })
      );

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).haveOwnProperty("ticketNumber");
            expect(data).not.to.haveOwnProperty("processor_merchant_id");
            expect(data).not.to.haveOwnProperty("processorMerchantId");
            expect(data).not.to.haveOwnProperty(
              "details.processor_merchant_id"
            );
            expect(data).not.to.haveOwnProperty("details.processorMerchantId");
            done();
          },
        });
    });

    it("Should response a hierarchyConfig object when it is called in unifiedChargesPreauth", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();

      gTokenDynamo.amount = 1112;
      gTokenDynamo.bin = "123456";
      gTokenDynamo.ip = "1.1.1.1";
      gTokenDynamo.lastFourDigits = "1234";
      gTokenDynamo.maskedCardNumber = "123456XXXXXX1234";
      gTokenDynamo.binInfo = {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        info: {
          type: "credit",
        },
        processor: "Credimatic",
      };
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";

      const put_spy: SinonSpy = box.spy();
      const put_stub: SinonStub = box
        .stub()
        .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

      gProcessorFetch.processor_code = "00002";
      gProcessorFetch.processor_name = ProcessorEnum.VISANET;

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: box
            .stub()
            .onFirstCall()
            .returns(of(gMerchantFetch))
            .onSecondCall()
            .returns(of(gTokenDynamo))
            .onThirdCall()
            .returns(of(gProcessorFetch))
            .returns(of(gMerchantFetch)),
          put: put_stub,
          queryReservedWord: box.stub().returns(of([])),
        })
      );
      gUnifiedTrxRequest.authorizerContext.hierarchyConfig =
        CONTEXT_HIERARCHY_CONFIG;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (): void => {
            expect(lambda_stub).to.be.calledOnce;
            expect(
              lambda_stub.args[0][1].body.hierarchyConfig
            ).to.be.deep.equals(
              get(gUnifiedTrxRequest, "authorizerContext.hierarchyConfig", {})
            );
            done();
          },
        });
    });

    it("unified charge with token created with more than 30 min should throw error 577", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.tokenCreated = 123123;
      gUnifiedTrxRequest.isDeferred = true;
      const put_spy: SinonSpy = box.spy();
      const put_stub: SinonStub = box
        .stub()
        .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
          queryReservedWord: box.stub().returns(of([])),
        })
      );

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.code).contains("577");
            done();
          },
        });
    });

    it("unified charge with token created with more than 30 min should throw error 577 with deferred true", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.tokenCreated = 123123;
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: box
            .stub()
            .callsFake(() => of(1).pipe(map(box.spy()), mapTo(true))),
          queryReservedWord: box.stub().returns(of([])),
        })
      );

      gChargesRequest.months = 2;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.code).contains("577");
            done();
          },
        });
    });

    it("when unified charge is called, it will send a SNS with the transaction and a contactDetails object", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      const contact_details_test: object = {
        documentNumber: "123",
        documentType: "CC",
        email: "email",
        firstName: "name",
        phoneNumber: "123",
        secondLastName: "slntest",
      };

      process.env.SNS_INVOICE = "snsInvoice";
      gUnifiedTrxRequest.contactDetails = contact_details_test;
      gTokenDynamo.merchantId = CHARGE_MID;

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (): void => {
            expect(lambda_stub).to.be.calledWith(
              match.any,
              match.has(
                "body",
                match.has(
                  "detail",
                  match.has("customer", match.has("secondLastName", "slntest"))
                )
              )
            );
            done();
          },
        });
    });

    it("unified charge in sandbox - success ", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      process.env.USRV_STAGE = "uat";
      process.env.IVA_EC = "0";
      process.env.IVA_CO = "0";
      process.env.IVA_PE = "0";

      CONTAINER.unbind(IDENTIFIERS.CardGateway);
      CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
        Mock.of<ICardGateway>({
          buildAurusAmount: box.stub().returns(
            of({
              IVA: 0.19,
              Subtotal_IVA: 1.1,
              Subtotal_IVA0: 2.2,
              Total_amount: 3.4,
            })
          ),
        })
      );

      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      set(gUnifiedTrxRequest, "merchant.sandboxEnable", true);

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put,
          queryReservedWord: box.stub().returns(of([])),
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.SANDBOX);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).to.have.property(
              "ticketNumber",
              gAurusResponse.ticket_number
            );
            expect(lambda_stub).to.be.called;
            done();
          },
        });
    });

    it("unified charge prosa with mccCode - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      const invoke_lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: "Prosa Processor",
              publicId: gProcessorFetch.public_id,
              subMccCode: "2345",
            },
          })
        )
      );
      const trx: Transaction = chargesCardResponse();

      trx.mccCode = "2345";
      const build_transaction_mcc = box.stub().returns(trx);

      gUnifiedTrxRequest.fullResponse = "v2";
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction_mcc);

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: invoke_lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.PROSA);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(get(data, "details")).to.not.have.ownProperty("mccCode");
            const request: ProcessRecordRequest =
              build_transaction_mcc.args[0][0];

            expect(request.processor?.sub_mcc_code).to.be.equal("2345");
            validateCharge(
              data,
              invoke_lambda_stub,
              card_stub,
              build_transaction_mcc,
              done
            );
          },
        });
    });

    it("should call unified charge and invoke trx rule with 'transactionCreated' value", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      gTokenDynamo.created = new Date().getTime();
      gAurusResponse.ticket_number = "07874520255";

      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (_data: object): void => {
            expect(lambda_stub.args[0][1].body.detail).haveOwnProperty(
              "transactionCreated"
            );
            done();
          },
        });
    });

    it("unified charge - throw error 205 when currencyToken is not equal to currencyRequest", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gUnifiedTrxRequest.amount.currency = "NIO";
      gTokenDynamo.merchantId = CHARGE_MID;
      gTokenDynamo.currency = "USD";
      gAurusResponse.ticket_number = "07874520255";
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: "NIO",
              privateId: gProcessorFetch.private_id,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.code).contains("205");
            expect(build_transaction).to.have.been.calledOnce;
            done();
          },
        });
    });

    it("unified charge redeban - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gAurusResponse.ticket_number = "07874520255";
      gProcessorFetch.processor_name = ProcessorEnum.REDEBAN;
      gTokenDynamo.merchantId = CHARGE_MID;
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.REDEBAN,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      process.env.REDEBAN_MERCHANTS = `${gProcessorFetch.public_id}`;
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        niubiz: "1234,444,6666",
        redeban: `${gProcessorFetch.public_id},1111,1234`,
      });

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.REDEBAN);
      commonExpect(done);
    });

    it("unified charge redeban but not in env var - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gAurusResponse.ticket_number = "07874520255";
      gProcessorFetch.processor_name = ProcessorEnum.REDEBAN;
      gTokenDynamo.merchantId = CHARGE_MID;
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.REDEBAN,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      process.env.REDEBAN_MERCHANTS = `123`;
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        niubiz: "999,666,555",
        redeban: "123,555,666",
      });

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      commonExpect(done);
    });

    it("unified charge transbank - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gAurusResponse.ticket_number = "07874520255";
      gProcessorFetch.processor_name = ProcessorEnum.TRANSBANK;
      gTokenDynamo.merchantId = CHARGE_MID;
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.TRANSBANK,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        transbank: gProcessorFetch.public_id,
      });

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.TRANSBANK);
      commonExpect(done);
    });

    it("unified charge transbank but not in env var - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gAurusResponse.ticket_number = "07874520255";
      gProcessorFetch.processor_name = ProcessorEnum.TRANSBANK;
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.provider = CardProviderEnum.TRANSBANK_WEBPAY;
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.TRANSBANK,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        transbank: "999,666,555",
      });

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      commonExpect(done);
    });

    it("when unified charge is called it will catch an error when sending a sns and validate the charge", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gChargesRequest.contactDetails = {
        documentNumber: "123",
        documentType: "CC",
        email: "email",
        firstName: "name",
        phoneNumber: "123",
      };
      box
        .stub(SNSGateway.prototype, "publish")
        .returns(of(1).pipe(switchMap(() => throwError(() => new Error("")))));
      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            validateCharge(
              data,
              lambda_stub,
              card_stub,
              build_transaction,
              done
            );
            expect(lambda_stub).to.not.be.calledWith(
              match.any,
              match.has(
                "body",
                match.has(
                  "detail",
                  match.has("customer", match.has("secondLastName"))
                )
              )
            );
          },
        });
    });

    it("unified charge credomatic centroamérica - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.deferred = {
        creditType: "01",
        graceMonths: "2",
        months: 4,
      };
      gProcessorFetch.processor_name = ProcessorEnum.CREDOMATIC;
      gTokenDynamo.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.merchant.country = CountryEnum.PANAMA;
      gUnifiedTrxRequest.merchant.deferredOptions = [
        {
          bank: ["test_bank_1", "test_bank_3"],
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["1", "2"],
        },
      ];

      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.CREDOMATIC,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.CREDOMATIC);
      commonExpect(done);
    });

    it("unified charge fis Brazil - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.deferred = {
        creditType: "01",
        graceMonths: "0",
        months: 4,
      };
      gProcessorFetch.processor_name = ProcessorEnum.FIS;
      gUnifiedTrxRequest.merchant.country = CountryEnum.BRAZIL;
      gUnifiedTrxRequest.merchant.deferredOptions = [
        {
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["0"],
        },
      ];
      set(gUnifiedTrxRequest.merchant.deferredOptions[0], "merchantMonths", [
        "2",
        "4",
        "6",
      ]);
      set(
        gUnifiedTrxRequest.merchant.deferredOptions[0],
        "merchantStatus",
        StatusMerchantDeferredOptionEnum.ENABLED
      );

      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.FIS,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.FIS);
      commonExpect(done);
    });

    it("unified charge credomatic centroamérica - error without deferred", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gAurusResponse.ticket_number = "07874520255";
      delete gUnifiedTrxRequest.deferred;
      gProcessorFetch.processor_name = ProcessorEnum.CREDOMATIC;
      gTokenDynamo.merchantId = CHARGE_MID;
      gMerchantFetch.country = CountryEnum.PANAMA;
      gMerchantFetch.deferredOptions = [
        {
          bank: ["test_bank_1", "test_bank_3"],
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["1", "2"],
        },
      ];

      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.CREDOMATIC,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.CREDOMATIC);

      commonExpectDeferredError(done);
    });
    it("unified charge fis brazil - no error when deferred", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      set(gUnifiedTrxRequest, "transactionType", "deferred");
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.deferred = {
        creditType: "01",
        graceMonths: "0",
        months: 4,
      };
      gProcessorFetch.processor_name = ProcessorEnum.FIS;
      gUnifiedTrxRequest.merchant.country = CountryEnum.BRAZIL;
      gUnifiedTrxRequest.merchant.deferredOptions = [
        {
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["0"],
        },
      ];
      set(gUnifiedTrxRequest.merchant.deferredOptions[0], "merchantMonths", [
        "2",
        "4",
        "6",
      ]);
      set(
        gUnifiedTrxRequest.merchant.deferredOptions[0],
        "merchantStatus",
        StatusMerchantDeferredOptionEnum.ENABLED
      );
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.FIS,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.FIS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: buildNextExpect(done),
        });
    });

    it("unified charge fis brazil - error when type deferred and no matching months", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.deferred = {
        creditType: "01",
        graceMonths: "0",
        months: 555,
      };
      gProcessorFetch.processor_name = ProcessorEnum.FIS;
      gUnifiedTrxRequest.merchant.country = CountryEnum.BRAZIL;
      set(gUnifiedTrxRequest, "transactionType", "deferred");
      gAurusResponse.ticket_number = "07874520255";

      gUnifiedTrxRequest.merchant.deferredOptions = [
        {
          deferredType: ["01"],
          months: ["2"],
          monthsOfGrace: ["0"],
        },
      ];
      set(gUnifiedTrxRequest.merchant.deferredOptions[0], "merchantMonths", [
        "2",
      ]);
      set(
        gUnifiedTrxRequest.merchant.deferredOptions[0],
        "merchantStatus",
        StatusMerchantDeferredOptionEnum.ENABLED
      );
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.FIS,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.FIS);
      commonExpectDeferredError(done, true);
    });

    it("unified charge fis brazil - error without deferred", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      delete gUnifiedTrxRequest.deferred;
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      gProcessorFetch.processor_name = ProcessorEnum.FIS;
      gMerchantFetch.country = CountryEnum.BRAZIL;
      gMerchantFetch.deferredOptions = [
        {
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["0"],
        },
      ];
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.FIS,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.FIS);
      commonExpectDeferredError(done, true);
    });

    it("unified charge credomatic centroamérica - error", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.deferred = {
        creditType: "01",
        graceMonths: "3",
        months: 7,
      };
      gProcessorFetch.processor_name = ProcessorEnum.CREDOMATIC;
      gTokenDynamo.merchantId = CHARGE_MID;
      gMerchantFetch.country = CountryEnum.PANAMA;
      gMerchantFetch.deferredOptions = [
        {
          bank: ["test_bank_1", "test_bank_3"],
          deferredType: ["01"],
          months: ["2", "4", "6"],
          monthsOfGrace: ["1", "2"],
        },
      ];

      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.CREDOMATIC,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.CREDOMATIC);
      commonExpectDeferredError(done);
    });

    it("unified charge fis brazil - unmatched deferred error", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.deferred = {
        creditType: "01",
        graceMonths: "0",
        months: 7,
      };
      gProcessorFetch.processor_name = ProcessorEnum.FIS;
      gMerchantFetch.country = CountryEnum.BRAZIL;
      gMerchantFetch.deferredOptions = [
        {
          deferredType: ["01"],
          months: ["2", "4"],
          monthsOfGrace: ["0"],
        },
      ];
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.FIS,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.FIS);
      commonExpectDeferredError(done, true);
    });

    it("unified charge - success with months and country on bin info", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gTokenDynamo.secureId = "asdlkadslk0-12dasda";
      gTokenDynamo.bin = "123456";
      gTokenDynamo.ip = "1.1.1.1";
      gTokenDynamo.lastFourDigits = "1234";
      gTokenDynamo.maskedCardNumber = "123456XXXXXX1234";
      gTokenDynamo.binInfo = {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        info: {
          country: {
            name: "Ecuador",
          },
          type: "credit",
        },
        processor: "Credimatic",
      };
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 3);
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(get(data, "ticketNumber")).to.eql(
              gAurusResponse.ticket_number
            );
            done();
          },
        });
    });

    it("When send unified charge with channel property - success", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gTokenDynamo.amount = 1112;
      gTokenDynamo.bin = "123456";
      gTokenDynamo.ip = "1.1.1.1";
      gTokenDynamo.lastFourDigits = "1234";
      gTokenDynamo.maskedCardNumber = "123456XXXXXX1234";
      gTokenDynamo.binInfo = {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        info: {
          type: "credit",
        },
        processor: "Credimatic",
      };
      gTokenDynamo.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 3);

      process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          queryReservedWord: box.stub().returns(of([])),
        })
      );

      gUnifiedTrxRequest.channel = "Test";
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).haveOwnProperty("ticketNumber");
            done();
          },
        });
    });

    it("unified charge - success with siftScience flow and no bin info", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gMerchantFetch.sift_science.SiftScore = 0.2;
      gSiftScienceGetWorkflowsResponse.score_response = {
        scores: {
          payment_abuse: {
            score: 0.18,
          },
        },
        workflow_statuses: [
          {
            config_display_name: "displayName",
            history: [
              {
                app: "decision",
                name: "ApprovedTransaction",
              },
            ],
          },
        ],
      };
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      process.env.USRV_STAGE = "uat";
      dynamoBindSiftFlow(put, box);
      CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
      const workflows_stub: SinonStub = box
        .stub()
        .returns(of(gSiftScienceGetWorkflowsResponse));

      delete gUnifiedTrxRequest.binInfo;

      antifraudBindSiftFlow(workflows_stub);
      gTokenDynamo.merchantId = CHARGE_MID;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      chargeSuccessNoBinInfo(service, lambda_stub, workflows_stub, done);
    });

    it("unified charge - success with DATAFAST processor", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gMerchantFetch.sift_science.SiftScore = 0.2;
      gSiftScienceGetWorkflowsResponse.score_response = {
        scores: {
          payment_abuse: {
            score: 0.18,
          },
        },
        workflow_statuses: [
          {
            config_display_name: "displayName",
            history: [
              {
                app: "decision",
                name: "ApprovedTransaction",
              },
            ],
          },
        ],
      };
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      process.env.USRV_STAGE = "uat";
      dynamoBindSiftFlow(put, box);
      CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
      const workflows_stub: SinonStub = box
        .stub()
        .returns(of(gSiftScienceGetWorkflowsResponse));

      antifraudBindSiftFlow(workflows_stub);
      gAurusResponse.transaction_details.processorName = ProcessorEnum.DATAFAST;
      set(gUnifiedTrxRequest, "deferred.creditType", "02");
      gTokenDynamo.merchantId = CHARGE_MID;
      delete gUnifiedTrxRequest.binInfo;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      chargeSuccessNoBinInfo(service, lambda_stub, workflows_stub, done);
    });

    it("should set merchant data transaction rule processor request when merchantData of authorizer is string", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gMerchantFetch.sift_science.SiftScore = 0.2;
      gSiftScienceGetWorkflowsResponse.score_response = {
        scores: {
          payment_abuse: {
            score: 0.18,
          },
        },
        workflow_statuses: [
          {
            config_display_name: "displayName",
            history: [
              {
                app: "decision",
                name: "ApprovedTransaction",
              },
            ],
          },
        ],
      };
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      process.env.USRV_STAGE = "uat";
      dynamoBindSiftFlow(put, box);
      CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
      const workflows_stub: SinonStub = box
        .stub()
        .returns(of(gSiftScienceGetWorkflowsResponse));

      antifraudBindSiftFlow(workflows_stub);
      gAurusResponse.transaction_details.processorName = ProcessorEnum.DATAFAST;
      set(
        gUnifiedTrxRequest,
        "authorizerContext.merchantData",
        `{"mcc":"5933","merchantCategory":"Medium"}`
      );
      gTokenDynamo.merchantId = CHARGE_MID;
      delete gUnifiedTrxRequest.binInfo;
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      chargeSuccessNoBinInfo(service, lambda_stub, workflows_stub, done);
    });

    it("unified charge - success with fullResponse", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.fullResponse = "v2";
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      successUnifiedChargefullResponse(
        service,
        gUnifiedTrxRequest,
        done,
        build_transaction
      );
    });

    it("unified charge - success - the transactionCardId field must be saved in the transactions table", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(
          { ...gUnifiedTrxRequest, transactionCardId: TRANSACTION_CARD_ID },
          gLambdaContext
        )
        .subscribe({
          next: (data: object): void => {
            expect(build_transaction).to.be.called;
            expect(data).to.not.have.property("acquirerBank");
            expect(data).not.to.have.deep.nested.property(
              DETAIL_CONSORTIUM_NAME
            );
            done();
          },
        });
    });

    it("unified charge - success with Aurus Response", (done: Mocha.Done) => {
      service = CONTAINER.get(IDENTIFIERS.CardService);
      mockUnifiedChargesRequest();
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      successUnifiedChargeAurusResponse(
        service,
        gChargeRequest,
        done,
        build_transaction
      );
    });

    it("unified charge - success with deferred", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.deferred = {
        creditType: "00",
        graceMonths: "01",
        months: 2,
      };

      set(gTransaction, "credit_type", "03");
      gUnifiedTrxRequest.fullResponse = "v2";
      const invoke = box.stub().returns(
        of({
          body: {
            currencyCode: CurrencyEnum.USD,
            plcc: "0",
            privateId: gProcessorFetch.private_id,
            publicId: gProcessorFetch.public_id,
          },
        })
      );

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: invoke,
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data: object): void => {
            expect(data)
              .to.have.property("details")
              .and.have.property("binInfo");
            expect(data).to.not.have.property("acquirerBank");
            expect(invoke.args[0][1].body.detail.deferred.months).to.be.eql(2);
            expect(
              invoke.args[0][1].body.detail.deferred.graceMonths
            ).to.be.eql("01");
            expect(invoke.args[0][1].body.detail.deferred.creditType).to.be.eql(
              "00"
            );
            done();
          },
        });
    });

    it("unified PreAuthorization - success - and with transactionCardId field present in the vaultToken middleware, it must be saved in tokens table", (done: Mocha.Done) => {
      mockUnifiedChargesRequest();
      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.merchant.sandboxEnable = false;
      gUnifiedTrxRequest.transactionCardId = TRANSACTION_CARD_ID;
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).to.have.property("ticketNumber");
            expect(data).not.to.have.property("transactionCardId");
            expect(lambda_stub).to.be.calledOnce;
            expect(lambda_stub.args[0][0]).to.be.eqls(TRX_RULE_PROCESSOR);
            expect(lambda_stub.args[0][1].body.sandboxEnable).to.be.false;
            validateCharge(
              data,
              lambda_stub,
              card_stub,
              build_transaction,
              done
            );
          },
        });
    });

    it("unified preAuthorization - when processor is kushki", (done: Mocha.Done) => {
      delete gTokenDynamo.secureId;
      gTokenDynamo.merchantId = CHARGE_MID;
      delete gChargesRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.KUSHKI,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );
      process.env.DIRECT_INTEGRATION_BINS = DIRECT_INTEGRATION_BINS_ALL;
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        kushki: `${gProcessorFetch.public_id},1111,1234`,
      });
      lambdaServiceBinding(lambda_stub);
      mockProviderService(
        undefined,
        undefined,
        CardProviderEnum.KUSHKI,
        card_stub
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            validateCharge(
              data,
              lambda_stub,
              card_stub,
              build_transaction,
              done
            );
            expect(data).to.have.property("ticketNumber");
          },
        });
    });

    it("unified preAuthorization | should throw error if currency is MXN and processor is not supported", (done: Mocha.Done) => {
      delete gUnifiedTrxRequest.secureId;
      gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
      delete gUnifiedTrxRequest.secureService;
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.amount.currency = CurrencyEnum.MXN;
      gUnifiedTrxRequest.tokenCurrency = CurrencyEnum.MXN;
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;

      CONTAINER.unbind(CORE.LambdaGateway);
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.MXN,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.TRANSBANK,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );
      lambdaServiceBinding(lambda_stub);

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.code).to.be.eql("K901");
            done();
          },
        });
    });

    it("unified preAuthorization - when processor is billpocket should return error K041", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        billpocket: `${gProcessorFetch.public_id},1111,1234`,
      });
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                partnerValidator: "test",
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.BILLPOCKET,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );

      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      set(gUnifiedTrxRequest, BIN_PATH, "11111");
      card_stub = box.stub().rejects(new KushkiError(ERRORS.E041));
      mockProviderService(
        undefined,
        undefined,
        CardProviderEnum.BILLPOCKET,
        card_stub
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (error: KushkiError) => {
            expect(error.code).to.be.eqls("K041");
            expect(error.getMessage()).to.be.eqls(ERRORS.E041.message);
            done();
          },
        });
    });

    it("preAuthorization - success with fullResponse", (done: Mocha.Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                partnerValidator: "transunion",
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );
      gUnifiedTrxRequest.fullResponse = true;
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      mockProviderService(
        undefined,
        undefined,
        CardProviderEnum.AURUS,
        card_stub
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      successUnifiedPreAuthorizationFullResponse(
        service,
        gUnifiedTrxRequest,
        done,
        build_transaction
      );
    });

    it("preAuthorization - success with 3DS data", (done: Mocha.Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                cybersource: { detail: cybersource_detail },
                partnerValidator: "transunion",
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );

      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      mockProviderService(
        undefined,
        undefined,
        CardProviderEnum.AURUS,
        card_stub
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          complete: (): void => {
            assertCardAndPreAuthWith3DS();
            done();
          },
          error: done,
        });
    });

    it("preAuthorization - success without 3DS data", (done: Mocha.Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                partnerValidator: "transunion",
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );

      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      delete gUnifiedTrxRequest["3ds"];
      mockProviderService(
        undefined,
        undefined,
        CardProviderEnum.AURUS,
        card_stub
      );
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          complete: (): void => {
            assertCardAndPreAuthWithout3DS();
            done();
          },
          error: done,
        });
    });

    it("preAuthorization - success with fullResponse v2", (done: Mocha.Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                partnerValidator: "transunion",
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      gUnifiedTrxRequest.fullResponse = "v2";
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data: object): void => {
            expect(data).to.haveOwnProperty("ticketNumber");
            expect(data).to.haveOwnProperty("transactionReference");
            expect(data).to.haveOwnProperty("details");
            expect(build_transaction).to.be.called;
            done();
          },
        });
    });

    it("preAuthorization - k322 error with fullResponse v2", (done: Mocha.Done) => {
      lambda_stub.throws(new KushkiError(ERRORS.E322, ERRORS.E322.message));
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      gUnifiedTrxRequest.fullResponse = "v2";
      delete gUnifiedTrxRequest.metadata;

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.getMessage()).to.be.eqls(ERRORS.E322.message);
            expect(err.getMetadata()).to.haveOwnProperty(
              "transactionReference"
            );
            expect(err.getMetadata()).to.haveOwnProperty("responseText");
            done();
          },
        });
    });

    it("preAuthorization - k322 error with fullResponse v2 send processor.code", (done: Mocha.Done) => {
      lambda_stub.throws(new KushkiError(ERRORS.E322, ERRORS.E322.message));
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_stub,
        })
      );
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      gUnifiedTrxRequest.fullResponse = "v2";

      const transaction_processor: Transaction = chargesCardResponse();

      transaction_processor.processor = {
        code: "15",
      };

      build_transaction = box.stub().returns(transaction_processor);
      CONTAINER.unbind(IDENTIFIERS.TransactionService);
      transactionServiceBinding(build_transaction);

      delete gUnifiedTrxRequest.metadata;

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (err: KushkiError): void => {
            expect(err.getMetadata()).to.haveOwnProperty("isoErrorCode");
            done();
          },
        });
    });

    it("preAuthorization - success with fullResponse with prosa", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        prosa: `${gProcessorFetch.public_id},1111,1234`,
      });
      process_stub = box.stub().returns({
        approval_code: "reprenderit do minim",
        approved_amount: "cupidtat occacat nulla",
        approved_transaction_amount: 123,
        bin_card: "2323",
        binCard: "ocecat eu exeritation",
        card_holder_name: "Dis offcia",
        created: Number(new Date()),
        currency_code: "USD",
        isDeferred: "id tepor ipsum qui",
        issuing_bank: "Bco.Pichincha",
        iva_value: 1,
        last_four_digits: "do",
        merchant_id: "irure exerctation deseunt sed",
        merchant_name: "Exceptur",
        payment_brand: "ate",
        processor_bank_name: "Exeper",
        processor_id: "Exepeur",
        processor_name: ProcessorEnum.BILLPOCKET,
        recap: "12345",
        request_amount: 23,
        response_code: "263",
        response_text: "incidunt ip ullaco citation",
        security: {
          partner: "transunion",
        },
        subtotal_iva: 1,
        subtotal_iva0: 1,
        sync_mode: "api",
        ticket_number: "0787450255",
        transaction_id: "tId",
        transaction_status: "0000",
        transaction_type: "exeiation ",
      });

      CONTAINER.rebind<ITransactionService>(
        IDENTIFIERS.TransactionService
      ).toConstantValue(
        Mock.of<ITransactionService>({
          buildTransactionObject: process_stub,
        })
      );

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                partnerValidator: "transunion",
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                processor: ProcessorEnum.BILLPOCKET,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      gUnifiedTrxRequest.fullResponse = true;
      set(gUnifiedTrxRequest, BIN_PATH, "11111");
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(data)
              .to.have.property("details")
              .and.have.property("processorName")
              .to.be.equal(ProcessorEnum.PROSA_AGR);
            done();
          },
        });
    });

    //
    it("charges - success with fullResponse with deferred options", (done: Mocha.Done) => {
      gUnifiedTrxRequest.deferred = {
        creditType: "003",
        graceMonths: "00",
        months: 12,
      };

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );
      set(gUnifiedTrxRequest, "deferred.creditType", "03");
      gUnifiedTrxRequest.fullResponse = true;

      service = CONTAINER.get(IDENTIFIERS.CardService);
      successUnifiedChargefullResponse(
        service,
        gUnifiedTrxRequest,
        done,
        build_transaction
      );
    });

    it("charges - success with 3DS data", (done: Mocha.Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                cybersource: { detail: cybersource_detail },
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          complete: (): void => {
            assertCardAndPreAuthWith3DS();
            done();
          },
          error: done,
        });
    });

    it("charges - success without 3DS data", (done: Mocha.Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );

      delete gUnifiedTrxRequest["3ds"];
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          complete: (): void => {
            assertCardAndPreAuthWithout3DS();
            done();
          },
          error: done,
        });
    });

    it("charges - success with fullResponse - acquirerBank", (done: Mocha.Done) => {
      const bank_test: string = "Banco Internacional";
      const next_spy: SinonSpy = box.spy();

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                acquirerBank: bank_test,
                currencyCode: CurrencyEnum.USD,
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );
      gUnifiedTrxRequest.fullResponse = true;

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          complete: (): void => {
            expect(next_spy).to.have.been.calledWithMatch({
              details: {
                acquirerBank: bank_test,
              },
            });
            done();
          },
          next: next_spy,
        });
    });

    it("when charges is called with a transaction rule response with plcc = 1, it will validate the charge", (done: Mocha.Done) => {
      const lambda_test: SinonStub = box
        .stub()
        .onFirstCall()
        .returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: {
                currencyCode: CurrencyEnum.USD,
                plcc: "1",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          )
        )
        .onSecondCall()
        .returns(of({ ...gBinFetch, bin: "EC1224324" }));

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_test,
        })
      );
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data: object): void => {
            validateCharge(
              data,
              lambda_test,
              card_stub,
              build_transaction,
              done,
              true
            );
          },
        });
    });

    it("when charges is called with a transaction rule response with plcc = 1 but undefined response of bin, it will validate the charge", (done: Mocha.Done) => {
      const lambda_test: SinonStub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              plcc: "1",
              privateId: gProcessorFetch.private_id,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_test,
        })
      );
      gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          next: (data: object): void => {
            expect(data).to.not.be.undefined;
            validateCharge(
              data,
              lambda_test,
              card_stub,
              build_transaction,
              done,
              true
            );
          },
        });
    });

    it("charges - deferred in token info incorrect with charge info", (done: Mocha.Done) => {
      gUnifiedTrxRequest.isDeferred = true;
      gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
      delete gUnifiedTrxRequest.deferred;

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.code).to.be.eql("K013");
            done();
          },
          next: (): void => {
            done(UNREACHABLE);
          },
        });
    });

    it("When send charge with saveCard property - success", (done: Mocha.Done) => {
      const lambda_inner_stub: SinonStub = box
        .stub()
        .onFirstCall()
        .returns(
          of({
            body: {
              currencyCode: CurrencyEnum.USD,
              plcc: "0",
              privateId: gProcessorFetch.private_id,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
        .onSecondCall()
        .returns(
          of({
            body: {
              token: "123token",
            },
          })
        );

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lambda_inner_stub,
        })
      );

      gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
      gUnifiedTrxRequest.vaultToken = "123vaultToken";
      gUnifiedTrxRequest.expiryMonth = "12";
      gUnifiedTrxRequest.expiryYear = "25";
      gUnifiedTrxRequest.saveCard = true;
      gUnifiedTrxRequest.isAft = true;

      process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: done,
          next: (data: object): void => {
            expect(data).haveOwnProperty("vaultToken");
            expect(data).haveOwnProperty("expiryYear");
            expect(data).haveOwnProperty("expiryMonth");
            done();
          },
        });
    });

    it("When call charge method with Credibanco, it should be success", (done: Mocha.Done) => {
      delete gUnifiedTrxRequest.secureService;
      delete gUnifiedTrxRequest.secureId;
      gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
      gAurusResponse.ticket_number = "07874520255";
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        credibanco: `${gProcessorFetch.public_id},1111,666`,
      });
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.CREDIBANCO,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      mockProviderService(undefined, card_stub, CardProviderEnum.CREDIBANK);
      CONTAINER.unbind(CORE.LambdaGateway);
      lambdaServiceBinding(lambda_stub);
      commonExpect(done);
    });

    it("When call charge method with niubiz, it should be success", (done: Mocha.Done) => {
      delete gUnifiedTrxRequest.secureId;
      delete gUnifiedTrxRequest.secureService;
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        niubiz: `${gProcessorFetch.public_id},1111,666`,
        redeban: "1234,1111,666",
      });
      gAurusResponse.ticket_number = "07874520255";
      gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              integration: "direct",
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.NIUBIZ,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );

      CONTAINER.unbind(CORE.LambdaGateway);
      lambdaServiceBinding(lambda_stub);
      mockProviderService(undefined, card_stub, CardProviderEnum.NIUBIZ);
      commonExpect(done);
    });

    it("When call charge method with credimatic and transaction rule integration is direct, it should be success with credimatic", (done: Mocha.Done) => {
      prepareChargeUnifiedByProcessorTest(
        done,
        ProcessorEnum.CREDIMATIC,
        CardProviderEnum.CREDIMATIC,
        "direct"
      );
      commonExpect(done);
    });

    it("When call charge method with credimatic and transaction rule integration is not direct, it should be success with aurus", (done: Mocha.Done) => {
      prepareChargeUnifiedByProcessorTest(
        done,
        ProcessorEnum.CREDIMATIC,
        CardProviderEnum.AURUS,
        "aurus"
      );
      commonExpect(done);
    });

    it("When call charge method with credimatic and env var CREDIMATIC_DIRECT_ENABLED is all, it should be success with credimatic", (done: Mocha.Done) => {
      process.env.CREDIMATIC_DIRECT_ENABLED = DirectMerchantEnabledEnum.ALL;
      prepareChargeUnifiedByProcessorTest(
        done,
        ProcessorEnum.CREDIMATIC,
        CardProviderEnum.CREDIMATIC,
        "aurus"
      );
      commonExpect(done);
      delete process.env.CREDIMATIC_DIRECT_ENABLED;
    });

    it("When call charge method with datafast and transaction rule integration is direct, it should be success with datafast", (done: Mocha.Done) => {
      prepareChargeUnifiedByProcessorTest(
        done,
        ProcessorEnum.DATAFAST,
        CardProviderEnum.DATAFAST,
        "direct"
      );
      commonExpect(done);
    });

    it("When call charge method with datafast and transaction rule integration is not direct, it should be success with aurus", (done: Mocha.Done) => {
      prepareChargeUnifiedByProcessorTest(
        done,
        ProcessorEnum.DATAFAST,
        CardProviderEnum.AURUS,
        "aurus"
      );
      commonExpect(done);
    });

    it("When call charge method with datafast and env var DATAFAST_DIRECT_ENABLED is all, it should be success with datafast", (done: Mocha.Done) => {
      process.env.DATAFAST_DIRECT_ENABLED = DirectMerchantEnabledEnum.ALL;
      prepareChargeUnifiedByProcessorTest(
        done,
        ProcessorEnum.DATAFAST,
        CardProviderEnum.DATAFAST,
        "aurus"
      );
      commonExpect(done);
      delete process.env.DATAFAST_DIRECT_ENABLED;
    });

    it("When call preAuthorization method with niubiz, it should be success", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        niubiz: `${gProcessorFetch.public_id},1111,1234`,
        redeban: "1234,1111,555",
      });
      lambda_stub = box.stub().returns(
        of(
          Mock.of<{ body: LambdaTransactionRuleResponse }>({
            body: {
              currencyCode: CurrencyEnum.USD,
              integration: "direct",
              privateId: gProcessorFetch.private_id,
              processor: ProcessorEnum.NIUBIZ,
              publicId: gProcessorFetch.public_id,
            },
          })
        )
      );
      gUnifiedTrxRequest.transactionType =
        TransactionRuleTypeEnum.PREAUTHORIZATION;
      gUnifiedTrxRequest.fullResponse = true;
      CONTAINER.unbind(CORE.LambdaGateway);
      lambdaServiceBinding(lambda_stub);
      mockProviderService(
        undefined,
        undefined,
        CardProviderEnum.NIUBIZ,
        card_stub
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      successUnifiedPreAuthorizationFullResponse(
        service,
        gUnifiedTrxRequest,
        done,
        build_transaction
      );
    });

    it("charges billpocket - success, when bin exists in  DIRECT_INTEGRATION_BINS variable.", (done: Mocha.Done) => {
      set(gUnifiedTrxRequest, BIN_PATH, "2222");
      billpocketMock(CardProviderEnum.BILLPOCKET);

      commonExpect(done);
    });

    it("charges billpocket - success, when DIRECT_INTEGRATION_BINS is equal to all ", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_BINS = DIRECT_INTEGRATION_BINS_ALL;
      set(gUnifiedTrxRequest, BIN_PATH, "2222");
      billpocketMock(CardProviderEnum.BILLPOCKET);

      commonExpect(done);
    });

    it("charges billpocket - success, when bin not exists in  DIRECT_INTEGRATION_BINS variable.", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_BINS = "222";
      set(gUnifiedTrxRequest, BIN_PATH, "222");
      billpocketMock(CardProviderEnum.AURUS);

      commonExpect(done);
    });

    it("charges kushki acq - success.", (done: Mocha.Done) => {
      set(gUnifiedTrxRequest, BIN_PATH, "2222");
      kushkiAcqMock(CardProviderEnum.KUSHKI);

      commonExpect(done);
    });

    it("charges kushki acq - success when bin exists in DIRECT_INTEGRATION_BINS variable", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_BINS = JSON.stringify({
        "123456789": "2222",
      });
      set(gUnifiedTrxRequest, BIN_PATH, "2222");
      kushkiAcqMock(CardProviderEnum.KUSHKI);

      commonExpect(done);
    });

    it("charges kushki acq - should return success when mcc code is 6051", (done: Mocha.Done) => {
      set(gUnifiedTrxRequest, BIN_PATH, "2222");
      set(gUnifiedTrxRequest, BIN_BRAN, "VISA");
      kushkiAcqMock(CardProviderEnum.KUSHKI, "6051");

      commonExpect(done);
    });

    it("charges kushki acq - should throw error when trx is aft and preauth", (done: Mocha.Done) => {
      set(gUnifiedTrxRequest, BIN_BRAN, "VISA");
      set(gUnifiedTrxRequest, "transactionType", "preauthorization");
      kushkiAcqMock(CardProviderEnum.KUSHKI, "6051");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.code).to.be.eql("K041");
            done();
          },
          next: (): void => {
            done(UNREACHABLE);
          },
        });
    });

    it("charges kushki acq - should throw error when trx is aft and deferred", (done: Mocha.Done) => {
      set(gUnifiedTrxRequest, BIN_BRAN, "VISA");
      set(gUnifiedTrxRequest, "isDeferred", true);
      kushkiAcqMock(CardProviderEnum.KUSHKI, "6051");

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service
        .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.code).to.be.eql("K901");
            done();
          },
          next: (): void => {
            done(UNREACHABLE);
          },
        });
    });

    it("charges kushki acq - should run local deferred successfully", (done: Mocha.Done) => {
      mockEnvAcqVars(true);
      set(gUnifiedTrxRequest, BIN_PATH, "2222");
      set(gUnifiedTrxRequest, BIN_BRAN, "VISA");
      set(gUnifiedTrxRequest, "isDeferred", true);
      set(gUnifiedTrxRequest, "usrvOrigin", UsrvOriginEnum.CARD);
      set(gUnifiedTrxRequest, "binInfo.info", {
        country: { name: CountryEnum.ECUADOR, alpha2: "EC" },
        type: "credit",
      });

      kushkiAcqMock(CardProviderEnum.KUSHKI);
      commonExpect(done);
    });

    it("charges kushki acq - should run international deferred as simple charge successfully", (done: Mocha.Done) => {
      mockEnvAcqVars(true);
      set(gUnifiedTrxRequest, BIN_PATH, "2222");
      set(gUnifiedTrxRequest, BIN_BRAN, "VISA");
      set(gUnifiedTrxRequest, "usrvOrigin", UsrvOriginEnum.CARD);
      set(gUnifiedTrxRequest, "binInfo.info", {
        country: { name: CountryEnum.ECUADOR, alpha2: "EC" },
        type: "credit",
      });
      set(gUnifiedTrxRequest, "merchant.country", "MEX");
      set(gUnifiedTrxRequest, "isDeferred", true);

      kushkiAcqMock(CardProviderEnum.KUSHKI);
      commonExpect(done);
    });

    it("charge - success with fullResponse and 3ds data for 3ds response customer", (done: Mocha.Done) => {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: box.stub().returns(
            of({
              body: {
                currencyCode: CurrencyEnum.USD,
                cybersource: { detail: cybersource_detail },
                plcc: "0",
                privateId: gProcessorFetch.private_id,
                publicId: gProcessorFetch.public_id,
              },
            })
          ),
        })
      );
      mockUnifiedChargesRequest();
      gUnifiedTrxRequest.fullResponse = "v2";
      mockProviderService(undefined, card_stub, CardProviderEnum.AURUS);
      process.env["3DS_RESPONSE_CUSTOMER"] = JSON.stringify(["merchant1"]);
      service = CONTAINER.get(IDENTIFIERS.CardService);
      successUnifiedChargefullResponse(
        service,
        gUnifiedTrxRequest,
        done,
        build_transaction
      );
    });
  });
});

describe("CardService - Charges SiftScience", () => {
  process.env.THRESHOLD_AMOUNT = "0.05";
  let service: ICardService;
  let box: SinonSandbox;
  let card_stub: SinonStub;
  let lambda_stub: SinonStub;
  let process_stub: SinonStub;
  let build_transaction: SinonStub;
  let put_sqs_stub: SinonStub;
  let tracer: SinonStub;

  beforeEach(() => {
    createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of([])),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    gChargesResponse.approvalCode = "PRUEBA";
    card_stub = box.stub().returns(of(gAurusResponse));
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: card_stub,
        getAurusToken: box.stub().returns(
          of({
            token: "token44",
          })
        ),
        preAuthorization: card_stub,
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: { currencyCode: CurrencyEnum.USD, privateId: "123" },
        })
      )
    );
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub,
      })
    );
    process_stub = box.stub().returns(of(chargesCardResponse()));
    build_transaction = box.stub().returns(chargesCardResponse());
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind<ITransactionService>(
      IDENTIFIERS.TransactionService
    ).toConstantValue(
      Mock.of<ITransactionService>({
        buildTransactionObject: build_transaction,
        processRecord: process_stub,
      })
    );
    put_sqs_stub = box.stub().returns(of(true));
    mockSQSGateway(put_sqs_stub);
    tracer = box.stub(Tracer.prototype, "putAnnotation");
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
    tracer.restore();
  });

  it("unified charge - siftScience error, sift score greater than merchant sift score", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    gSiftScienceGetWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.22,
        },
      },
    };
    set(gUnifiedTrxRequest, SIFT_SCORE_PATH, 0.2);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
        queryReservedWord: box.stub().returns(of([])),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
    const workflows_stub: SinonStub = box
      .stub()
      .returns(of(gSiftScienceGetWorkflowsResponse));
    const transaction_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
      Mock.of<IAntifraudGateway>({
        getWorkflows: workflows_stub,
        transaction: transaction_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("K021");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - siftScience error, workflow failed", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    const g_sift_decision_green: SiftScienceDecisionResponse = {
      description: "siftResp 2",
      id: "decisionId2",
      name: "siftGreenResponse",
      type: "green",
    };

    gSiftScienceDecisionResponse = {
      description: "siftResponse description",
      id: "decisionId1",
      name: "siftResponse",
      type: "red",
    };

    process.env.SIFT_SCORE = "0.2";

    set(gUnifiedTrxRequest, SIFT_SCORE_PATH, undefined);
    gSiftScienceGetWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.15,
        },
      },
    };
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        queryReservedWord: box.stub().returns(of([])),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
    gSiftScienceGetWorkflowsResponse.score_response.workflow_statuses = [
      {
        config_display_name: "workflowName",
        history: [
          {
            app: "decision",
            config: { decision_id: "decisionId1" },
            name: "DeclinedTransaction",
          },
          {
            app: "decision",
            config: { decision_id: "decisionId2" },
            name: "ApprovedTransaction",
          },
        ],
      },
    ];
    const workflows_stub: SinonStub = box
      .stub()
      .returns(of(gSiftScienceGetWorkflowsResponse));
    const transaction_stub: SinonStub = box.stub().returns(of(true));
    const decision_stub: SinonStub = box
      .stub()
      .onFirstCall()
      .returns(g_sift_decision_green)
      .onSecondCall()
      .returns(gSiftScienceDecisionResponse);

    CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
      Mock.of<IAntifraudGateway>({
        getDecision: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceDecisionResponse>): void => {
              observable.next(decision_stub());
              observable.complete();
            }
          )
        ),
        getWorkflows: workflows_stub,
        transaction: transaction_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("K021");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - siftScience error, no workflow data", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    const g_sift_decision_green: SiftScienceDecisionResponse = {
      description: "siftResp 2",
      id: "decisionId2",
      name: "siftGreenResponse",
      type: "green",
    };
    process.env.SIFT_SCORE = "0.2";

    set(gUnifiedTrxRequest, SIFT_SCORE_PATH, undefined);
    gSiftScienceGetWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.15,
        },
      },
    };
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
        queryReservedWord: box.stub().returns(of([])),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
    delete gSiftScienceGetWorkflowsResponse.score_response.workflow_statuses;
    const workflows_stub: SinonStub = box
      .stub()
      .returns(of(gSiftScienceGetWorkflowsResponse));
    const transaction_stub: SinonStub = box.stub().returns(of(true));
    const decision_stub: SinonStub = box
      .stub()
      .onFirstCall()
      .returns(g_sift_decision_green)
      .onSecondCall()
      .returns(gSiftScienceDecisionResponse);

    CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
      Mock.of<IAntifraudGateway>({
        getDecision: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceDecisionResponse>): void => {
              observable.next(decision_stub());
              observable.complete();
            }
          )
        ),
        getWorkflows: workflows_stub,
        transaction: transaction_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: done,
        next: (response: object): void => {
          expect(response).to.have.property("ticketNumber");
          done();
        },
      });
  });
});

describe("CardService - Charges wrong", () => {
  process.env.THRESHOLD_AMOUNT = "0.05";
  let service: ICardService;
  let box: SinonSandbox;
  let sqs_put_stub: SinonStub;
  let tracer: SinonStub;

  type DeferredOptionTypes = DeferredOption[] | boolean | undefined | null;

  function assertDisableDeferredOptionsUnifiedCharge(
    deferredOptions: DeferredOptionTypes,
    country: string,
    done: Mocha.Done
  ): void {
    gUnifiedTrxRequest.deferred = {
      creditType: "",
      graceMonths: "",
      months: 3,
    };
    set(gUnifiedTrxRequest, "merchant.deferredOptions", deferredOptions);
    gUnifiedTrxRequest.merchant.country = country;
    gUnifiedTrxRequest.transactionType = TransactionRuleTypeEnum.DEFERRED;

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: { privateId: "123" },
            })
          )
        ),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);

    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eql("K028");
          done();
        },
      });
  }

  beforeEach(() => {
    createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    mockUnifiedChargesRequest();
    process.env.MERCHANT_IDS_TUENTI = "10123113485560493028150712749750";

    CONTAINER.unbind(IDENTIFIERS.SQSGateway);
    sqs_put_stub = box.stub().returns(of(true));
    CONTAINER.bind(IDENTIFIERS.SQSGateway).toConstantValue(
      Mock.of<ISQSGateway>({
        put: sqs_put_stub,
      })
    );
    rollbarInstance(box);
    tracer = box.stub(Tracer.prototype, "putAnnotation");
  });

  afterEach(() => {
    box.restore();
    tracer.restore();
    CONTAINER.restore();
  });

  // TODO: SKIP BECAUSE TUENTI MAKE TOKEN WITH AURUS AND CHARGE BY HERE -.-
  it.skip("charges - wrong no token information", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({})
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event, gLambdaContext).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K008");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  // TODO: EXISTS BECAUSE TUENTI MAKE TOKEN WITH AURUS AND CHARGE BY HERE -.-
  it("charges - wrong no token information, Tuenti success", (done: Mocha.Done) => {
    gAurusResponse.ticket_number = "123";
    const ticket: string = gTransaction.ticket_number;

    gUnifiedTrxRequest.authorizerContext.merchantId =
      "10123113485560493028150712749750";
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
        queryReservedWord: box.stub().returns(of([])),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    gChargesResponse.approvalCode = "PRUEBA";
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: box.stub().returns(of(gAurusResponse)),
        getAurusToken: box.stub().returns(
          of({
            token: "token23",
          })
        ),
        preAuthorization: box.stub().returns(of(gAurusResponse)),
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: { currencyCode: CurrencyEnum.USD, privateId: "123" },
            })
          )
        ),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind<ITransactionService>(
      IDENTIFIERS.TransactionService
    ).toConstantValue(
      Mock.of<ITransactionService>({
        buildTransactionObject: box.stub().returns(gTransaction),
      })
    );
    mockAntifraudBindSiftFlow(box);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        complete: done,
        error: done,
        next: (data: object): void => {
          expect(data).to.have.property("ticketNumber", ticket);
        },
      });
  });

  it("charges - wrong private merchant id", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().onFirstCall().returns(of(undefined)),
        query: box.stub().returns(of(undefined)),
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: { privateId: "123" },
            })
          )
        ),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    chargesError(service, mock_charges_event, done);
  });

  it("charges - must throw error if trx type is deferred but merchant has deferredOptions false", (done: Mocha.Done) => {
    assertDisableDeferredOptionsUnifiedCharge(false, "Mexico", done);
  });

  it("charges - must throw error if trx type is deferred but merchant has deferredOptions array empty", (done: Mocha.Done) => {
    assertDisableDeferredOptionsUnifiedCharge([], "Ecuador", done);
  });

  it("charges - must throw error if trx type is deferred but merchant has deferredOptions undefined", (done: Mocha.Done) => {
    assertDisableDeferredOptionsUnifiedCharge(undefined, "Peru", done);
  });

  it("charges - must throw error if trx type is deferred but merchant has deferredOptions null", (done: Mocha.Done) => {
    assertDisableDeferredOptionsUnifiedCharge(null, "Mexico", done);
  });
});

describe("CardService - Deferred", () => {
  let box: SinonSandbox;
  let service: ICardService;
  const merchant_id: string = "42123333";
  const bin_number: string = "123456";
  let merchant_response: DynamoMerchantFetch;
  let invoke_stub: SinonStub;
  const processor_fetch_response: DynamoProcessorFetch = {
    merchant_id,
    created: 1114,
    private_id: "123331",
    processor_name: "",
    processor_type: "traditional",
    public_id: "23444",
    terminal_id: "K69",
  };
  let hierarchy_config: HierarchyConfig;
  let deferred_response: GetDeferredResponse;

  let deferred_event: IAPIGatewayEvent<
    null,
    BinParameters,
    null,
    AuthorizerContext
  >;
  let tracer: SinonStub;

  const processing_deferred: string = "processing.deferred";

  beforeEach(() => {
    deferred_response = {
      deferred: [
        {
          months: ["2", "4", "5", "6", "8"],
          monthsOfGrace: ["1", "2", "3"],
          name: DeferredNamesEnum[`D01`],
          type: "01",
        },
        {
          months: ["3", "6", "9"],
          monthsOfGrace: ["2", "3", "4"],
          name: DeferredNamesEnum[`D02`],
          type: "02",
        },
        {
          months: ["3", "6", "9"],
          monthsOfGrace: ["2", "3", "4"],
          name: DeferredNamesEnum[`D03`],
          type: "03",
        },
      ],
    };
    hierarchy_config = {
      processing: {
        businessRules: "200000000345044",
        deferred: "200000000345046",
        processors: "200000000345043",
        securityRules: "200000000345045",
      },
      rootId: "3000abc0001",
    };

    box = createSandbox();
    CONTAINER.snapshot();
    invoke_stub = box.stub().returns(of(deferred_response));
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invoke_stub,
      })
    );
    rollbarInstance(box);
    deferred_event = Mock.of<
      IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
    >({
      headers: { [HEADER]: merchant_id },
      pathParameters: { binNumber: bin_number },
      requestContext: {
        authorizer: {
          merchantId: merchant_id,
        },
      },
    });
    merchant_response = {
      merchant_id,
      contactPerson: "",
      country: CountryEnum.ECUADOR,
      email: "",
      merchant_name: "Kushki",
      private_id: "333",
      public_id: merchant_id,
      sift_science: {},
    };
    tracer = box.stub(Tracer.prototype, "putAnnotation");
  });
  afterEach(() => {
    runDependencies(box, tracer);
  });

  it("when deferred is called with a bin,it returns deferred conditions", (done: Mocha.Done) => {
    merchant_response.country = CountryEnum.ECUADOR;

    processor_fetch_response.processor_name = ECUADORIAN_PROCESSORS[0];

    const spy: SinonSpy = box.spy();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().onFirstCall().returns(of(merchant_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      complete: (): void => {
        expect(spy).calledWith(deferred_response.deferred);
        expect(invoke_stub).to.be.calledOnce;
        done();
      },
      error: done,
      next: spy,
    });
  });

  it("Should invoke getDeferred lambda with deferred field of hierarchyConfig as merchantId when it has hierarchy config and country of merchant is ECUADOR", (done: Mocha.Done) => {
    merchant_response.country = CountryEnum.ECUADOR;
    deferred_event.requestContext.authorizer.hierarchyConfig =
      JSON.stringify(hierarchy_config);

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(merchant_response)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (res: IDeferredResponse[]): void => {
        expect(invoke_stub).to.be.calledOnce;
        expect(invoke_stub.args[0][1].merchantId).to.be.equal(
          get(hierarchy_config, processing_deferred)
        );
        expect(invoke_stub.args[0][1].merchantId).not.to.be.equal(
          deferred_event.requestContext.authorizer.merchantId
        );
        expect(res).to.eql(deferred_response.deferred);
        done();
      },
    });
  });

  it("Should invoke getDeferred lambda with deferred field of hierarchyConfig as merchantId when it has hierarchy and the processing.deferred field is empty", (done: Mocha.Done) => {
    merchant_response.country = CountryEnum.ECUADOR;
    set(hierarchy_config, "processing.deferred", "");
    deferred_event.requestContext.authorizer.hierarchyConfig =
      JSON.stringify(hierarchy_config);

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(merchant_response)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (res: IDeferredResponse[]): void => {
        expect(invoke_stub).to.be.calledOnce;
        expect(invoke_stub.args[0][1].merchantId).not.to.be.equal(
          get(hierarchy_config, processing_deferred)
        );
        expect(invoke_stub.args[0][1].merchantId).to.be.equal(
          deferred_event.requestContext.authorizer.merchantId
        );
        expect(res).to.eql(deferred_response.deferred);
        done();
      },
    });
  });

  it("Should return default deferred when it has hierarchy config and country of merchant is Colombia", (done: Mocha.Done) => {
    merchant_response.country = CountryEnum.COLOMBIA;
    deferred_event.requestContext.authorizer.hierarchyConfig = hierarchy_config;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(merchant_response)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (res: IDeferredResponse[]): void => {
        expect(invoke_stub).not.to.be.called;
        expect(res).to.eql(CardService.sColombianChileanDeferredOptions);
        done();
      },
    });
  });

  it("Should invoke getDeferred lambda with merchantId of authorizer when it has not hierarchy config and country of merchant is Ecuador", (done: Mocha.Done) => {
    merchant_response.country = CountryEnum.ECUADOR;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().onFirstCall().returns(of(merchant_response)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (res: IDeferredResponse[]): void => {
        expect(invoke_stub).to.be.calledOnce;
        expect(invoke_stub.args[0][1].merchantId).to.be.equal(
          deferred_event.requestContext.authorizer.merchantId
        );
        expect(res).to.eql(deferred_response.deferred);
        done();
      },
    });
  });

  it("Should return default deferred when it has not hierarchy config and country of merchant is Colombia", (done: Mocha.Done) => {
    merchant_response.country = CountryEnum.COLOMBIA;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().onFirstCall().returns(of(merchant_response)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (res: IDeferredResponse[]): void => {
        expect(res).to.equal(CardService.sColombianChileanDeferredOptions);
        expect(invoke_stub).not.to.be.called;
        done();
      },
    });
  });

  it("when deferred is called with timeout error on invokeLambda", (done: Mocha.Done) => {
    merchant_response.country = CountryEnum.ECUADOR;
    process.env.EXTERNAL_TIMEOUT = "100";
    processor_fetch_response.processor_name = ECUADORIAN_PROCESSORS[0];

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().onFirstCall().returns(of(merchant_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );
    invoke_stub = box.stub().returns(of(deferred_response).pipe(delay(110)));
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invoke_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.getMessage()).to.be.equal(ERRORS.E027.message);
        expect(err.code).to.be.contain("027");
        done();
      },
    });
  });

  it("when deferred is called with a bin,it returns deferred object for colombia and chile", (done: Mocha.Done) => {
    merchant_response.country = CountryEnum.COLOMBIA;

    processor_fetch_response.processor_name = COLOMBIAN_PROCESSORS[0];

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().onFirstCall().returns(of(merchant_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (defResp: IDeferredResponse[]): void => {
        expect(defResp[0].months.length).to.eql(47);
        expect(invoke_stub).not.to.be.calledOnce;
        done();
      },
    });
  });

  it("should get an empty object - dynamo undefined objects", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(undefined)),
        query: box.stub().returns(of([])),
      })
    );
    const spy: SinonSpy = box.spy();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      complete: (): void => {
        expect(spy).calledWith([]);
        expect(invoke_stub).to.not.be.called;
        done();
      },
      error: done,
      next: spy,
    });
  });
});

describe("CardService - BinInfo", () => {
  let box: SinonSandbox;
  let service: ICardService;
  let processor: DynamoProcessorFetch;
  const merchant_id: string = "42123333";
  const bin_number: string = "234363";
  const bin_fetch_response: DynamoBinFetch = {
    bank: "bb",
    bin: bin_number,
    brand: "VISA",
    info: {
      type: "credit",
    },
    processor: "NA",
  };
  let deferred_event: IAPIGatewayEvent<
    null,
    BinParameters,
    null,
    AuthorizerContext
  >;
  let tracer: SinonStub;

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .returns(of({ body: { publicId: "123456" } })),
      })
    );
    deferred_event = Mock.of<
      IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
    >({
      headers: { [HEADER]: merchant_id },
      pathParameters: { binNumber: bin_number },
      requestContext: {
        authorizer: {
          merchantId: merchant_id,
        },
      },
    });
    processor = Mock.of<DynamoProcessorFetch>({
      acquirer_bank: "Banco Del Pacifico",
      public_id: "323",
    });
    tracer = box.stub(Tracer.prototype, "putAnnotation");
  });
  afterEach(() => {
    runDependencies(box, tracer);
  });

  function bindDynamoGateway(
    queryCall?: DynamoProcessorFetch[],
    firstCall?: DynamoBinFetch,
    secondCall?: DynamoBinFetch
  ): void {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(firstCall))
          .onSecondCall()
          .returns(of(secondCall)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of(queryCall)),
      })
    );
  }

  function assertTimeOutException(
    cardService: ICardService,
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>,
    done: Mocha.Done
  ): void {
    cardService.binInfo(event).subscribe({
      complete: done,
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq("K027");
        done();
      },
      next: done,
    });
  }

  function getHierarchyConfig(): HierarchyConfig {
    return {
      processing: {
        businessRules: "200000000345046",
        deferred: "200000000345046",
        processors: "200000000345046",
        securityRules: "200000000345046",
      },
    };
  }

  it("get BinInfo but should get an error. Invalid is false, send country", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "ALIA";
    bin_fetch_response.info = { type: null, country: { name: "Ecuador" } };

    bindDynamoGateway([processor], bin_fetch_response);

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(of({ body: { plcc: true } }))
          .onSecondCall()
          .returns(of(bin_fetch_response)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.equal("K029");
        done();
      },
      next: (response: BinInfo): void => {
        expect(response).to.eql({
          bank: "bb",
          brand: "alia",
          cardType: "credit",
          country: "Ecuador",
        });
        done();
      },
    });
  });

  it("get BinInfo but should get an error. Invalid is false, do not send country", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "ALIA";
    bin_fetch_response.info = { type: "debit" };

    bindDynamoGateway([processor], bin_fetch_response);

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(of({ body: { plcc: true } }))
          .onSecondCall()
          .returns(of(bin_fetch_response)),
      })
    );

    const expected_result: BinInfo = {
      bank: "bb",
      brand: "alia",
      cardType: "debit",
    };

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.equal("K029");
        done();
      },
      next: (response: BinInfo): void => {
        expect(response).to.eql(expected_result);
        done();
      },
    });
  });

  it("get BinInfo from card private in Ecuador Commerce", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "ALIA";
    bin_fetch_response.info = { type: null };

    bindDynamoGateway([processor], bin_fetch_response);

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(of({ body: { plcc: true } }))
          .onSecondCall()
          .returns(of(bin_fetch_response)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.eql({
          bank: "bb",
          brand: "alia",
          cardType: "credit",
        });
        done();
      },
    });
  });

  it("get BinInfo but should get an error. Invalid is true", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "ALIA";
    bin_fetch_response.info = { type: null };
    bin_fetch_response.invalid = true;

    bindDynamoGateway([processor], bin_fetch_response);

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(of({ body: { plcc: true } }))
          .onSecondCall()
          .returns(of(bin_fetch_response)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.equal("K029");
        done();
      },
    });
  });

  it("get BinInfo with a private card not found", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "visa";

    bindDynamoGateway([processor], undefined, bin_fetch_response);

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(of({ body: { plcc: true } }))
          .onSecondCall()
          .returns(
            of({
              ...bin_fetch_response,
              info: {
                country: {
                  name: "test",
                },
                type: "debit",
              },
            })
          ),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.equal("K029");
        done();
      },
    });
  });

  it("get BinInfo from regular card in Ecuador Commerce", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "MASTERCARD";
    bindDynamoGateway([processor], bin_fetch_response);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.haveOwnProperty("cardType");
        done();
      },
    });
  });

  it("get BinInfo from regular card in Ecuador Commerce with processor don't support private cards", (done: Mocha.Done) => {
    bin_fetch_response.brand = "VISA";

    bindDynamoGateway([processor], bin_fetch_response);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.haveOwnProperty("brand");
        done();
      },
    });
  });

  it("get BinInfo from card without BinInfo in dynamo ", (done: Mocha.Done) => {
    bindDynamoGateway([processor]);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response.bank).to.eql("");
        done();
      },
    });
  });

  it("get BinInfo from card with bin start with 0 ", (done: Mocha.Done) => {
    bindDynamoGateway([processor]);

    deferred_event.pathParameters.binNumber = "098765";

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      complete: done,
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq("K029");
        done();
      },
      next: done,
    });
  });

  it("get BinInfo throw error if getProcessorDynamo gives timeout", (done: Mocha.Done) => {
    process.env.EXTERNAL_TIMEOUT = "1000";

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .returns(of({ body: { plcc: true } }).pipe(delay(1100))),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertTimeOutException(service, deferred_event, done);
  });

  it("get BinInfo throw error if get item from dynamo for bins gives timeout", (done: Mocha.Done) => {
    process.env.EXTERNAL_TIMEOUT = "1000";

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(of({ body: { plcc: true } }))
          .onSecondCall()
          .returns(of({ body: { publicId: "123456" } }).pipe(delay(1100))),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    assertTimeOutException(service, deferred_event, done);
  });

  it("when hierarchyConfig is an object", (done: Mocha.Done) => {
    deferred_event = Mock.of<
      IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
    >({
      headers: { [HEADER]: merchant_id },
      pathParameters: { binNumber: bin_number },
      requestContext: {
        authorizer: {
          hierarchyConfig: getHierarchyConfig(),
          merchantId: merchant_id,
        },
      },
    });

    processor.plcc = true;
    bin_fetch_response.brand = "MASTERCARD";
    bindDynamoGateway([processor], bin_fetch_response);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.haveOwnProperty("cardType");
        done();
      },
    });
  });
  it("when hierarchyConfig is a string", (done: Mocha.Done) => {
    const hc: string = JSON.stringify(getHierarchyConfig());

    deferred_event = Mock.of<
      IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
    >({
      headers: { [HEADER]: merchant_id },
      pathParameters: { binNumber: bin_number },
      requestContext: {
        authorizer: {
          hierarchyConfig: hc,
          merchantId: merchant_id,
        },
      },
    });

    processor.plcc = true;
    bin_fetch_response.brand = "MASTERCARD";
    bindDynamoGateway([processor], bin_fetch_response);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.haveOwnProperty("cardType");
        done();
      },
    });
  });
});

describe("CardService - Charges Error", () => {
  process.env.THRESHOLD_AMOUNT = "0.05";
  let service: ICardService;
  let box: SinonSandbox;
  let card_stub: SinonStub;
  let process_record_stub: SinonStub;
  let lambda_stub: SinonStub;
  let put: SinonStub;
  let process_stub: SinonStub;
  let build_transaction: SinonStub;
  let put_sqs_stub: SinonStub;
  let aurus_error: AurusError;
  let tracer: SinonStub;
  const unreachable_processor: string = "Procesador inalcanzable";

  function mockLambdaGateway(lambdaStub: SinonStub): void {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambdaStub,
      })
    );
  }

  function mockAurusGateway(cardStub: SinonStub): void {
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: cardStub,
        getAurusToken: box.stub().returns(
          of({
            token: "token",
          })
        ),
        preAuthorization: cardStub,
      })
    );
  }

  function mockTransactionService(processRecordStub: SinonStub): void {
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind(IDENTIFIERS.TransactionService).toConstantValue(
      Mock.of<ITransactionService>({
        buildTransactionObject: box.stub().returns(gTransaction),
        processRecord: processRecordStub,
      })
    );
  }

  beforeEach(() => {
    createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    put = box.stub().returns(of(true));
    sandboxInit(box);
    mockUnifiedChargesRequest();
    gTokenDynamo = Mock.of<TokenDynamo>({
      amount: 1112,
      binInfo: {
        bank: "Bolivariano",
        bin: "123456",
        brand: "MASTERCARD",
        processor: "Credimatic",
      },
      kushkiInfo: {
        manager: "API",
        managerId: "DP002",
        methodId: "KM001",
        methodName: "CARD",
        platformId: "KP001",
        platformName: "API",
        platformVersion: "latest",
      },
      securityIdentity: [
        {
          identityCategory: "TOKEN",
          identityCode: "SI001",
          partnerName: "KUSHKI",
        },
        {
          identityCategory: "CHALLENGER",
          identityCode: "SI001",
          info: {
            status: "PENDING",
            version: "1.2.0",
          },
          partnerName: "3DS",
        },
      ],
      transactionReference: "87348383",
    });
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gMerchantFetch))
          .onThirdCall()
          .returns(of(gMerchantFetch)),
        queryReservedWord: box.stub().returns(of([])),
        updateTokenValue: box.stub().returns(of(gTokenDynamo)),
      })
    );
    aurus_error = new AurusError("228", unreachable_processor, {
      approvalCode: "000000",
      binCard: "450724",
      cardHolderName: "Juan Perez",
      cardType: "VISA",
      isDeferred: "N",
      lastFourDigitsOfCard: "3249",
      merchantName: "",
      processorBankName: "",
      processorCode: "0001",
      processorMessage: "test",
      processorName: ECUADORIAN_PROCESSORS[0],
    });
    process_stub = box.stub().returns(of(gTransaction));
    build_transaction = box.stub().returns(gTransaction);
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind<ITransactionService>(
      IDENTIFIERS.TransactionService
    ).toConstantValue(
      Mock.of<ITransactionService>({
        buildTransactionObject: build_transaction,
        processRecord: process_stub,
      })
    );

    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            currencyCode: CurrencyEnum.USD,
            plcc: "0",
            privateId: "123",
            publicId: "123343",
          },
        })
      )
    );

    gLambdaContext = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(21000),
    });

    gChargesResponse.approvalCode = "GENERICO";
    card_stub = box.stub().returns(of(gAurusResponse));
    put_sqs_stub = box.stub().returns(of(true));
    mockSQSGateway(put_sqs_stub);
    tracer = box.stub(Tracer.prototype, "putAnnotation");
  });
  afterEach(() => {
    runDependencies(box, tracer);
  });

  it("unified charge - AurusError CardService with fullResponse", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockAntifraudBindSiftFlow(box);
    card_stub.throws(aurus_error);
    process.env.USRV_STAGE = "uat";
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.code).to.be.eql("228");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - error K040 for invalid merchant in authorizer", (done: Mocha.Done) => {
    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    card_stub.throws(aurus_error);
    process.env.USRV_STAGE = "uat";
    gTokenDynamo.id = "123";
    gTokenDynamo.merchantId = "22010201020120";

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.preAuthorization(chargesEvent(true), gLambdaContext).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K040");
        done();
      },
    });
  });

  it("unified preauth - AurusError PreAuthorization with fullResponse", (done: Mocha.Done) => {
    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockAntifraudBindSiftFlow(box);
    card_stub.throws(aurus_error);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    gUnifiedTrxRequest.transactionType =
      TransactionRuleTypeEnum.PREAUTHORIZATION;
    gUnifiedTrxRequest.fullResponse = true;
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.code).to.be.eql("228");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - AurusPay Error ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockAntifraudBindSiftFlow(box);
    const aurus_pay_error: AurusError = new AurusError(
      "228",
      unreachable_processor,
      {
        approved_amount: "",
        recap: "0001",
        response_code: "238",
        response_text: "Transacción anulada",
        ticket_number: "",
        transaction_details: {
          approvalCode: "",
          binCard: "",
          cardHolderName: "",
          cardType: "VISA",
          isDeferred: "N",
          lastFourDigitsOfCard: "",
          merchantName: "Kushki Staging test Account",
          processorBankName: "0032~BANCO INTERNACIONAL",
          processorName: ECUADORIAN_PROCESSORS[0],
        },
        transaction_id: "295182854295577817",
      }
    );

    card_stub.throws(aurus_pay_error);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.code).to.be.eql(aurus_pay_error.code);
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - AurusPay Error and go through failover process with enough time to response", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            currencyCode: CurrencyEnum.USD,
            failOverProcessor: {
              privateId: "2",
              processor: "failover",
              publicId: "2",
            },
            plcc: "0",
            privateId: "123",
            publicId: "123343",
          },
        })
      )
    );

    gLambdaContext = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(19000),
    });

    card_stub
      .onFirstCall()
      .returns(of(new AurusError("228", UNREACHABLE_PROCESSOR, {})));
    card_stub.onSecondCall().returns(of(gAurusResponse));
    process_record_stub = box.stub().returns(of(gTransaction));

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockTransactionService(process_record_stub);
    mockAntifraudBindSiftFlow(box);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        next: (rs: object): void => {
          expect(rs).to.has.ownProperty("ticketNumber");
          expect(lambda_stub).to.be.callCount(1);
          expect(card_stub).to.be.callCount(2);
          expect(put_sqs_stub).to.be.callCount(2);
          done();
        },
      });
  });

  it("unified charge - AurusPay Error and go through failover process and not enough time to response", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            currencyCode: CurrencyEnum.USD,
            failOverProcessor: {
              privateId: "2",
              processor: "failover",
              publicId: "2",
            },
            plcc: "0",
            privateId: "123",
            publicId: "123343",
          },
        })
      )
    );

    gLambdaContext = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(2000),
    });

    card_stub
      .onFirstCall()
      .returns(of(new AurusError("228", UNREACHABLE_PROCESSOR, {})));
    card_stub.onSecondCall().returns(of(gAurusResponse));
    set(gTransaction, "transaction_status", TransactionStatusEnum.APPROVAL);
    process_record_stub = box.stub().returns(of(gTransaction));

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockTransactionService(process_record_stub);
    mockAntifraudBindSiftFlow(box);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        next: (rs: object): void => {
          expect(rs).to.has.ownProperty("message");
          expect(get(rs, "message")).to.contains("FailoverVoid");
          expect(lambda_stub).to.be.callCount(2);
          expect(card_stub).to.be.callCount(2);
          expect(put_sqs_stub).to.be.callCount(2);
          done();
        },
      });
  });

  it("unified charge - AurusPay Error and go through failover process and not enough time to response when declined", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            currencyCode: CurrencyEnum.USD,
            failOverProcessor: {
              privateId: "3",
              processor: "failover",
              publicId: "2",
            },
            plcc: "0",
            privateId: "123",
            publicId: "123343",
          },
        })
      )
    );

    gLambdaContext = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(2000),
    });

    card_stub
      .onFirstCall()
      .returns(of(new AurusError("228", UNREACHABLE_PROCESSOR, {})));
    card_stub.onSecondCall().returns(of(gAurusResponse));
    set(gTransaction, "transaction_status", TransactionStatusEnum.DECLINED);
    process_record_stub = box.stub().returns(of(gTransaction));

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockTransactionService(process_record_stub);
    mockAntifraudBindSiftFlow(box);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        next: (rs: object): void => {
          expect(get(rs, "message")).to.contains("DECLINED");
          expect(lambda_stub).to.be.callCount(1);
          expect(card_stub).to.be.callCount(2);
          expect(put_sqs_stub).to.be.callCount(2);
          done();
        },
      });
  });

  it("When unified charge is called, but Aurus Error 322 is thrown , it returns an error K322", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    const expected_error_code: string = "322";
    const response_text_key: string = "response_text";

    card_stub.throws(new AurusError("322", "Error", { qwerty: "lorem" }));

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockAntifraudBindSiftFlow(box);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.isDeferred = true;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.getMessage()).to.eql(ERRORS.E322.message);
          expect(error.getStatusCode()).to.eql(ERRORS.E322.statusCode);
          expect(error.code).to.be.eql(expected_error_code);
          expect(error.getMetadata()[response_text_key]).to.not.eql(
            error.getMessage()
          );
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("When unified charge is called, but Aurus Error 322 with full Response v2", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    card_stub.throws(new AurusError("322", "Error", { qwerty: "lorem" }));
    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    gUnifiedTrxRequest.fullResponse = "v2";
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.getMetadata()).to.haveOwnProperty(
            "transactionReference"
          );
          expect(error.getMetadata()).to.be.eqls({
            approvalCode: gTransaction.approval_code,
            approvedTransactionAmount: gTransaction.approved_transaction_amount,
            binInfo: {
              binCard: gTransaction.bin_card,
              lastFourDigits: gTransaction.last_four_digits,
            },
            cardHolderName: gTransaction.card_holder_name,
            created: gTransaction.created,
            merchantId: gTransaction.merchant_id,
            merchantName: gTransaction.merchant_name,
            paymentBrand: gTransaction.payment_brand,
            processorBankName: gTransaction.processor_bank_name,
            recap: gTransaction.recap,
            requestAmount: gTransaction.request_amount,
            transactionId: gTransaction.transaction_id,
            transactionReference: gTransaction.transaction_reference,
            transactionStatus: gTransaction.transaction_status,
            transactionType: gTransaction.transaction_type,
          });
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - K322 KushkiError in lambda with bin info undefined ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();

    lambda_stub.throws(new KushkiError(ERRORS.E322, ERRORS.E322.message));
    delete gUnifiedTrxRequest.binInfo;
    set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 1);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.metadata = {
      ksh_subscriptionValidation: true,
      property: "value",
    };

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("K322");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  function rebindDynamoGateway() {
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        queryReservedWord: box.stub().returns(of([])),
      })
    );
  }

  it("When unified charge is called, but Aurus Error 500 is thrown , it returns an error", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    const expected_error_code: string = "500";
    const expected_message: string = "Procesador inalcanzable";

    card_stub.throws(
      new AurusError("500", expected_message, { processorName: "" })
    );

    gProcessorFetch.processor_name = ProcessorEnum.DATAFAST;
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    rebindDynamoGateway();

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockAntifraudBindSiftFlow(box);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.eql(expected_message);
          expect(error.getStatusCode()).to.eql(400);
          expect(error.code).to.be.eql(expected_error_code);
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("When unified charge is called with deferred, but Aurus Error 500 is thrown , it returns an error", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    const expected_error_code: string = "500";
    const expected_message: string = "Internal server error";

    card_stub.throws(
      new AurusError("500", expected_message, { processorName: "" })
    );

    gUnifiedTrxRequest.isDeferred = true;
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gProcessorFetch.processor_name = ProcessorEnum.CREDIMATIC;
    rebindDynamoGateway();

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);
    mockAntifraudBindSiftFlow(box);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    gChargesRequest.months = 6;
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.getStatusCode()).to.eql(400);
          expect(error.getMessage()).to.eql(expected_message);
          expect(error.code).to.be.eql(expected_error_code);
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("When unified charge is called with unknown error, it returns an error", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    card_stub.throws(new Error("error"));

    gUnifiedTrxRequest.isDeferred = true;
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gProcessorFetch.processor_name = ProcessorEnum.CREDIMATIC;
    rebindDynamoGateway();

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    gChargesRequest.months = 6;
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: Error): void => {
          expect(error).to.not.be.undefined;
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - KushkiError in  lambda  with fullResponse   ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();

    lambda_stub.throws(new KushkiError(ERRORS.E003));
    gUnifiedTrxRequest.fullResponse = "v2";

    gUnifiedTrxRequest.binInfo = {
      bank: "Pichincha",
      bin: "",
      brand: "VISA",
      processor: "CREDIMATIC",
    };

    set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 1);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("K003");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - K322 KushkiError in  lambda  with fullResponse and metadata should return event metadata on error ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();

    lambda_stub.throws(new KushkiError(ERRORS.E322, ERRORS.E322.message));
    gUnifiedTrxRequest.fullResponse = "v2";
    gUnifiedTrxRequest.binInfo = {
      bank: "Pichincha",
      bin: "",
      brand: "VISA",
      processor: "CREDIMATIC",
    };
    set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 1);
    gUnifiedTrxRequest.metadata = {
      test: "TEST",
      test2: "TEST2",
    };
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("K322");
          expect(
            Object.prototype.hasOwnProperty.call(
              error.getMetadata(),
              "metadata"
            )
          ).to.be.eql(false);
          expect(
            Object.prototype.hasOwnProperty.call(
              error.getMetadata(),
              "transactionReference"
            )
          ).to.be.eql(true);
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("charges - K322 KushkiError should return event metadata on error with field rules ", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    lambda_stub.throws(
      new KushkiError(ERRORS.E322, ERRORS.E322.message, {
        rules: [
          {
            code: "K322",
            limitMerchant: 2,
            limitProcessor: 2,
            message: "Superaste el límite de reintentos para esta transacción",
          },
        ],
      })
    );

    mock_charges_event.body.fullResponse = true;

    mock_charges_event.body.binInfo = {
      bank: "Pichincha",
      brand: "VISA",
      processor: "CREDIMATIC",
    };
    mock_charges_event.body.months = 1;
    gTokenDynamo.merchantId = CHARGE_MID;

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event, gLambdaContext).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K322");
        expect(get(error.getMetadata(), "rules")).to.be.deep.eq([
          {
            code: "K322",
            limitMerchant: 2,
            limitProcessor: 2,
            message: "Superaste el límite de reintentos para esta transacción",
          },
        ]);
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  it("charges - K001 KushkiError should return when cit  mit validation return false", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    lambda_stub.returns(of(true));

    mock_charges_event.body.citMit = "C101";
    mock_charges_event.body.amount = {
      subtotalIva: 0,
      subtotalIva0: 0,
      iva: 0,
    };
    mock_charges_event.body.transactionMode = TransactionModeEnum.VALIDATE_CARD;

    mockLambdaGateway(lambda_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event, gLambdaContext).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K001");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  it("should throw K220 error if amount is more than threshold ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.amount = {
      extraTaxes: {
        agenciaDeViaje: 12,
        iac: 10,
        propina: 20,
        tasaAeroportuaria: 10,
      },
      ice: 2,
      iva: 0,
      subtotalIva: 0,
      subtotalIva0: 1000.06,
    };
    mockLambdaGateway(lambda_stub);

    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eql("K220");
          expect(
            Object.prototype.hasOwnProperty.call(err.getMetadata(), "metadata")
          ).to.be.eql(true);
          expect(
            Object.prototype.hasOwnProperty.call(
              err.getMetadata(),
              "transaction_id"
            )
          ).to.be.eql(true);
          done();
        },
      });
  });

  it("should throw K220 error if amount is smaller than threshold ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    gUnifiedTrxRequest.amount.totalAmount = 1085;
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.amount = {
      extraTaxes: {
        agenciaDeViaje: 12,
        iac: 10,
        propina: 20,
        tasaAeroportuaria: 10,
        tip: 1,
      },
      ice: 2,
      iva: 10,
      subtotalIva: 20,
      subtotalIva0: 999.94,
    };
    mockLambdaGateway(lambda_stub);

    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (err: KushkiError) => {
          expect(
            Object.prototype.hasOwnProperty.call(err.getMetadata(), "metadata")
          ).to.be.eql(true);
          expect(err.getMetadata()).to.have.property("transaction_id");
          expect(err.code).to.be.eql("K220");
          done();
        },
      });
  });

  it("should throw K220 error if amount is smaller ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();

    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.amount.totalAmount = 1080;
    gUnifiedTrxRequest.amount = {
      extraTaxes: {
        iac: 10,
        propina: 20,
        reducedStateTax: 11,
        tasaAeroportuaria: 10,
      },
      ice: 2,
      iva: 10,
      subtotalIva: 20,
      subtotalIva0: 999.94,
    };
    mockLambdaGateway(lambda_stub);

    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (err: KushkiError) => {
          expect(
            Object.prototype.hasOwnProperty.call(
              err.getMetadata(),
              "transaction_id"
            )
          ).to.be.eql(true);
          expect(
            Object.prototype.hasOwnProperty.call(err.getMetadata(), "metadata")
          ).to.be.eql(true);
          expect(err.code).to.be.eql("K220");
          done();
        },
      });
  });

  it("should throw K220 error if amount is smaller sf", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();

    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.amount = {
      extraTaxes: {
        municipalTax: 11,
        propina: 20,
        reducedStateTax: 11,
        tasaAeroportuaria: 10,
      },
      ice: 2,
      iva: 10,
      subtotalIva: 20,
      subtotalIva0: 999.94,
    };
    gUnifiedTrxRequest.amount.totalAmount = 1081;
    mockLambdaGateway(lambda_stub);

    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (err: KushkiError) => {
          expect(
            Object.prototype.hasOwnProperty.call(err.getMetadata(), "metadata")
          ).to.be.eql(true);
          expect(err.code).to.be.eql("K220");
          done();
        },
      });
  });
  it("should throw K220 error if amount is smaller rd", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    mockLambdaGateway(lambda_stub);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.amount.totalAmount = 1082;
    gUnifiedTrxRequest.amount = {
      extraTaxes: {
        municipalTax: 11,
        reducedStateTax: 11,
        stateTax: 20,
        tasaAeroportuaria: 10,
      },
      ice: 2,
      iva: 10,
      subtotalIva: 20,
      subtotalIva0: 999.94,
    };

    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.getMetadata()).to.have.property("transaction_id");
          expect(err.code).to.be.eql("K220");
          done();
        },
      });
  });

  it("should throw K220 error if amount is smaller ts", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();

    gUnifiedTrxRequest.amount = {
      extraTaxes: {
        municipalTax: 12,
        reducedStateTax: 11,
        stateTax: 20,
      },
      ice: 1,
      iva: 11,
      subtotalIva: 19,
      subtotalIva0: 999.94,
    };
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.amount.totalAmount = 1083;

    mockLambdaGateway(lambda_stub);
    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eql("K220");
          done();
        },
      });
  });

  it("unified charge - KushkiError in  lambda  with information    ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    lambda_stub.throws(new KushkiError(ERRORS.E003));
    gUnifiedTrxRequest.fullResponse = "v2";
    set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 0);
    gTokenDynamo.merchantId = CHARGE_MID;

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("K003");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - KushkiError in  lambda  without information    ", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    unset(gMerchantFetch, "merchant_name");
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);

    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        queryReservedWord: box.stub().returns(of([])),
      })
    );

    lambda_stub.throws(new KushkiError(ERRORS.E003));
    gUnifiedTrxRequest.fullResponse = "v2";
    set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 0);

    mockLambdaGateway(lambda_stub);
    mockAurusGateway(card_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eql("K003");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("unified charge - throw error for token already used", (done: Mocha.Done) => {
    mockUnifiedChargesRequest();
    set(gUnifiedTrxRequest, DEFERRED_MONTHS_PATH, 0);
    gUnifiedTrxRequest.merchant.merchantId = CHARGE_MID;
    gUnifiedTrxRequest.tokenId = "123";

    mockLambdaGateway(lambda_stub);
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        queryReservedWord: box.stub().returns(of([gTransaction])),
      })
    );
    mockAurusGateway(card_stub);
    mockAntifraudBindSiftFlow(box);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedChargesOrPreAuth(gUnifiedTrxRequest, gLambdaContext)
      .subscribe({
        error: (error: KushkiError): void => {
          expect(put_sqs_stub).to.be.callCount(1);
          expect(error.code).to.be.eql("577");
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });
});

describe("CardService - Capture", () => {
  let service: ICardService;
  let box: SinonSandbox;
  let put: SinonStub;
  let capture_stub: SinonStub;
  let lambda_stub: SinonStub;
  let sqs_put_stub: SinonStub;
  let tracer: SinonStub;
  let lambda_stub_response: object;

  function captureEvent(
    amount: object = {
      currency: CurrencyEnum.COP,
      extraTaxes: {},
      ice: 0.1,
      iva: 5,
      subtotalIva: 5,
      subtotalIva0: 0,
    }
  ): IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext> {
    const event = Mock.of<
      IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext>
    >({
      body: {
        ...gCaptureRequest,
        amount,
      },
      headers: {},
      requestContext: Mock.of<IRequestContext<AuthorizerContext>>({
        authorizer: {
          hierarchyConfig: CONTEXT_HIERARCHY_CONFIG,
          merchantId: CHARGE_MID,
          sandboxEnable: true,
        },
      }),
    });

    event.headers[HEADER_NAME] = "123455799754313";

    return event;
  }

  function validateCapture(
    data: object,
    ticketNumber: string,
    done: Mocha.Done
  ): void {
    expect(data).to.have.property("ticketNumber", ticketNumber);
    done();
  }

  function validateCaptureAndInvokeTrxRule(
    data: object,
    ticketNumber: string,
    done: Mocha.Done
  ) {
    validateCapture(data, ticketNumber, done);
  }

  function mockProviderService(
    captureStub: SinonStub | undefined,
    variantStub: CardProviderEnum
  ): void {
    CONTAINER.unbind(IDENTIFIERS.ProviderService);
    CONTAINER.bind(IDENTIFIERS.ProviderService).toConstantValue(
      Mock.of<IProviderService>({
        capture: captureStub,
        variant: variantStub,
      })
    );
  }

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    process.env.LAMBDA_RULE = "usrv-transaction-rule-qa-processor";
    process.env.IVA_VALUES = `{ "USD": 0.12, "COP": 0.19, "CLP": 0.19, "UF": 0.19, "PEN": 0.18, "MXN": 0.16 }`;
    CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
      Mock.of<ISandboxGateway>({
        chargesTransaction: box.stub().returns({}),
        tokensTransaction: box.stub().returns({}),
      })
    );
    process.env.MERCHANT_IDS_TUENTI = "merchantidTuenti,123";
    rollbarInstance(box);
    sandboxInit(box);
    lambda_stub_response = {
      body: { acquirerBank: "Banco Pacifico2", publicId: "123456" },
    };
    lambdaGateway(box, lambda_stub_response);
    createSchemas();
    lambdaStubTransactionRule(box);
    capture_stub = mockCaptureTransaction();
    sqs_put_stub = box.stub().returns(of(true));
    tracer = box.stub(Tracer.prototype, "putAnnotation");
  });

  function mockDynamo(queryStub?: SinonStub): void {
    put = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(gBinFetch)),
        query:
          queryStub ||
          box
            .stub()
            .onFirstCall()
            .returns(of([gTransaction]))
            .onSecondCall()
            .returns(of([gTransaction])),
        queryTransactionBySeqIdAndCreated: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction, gTransaction]))
          .onSecondCall()
          .returns(of([gTransaction, gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction, gTransaction]))
          .onSecondCall()
          .returns(of([gTransaction, gTransaction])),
      })
    );
  }

  function mockCaptureTransaction(isError?: boolean): SinonStub {
    const response_stub = !isError
      ? box.stub().returns(of(gAurusResponse))
      : box.stub().rejects(new KushkiError(ERRORS.E041));

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        captureTransaction: response_stub,
      })
    );

    return response_stub;
  }

  function mockInvokeTrxRule() {
    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = lambdaStubTransactionRule(box);
    lambdaServiceBinding(lambda_stub);
  }

  afterEach(() => {
    runDependencies(box, tracer);
  });

  it("should return error when merchant does not exist", (done: Mocha.Done) => {
    const capture_event = captureEvent();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().onFirstCall().returns(of(undefined)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: (err: KushkiError) => {
        expect(err.code).to.be.eq("K004");
        done();
      },
    });
  });

  it("should return error when ticket number is empty", (done: Mocha.Done) => {
    const capture_event = captureEvent();
    capture_event.body.ticketNumber = "";
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().onFirstCall().returns(of(gMerchantFetch)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: (err: KushkiError) => {
        expect(err.code).to.be.eq("K001");
        done();
      },
    });
  });

  it("should return error when capture is duplicated and processor is Kushki Acquirer", (done: Mocha.Done) => {
    const capture_event = captureEvent();
    process.env.KUSHKI_ADQUIRER_VARS = TEST_TIME_LIMITS;
    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      transbank: `123456789`,
    });
    capture_event.body.amount = {
      currency: CurrencyEnum.COP,
      iva: 6,
      subtotalIva: 6,
      subtotalIva0: 0,
    };
    delete capture_event.body.fullResponse;
    capture_event.body.metadata = {
      customerId: "1736PE",
    };
    capture_event.body.orderDetails = {
      order: "demo",
    };
    gTransaction.approved_transaction_amount = 103;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    gTransaction.processor_name = ProcessorEnum.KUSHKI;
    gProcessorFetch.processor_name = ProcessorEnum.KUSHKI;
    gProcessorFetch.acquirer_bank = "BP";
    lambda_stub_response = {
      body: {
        processor: ProcessorEnum.KUSHKI,
      },
    };
    lambdaGateway(box, lambda_stub_response);
    mockSQSGateway(sqs_put_stub);
    mockDynamo(
      box
        .stub()
        .onFirstCall()
        .returns(of([gTransaction]))
        .onSecondCall()
        .returns(
          of([
            { ...gTransaction, transaction_type: TransactionTypeEnum.CAPTURE },
          ])
        )
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: (err: KushkiError) => {
        expect(err.code).to.be.eq("K051");
        expect(err.getMessage()).to.be.eqls(ERRORS.E051.message);
        done();
      },
    });
  });

  it("works with the correct ticket number without an amount", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";
    const capture_event = captureEvent();

    delete capture_event.body.amount;
    delete capture_event.body.fullResponse;
    capture_event.body.metadata = {
      customerId: "1736PE",
    };
    gTransaction.approved_transaction_amount = 100;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;

    gProcessorFetch.acquirer_bank = "BP";
    set(gMerchantFetch, "sandboxEnable", false);
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;
    capture_stub = mockCaptureTransaction();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => {
        validateCaptureAndInvokeTrxRule(data, ticket_number, done);
      },
    });
  });

  it("works with the correct ticket number without an order details", (done: Mocha.Done) => {
    const ticket_number = "1234567989";
    const capture_event = captureEvent();

    capture_event.body.amount = {
      currency: CurrencyEnum.COP,
      iva: 5,
      subtotalIva: 5,
      subtotalIva0: 0,
    };
    delete capture_event.body.fullResponse;
    capture_event.body.metadata = {
      customerId: "1736PE",
    };
    capture_event.body.orderDetails = {
      order: "demo",
    };
    gTransaction.approved_transaction_amount = 100;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;

    gProcessorFetch.acquirer_bank = "BP";
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => validateCapture(data, ticket_number, done),
    });
  });

  it("works with the correct ticket number with UF currency", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";

    set(gTokenDynamo, "currency", "UF");
    process.env.IVA_CL = "0.19";
    gTransaction.approved_transaction_amount = 30000;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.currency_code = CurrencyEnum.UF;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(
            of(
              Mock.of<ConvertionResponse>({
                body: {
                  convertedCurrency: "CLP",
                  newAmount: 28000,
                },
              })
            )
          )
          .onSecondCall()
          .returns(
            of(
              Mock.of<{ body: SandboxChargeResponse }>({
                body: {
                  response_code: "000",
                  response_text: "aprovada",
                  ticket_number: "123",
                },
              })
            )
          ),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "UF",
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          {
            validateCapture(data, ticket_number, done);
          }
        },
      });
  });

  it("works with the correct ticket number with UF currency and iva = 0", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";

    gTransaction.approved_transaction_amount = 30000;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    set(gTransaction, "currency_code", "UF");
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .onFirstCall()
          .returns(
            of(
              Mock.of<ConvertionResponse>({
                body: {
                  convertedCurrency: "CLP",
                  newAmount: 28000,
                },
              })
            )
          )
          .onSecondCall()
          .returns(
            of(
              Mock.of<{ body: SandboxChargeResponse }>({
                body: {
                  response_code: "000",
                  response_text: "aprovada",
                  ticket_number: "123",
                },
              })
            )
          ),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "UF",
          iva: 0,
          subtotalIva: 5,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          validateCapture(data, ticket_number, done);
        },
      });
  });

  it("works with the correct ticket number and a correct amount", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";

    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.currency_code = CurrencyEnum.CLP;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            propina: 0.1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          validateCapture(data, ticket_number, done);
        },
      });
  });

  it("works when is kushki processor and amount is correct ", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";

    process.env.KUSHKI_ADQUIRER_VARS = '{"CAPTURE_PERCENTAGE":15}';
    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.processor_name = ProcessorEnum.KUSHKI;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "COP",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            propina: 0.1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          validateCapture(data, ticket_number, done);
        },
      });
  });

  it("should return error when capture amount is greater than the sum of the previous transactions ", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";

    process.env.KUSHKI_ADQUIRER_VARS = '{"CAPTURE_PERCENTAGE":20}';
    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.processor_name = ProcessorEnum.KUSHKI;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "COP",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            propina: 0.1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 0,
          subtotalIva: 50,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equals("K012");
          done();
        },
      });
  });

  it("should return error when original currency is different than request currency", (done: Mocha.Done) => {
    gTransaction.processor_name = ProcessorEnum.KUSHKI;
    gTransaction.approved_transaction_amount = 10;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    gTransaction.merchant_id = CHARGE_MID;
    const ticket_number: string = "000";

    mockDynamo();
    process.env.KUSHKI_ADQUIRER_VARS = '{"CAPTURE_PERCENTAGE":10}';

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "USD",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            propina: 0.1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 0,
          subtotalIva: 50,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equals("K042");
          done();
        },
      });
  });

  it("Should works when is kushki processor and created is greater than feature flag", (done: Mocha.Done) => {
    const ticket_number: string = "1234567234";

    process.env.KUSHKI_ADQUIRER_VARS = '{"CAPTURE_PERCENTAGE":10}';
    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.processor_name = ProcessorEnum.KUSHKI;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    gTransaction.currency_code = "MXN";
    delete gProcessorFetch.acquirer_bank;
    mockDynamo();
    mockSQSGateway(sqs_put_stub);

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "MXN",
          extraTaxes: {
            agenciaDeViaje: 0.5,
            iac: 0.1,
            propina: 0.2,
            tasaAeroportuaria: 0.1,
          },
          ice: 0.3,
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          validateCapture(data, ticket_number, done);
        },
      });
  });

  it("works with the correct ticket number, a correct amount and token alredy expired", (done: Mocha.Done) => {
    const ticket_number = "1234567989";

    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.currency_code = "CLP";
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    mockSQSGateway(sqs_put_stub);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(undefined))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(gBinFetch)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([gTransaction])),
      })
    );

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            propina: 0.1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void =>
          validateCapture(data, ticket_number, done),
      });
  });

  it("works with the correct ticket number, a correct amount and merchanId is from tuenti and token is undefined", (done: Mocha.Done) => {
    const ticket_number = "1234567989";

    g3Transaction = Mock.of<Transaction>({
      created: 123,
      transaction_reference: "fake transaction 3",
    });
    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = "merchantidTuenti";
    gTransaction.currency_code = "CLP";
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(undefined))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(gBinFetch)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([g2Transaction, g3Transaction])),
      })
    );
    mockSQSGateway(sqs_put_stub);
    gAurusResponse.ticket_number = ticket_number;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    const event_capture = captureEvent({
      currency: "CLP",
      extraTaxes: {
        agenciaDeViaje: 0.2,
        iac: 0.2,
        propina: 0.1,
        tasaAeroportuaria: 0.5,
      },
      ice: 0.1,
      iva: 5,
      subtotalIva: 5,
      subtotalIva0: 0,
    });

    event_capture.requestContext.authorizer.merchantId = "merchantidTuenti";
    service.capture(event_capture, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => validateCapture(data, ticket_number, done),
    });
  });

  it("works with the correct ticket number, a correct amount and merchanId is from tuenti", (done: Mocha.Done) => {
    const ticket_number = "1234567989";

    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = "merchantidTuenti";
    gTransaction.currency_code = "CLP";
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    mockSQSGateway(sqs_put_stub);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(gBinFetch)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([gTransaction, g2Transaction])),
      })
    );

    gAurusResponse.ticket_number = ticket_number;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    const event_capture = captureEvent({
      currency: "CLP",
      extraTaxes: {
        agenciaDeViaje: 0.2,
        iac: 0.2,
        propina: 0.1,
        tasaAeroportuaria: 0.5,
      },
      ice: 0.1,
      iva: 5,
      subtotalIva: 5,
      subtotalIva0: 0,
    });

    event_capture.requestContext.authorizer.merchantId = "merchantidTuenti";
    service.capture(event_capture, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => validateCapture(data, ticket_number, done),
    });
  });

  it("works with the correct ticket number and a correct amount using extra taxes from puerto rico", (done: Mocha.Done) => {
    const ticket_number = "1234567989";

    gTransaction.approved_transaction_amount = 14;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.currency_code = CurrencyEnum.CLP;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            municipalTax: 1,
            propina: 0.1,
            reducedStateTax: 1,
            stateTax: 1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void =>
          validateCapture(data, ticket_number, done),
      });
  });

  it("when capture is called with no extraTaxes, it will validate the capture", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";

    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.currency_code = CurrencyEnum.CLP;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    delete gProcessorFetch.acquirer_bank;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {},
          ice: 0.1,
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          validateCapture(data, ticket_number, done);
        },
      });
  });

  it("respond with a fullResponse", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";
    const capture_event = captureEvent({
      currency: CurrencyEnum.COP,
      extraTaxes: {},
      ice: 0.1,
      iva: 5,
      subtotalIva: 5,
      subtotalIva0: 0,
    });

    capture_event.body.fullResponse = true;
    set(gMerchantFetch, "sandboxEnable", false);
    gTransaction.approved_transaction_amount = 100;
    gTransaction.transaction_reference = "12343345";
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    put = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(undefined))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(
            of({
              ...gMerchantFetch,
              sandboxEnable: false,
            })
          )
          .onCall(4)
          .returns(of(gBinFetch)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box.stub().returns(of([])),
      })
    );
    mockSQSGateway(sqs_put_stub);
    mockInvokeTrxRule();

    gAurusResponse.ticket_number = ticket_number;
    gAurusResponse.transaction_id = "laboreipsum";
    capture_stub = mockCaptureTransaction();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data).to.have.property("ticketNumber", ticket_number);
        expect(data).to.have.property("transactionReference");
        expect(data).to.have.property("details").and.have.property("binInfo");
        expect(data).to.have.property("details");
        expect(data)
          .to.have.property("details")
          .and.have.property("preauthTransactionReference", "12343345");
        done();
      },
    });
  });

  it(" Should respond with a hierarchyConfig object when it is called", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";
    const capture_event = captureEvent({
      currency: CurrencyEnum.COP,
      extraTaxes: {},
      ice: 0.1,
      iva: 5,
      subtotalIva: 5,
      subtotalIva0: 0,
    });

    capture_event.body.fullResponse = true;
    set(gMerchantFetch, "sandboxEnable", false);
    gTransaction.approved_transaction_amount = 100;
    gTransaction.transaction_reference = "12343345";
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    put = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(
            of({
              ...gMerchantFetch,
              sandboxEnable: false,
            })
          )
          .onCall(4)
          .returns(of(gBinFetch)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionBySeqIdAndCreated: box
          .stub()
          .returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([gTransaction])),
      })
    );
    mockSQSGateway(sqs_put_stub);
    mockInvokeTrxRule();

    gAurusResponse.ticket_number = ticket_number;
    gAurusResponse.transaction_id = "laboreipsum";
    capture_stub = mockCaptureTransaction();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: done,
      next: (): void => {
        expect(lambda_stub).to.be.calledOnce;
        expect(lambda_stub.args[0][1].body.hierarchyConfig).to.be.deep.equals(
          get(capture_event, PATH_HIERARCHY_CONFIG, "{}")
        );
        done();
      },
    });
  });

  it("saves capture transaction with monitoring fields", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";
    const capture_event = captureEvent();

    capture_event.body.fullResponse = true;

    gTransaction.approved_transaction_amount = 100;
    gTransaction.transaction_reference = "12343345";
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    put = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(
            of({
              ...gMerchantFetch,
              sandboxEnable: false,
            })
          )
          .onCall(4)
          .returns(of(gBinFetch)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([gTransaction])),
      })
    );

    mockSQSGateway(sqs_put_stub);
    mockInvokeTrxRule();

    gAurusResponse.ticket_number = ticket_number;
    gAurusResponse.transaction_id = "laboreipsum";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      next: (data: object): void => {
        validateMonitorFields(data, sqs_put_stub, done);
      },
    });
  });

  it("respond with fullResponse when processor acquirer bank isn't undefined", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";
    const capture_event = captureEvent();

    capture_event.body.fullResponse = true;

    gTransaction.approved_transaction_amount = 100;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.acquirer_bank = "bankTest";
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    gProcessorFetch.private_id = "34345";
    gProcessorFetch.public_id = "123123";
    put = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(
            of({
              ...gMerchantFetch,
              sandboxEnable: false,
            })
          )
          .onCall(4)
          .returns(of(gBinFetch)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([gTransaction])),
      })
    );
    gAurusResponse.transaction_details = {
      approvalCode: "111111",
      binCard: "424242",
      cardHolderName: "Jhon Doe",
      cardType: "VISA",
      isDeferred: "N",
      lastFourDigitsOfCard: "4242",
      merchantName: "merchantName",
      processorBankName: "",
      processorName: "Transbank Processor",
    };

    gAurusResponse.ticket_number = ticket_number;
    mockSQSGateway(sqs_put_stub);

    const response_stub = box.stub().returns(of(gAurusResponse));

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        captureTransaction: response_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data).to.have.property("ticketNumber", ticket_number);
        expect(data)
          .to.have.property("details")
          .and.have.property("acquirerBank", "Banco Pacifico2");
        done();
      },
    });
  });

  it("respond with fullResponse when processor acquirer bank is undefined", (done: Mocha.Done) => {
    const capture_event = captureEvent();

    capture_event.body.fullResponse = true;

    gProcessorFetch.acquirer_bank = undefined;
    put = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(
            of({
              ...gMerchantFetch,
              sandboxEnable: false,
            })
          )
          .onCall(4)
          .returns(of(gBinFetch)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([gTransaction])),
      })
    );
    mockSQSGateway(sqs_put_stub);

    gAurusResponse.ticket_number = "1234567989";
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      next: (data: object): void => {
        expect(data).to.not.have.property("acquirerBank");
        done();
      },
    });
  });

  it("Should save 3ds info in dynamo trx, when preauth original trx has 3ds props and capture is not duplicated", (done: Mocha.Done) => {
    const direct_integrations: DirectIntegrationProcessorIds =
      Mock.of<DirectIntegrationProcessorIds>({
        kushki: "12345",
      });

    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS =
      JSON.stringify(direct_integrations);
    process.env.KUSHKI_ADQUIRER_VARS = TEST_TIME_LIMITS;
    lambda_stub_response = {
      body: {
        processor: ProcessorEnum.KUSHKI,
      },
    };
    const capture_event = captureEvent();
    const threeDSObj: object = {
      cavv: "cavv1",
      eci: "eci2",
      xid: "xid3",
      directoryServerTransactionID: "dsId",
      specificationVersion: "2.0",
      ucaf: "ucaf2",
      veresEnrolled: "Y",
    };
    const secure_id: string = "432-234-111";
    const secure_service: string = "3dsecure";

    set(gTransaction, "security.3ds", threeDSObj);
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    gTokenDynamo = Mock.of<TokenDynamo>({
      secureService: secure_service,
      secureId: secure_id,
    });
    mockDynamo(
      box
        .stub()
        .onFirstCall()
        .returns(of([gTransaction]))
        .onSecondCall()
        .returns(of([]))
    );
    lambdaGateway(box, lambda_stub_response);
    mockSQSGateway(sqs_put_stub);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      next: (data: object): void => {
        const put_args = sqs_put_stub.args[0][1];

        expect(put_args["security"])
          .to.haveOwnProperty("3ds")
          .to.deep.includes(threeDSObj);
        expect(put_args)
          .to.haveOwnProperty("secureService")
          .to.be.eql(secure_service);
        expect(put_args).to.haveOwnProperty("secureId").to.be.eql(secure_id);
        done();
      },
    });
  });

  it("respond with fullResponse when processoris billpocket", (done: Mocha.Done) => {
    const capture_event = captureEvent();

    capture_event.body.fullResponse = true;
    gTransaction.processor_name = ProcessorEnum.BILLPOCKET;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;

    gProcessorFetch.acquirer_bank = undefined;
    put = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(
            of({
              ...gMerchantFetch,
              sandboxEnable: false,
            })
          )
          .onCall(4)
          .returns(of(gBinFetch)),
        query: box.stub().returns(of([gTransaction])),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([gTransaction])),
      })
    );
    mockSQSGateway(sqs_put_stub);

    gAurusResponse.ticket_number = "1234567989";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      next: (data: object): void => {
        expect(get(data, "details.processorName", "")).to.be.equal("Prosa Agr");
        done();
      },
    });
  });

  it("works on on superior amount below or equal to 20% of initial approved amount", (done: Mocha.Done) => {
    const ticket_number: string = "1234567989";

    gAurusResponse.ticket_number = ticket_number;

    gTransaction.approved_transaction_amount = 200;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.currency_code = CurrencyEnum.CLP;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 200,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          validateCapture(data, ticket_number, done);
        },
      });
  });

  it("When call capture method with niubiz, and exist merchantId in DIRECT_INTEGRATION_PROCESSOR_IDS env", (done: Mocha.Done) => {
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            integration: "direct",
            processor: ProcessorEnum.NIUBIZ,
            publicId: "1212121212",
          },
        })
      )
    );

    CONTAINER.unbind(CORE.LambdaGateway);
    lambdaServiceBinding(lambda_stub);
    const ticket_number = "1234567989";

    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
      niubiz: `1212121212,1111,1234`,
      redeban: "1234,155,555",
    });
    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.currency_code = CurrencyEnum.CLP;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;

    CONTAINER.unbind(CORE.LambdaGateway);
    lambdaServiceBinding(lambda_stub);
    delete gProcessorFetch.acquirer_bank;
    gProcessorFetch.processor_name = ProcessorEnum.NIUBIZ;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;
    mockProviderService(capture_stub, CardProviderEnum.NIUBIZ);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            propina: 0.1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          validateCapture(data, ticket_number, done);
        },
      });
  });

  it("When call capture method with niubiz, and not exist merchantId in DIRECT_INTEGRATION_PROCESSOR_IDS env", (done: Mocha.Done) => {
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            integration: "direct",
            processor: ProcessorEnum.NIUBIZ,
          },
        })
      )
    );

    CONTAINER.unbind(CORE.LambdaGateway);
    lambdaServiceBinding(lambda_stub);

    const ticket_number: string = "1234567989";

    gTransaction.approved_transaction_amount = 10;
    gTransaction.merchant_id = CHARGE_MID;
    gTransaction.currency_code = CurrencyEnum.CLP;
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;

    CONTAINER.unbind(CORE.LambdaGateway);
    lambdaServiceBinding(lambda_stub);
    delete gProcessorFetch.acquirer_bank;
    gProcessorFetch.processor_name = ProcessorEnum.NIUBIZ;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;
    mockProviderService(capture_stub, CardProviderEnum.NIUBIZ);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            propina: 0.1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        }),
        gLambdaContext
      )
      .subscribe({
        error: done,
        next: (data: object): void => {
          validateCapture(data, ticket_number, done);
        },
      });
  });

  it("Succes when Capture transaction is called with Transbank processor", (done: Mocha.Done) => {
    const direct_integrations: DirectIntegrationProcessorIds =
      Mock.of<DirectIntegrationProcessorIds>({
        transbank: `12345678`,
      });

    process.env.DIRECT_INTEGRATION_PROCESSOR_IDS =
      JSON.stringify(direct_integrations);
    gInvokeFunctionStub = box.stub().returns(
      of({
        body: {
          acquirerBank: "Banco Pacifico3",
          processor: ProcessorEnum.TRANSBANK,
          publicId: "12345678",
        },
      })
    );

    mockProviderService(capture_stub, CardProviderEnum.TRANSBANK);
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: gInvokeFunctionStub,
      })
    );
    const ticket_number = "1234567989";
    const capture_event = captureEvent();

    delete capture_event.body.fullResponse;
    capture_event.body.metadata = {
      customerId: "1736PE",
    };
    gTransaction.approved_transaction_amount = 100;
    gTransaction.merchant_id = CHARGE_MID;
    gProcessorFetch.acquirer_bank = "BP";
    gTransaction.transaction_type = TransactionTypeEnum.PREAUTH;
    mockSQSGateway(sqs_put_stub);
    mockDynamo();
    gAurusResponse.ticket_number = ticket_number;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event, gLambdaContext).subscribe({
      error: done,
      next: (data: object): void => {
        validateCapture(data, ticket_number, done);
      },
    });
  });
});

describe("CardService - unifiedCapture", () => {
  let service: ICardService;
  let box: SinonSandbox;
  let event: UnifiedCaptureRequest;
  let capture_request: CaptureCardRequest;
  let authorizer: AuthorizerContext;
  let token: DynamoTokenFetch;
  let subscription: SubscriptionDynamo;
  let pre_auth_transaction: Transaction;
  let subscription_transaction: SubscriptionTransactionDynamo[];
  let trx_rule_response: LambdaTransactionRuleBodyResponse;
  let card_stub: SinonStub;
  let sqs_put_stub: SinonStub;
  let lambda_stub: SinonStub;
  let tracer: SinonStub;

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue(
      Mock.of<Context>({
        getRemainingTimeInMillis: box.stub().returns(300),
      })
    );
    capture_request = Mock.of<CaptureCardRequest>({
      amount: {
        currency: "USD",
        iva: 0,
        subtotalIva: 110,
        subtotalIva0: 0,
      },
      ticketNumber: "12345",
    });
    authorizer = Mock.of<AuthorizerContext>({ merchantId: "mid123" });
    pre_auth_transaction = Mock.of<Transaction>({
      currency_code: CurrencyEnum.USD,
      merchant_id: "mid123",
      subscription_id: "sid123",
      transaction_type: TransactionTypeEnum.PREAUTH,
    });
    subscription_transaction = Mock.of<SubscriptionTransactionDynamo[]>([]);
    trx_rule_response = Mock.of<LambdaTransactionRuleBodyResponse>({
      body: {
        acquirerBank: "Banco de Guayaquil",
        categoryModel: "Gateway",
        privateId: "privId1234",
        processor: "Billpocket",
        processorCode: "BIPK",
        publicId: "pubid1234",
        terminalId: "terid1234",
        uniqueCode: "ucode1",
      },
    });
    gAurusResponse = Mock.of<AurusResponse>({
      approved_amount: "czxczx",
      kushkiInfo: {
        manager: "API",
        managerId: "DP002",
        methodId: "KM001",
        methodName: "CARD",
        platformId: "KP001",
        platformName: "API",
        platformVersion: "latest",
      },
      recap: "sadads",
      response_code: "asdcxva",
      response_text: "sadbcvbs",
      secure_code: WarningSecurityEnum.K327,
      secure_message: "some message in capture",
      securityIdentity: [
        {
          identityCategory: "IDENTIFICATION_VERIFICATION",
          identityCode: "SI006",
          partnerName: "SIFTSCIENCE",
        },
      ],
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
    gProcessorFetch = Mock.of<DynamoProcessorFetch>({
      merchant_id: "iuoi",
      private_id: "mossf",
      processor_name: "nnkjbj",
      processor_type: "mvsdv",
      public_id: "123456789",
      terminal_id: "pmkxnv",
    });
    card_stub = box.stub().returns(of(gAurusResponse));
    sqs_put_stub = box.stub().returns(of(true));
    rollbarInstance(box);
    tracer = box.stub(Tracer.prototype, "putAnnotation");
  });

  afterEach(() => {
    runDependencies(box, tracer);
  });

  function mockDynamo(preAuthTransaction: Transaction | undefined): void {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(gTokenDynamo)),
        put: box.stub().returns(of(true)),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([preAuthTransaction]))
          .onSecondCall()
          .returns(of(subscription_transaction)),
        queryTransactionCustomOpsBySeqIdAndVoided: box
          .stub()
          .returns(of([preAuthTransaction])),
      })
    );
  }

  function mockAurusGateway(captureStub: SinonStub): void {
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        captureTransaction: captureStub,
      })
    );
  }

  function getUnifiedCaptureEvent() {
    return Mock.of<UnifiedCaptureRequest>({
      authorizer,
      subscription,
      token,
      captureRequest: capture_request,
      pathSubscriptionId: "sid123",
    });
  }

  function mockInvokeTrxRule() {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(of(trx_rule_response)),
      })
    );
  }

  it("Should return succeed on a card capture when token does not exist", (done: Mocha.Done) => {
    const new_context = Mock.of<IContext>({
      credentialValidationBlock: "",
      getRemainingTimeInMillis: box.stub().returns(2000),
    });

    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    mockSQSGateway(sqs_put_stub);
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    mockAurusGateway(card_stub);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.unifiedCapture(event, new_context).subscribe({
      next: (data): void => {
        expect(data).to.not.be.null;
        done();
      },
    });
  });

  it("Should return succeed on a card capture when token exists", (done: Mocha.Done) => {
    const new_context = Mock.of<IContext>({
      credentialValidationBlock: "",
      getRemainingTimeInMillis: box.stub().returns(2000),
    });

    token = Mock.of<DynamoTokenFetch>({
      id: "id123",
      merchantId: "mid4444",
    });
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    mockSQSGateway(sqs_put_stub);
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    mockAurusGateway(card_stub);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.unifiedCapture(event, new_context).subscribe({
      next: (data): void => {
        expect(data).to.not.be.null;
        done();
      },
    });
  });

  it("it Should store the code and message when the successful response of the transaction-rule in capture", (done: Mocha.Done) => {
    const code_k327: string = WarningSecurityEnum.K327;
    const message_capture: string = "some message in capture";
    const new_context = Mock.of<IContext>({
      credentialValidationBlock: "",
      getRemainingTimeInMillis: box.stub().returns(2000),
    });

    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            rules: {
              rules: [
                {
                  code: code_k327,
                  message: message_capture,
                },
              ],
            },
          },
        })
      )
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    lambdaServiceBinding(lambda_stub);
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind<ITransactionService>(IDENTIFIERS.TransactionService).to(
      TransactionService
    );
    token = Mock.of<DynamoTokenFetch>({
      id: "id123",
      merchantId: "mid4444",
    });
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    mockSQSGateway(sqs_put_stub);
    mockDynamo(pre_auth_transaction);
    mockAurusGateway(card_stub);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.unifiedCapture(event, new_context).subscribe({
      next: (data): void => {
        expect(data).to.not.be.null;
        expect(sqs_put_stub.args[0][1].secure_code).to.be.eql(code_k327);
        expect(sqs_put_stub.args[0][1].secure_message).to.be.eql(
          message_capture
        );
        done();
      },
    });
  });

  it("Should response a hierarchyConfig object when it is called in unifiedCapture", (done: Mocha.Done) => {
    const new_context = Mock.of<IContext>({
      credentialValidationBlock: "",
      getRemainingTimeInMillis: box.stub().returns(2000),
    });

    token = Mock.of<DynamoTokenFetch>({
      id: "id123",
      merchantId: "mid4444",
    });
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    event.authorizer.hierarchyConfig = JSON.stringify(CONTEXT_HIERARCHY_CONFIG);
    mockSQSGateway(sqs_put_stub);
    mockDynamo(pre_auth_transaction);
    lambda_stub = box.stub();
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub.returns(of(trx_rule_response)),
      })
    );
    mockAurusGateway(card_stub);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.unifiedCapture(event, new_context).subscribe({
      next: (): void => {
        expect(lambda_stub).to.be.calledOnce;
        expect(lambda_stub.args[0][1].body.hierarchyConfig).to.be.deep.equals(
          JSON.parse(get(event, "authorizer.hierarchyConfig", "{}"))
        );
        done();
      },
    });
  });

  it("Should return succeed on a card capture when token exists", (done: Mocha.Done) => {
    const new_context = Mock.of<IContext>({
      credentialValidationBlock: "",
      getRemainingTimeInMillis: box.stub().returns(2000),
    });

    token = Mock.of<DynamoTokenFetch>({
      id: "id123",
      merchantId: "mid4444",
    });
    process.env.MERCHANT_IDS_TUENTI = "merchantidTuenti333,123";
    authorizer.merchantId = "merchantidTuenti333";
    pre_auth_transaction.merchant_id = "merchantidTuenti333";
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    mockSQSGateway(sqs_put_stub);
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    mockAurusGateway(card_stub);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.unifiedCapture(event, new_context).subscribe({
      next: (data): void => {
        expect(data).to.not.be.null;
        done();
      },
    });
  });

  it("Should return error when approved trx is greater than full amount", (done: Mocha.Done) => {
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    pre_auth_transaction.approved_transaction_amount = 50;
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equals("K012");
          done();
        },
      });
  });

  it("Should return error when ticket number is empty", (done: Mocha.Done) => {
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    pre_auth_transaction.approved_transaction_amount = 50;
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    event.captureRequest.ticketNumber = "";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equals("K001");
          done();
        },
      });
  });

  it("Should return error when a preauth merchantId does not match with authorizer's", (done: Mocha.Done) => {
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    pre_auth_transaction = Mock.of<Transaction>({ merchant_id: "aaaa" });
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equals("K042");
          done();
        },
      });
  });

  it("Should return error when a preauth trx does not exist", (done: Mocha.Done) => {
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    mockDynamo(undefined);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equals("K041");
          done();
        },
      });
  });

  it("Should return succeed on a card capture when amount on capture request doesnt exist", (done: Mocha.Done) => {
    capture_request.amount = undefined;
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err) => {
          expect(err).to.not.be.null;
          done();
        },
        next: (data): void => {
          expect(data).to.not.be.null;
          done();
        },
      });
  });

  it("Should return error on a subscription capture when subscription is undefined", (done: Mocha.Done) => {
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    mockDynamo(pre_auth_transaction);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eq("K050");
          done();
        },
      });
  });

  it("Should return error on a subscription capture when subscription merchantId doesnt match with authorizer", (done: Mocha.Done) => {
    subscription = Mock.of<SubscriptionDynamo>({
      merchantId: "mid456",
    });
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    mockDynamo(pre_auth_transaction);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eq("K040");
          done();
        },
      });
  });

  it("Should return error on a subscription capture when transaction merchantId doesnt match with authorizer", (done: Mocha.Done) => {
    subscription = Mock.of<SubscriptionDynamo>({
      merchantId: "mid123",
    });
    pre_auth_transaction.subscription_id = "sid345";
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    mockDynamo(pre_auth_transaction);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eq("K043");
          done();
        },
      });
  });

  it("Should return succeed on a subscription capture", (done: Mocha.Done) => {
    subscription = Mock.of<SubscriptionDynamo>({
      binInfo: {
        bin: "123",
      },
      merchantId: "mid123",
    });
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: () => {
          done();
        },
        next: (data): void => {
          expect(data).to.not.be.null;
          done();
        },
      });
  });

  it("Should return succeed capture when request comes from card and amount is undefined", (done: Mocha.Done) => {
    subscription = Mock.of<SubscriptionDynamo>({
      binInfo: {
        bin: "123",
      },
      merchantId: "mid123",
    });
    capture_request.amount = undefined;
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.CARD;
    pre_auth_transaction.currency_code = "UF";
    pre_auth_transaction.amount = {
      currency: "CLP",
      subtotalIva0: 2000,
    };
    set(gTransaction, "currency_code", "UF");
    set(gTransaction, "amount.currency", "CLP");
    set(gTransaction, "amount.subtotalIva0", 200);
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: () => {
          done();
        },
        next: (data): void => {
          expect(data).to.not.be.null;
          done();
        },
      });
  });

  it("Should return error when request amount is 0", (done: Mocha.Done) => {
    subscription = Mock.of<SubscriptionDynamo>({
      binInfo: {
        bin: "123",
      },
      merchantId: "mid123",
    });
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    capture_request.amount!.subtotalIva = 0;
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.getMessage()).to.be.eqls(ERRORS.E039.message);
          done();
        },
      });
  });

  it("Should return error when transaction had been done before", (done: Mocha.Done) => {
    subscription = Mock.of<SubscriptionDynamo>({
      binInfo: {
        bin: "123",
      },
      merchantId: "mid123",
    });

    subscription_transaction = Mock.of<SubscriptionTransactionDynamo[]>([
      {
        merchantId: "mid123",
        transaction_type: TransactionTypeEnum.CAPTURE,
        transaction_status: TransactionStatusEnum.APPROVAL,
      },
    ]);
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.getMessage()).to.be.eqls(ERRORS.E051.message);
          expect(err.code).to.be.eqls("K051");
          done();
        },
      });
  });

  it("Should return an error on a subscription capture when a capture trx already exists", (done: Mocha.Done) => {
    subscription = Mock.of<SubscriptionDynamo>({
      binInfo: {
        info: {
          type: "credit",
        },
      },
      merchantId: "mid123",
    });
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: () => {
          done();
        },
        next: (data): void => {
          expect(data).to.not.be.null;
          done();
        },
      });
  });

  it("Should return an error on a subscription capture when request amount is undefined", (done: Mocha.Done) => {
    subscription_transaction = Mock.of<SubscriptionTransactionDynamo[]>([
      {
        merchantId: "mid123",
      },
    ]);
    subscription = Mock.of<SubscriptionDynamo>({
      binInfo: {
        info: {
          type: "credit",
        },
      },
      merchantId: "mid123",
    });
    capture_request.amount = undefined;
    set(
      pre_auth_transaction,
      "amount",
      Mock.of<Amount>({
        iva: 0,
        subtotalIva: 50,
      })
    );
    event = getUnifiedCaptureEvent();
    event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    mockDynamo(pre_auth_transaction);
    mockInvokeTrxRule();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .unifiedCapture(event, {
        ...gLambdaContext,
        credentialValidationBlock: "",
      })
      .subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equals("K039");
          done();
        },
        next: (data): void => {
          expect(data).to.not.be.null;
          done();
        },
      });
  });

  describe("CardService - Account Validation", () => {
    let sandbox: SinonSandbox;
    let get_dynamo_stub: SinonStub;
    let put_dynamo_stub: SinonStub;
    let lamba: SinonStub;
    let update_token_dynamo_stub: SinonStub;

    const get_merchant_fetch: DynamoMerchantFetch = {
      country: "ECUA",
      merchant_name: "Generic merchant name",
      public_id: "0987654321",
      sandboxEnable: false,
      sift_science: {},
    };
    const get_token_fetch: DynamoTokenFetch = {
      "3ds": {
        authentication: true,
        detail: {
          cavv: "1234",
          eci: "1234",
          xid: "1234",
        },
      },
      amount: 0,
      bin: "00000",
      convertedAmount: { currency: "", totalAmount: 0 },
      created: 0,
      currency: "USD",
      id: "123456",
      ip: "127.0.0.1",
      isBlockedCard: false,
      lastFourDigits: "4321",
      maskedCardNumber: "12345XXXX4321",
      merchantId: "0987654321",
      tokenType: "transaction",
      transactionCardId: "999999999",
      transactionMode: TransactionModeEnum.ACCOUNT_VALIDATION,
      transactionReference: "12345-abcd",
    };
    let trx_rule_response_av: LambdaTransactionRuleResponse = {
      privateId: "12345678",
      processor: ProcessorEnum.KUSHKI,
      publicId: "123456789",
    };
    const acq_card_response: AcqCardResponse = {
      approved_amount: "0",
      recap: "",
      response_code: "000",
      response_text: "success",
      ticket_number: "1234567",
      transaction_details: {
        approvalCode: "1234567",
        binCard: "1234567",
        cardHolderName: "ABC",
        cardType: "A",
        isDeferred: "N",
        lastFourDigitsOfCard: "4321",
        merchantName: "ABCD",
        processorBankName: "AAAA",
        processorName: ProcessorEnum.KUSHKI,
      },
      transaction_id: "1234567",
      transaction_reference: "12345678",
    };

    beforeEach(() => {
      process.env.LAMBDA_VALUES =
        '{"CHARGEBACK":"usrv-card-chargeback-chargeback","GET_BIN_INFO":"usrv-deferred-ci-getBinInfo","RULE":"usrv-transaction-rule-processor","ASYNC_VOID":"usrv-card-chargeback-ci-voidTrigger","CREDOMATIC_CHARGE":"usrv-card-credomatic-ci-charge","REDEBAN_CHARGE":"usrv-card-redeban-ci-charge","TRANSBANK_TOKEN":"usrv-wssecurity-processor-ci-token","VALIDATE_ACCOUNT":"acq-card-validate"}';
      sandbox = createSandbox();
      CONTAINER.snapshot();
      CONTAINER.rebind(IDENTIFIERS.ProviderService).toConstantValue(
        Mock.of<IProviderService>({})
      );
      CONTAINER.rebind(IDENTIFIERS.AntifraudGateway).toConstantValue(
        Mock.of<IAntifraudGateway>({})
      );
      CONTAINER.rebind(IDENTIFIERS.TransactionService).toConstantValue(
        Mock.of<ITransactionService>({})
      );
      CONTAINER.rebind(IDENTIFIERS.ISNSGateway).toConstantValue(
        Mock.of<ISNSGateway>({})
      );
      process.env.USRV_STAGE = EnvironmentEnum.QA;
      rollbarInstance(sandbox);
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
      get_token_fetch.transactionMode = TransactionModeEnum.ACCOUNT_VALIDATION;
      get_token_fetch["3ds"] = {
        authentication: true,
        detail: {
          cavv: "1234",
          eci: "1234",
          xid: "1234",
        },
      };
      trx_rule_response_av.processor = ProcessorEnum.KUSHKI;
      acq_card_response.response_code = "000";
    });

    function mockProviderVAService(
      tokenStub: SinonStub,
      variantStub: CardProviderEnum
    ): void {
      CONTAINER.unbind(IDENTIFIERS.ProviderService);
      CONTAINER.bind(IDENTIFIERS.ProviderService).toConstantValue(
        Mock.of<IProviderService>({
          validateAccount: tokenStub,
          variant: variantStub,
        })
      );
    }

    function accountValidationEvent(
      sandboxActive: boolean
    ): IAPIGatewayEvent<
      AccountValidationRequest,
      null,
      null,
      AuthorizerContext
    > {
      return Mock.of<
        IAPIGatewayEvent<
          AccountValidationRequest,
          null,
          null,
          AuthorizerContext
        >
      >({
        body: {
          token: "someExistingToken",
        },
        headers: {},
        requestContext: Mock.of<IRequestContext<AuthorizerContext>>({
          authorizer: {
            credentialId: "someCredentialID",
            merchantId: CHARGE_MID,
            sandboxEnable: sandboxActive,
          },
        }),
      });
    }

    function mockDynamoGateway(
      merchantResult: DynamoMerchantFetch | undefined,
      tokenResult: DynamoTokenFetch | undefined
    ) {
      get_dynamo_stub = sandbox.stub().returns(of(merchantResult));
      put_dynamo_stub = sandbox.stub().returns(of(true));
      update_token_dynamo_stub = sandbox.stub().returns(of(tokenResult));

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: get_dynamo_stub,
          put: put_dynamo_stub,
          updateTokenValue: update_token_dynamo_stub,
        })
      );
    }

    function mockLambdaGateway(
      transactionRuleResponse: object | undefined,
      acqCardResponse: object | undefined
    ) {
      lamba = sandbox
        .stub()
        .onFirstCall()
        .returns(of(transactionRuleResponse))
        .onSecondCall()
        .returns(of(acqCardResponse));

      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lamba,
        })
      );
    }

    it("should process account validation successfully", (done: Mocha.Done) => {
      const validation_account_response: SinonStub = sandbox
        .stub()
        .returns(of(acq_card_response));

      mockDynamoGateway(
        { ...get_merchant_fetch, sandboxEnable: true },
        get_token_fetch
      );
      trx_rule_response_av = {
        ...trx_rule_response_av,
        processor: CardProviderEnum.SANDBOX,
      };
      mockLambdaGateway({ body: trx_rule_response_av }, acq_card_response);
      mockProviderVAService(
        validation_account_response,
        CardProviderEnum.SANDBOX
      );
      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      service.validateAccount(accountValidationEvent(false)).subscribe({
        complete: done,
        error: done,
        next: (res): void => {
          expect(get_dynamo_stub).to.be.calledOnce;
          expect(update_token_dynamo_stub).to.be.calledOnce;
          expect(put_dynamo_stub).to.be.calledOnce;
          expect(res).to.not.have.property("processorError");
          expect(res).to.not.have.property("processorMessage");
          expect(res).to.have.property("approvalCode");
        },
      });
    });
    it("should process an account validation successfully when is credimatic direct integration", (done: Mocha.Done) => {
      const validation_account_response: SinonStub = sandbox
        .stub()
        .returns(of(acq_card_response));

      mockDynamoGateway(
        { ...get_merchant_fetch, sandboxEnable: false },
        get_token_fetch
      );
      trx_rule_response_av = {
        ...trx_rule_response_av,
        processor: ProcessorEnum.CREDIMATIC,
        integration: "direct",
      };
      mockLambdaGateway({ body: trx_rule_response_av }, acq_card_response);
      mockProviderVAService(
        validation_account_response,
        CardProviderEnum.CREDIMATIC
      );
      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      const event_with_sub_merchant = accountValidationEvent(false);
      const sub_merchant = Mock.of<SubMerchant>({
        idAffiliation: "idAffiliationTest",
      });

      set(event_with_sub_merchant, "body.subMerchant", sub_merchant);
      service.validateAccount(event_with_sub_merchant).subscribe({
        complete: done,
        error: done,
        next: (res): void => {
          expect(get_dynamo_stub).to.be.calledOnce;
          expect(update_token_dynamo_stub).to.be.calledOnce;
          expect(put_dynamo_stub).to.be.calledOnce;
          expect(res).to.not.have.property("processorMessage");
          expect(res).to.have.property("approvalCode");
        },
      });
    });

    it("should process an account validation successfully when sandbox is not enabled", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_BINS = DIRECT_INTEGRATION_BINS_ALL;
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        kushki: `${gProcessorFetch.public_id},22222,4321,all`,
      });
      const validation_account_response: SinonStub = sandbox
        .stub()
        .returns(of(acq_card_response));

      mockDynamoGateway(
        { ...get_merchant_fetch, sandboxEnable: false },
        get_token_fetch
      );
      trx_rule_response_av = {
        ...trx_rule_response_av,
        processor: ProcessorEnum.KUSHKI,
      };
      mockLambdaGateway({ body: trx_rule_response_av }, acq_card_response);
      mockProviderVAService(
        validation_account_response,
        CardProviderEnum.KUSHKI
      );
      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      const event_with_sub_merchant = accountValidationEvent(false);
      const sub_merchant = Mock.of<SubMerchant>({
        idAffiliation: "idAffiliationTest",
      });

      set(event_with_sub_merchant, "body.subMerchant", sub_merchant);
      service.validateAccount(event_with_sub_merchant).subscribe({
        complete: done,
        error: done,
        next: (res): void => {
          expect(get_dynamo_stub).to.be.calledOnce;
          expect(update_token_dynamo_stub).to.be.calledOnce;
          expect(put_dynamo_stub).to.be.calledOnce;
          expect(res).to.not.have.property("processorMessage");
          expect(res).to.have.property("approvalCode");
        },
      });
    });

    it("should process an account validation successfully when sandbox is not enabled and 3ds is not present", (done: Mocha.Done) => {
      process.env.DIRECT_INTEGRATION_BINS = DIRECT_INTEGRATION_BINS_ALL;
      process.env.DIRECT_INTEGRATION_PROCESSOR_IDS = JSON.stringify({
        kushki: `${gProcessorFetch.public_id},22222,4321,all`,
      });
      const validation_account_response: SinonStub = sandbox
        .stub()
        .returns(of(acq_card_response));

      get_token_fetch["3ds"] = undefined;

      mockDynamoGateway(
        { ...get_merchant_fetch, sandboxEnable: false },
        get_token_fetch
      );
      trx_rule_response_av = {
        ...trx_rule_response_av,
        processor: ProcessorEnum.KUSHKI,
      };
      mockLambdaGateway({ body: trx_rule_response_av }, acq_card_response);
      mockProviderVAService(
        validation_account_response,
        CardProviderEnum.KUSHKI
      );
      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      service.validateAccount(accountValidationEvent(false)).subscribe({
        complete: done,
        error: done,
        next: (res): void => {
          expect(res).to.have.property("approvalCode");
          expect(get_dynamo_stub).to.be.calledOnce;
          expect(update_token_dynamo_stub).to.be.calledOnce;
          expect(put_dynamo_stub).to.be.called;
        },
      });
    });

    it("should process an account validation when acq response code is not '000'", (done: Mocha.Done) => {
      const validation_account_response: SinonStub = sandbox
        .stub()
        .returns(of(acq_card_response));

      mockDynamoGateway(
        { ...get_merchant_fetch, sandboxEnable: true },
        get_token_fetch
      );
      trx_rule_response_av = {
        ...trx_rule_response_av,
        processor: CardProviderEnum.SANDBOX,
      };
      mockLambdaGateway({ body: trx_rule_response_av }, acq_card_response);
      mockProviderVAService(
        validation_account_response,
        CardProviderEnum.SANDBOX
      );

      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      service.validateAccount(accountValidationEvent(true)).subscribe({
        complete: done,
        error: done,
        next: (res): void => {
          expect(get_dynamo_stub).to.be.calledOnce;
          expect(update_token_dynamo_stub).to.be.calledOnce;
          expect(res).to.not.have.property("processorError");
          expect(validation_account_response).to.be.calledOnce;
        },
      });
    });

    it("should throw an error if the merchant could not be found", (done: Mocha.Done) => {
      mockDynamoGateway(undefined, undefined);
      mockLambdaGateway(undefined, undefined);

      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: lamba,
        })
      );

      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      service.validateAccount(accountValidationEvent(false)).subscribe({
        complete: done,
        error: (error: KushkiError): void => {
          expect(get_dynamo_stub).to.have.been.calledOnce;
          expect(lamba).to.not.have.been.called;
          expect(error.getMessage()).to.be.eqls(ERRORS.E004.message);
          expect(error.code).to.be.eqls("K004");
          done();
        },
      });
    });

    it("should throw an error when updateToken return ConditionalCheckFailedException in error code ", (done: Mocha.Done) => {
      const error_update_token: AWSError = Mock.of<AWSError>({
        name: "ConditionalCheckFailedException",
      });

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: sandbox.stub().returns(of(get_merchant_fetch)),
          updateTokenValue: sandbox
            .stub()
            .returns(throwError(() => error_update_token)),
        })
      );

      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      service.validateAccount(accountValidationEvent(false)).subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eqls("K049");
          expect(error.getMessage()).to.be.eqls(ERRORS.E049.message);
          done();
        },
      });
    });

    it("should throw an error if the token could not be found", (done: Mocha.Done) => {
      mockDynamoGateway(get_merchant_fetch, undefined);
      mockLambdaGateway(undefined, undefined);

      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      service.validateAccount(accountValidationEvent(false)).subscribe({
        complete: done,
        error: (error: KushkiError): void => {
          expect(get_dynamo_stub).to.be.calledOnce;
          expect(update_token_dynamo_stub).to.be.calledOnce;
          expect(lamba).to.not.have.been.called;
          expect(error.code).to.be.eqls("K041");
          expect(error.getMessage()).to.be.eqls(ERRORS.E041.message);
          done();
        },
      });
    });

    it("should throw an error if the token does not refer to an Account Validation", (done: Mocha.Done) => {
      get_token_fetch.transactionMode = "";
      mockDynamoGateway(get_merchant_fetch, get_token_fetch);
      mockLambdaGateway(undefined, undefined);

      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      service.validateAccount(accountValidationEvent(false)).subscribe({
        complete: done,
        error: (error: KushkiError): void => {
          expect(get_dynamo_stub).to.be.calledOnce;
          expect(update_token_dynamo_stub).to.be.calledOnce;
          expect(error.code).to.be.eqls("K041");
          expect(error.getMessage()).to.be.eqls(ERRORS.E041.message);
          done();
        },
      });
    });

    it("should process an account validation but catch error and save processor code and message", (done: Mocha.Done) => {
      const message_processor = "Error en el procesador validate Account";

      const wrapper_error: AurusError = new AurusError(
        "500",
        ERRORS.E500.message,
        {
          processor_code: "201",
          response_text: message_processor,
        }
      );
      const validation_account_response: SinonStub = box
        .stub()
        .returns(throwError(wrapper_error));

      mockDynamoGateway(
        { ...get_merchant_fetch, sandboxEnable: true },
        get_token_fetch
      );
      mockLambdaGateway({ body: trx_rule_response_av }, acq_card_response);
      mockProviderVAService(
        validation_account_response,
        CardProviderEnum.SANDBOX
      );
      service = CONTAINER.get<ICardService>(IDENTIFIERS.CardService);
      service.validateAccount(accountValidationEvent(false)).subscribe({
        complete: done,
        error: (error: KushkiError): void => {
          expect(get_dynamo_stub).to.be.calledOnce;
          expect(put_dynamo_stub).to.be.calledOnce;
          expect(error.code).to.be.eqls("500");
          expect(error.getMessage()).to.be.eqls(ERRORS.E500.message);
          expect(error.getMetadata())
            .to.haveOwnProperty("response_text")
            .eqls(message_processor);
          done();
        },
        next: done,
      });
    });
  });

  describe("AutomaticVoidStream", () => {
    let convertion_response_mock: ConvertionResponse;
    let g_transaction: Transaction;
    let sandbox: SinonSandbox;

    beforeEach(async () => {
      CONTAINER.snapshot();
      sandbox = createSandbox();
      g_transaction = Mock.of<Transaction>({
        approval_code: "21321",
        approved_transaction_amount: 344,
        bin_card: "333333",
        card_holder_name: "name",
        consortium_name: "consortium_name",
        country: "Ecuador",
        created: new Date().valueOf(),
        currency_code: "COP",
        iva_value: 0,
        last_four_digits: "1234",
        merchant_id: "mid",
        merchant_name: "asfsf",
        payment_brand: "visa",
        processor_bank_name: "gdgfd",
        processor_id: "id",
        processor_name: "zxvzv",
        recap: "adas",
        request_amount: 344,
        subtotal_iva: 0,
        subtotal_iva0: 210,
        sync_mode: "api",
        ticket_number: "11111",
        transaction_id: "2333333",
        transaction_reference: "98398328932",
        transaction_status: "status",
        transaction_type: "type",
      });
      convertion_response_mock = Mock.of<ConvertionResponse>({
        body: {
          convertedCurrency: CurrencyEnum.CLP,
          newAmount: 400,
        },
      });
      const convertion_response_stub: SinonStub = sandbox
        .stub()
        .returns(of(convertion_response_mock));

      rollbarInstance(sandbox);
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: sandbox.stub().returns(of(g_transaction)),
        })
      );
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: convertion_response_stub,
        })
      );
    });

    afterEach(async () => {
      CONTAINER.restore();
    });

    it("Should throw error with code K020 when NewImage is undefined", (done: Mocha.Done) => {
      const transaction_event: IDynamoDbEvent<TransactionDynamo> = Mock.of<
        IDynamoDbEvent<TransactionDynamo>
      >({
        Records: [
          Mock.of<IDynamoRecord>({
            dynamodb: Mock.of<IDynamoElement<TransactionDynamo>>({}),
            eventName: DynamoEventNameEnum.REMOVE,
          }),
        ],
      });

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.automaticVoidStream(transaction_event).subscribe({
        next: (result: boolean) => {
          expect(result).to.be.true;
          done();
        },
      });
    });

    it("Should return true when dynamo event is not REMOVE,", (done: Mocha.Done) => {
      const transaction_event: IDynamoDbEvent<TransactionDynamo> = Mock.of<
        IDynamoDbEvent<TransactionDynamo>
      >({
        Records: [
          Mock.of<IDynamoRecord>({
            dynamodb: Mock.of<IDynamoElement<TransactionDynamo>>({
              NewImage: undefined,
            }),
            eventName: DynamoEventNameEnum.INSERT,
          }),
        ],
      });

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.automaticVoidStream(transaction_event).subscribe({
        complete: done,
        next: (result: boolean) => {
          expect(result).to.be.true;
        },
      });
    });

    it("Should process automatic void successfully when dynamo event is REMOVE", (done: Mocha.Done) => {
      const query_stub: SinonStub = sandbox.stub().returns(of([g_transaction]));
      const transaction_event: IDynamoDbEvent<TransactionDynamo> = Mock.of<
        IDynamoDbEvent<TransactionDynamo>
      >({
        Records: [
          Mock.of<IDynamoRecord>({
            dynamodb: Mock.of<IDynamoElement<TransactionDynamo>>({
              NewImage: {
                approval_code: "21321",
                approved_transaction_amount: 344,
                bin_card: "333333",
                card_holder_name: "name",
                consortium_name: "consortium_name",
                country: "Ecuador",
                created: new Date().valueOf(),
                currency_code: "COP",
                iva_value: 0,
                last_four_digits: "1234",
                merchant_id: "mid",
                merchant_name: "asfsf",
                payment_brand: "visa",
                processor_bank_name: "gdgfd",
                processor_id: "id",
                processor_name: "zxvzv",
                recap: "adas",
                request_amount: 344,
                subtotal_iva: 0,
                subtotal_iva0: 210,
                sync_mode: "api",
                ticket_number: "11111",
                transaction_id: "2333333",
                transaction_reference: "98398328932",
                transaction_status: "status",
                transaction_type: "type",
              },
            }),
            eventName: DynamoEventNameEnum.REMOVE,
          }),
        ],
      });

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: query_stub,
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.automaticVoidStream(transaction_event).subscribe({
        complete: done,
        next: (result: boolean) => {
          expect(result).to.be.true;
          expect(query_stub).to.be.called;
        },
      });
    });

    it("Should throw K020 error when query operations doesn't return items", (done: Mocha.Done) => {
      const transaction_event: IDynamoDbEvent<TransactionDynamo> = Mock.of<
        IDynamoDbEvent<TransactionDynamo>
      >({
        Records: [
          Mock.of<IDynamoRecord>({
            dynamodb: Mock.of<IDynamoElement<TransactionDynamo>>({
              NewImage: {
                transaction_reference: "98398328932",
              },
            }),
            eventName: DynamoEventNameEnum.REMOVE,
          }),
        ],
      });

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          query: sandbox.stub().returns(of([])),
        })
      );

      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.automaticVoidStream(transaction_event).subscribe({
        next: (result: boolean) => {
          expect(result).to.be.true;
          done();
        },
      });
    });
  });

  describe("UpdateReAuthVoidStatus", () => {
    let chargeback_transaction: ChargebackTransaction;
    let dynamo_event: IDynamoRecord<ChargebackTransaction>;
    let event_bus_detail: IEventBusDetail<IDynamoRecord<ChargebackTransaction>>;
    let sandbox: SinonSandbox;
    let stub: SinonStub;

    beforeEach(() => {
      CONTAINER.snapshot();
      sandbox = createSandbox();

      chargeback_transaction = Mock.of<ChargebackTransaction>({
        saleTransactionReference: "1234567890",
        saleTransactionType: TransactionTypeEnum.REAUTH,
        ticketNumber: "121212121212",
        transactionStatus: TransactionStatusEnum.APPROVAL,
        transactionType: TransactionTypeEnum.VOID,
      });

      dynamo_event = Mock.of<IDynamoRecord<ChargebackTransaction>>({
        dynamodb: Mock.of<IDynamoElement<ChargebackTransaction>>({
          NewImage: {
            ...chargeback_transaction,
          },
        }),
        eventName: DynamoEventNameEnum.INSERT,
      });

      event_bus_detail = Mock.of<
        IEventBusDetail<IDynamoRecord<ChargebackTransaction>>
      >({
        action: PAYLOAD.EVENT_NAME,
        mappingType: "dynamo",
        originUsrv: "usrv-card-chargeback",
        payload: dynamo_event,
      });

      stub = sandbox.stub().returns(of(true));

      rollbarInstance(sandbox);
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          updateValues: stub,
        })
      );
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("Should update transaction voided status and void_ticket_number when a record is received", (done: Mocha.Done) => {
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.updateReAuthVoidStatus(event_bus_detail).subscribe({
        next: (response: boolean): void => {
          expect(response).to.be.true;
          expect(stub).to.have.been.calledOnce;
          expect(stub.args[0][1]).to.have.property(
            "transaction_reference",
            "1234567890"
          );
          expect(stub.args[0][2]).to.have.property("voided", "true");
          expect(stub.args[0][2]).to.have.property(
            "void_ticket_number",
            "121212121212"
          );
          done();
        },
      });
    });

    it("Should return error when updateValues fails", (done: Mocha.Done) => {
      stub.returns(throwError(() => new Error("some error")));
      service = CONTAINER.get(IDENTIFIERS.CardService);
      service.updateReAuthVoidStatus(event_bus_detail).subscribe({
        error: (err: Error): void => {
          expect(err).not.to.be.null;
          done();
        },
      });
    });
  });
});

describe("CardService - update3dsTokenInfo", () => {
  let service: ICardService;
  let sinon_sandbox: SinonSandbox;
  let tracer: SinonStub;
  let threeds_token_info: ThreeDSTokenInfoRequest;
  let token_dynamo: DynamoTokenFetch | undefined;
  let get_item_stub: SinonStub;
  let update_stub: SinonStub;

  beforeEach(() => {
    sinon_sandbox = createSandbox();
    CONTAINER.snapshot();
    get_item_stub = sinon_sandbox.stub().returns(of(undefined));
    update_stub = sinon_sandbox.stub().returns(of(true));
    threeds_token_info = {
      cybersource: {
        authentication: true,
        detail: {
          commerceIndicator: "1234",
          specificationVersion: "1234",
          veresEnrolled: "",
        },
      },
      secureId: "a59dbea4-786a-45ff-81fa-572160c4c740",
      secureService: "3dsecure",
      token: "",
    };
    token_dynamo = {
      amount: 10000,
      bin: "545195",
      binInfo: {
        bank: "Banco de la Produccion S.A. (PRODUBANCO)",
        bin: "545195",
        binType: 6,
        brand: "MASTERCARD",
        brandProductCode: "MBK",
        firstDigitsBin: "54519515",
        info: {
          country: {
            alpha2: "EC",
            alpha3: "ECU",
            name: "Ecuador",
            numeric: "218",
          },
          prepaid: false,
          scheme: "mastercard",
          type: "credit",
        },
        invalid: false,
        origin: "MASTERCARD",
        originalBinFullLength: "54519515",
        processor: "NA",
        updatedAt: 1702928656288,
      },
      cardHolderName: "John Doe",
      config: {
        region: "us-east-1",
      },
      created: 1702928657352,
      credentialInfo: {
        alias: "ATG COL v2",
        credentialId: "93c560ad1ef14814a81d4a49754e2086",
      },
      currency: "COP",
      expirationTime: 1718739857,
      expiryMonth: "08",
      expiryYear: "28",
      id: "500aff3dc080402fa104ec7a3b6982ad",
      ip: "35.235.84.154",
      isBlockedCard: false,
      isDeferred: false,
      kushkiInfo: {
        manager: "API",
        managerId: "DP002",
        methodId: "KM001",
        methodName: "CARD",
        platformId: "KP001",
        platformName: "API",
        platformVersion: "latest",
      },
      lastFourDigits: "5480",
      maskedCardNumber: "545195XXXXXX5480",
      merchantId: "20000000104269390000",
      securityIdentity: [
        {
          identityCategory: "TOKEN",
          identityCode: "SI001",
          partnerName: "KUSHKI",
        },
      ],
      sendCvv: true,
      tokenStatus: "CREATED",
      transactionCardId: "f2abe727-67a8-40c1-a8f9-97e3e770874e",
      transactionReference: "96aef23f-d3ff-4d96-9906-1c0cf4444ce1",
      userAgent: "runscope-radar/a2613df0626c21d59c62ca6cf717dacf6a1d04df",
      vaultToken:
        "EM4TONZQGA2DSNJXG4ZTEOJXGY4DAMJSGY3DEOJUGY4TEOBWHAYDAMBRGA2DEOBQGA3TEOJWHE3DANBTGEYDAMRVGY3DSOJSGU4TINRZENADOMBZGYYDGNRWG42DANBXGI4TSNZRGAYDOMBXGA3DQOJZHE2DSOJQGEZDQOJWG4YDMNJQGI4TINZUGI3TMNBZGE3TGNRTHE4DMMZZHBACIMJQGAYDGMRZHE4TONRQGUYDGOJWHE4DSNRXGEYDENRZGA2DAMJXGE3TOMBTHEYTSOBWHA3TANRYGAZTENZZG44TINRZHE3TSNZZGM4TKJA=",
    };
    rollbarInstance(sinon_sandbox);
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    process.env.USRV_STAGE = EnvironmentEnum.QA;
    delete process.env.BAD_BINS;
    tracer = sinon_sandbox.stub(Tracer.prototype, "putAnnotation");
  });

  afterEach(() => {
    CONTAINER.restore();
    sinon_sandbox.restore();
    tracer.restore();
  });

  it("must update token with 3ds information when everything is ok", (done: Mocha.Done) => {
    get_item_stub = sinon_sandbox.stub().returns(of(token_dynamo));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_item_stub,
        updateValues: update_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.update3dsTokenInfo(threeds_token_info).subscribe({
      next: (rsp: boolean): void => {
        expect(rsp).to.be.true;
        expect(update_stub.lastCall.lastArg).to.have.property("3ds");
        expect(update_stub.lastCall.lastArg).to.have.property("secureId");
        expect(update_stub.lastCall.lastArg).to.have.property("secureService");
        expect(update_stub.lastCall.lastArg).to.have.property(
          "securityIdentity"
        );
        done();
      },
    });
  });
  it("must return error when the transaction is empty", (done: Mocha.Done) => {
    token_dynamo = undefined;
    get_item_stub = sinon_sandbox.stub().returns(of(token_dynamo));

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_item_stub,
        updateValues: update_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.update3dsTokenInfo(threeds_token_info).subscribe({
      complete: () => {
        expect(update_stub).to.not.be.called;
      },
      error: (err) => {
        expect(err.code).to.be.eq("K002");
        done();
      },
    });
  });
  it("must return error when dynamo query fails", (done: Mocha.Done) => {
    get_item_stub = sinon_sandbox.stub().rejects(new Error());

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_item_stub,
        updateValues: update_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.update3dsTokenInfo(threeds_token_info).subscribe({
      complete: () => {
        expect(update_stub).to.not.be.called;
      },
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eq("K002");
        done();
      },
    });
  });
});

function runDependencies(box: SinonSandbox, tracer: SinonStub) {
  CONTAINER.restore();
  box.restore();
  tracer.restore();
}
