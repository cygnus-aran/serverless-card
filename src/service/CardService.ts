/**
 * Card Service file
 */
import { Tracer } from "@aws-lambda-powertools/tracer";
import {
  AurusError,
  DynamoEventNameEnum,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE,
  IDynamoDbEvent,
  IDynamoRecord,
  IGenericHeaders,
  ILambdaGateway,
  ILogger,
  IRequestContext,
  KushkiError,
  StatusCodeEnum,
} from "@kushki/core";
import { OriginTypeEnum } from "@kushki/core/lib/infrastructure/DataFormatterCatalogEnum";
import { TokenTypeEnum } from "@kushki/core/lib/infrastructure/TokenTypeEnum";
import {
  IDataFormatter,
  IKushkiInfo,
  IKushkiInfoRequest,
  IRootRequest,
  IRootResponse,
  ISecurityIdentity,
  ISecurityIdentityRequest,
} from "@kushki/core/lib/repository/IDataFormatter";
import { Context } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { NON_ASCII_CHARACTERS } from "constant/ASCIICharacters";
import { IDENTIFIERS } from "constant/Identifiers";
import {
  PAYLOAD,
  QUEUES,
  VALID_ECI_FOR_MC,
  VALID_ECI_FOR_VISA,
} from "constant/Resources";
import { TABLES } from "constant/Tables";
import { AggTransactionEnum } from "infrastructure/AggTransactionEnum";
import { AurusErrorCodeEnum } from "infrastructure/AurusErrorCodeEnum";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import {
  CardProviderEnum,
  PROVIDER_BY_PROCESSOR,
} from "infrastructure/CardProviderEnum";
import { ChannelEnum } from "infrastructure/ChannelEnum";
import { CompleteTransactionTypeEnum } from "infrastructure/CompleteTransactionTypeEnum";
import {
  AVAILABLE_COUNTRIES_PARTIAL_VOID,
  COUNTRIES_ALWAYS_ACTIVE_DEFERRED,
  CountryEnum,
  PARTIAL_VOID_BY_COUNTRY_PROCESSOR,
} from "infrastructure/CountryEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { DeferredTypeEnum } from "infrastructure/DeferredTypeEnum";
import {
  EnvironmentEnum,
  PROCESSOR_SANDBOX_STAGES,
} from "infrastructure/EnvironmentEnum";
import { ERRORS, KUSHKI_HANDLED_ERRORS } from "infrastructure/ErrorEnum";
import { FullResponseVersionEnum } from "infrastructure/FullResponseVersionEnum";
import { HierarchyEnum } from "infrastructure/HierarchyEnum";
import { IEventBusDetail } from "infrastructure/IEventBusDetail";
import { IndexEnum } from "infrastructure/IndexEnum";
import { MethodsEnum } from "infrastructure/MethodsEnum";
import {
  PARTIAL_VOID_DISABLED_PROCESSOR,
  PARTIAL_VOID_PROCESSORS,
  ProcessorEnum,
  PROCESSORS,
  PROCESSORS_SANDBOX,
} from "infrastructure/ProcessorEnum";
import { ProcessorTypeEnum } from "infrastructure/ProcessorTypeEnum";
import { RegexEnum } from "infrastructure/RegexEnum";
import {
  PartnerValidatorEnum,
  SECURE_IDENTITY_PROVIDER,
  SECURE_IDENTITY_SECURE_SERVICE,
} from "infrastructure/SecureIdentityEnum";
import { SubscriptionTriggerEnum } from "infrastructure/SubscriptionEnum";
import { TokensEnum, TokenStatusEnum } from "infrastructure/TokenTypeEnum";
import { TransactionKindEnum } from "infrastructure/TransactionKindEnum";
import { TransactionModeEnum } from "infrastructure/TransactionModeEnum";
import {
  SUBSCRIPTIONS_TYPE_RECORD,
  SubsTransactionRuleEnum,
  TransactionRuleInvokeTypeEnum,
  TransactionRuleTypeEnum,
} from "infrastructure/TransactionRuleTypeEnum";
import {
  DeclinedAuthentication3DSEnum,
  TransactionStatusEnum,
} from "infrastructure/TransactionStatusEnum";
import { TransactionSyncModeEnum } from "infrastructure/TransactionSyncModeEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { TransbankTransactionTypeEnum } from "infrastructure/TransbankTransactionTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { WebpayIntegrationTypeEnum } from "infrastructure/WebpayIntegrationTypeEnum";
import { inject, injectable, multiInject } from "inversify";
import {
  cloneDeep,
  defaultTo,
  filter,
  first,
  get,
  has,
  includes,
  isEmpty,
  isEqual,
  isObject,
  isUndefined,
  omit,
  omitBy,
  set,
  some,
  toString,
  unset,
  capitalize,
} from "lodash";
import "reflect-metadata";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { ICardService } from "repository/ICardService";
import { IContext } from "repository/IContext";
import { DynamoQueryResponse, IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import { ISNSGateway } from "repository/ISNSGateway";
import { ISQSGateway } from "repository/ISQSGateway";
import {
  ITransactionService,
  ProcessRecordRequest,
  VoidBody,
} from "repository/ITransactionService";
import { defer, forkJoin, from, iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  concatMap,
  map,
  mapTo,
  mergeMap,
  reduce,
  switchMap,
  timeoutWith,
  toArray,
} from "rxjs/operators";
import { CustomValidators } from "service/CustomValidators";
import { KushkiAcqService } from "service/KushkiAcqService";
import { ResponseBuilder } from "service/ResponseBuilder";
import { UtilsService } from "service/UtilsService";
import { ThreeDSTokenInfoRequest } from "types/3ds_token_info_request";
import { AccountInfoRequest } from "types/account_info_request";
import { AccountValidationRequest } from "types/account_validation_request";
import { AccountValidationResponse } from "types/account_validation_response";
import { Amount } from "types/amount";
import { AurusChargesResponse } from "types/aurus_charges_response";
import { AurusResponse, TransactionDetails } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { AuthorizerContext } from "types/authorizer_context";
import { BinInfo } from "types/bin_info";
import { BinParameters } from "types/bin_parameters";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargeBackRequest } from "types/chargeback_request";
import { ChargebackTransaction } from "types/chargeback_transaction";
import {
  ChargesCardRequest,
  Deferred,
  ThreeDomainSecure,
} from "types/charges_card_request";
import { ChargesCardResponse, Details } from "types/charges_card_response";
import { ConvertionResponse } from "types/convertion_response";
import { CreateDefaultServicesRequest } from "types/create_card_request";
import { CreateDefaultServicesResponse } from "types/create_card_response";
import { DirectIntegrationBins } from "types/direct_integration_bins";
import { DirectIntegrationProcessorIds } from "types/direct_integration_processor_ids";
import {
  DeferredOption,
  DynamoMerchantFetch,
} from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { GetDeferredRequest } from "types/get_deferred_request";
import { GetDeferredResponse } from "types/get_deferred_response";
import { HierarchyConfig } from "types/hierarchy_config";
import { KushkiAcqVars } from "types/kushki_acq_vars";
import { LambdaGetProcessorConfigurationResponse } from "types/lambda_get_processor_configuration_response";
import {
  LambdaTransactionRuleBodyResponse,
  LambdaTransactionRuleResponse,
} from "types/lambda_transaction_rule_response";
import { LambdaValues } from "types/lambda_values";
import { MerchantResponse } from "types/merchant_response";
import { PlccInfo } from "types/plcc_info";
import {
  MessageFields,
  PreauthFullResponseV2,
} from "types/preauth_full_response_v2";
import { ReauthorizationRequest } from "types/reauthorization_request";
import { ReceivableResponse } from "types/receivableResponse";
import { IDeferredResponse } from "types/remote/deferred_response";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { TokenResponse } from "types/remote/token_response";
import { Amount as VoidAmount, RequestedVoid } from "types/requested_void";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { SandboxTokenLambdaRequest } from "types/sandbox_token_lambda_request";
import { SandboxTokenRequest } from "types/sandboxToken_request";
import { SaveDeclineTrxRequest } from "types/save_decline_trx_request";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import {
  History,
  SiftScienceWorkflowsResponse,
} from "types/sift_science_workflows_response";
import { SimplifyResponse } from "types/siplify_response";
import { SubscriptionDynamo } from "types/subscription_dynamo";
import { SubscriptionTokenDelete } from "types/subscription_token_delete";
import { SubscriptionTransactionDynamo } from "types/subscription_transaction_dynamo";
import {
  ContactDetails,
  Currency,
  Metadata,
  TokenChargeRequest,
} from "types/token_charge_request";
import { Cybersource, TokenDynamo } from "types/token_dynamo";
import { TokensCardBody, TransactionRuleInfo } from "types/tokens_card_body";
import { TokensCardResponse } from "types/tokens_card_response";
import { TracerInfo } from "types/tracer_info";
import { Transaction } from "types/transaction";
import { TransactionDynamo } from "types/transaction_dynamo";
import { UnifiedCaptureRequest } from "types/unified_capture_request";
import {
  OrderDetails,
  SubMerchantDynamo,
  ThreeDomainSecureRequestObject,
  UnifiedChargesPreauthRequest,
} from "types/unified_charges_preauth_request";
import { UpdateProcessorRequest } from "types/update_processor_request";
import { UpdateSemaphoreResponse } from "types/update_semaphore_response";
import { ValidateAccountLambdaRequest } from "types/validate_account_lambda_request";
import { AcqCardResponse } from "types/validate_account_lambda_response";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { WebhooksRequestChargeback } from "types/void_card_request";
import { VoidCardResponse } from "types/void_card_response";
import { VoidCardResponseV2 } from "types/void_card_response_v2";
import { VoidChargeBackResponse } from "types/void_chargeback_response";
import { WebhookSignatureResponse } from "types/webhook_signature_response";
import { v4 } from "uuid";
import { TokenlessChargeCardBody } from "types/tokenless_charge_card_body";
import { CitMitEnum } from "infrastructure/CitMitEnum";
import { QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { DirectMerchantEnabledEnum } from "infrastructure/DirectMerchantEnabledEnum";
import camelcaseKeys = require("camelcase-keys");
import deepCleaner = require("deep-cleaner");
import dotObject = require("dot-object");
import moment = require("moment");
import nanoSeconds = require("nano-seconds");
import rollbar = require("rollbar");
import { PaymentSubMethodTypeEnum } from "infrastructure/PaymentMethodEnum";
import { ChargebackPath } from "types/chargeback_path";
import { ChargebackResponse } from "types/chargeback_response";
import { GetVPCResponse } from "types/get_vpc_response";
import { VpcTransaction } from "types/vpc_transaction";

type BinFetchType = DynamoBinFetch | undefined;

type BaseTokenInfo = {
  totalAmount: number;
  transactionReference: string;
  transactionCreated: number;
  isTokenless: true;
  convertionResponse?: ConvertionResponse;
  convertedAmount?: Amount;
};

type TransactionRulePayload = {
  credentialId: string;
  currency: string;
  deferred: object;
  transactionType: TransactionRuleTypeEnum;
  customer: object;
  hierarchyConfig?: object;
  ignoreWarnings: boolean;
  isDeferred: boolean;
  merchantCountry: string;
  merchantId: string;
  metadata?: object;
  orderDetails?: object;
  token: DynamoTokenFetch;
  productDetails?: object;
  sellerUserId: string;
  sandboxEnable: boolean;
};

type PartialTransactionRefund = {
  status: boolean;
  pendingAmount: number;
  requestAmount: number;
  partialVoid?: boolean;
  convertedAmount?: {
    currency: string;
    totalAmount: number;
  };
};

type RequestBodyTrxRule = {
  deferred?: object;
  isDeferred: boolean;
  credentialId: string;
  currency: string;
  customer?: object;
  hierarchyConfig?: object;
  ignoreWarnings: boolean;
  merchantId: string;
  merchantCountry?: string;
  metadata?: object;
  orderDetails?: object;
  productDetails?: object;
  sellerUserId?: string;
  sandboxEnable?: boolean;
};

export type ChargeOTPRequest = {
  metadata?: Metadata;
  amount: Amount;
  channel: string;
  token: string;
  contactDetails?: ContactDetails;
};

type FullResponseType = boolean | undefined | "v2" | "v1";

export type ChargeInput = {
  address?: string;
  amount: Amount;
  authorizerContext: AuthorizerContext;
  contactDetails?: ContactDetails;
  convertedAmount?: Amount;
  currentMerchant: DynamoMerchantFetch;
  currentToken: DynamoTokenFetch;
  cvv?: string;
  deferred?: Deferred;
  email?: string;
  event: UnifiedChargesPreauthRequest; //  TODO: BORRAR U DEJAR UNIFIED
  ip?: string;
  isFailoverRetry: boolean;
  isAft?: boolean;
  initialRecurrenceReference?: string;
  isOCT?: boolean;
  lambdaContext: Context;
  lastName?: string;
  metadataId?: string;
  name?: string;
  orderDetails?: OrderDetails;
  plccInfo: { flag: string; brand: string };
  postalCode?: string;
  processor: DynamoProcessorFetch;
  ruleInfo?: object;
  siftScience?: boolean;
  skipSecurityValidation?: boolean;
  taxId?: string;
  token?: string;
  tokenType: string;
  transactionType: string;
  trxRuleResponse: LambdaTransactionRuleBodyResponse;
  originalCommissionType?: string;
  originUsrv?: string;
  subtokenType?: string;
  subscriptionMinChargeTrxRef?: string;
};

type VaultResponse = {
  vaultToken?: string;
  saveCard: boolean;
  expiryMonth?: string;
  expiryYear?: string;
};

export type CaptureInput = {
  authorizerContext: AuthorizerContext;
  body: CaptureCardRequest;
  transaction: Transaction;
  processor: DynamoProcessorFetch;
  merchantId: string;
  context: Context;
  currentToken?: DynamoTokenFetch;
  trxReference: string;
  trxRuleResponse: LambdaTransactionRuleBodyResponse;
  taxId?: string;
  merchantCountry?: string;
  usrvOrigin?: string;
  tokenTrxReference: string;
  lastTransaction?: Transaction;
};

export type ReauthInput = {
  merchantId: string;
  processorName: string;
  publicId: string;
  trxRuleResponse: LambdaTransactionRuleResponse;
};

const ACQUIRER_BANK_TARGET_STRING: string = "details.acquirerBank";
const PROCESSOR_NAME_DETAILS_PATH: string = "transaction_details.processorName";
const LAST_FOUR_DIGITS_DETAILS_PATH: string =
  "transaction_details.lastFourDigitsOfCard";
const MESSAGE_FIELDS_DETAILS_PATH: string = "transaction_details.messageFields";
const LAST_FOUR_DIGITS_CURRENT_TOKEN_PATH: string =
  "currentToken.lastFourDigits";
const BIN_CARD_DETAILS_PATH: string = "transaction_details.binCard";
const MERCHANT_NAME_DETAILS_PATH: string = "transaction_details.merchantName";
const BIN_CURRENT_TOKEN_PATH: string = "currentToken.bin";
const IS_DEFERRED_DETAILS_PATH: string = "transaction_details.isDeferred";
const CURRENT_MERCHANT_COUNTRY_PATH: string = "currentMerchant.country";
const SANDBOX_ENABLE_PATH: string = "requestContext.authorizer.sandboxEnable";
const CARD_NAME_PATH: string = "card.name";
const AURUS_ERROR_MESSAGE_TOKEN: string =
  "El token de la transacción no es válido";
const TOKEN_BIN_INFO_TYPE: string = "currentToken.binInfo.info.type";
const MERCHANT_ID_AUTHORIZER: string = "requestContext.authorizer.merchantId";
const DIRECT: string = "direct";
const INTEGRATION_PATH: string = "body.integration";
const CARD_TYPE_PATH: string = "binInfo.info.type";
const DEFERRED_MONTHS_PATH: string = "deferred.months";
const PROCESSOR_TYPE_PATH: string = "body.processorType";
const BIN_PATH: string = "binInfo.bin";
const BIN_PATH_FULL_SIZE: string = "binInfo.originalBinFullLength";
const BIN_BANK: string = "binInfo.bank";
const BIN_BRAND: string = "binInfo.brand";
const BIN_BRAND_PRODUCT_CODE: string = "binInfo.brandProductCode";
const AMOUNT_PATH: string = "body.amount";
const CURRENCY_PATH: string = "amount.currency";
const TOKEN_BIN_PATH: string = "tokenObject.bin";
const TOKEN_DEFERRED_PATH: string = "tokenObject.isDeferred";
const TOTAL_AMOUNT: string = "amount.totalAmount";
const MERCHANT_SANDBOX: string = "merchant.sandboxEnable";
const BIN_INFO_PATHS: string[] = ["bank", "brand", "number"];
const INTEGRATION_METHOD_PATH: string =
  "trxRuleResponse.body.completeTransactionType";
const RULE_INTEGRATION_PATH: string = "trxRuleResponse.body.integration";
const APPROVAL_CODES: string[] = ["000", "200"];
const TRANSACTION_MODE: string = "transactionMode";
const PROCESSOR_BANK_NAME_PATH = "processor.acquirer_bank";
const APPROVAL_CODE_PATH = "transaction_details.approvalCode";
const PROCESSOR_PATH = "transactionRuleInfo.processor";
const PARTNER_VALIDATOR_PATH = "trxRuleResponse.body.partnerValidator";
const PRODUCT_DETAILS_PATH: string = "productDetails";
const COUNTRY_NAME: string = "binInfo.info.country.name";
const ECOMMERCE: string = "ecommerce";
const TOKEN_USED_ERROR = "ConditionalCheckFailedException";
const MERCHANT_COUNTRY = "merchant.country";
const HIERARCHY_PATH = "authorizerContext.hierarchyConfig";
const MERCHANT_DATA_PATH = "authorizerContext.merchantData";
const TRANSACTION_REFERENCE = "transaction_reference";
const WEBHOOK_PATH = "body.webhooks";
const CAPTURE_PERCENTAGE: string = "CAPTURE_PERCENTAGE";
const REFUND_TIME_LIMIT: string = "REFUND_TIME_LIMIT";
const TRX_COUNTRY: string = "country";
const TRX_CARD_COUNTRY: string = "card_country";
const SCOPE_DOM: string = "dom";
const SCOPE_INT: string = "int";
const DEFAULT_TIME_LIMIT: object = { default: "120" };
const UNIFIED_CHARGE_TAG: string =
  "UnifiedRequest | _handleUnifiedChargesPreauth";
const CYBERSOURCE_TAG: string = "CardService | cybersource";
const CARD_INFO_CARD_HOLDER_NAME: string = "cardInfo.cardHolderName";
const CARD_INFO_MASKED_CARD_NUMBER: string = "cardInfo.maskedCardNumber";
const CARD_INFO_LAST_FOUR_DIGITS: string = "cardInfo.lastFourDigits";
const DEFERRED_PATH: string = "deferred";
const CONTACT_DETAILS: string = "contactDetails.email";
const CONTACT_DETAILS_PHONE_NUMBER: string = "contactDetails.phoneNumber";
const ORDER_DETAILS_PATH: string = "orderDetails";
const BIN_INFO_COUNTRY_NAME: string = "binInfo.country.name";
const TRANSACTION_RULE_OMIT_CVV: string = "transactionRuleInfo.omitCVV";
const PLATFORM_NAME_PATH: string = "kushkiInfo.platformName";
const is_credit_map: object = {
  credit: "true",
  debit: "false",
  na: "true",
};
const PRIVATE_PATHS_OMIT: string[] = [
  "authorizerContext.privateMerchantId",
  "authorizerContext.privateCredentialId",
  "authorizerContext.credentialId",
  "merchant.private_id",
];

type ChargeError = Error | AurusError | KushkiError;
export type EventCharge =
  | ChargesCardRequest
  | CaptureCardRequest
  | ChargeOTPRequest
  | TokenlessChargeCardBody
  | UnifiedChargesPreauthRequest;

export type InvokeTrxRuleResponse = {
  apiKey: string;
  processor: DynamoProcessorFetch;
  plccInfo: { flag: string; brand: string };
  trxRuleResponse: LambdaTransactionRuleBodyResponse;
};

type DeferredOptionsType = DeferredOption[] | boolean | undefined;

type FinalAmountAndSubscription = {
  finalAmount: Amount;
  modifiedSubscription: SubscriptionDynamo;
};

/**
 * Implementation
 */
@injectable()
export class CardService implements ICardService {
  private static _validateBin(binCard: string): void {
    let bad_bins: string[] = [];

    if (binCard.startsWith("0")) throw new KushkiError(ERRORS.E025);

    if (process.env.BAD_BINS !== undefined)
      bad_bins = process.env.BAD_BINS.split(",");

    if (bad_bins.includes(binCard.substring(0, 6)))
      throw new KushkiError(ERRORS.E007);
  }

  // TODO: THIS FIX WAS CREATED BECAUSE TUENTI MAKE TOKEN WITH AURUS AND CHARGE BY HERE -.-
  private static _validateTokenExists(
    cToken: DynamoTokenFetch | undefined,
    bodyToken: string,
    authorizerMerchantId: string,
    transaction?: Transaction
  ): DynamoTokenFetch {
    if (cToken === undefined)
      return {
        amount: 0,
        bin: "",
        created: 0,
        currency: "",
        id: bodyToken,
        ip: "",
        lastFourDigits: "",
        maskedCardNumber: "",
        merchantId: authorizerMerchantId,
        transactionReference: v4(),
        kushkiInfo: get(transaction, "kushkiInfo", {}),
      };

    return cToken;
  }

  private static _checkTokenExists(
    cToken: DynamoTokenFetch | undefined,
    transaction: Transaction,
    bodyToken: string,
    merchantId: string,
    subscription: SubscriptionDynamo | undefined
  ): DynamoTokenFetch {
    const merchant_id_list: string[] =
      `${process.env.MERCHANT_IDS_TUENTI}`.split(",");

    if (merchant_id_list.includes(merchantId))
      return CardService._validateTokenExists(cToken, bodyToken, merchantId);

    if (
      cToken !== undefined &&
      get(cToken, "transactionReference") !== transaction.transaction_reference
    )
      cToken.transactionReference = v4();

    if (cToken === undefined)
      return {
        amount: get(transaction, "request_amount", 0),
        bin: transaction.bin_card,
        binInfo: {
          bank: get(transaction, "issuing_bank", ""),
          bin: get(transaction, "bin_card", ""),
          brand: get(transaction, "payment_brand", ""),
          info: {
            type: get(transaction, "card_type", ""),
          },
          originalBinFullLength: get(transaction, "original_bin", ""),
          processor: get(transaction.processor_name, "", ""),
        },
        created: 0,
        currency: transaction.currency_code,
        id: get(transaction, "token", ""),
        ip: get(transaction, "ip", ""),
        lastFourDigits: get(transaction, "last_four_digits", ""),
        maskedCardNumber: get(transaction, "maskedCardNumber", ""),
        merchantId: get(transaction, "merchant_id", ""),
        secureService: get(subscription, "secureService"),
        transactionCardId: get(transaction, "transactionCardId", ""),
        transactionReference: get(transaction, TRANSACTION_REFERENCE, ""),
        kushkiInfo: get(transaction, "kushkiInfo"),
      };

    return cToken;
  }

  public static transformCardName(cardName: string): string {
    let str: string;

    str = defaultTo(cardName, "").replace(
      /[áéíóúÁÉÍÓÚÑñ]/gi,
      (matched: string): string => NON_ASCII_CHARACTERS[matched]
    );
    str = str.replace(/[^\x00-\x7F]/g, "");
    str = str.replace(/[^a-zA-Z 0-9]+/g, "");

    return str;
  }

  /* eslint-disable sonarjs/cognitive-complexity*/
  public static sFullAmount(amount: Amount): number {
    let total: number =
      get(amount, "iva", 0) +
      get(amount, "subtotalIva", 0) +
      get(amount, "subtotalIva0", 0);

    if (amount.ice !== undefined) total += amount.ice;
    if (amount.extraTaxes) {
      total += amount.extraTaxes.agenciaDeViaje
        ? amount.extraTaxes.agenciaDeViaje
        : 0;
      total += amount.extraTaxes.iac ? amount.extraTaxes.iac : 0;
      total += amount.extraTaxes.propina ? amount.extraTaxes.propina : 0;
      total += amount.extraTaxes.tip ? amount.extraTaxes.tip : 0;
      total += amount.extraTaxes.tasaAeroportuaria
        ? amount.extraTaxes.tasaAeroportuaria
        : 0;
      total += amount.extraTaxes.stateTax ? amount.extraTaxes.stateTax : 0;
      total += amount.extraTaxes.municipalTax
        ? amount.extraTaxes.municipalTax
        : 0;
      total += amount.extraTaxes.reducedStateTax
        ? amount.extraTaxes.reducedStateTax
        : 0;
    }

    return total;
  }

  private static _getWebpayCardType(
    request: UnifiedChargesPreauthRequest
  ): string {
    return get(request, CARD_TYPE_PATH, "").toLowerCase() === "credit"
      ? "credit"
      : "debit";
  }

  private static _getBinByMasquedCard(maskedCard: string): string {
    return maskedCard.toUpperCase().split("X")[0];
  }

  public static getValidBinNumber(request: object): string {
    return (
      get(request, BIN_PATH_FULL_SIZE) ||
      get(request, BIN_PATH) ||
      CardService._getBinByMasquedCard(get(request, "maskedCardNumber") || "")
    );
  }

  public static readonly sSiftScienceDecision: string = "decision";
  public static readonly sSiftScienceBlockType: string = "red";
  public static readonly sCountryName: string = "info.country.name";
  public static readonly sFullResponsePath: string = "event.fullResponse";
  public static readonly sqsFlagPath: string = "event.sqsFlag";
  public static readonly sColombianChileanDeferredOptions: IDeferredResponse[] =
    [
      {
        months: [
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "11",
          "12",
          "13",
          "14",
          "15",
          "16",
          "17",
          "18",
          "19",
          "20",
          "21",
          "22",
          "23",
          "24",
          "25",
          "26",
          "27",
          "28",
          "29",
          "30",
          "31",
          "32",
          "33",
          "34",
          "35",
          "36",
          "37",
          "38",
          "39",
          "40",
          "41",
          "42",
          "43",
          "44",
          "45",
          "46",
          "47",
          "48",
        ],
        monthsOfGrace: [],
        type: DeferredTypeEnum.ALL,
      },
    ];
  private readonly _requestVoid: object = {
    bin_card: "binCard",
    buy_order: "buyOrder",
    card_country: "cardCountry",
    card_country_code: "cardCountryCode",
    card_holder_name: "cardHolderName",
    card_type: "cardType",
    category_merchant: "categoryMerchant",
    channel: "channel",
    country: "country",
    created: "created",
    currency_code: "currencyCode",
    foreign_card: "foreignCard",
    last_four_digits: "lastFourDigits",
    merchant_id: "merchantId",
    merchant_name: "merchantName",
    metadata: "metadata",
    parent_ticket_number: "parentTicketNumber",
    payment_brand: "paymentBrand",
    processor_bank_name: "processorBankName",
    processor_id: "processorId",
    processor_name: "processorName",
    processor_type: "processorType",
    provider: "provider",
    request_amount: "requestAmount",
    social_reason: "socialReason",
    subscription_id: "subscriptionId",
    subscriptionMetadata: "subscriptionMetadata",
    tax_id: "taxId",
    ticket_number: "ticketNumber",
    token: "token",
    transaction_id: "transactionId",
    transaction_status: "transactionStatus",
    transaction_type: "transactionType",
    vault_token: "vaultToken",
  };
  private readonly _getMccCode: string = "body.subMccCode";
  private readonly _storage: IDynamoGateway;
  private readonly _antifraud: IAntifraudGateway;
  private readonly _lambda: ILambdaGateway;
  private readonly _transactionService: ITransactionService;
  private readonly _sns: ISNSGateway;
  private readonly _sqs: ISQSGateway;
  private readonly _rollbar: rollbar;
  private readonly _providers: IProviderService[];
  private readonly _logger: ILogger;
  private readonly _tracer: Tracer;
  private readonly _requestcontextcredentialAlias: string =
    "requestContext.authorizer.credentialAlias";
  private readonly _requestcontextcredentialId: string =
    "requestContext.authorizer.credentialId";
  private readonly _requestcontextcredentialMetadata: string =
    "requestContext.authorizer.credentialMetadata";
  private readonly _requestcontextpublicCredentialId: string =
    "requestContext.authorizer.publicCredentialId";
  private readonly _requestTransactionMode: string = "body.transactionMode";
  private readonly _requestHierarchyConfig: string =
    "requestContext.authorizer.hierarchyConfig";
  private readonly _subscriptionValidationPath: string =
    "metadata.ksh_subscriptionValidation";
  private readonly _processingDeferred: string = "processing.deferred";
  private readonly _coreFormatter: IDataFormatter;
  private readonly _requestMerchantData: string =
    "requestContext.authorizer.merchantData";

  /* eslint-disable max-params*/
  constructor(
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(IDENTIFIERS.AntifraudGateway) antifraud: IAntifraudGateway,
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.TransactionService)
    transactionService: ITransactionService,
    @inject(IDENTIFIERS.ISNSGateway) sns: ISNSGateway,
    @inject(IDENTIFIERS.SQSGateway) sqs: ISQSGateway,
    @inject(CORE.RollbarInstance) rollbarInstance: rollbar,
    @multiInject(IDENTIFIERS.ProviderService) providers: IProviderService[],
    @inject(CORE.Logger) logger: ILogger,
    @inject(CORE.Tracer) tracer: Tracer,
    @inject(CORE.DataFormatter) coreFormatter: IDataFormatter
  ) {
    this._tracer = tracer;
    this._storage = storage;
    this._antifraud = antifraud;
    this._lambda = lambda;
    this._transactionService = transactionService;
    this._sns = sns;
    this._sqs = sqs;
    this._rollbar = rollbarInstance;
    this._providers = providers;
    this._logger = logger;
    this._coreFormatter = coreFormatter;
  }

  public deferred(
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
  ): Observable<IDeferredResponse[]> {
    const is_object_hierarchy_config = isObject(
      get(event, this._requestHierarchyConfig, {})
    );
    const hierarchy_config: HierarchyConfig = is_object_hierarchy_config
      ? get(event, this._requestHierarchyConfig, {})
      : JSON.parse(get(event, this._requestHierarchyConfig, "{}"));

    return of(1).pipe(
      mergeMap(() => {
        const deferred: string = get(
          hierarchy_config,
          this._processingDeferred,
          ""
        );

        if (!isEmpty(deferred))
          return this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: deferred,
          });

        return of(undefined);
      }),
      switchMap((hierarchyMerchant: DynamoMerchantFetch | undefined) =>
        forkJoin([
          this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: event.requestContext.authorizer.merchantId,
          }),
          of(hierarchyMerchant),
        ])
      ),
      switchMap(
        ([merchant, hierarchy_merchant]: [
          DynamoMerchantFetch | undefined,
          DynamoMerchantFetch | undefined
        ]) => {
          if (merchant !== undefined) {
            const merchant_id: string = get(
              hierarchy_config,
              this._processingDeferred,
              ""
            );
            const request: GetDeferredRequest = {
              bin: event.pathParameters.binNumber,
              hierarchyConfig: event.requestContext.authorizer.hierarchyConfig,
              merchantId: !isEmpty(merchant_id)
                ? merchant_id
                : event.requestContext.authorizer.merchantId,
            };

            const merchant_country: string | undefined = !isEmpty(
              get(hierarchy_config, this._processingDeferred, "")
            )
              ? get(hierarchy_merchant, "country", "")
              : get(merchant, "country", "");

            if (
              merchant_country === CountryEnum.COLOMBIA ||
              merchant_country === CountryEnum.CHILE
            )
              return of(CardService.sColombianChileanDeferredOptions);

            return this._invokeGetDeferredLambda(request);
          }

          return of([]);
        }
      ),
      tag("Card Service | deferred")
    );
  }

  public binInfo(
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
  ): Observable<BinInfo> {
    return this._getPlccProcessor(event.requestContext.authorizer).pipe(
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      mergeMap((plcc: boolean) =>
        this._validateBinInformation(
          toString(event.pathParameters.binNumber).slice(0, 6),
          plcc,
          get(event.requestContext.authorizer, "merchantCountry", "")
        )
      ),
      map((binItem: DynamoBinFetch | undefined) => {
        const card_type: string = !isEmpty(get(binItem, "info.type"))
          ? get(binItem, "info.type", "credit")
          : "credit";
        const bank: string = !isEmpty(get(binItem, "bank"))
          ? get(binItem, "bank", "")
          : "";
        const brand: string = !isEmpty(get(binItem, "brand"))
          ? get(binItem, "brand", "")
          : "";

        let response: BinInfo = {
          bank,
          brand: brand.toLowerCase(),
          cardType: card_type.toLowerCase(),
        };

        response = isEmpty(get(binItem, CardService.sCountryName))
          ? response
          : {
              ...response,
              country: get(binItem, CardService.sCountryName),
            };

        return response;
      }),
      tag("Card Service | binInfo")
    );
  }

  // istanbul ignore next
  public sqsWebhook(): Observable<boolean> {
    return of(true);
  }

  public tokens(
    event: IAPIGatewayEvent<TokensCardBody, null, null, AuthorizerContext>
  ): Observable<TokenResponse> {
    let sandbox_enable: boolean;
    let merchant_id: string;
    let body: TokensCardBody;
    let transaction_reference: string;
    let processor: string;
    let merchant_dynamo: DynamoMerchantFetch | undefined;
    const is_aws_request: boolean = "KSH_AWS_REQUEST_ID" in event;

    return of(1).pipe(
      mergeMap(() =>
        this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
          public_id: event.requestContext.authorizer.merchantId,
        })
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      mergeMap((merchant: DynamoMerchantFetch | undefined) => {
        const transaction_mode: string = get(
          event,
          this._requestTransactionMode,
          ""
        );
        const total_amount: number = get(event, "body.totalAmount", 0);

        if (
          transaction_mode === TransactionModeEnum.ACCOUNT_VALIDATION &&
          total_amount !== 0
        )
          throw new KushkiError(ERRORS.E001);

        processor = get(event.body, PROCESSOR_PATH, "");

        if (get(event, "body.binInfo.invalid", false) === true)
          set(event, "body.binInfo", undefined);

        if (
          this._isTrxNotAllowedWithoutCvv(
            get(event, "body.cvv", ""),
            get(event, "body.transactionRuleInfo.omitCVV", true),
            processor,
            transaction_mode
          )
        ) {
          this._rollbar.warn("Transacción no permitida sin ccv2.");
          throw new KushkiError(ERRORS.E015);
        }

        body = this._prepareBody(event.body) as TokensCardBody;
        sandbox_enable = this._getSandboxEnable(
          defaultTo(
            get(merchant, "sandboxEnable"),
            get(event, SANDBOX_ENABLE_PATH, false)
          ),
          processor
        );
        merchant_id = get(event, MERCHANT_ID_AUTHORIZER, "");
        transaction_reference = v4();

        this._putTracerData({
          country: get(
            merchant,
            "country",
            get(event, "requestContext.authorizer.country", "")
          ),
          currency: get(body, "currency", ""),
          merchantId: merchant_id,
          merchantName: get(
            merchant,
            "merchant_name",
            get(event, "requestContext.authorizer.merchantName", "")
          ),
          processorName: event.body.transactionRuleInfo.processor,
          transactionReference: transaction_reference,
        });
        merchant_dynamo = merchant;
        return of(1);
      }),
      concatMap(() =>
        this._tokenCreationProcess({
          body,
          requestContext: event.requestContext,
          headers: event.headers,
          merchantDynamo: merchant_dynamo,
          processorName: processor,
          merchantID: merchant_id,
          transactionReference: transaction_reference,
          isAwsRequest: is_aws_request,
          isSandboxEnable: sandbox_enable,
        })
      ),
      map((data: TokenDynamo) => {
        const response: TokenResponse = {
          token: data.id,
        };

        if (UtilsService.hasCybersourceApiValidationUrl(event.body))
          set(
            response,
            "url",
            UtilsService.generateSecureValidationUrl(
              data.id,
              event,
              sandbox_enable
            )
          );

        dotObject.copy("settlement", "settlement", data, response);
        dotObject.copy("secureService", "secureService", data, response);
        dotObject.copy("secureId", "secureId", data, response);

        const three_ds: Cybersource | undefined = get(data, "3ds");

        if (!isEmpty(three_ds))
          set(response, "security", this._buildTokenThreeDSObject(three_ds));

        return response;
      })
    );
  }

  public tokenlessCharge(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >,
    context: Context
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() =>
        this._tokenlessTransactionByType(
          event,
          TransactionRuleTypeEnum.CHARGE,
          context
        )
      )
    );
  }

  public tokenlessPreAuthorization(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >,
    context: Context
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() =>
        this._tokenlessTransactionByType(
          event,
          TransactionRuleTypeEnum.PREAUTHORIZATION,
          context
        )
      )
    );
  }

  // tslint:disable-next-line:max-func-body-length
  public unifiedCapture(
    request: UnifiedCaptureRequest,
    context: IContext
  ): Observable<object> {
    const capture_reference: string = v4();
    let current_transaction: Transaction;
    let current_token: DynamoTokenFetch;
    let current_subscription: SubscriptionDynamo;
    let current_processor: DynamoProcessorFetch;
    let current_trx_rule: InvokeTrxRuleResponse;
    const is_card_request: boolean = Boolean(
      request.usrvOrigin === UsrvOriginEnum.CARD
    );
    const is_subscription_request: boolean = Boolean(
      request.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS
    );

    console.log(UNIFIED_CHARGE_TAG, omit(request, PRIVATE_PATHS_OMIT));

    if (!request.captureRequest.ticketNumber) {
      return throwError(() => new KushkiError(ERRORS.E001));
    }
    return of(1).pipe(
      mergeMap(() =>
        this._getPreauthTransactionAndToken(
          request.captureRequest.ticketNumber,
          request.authorizer.merchantId,
          is_card_request,
          get(request.captureRequest.amount, "currency", "")
        )
      ),
      mergeMap(
        ([transaction, token]: [Transaction, DynamoTokenFetch | undefined]) => {
          current_transaction = transaction;
          current_token = this._validateCaptureToken(
            token,
            transaction,
            "",
            request.authorizer.merchantId,
            request.subscription
          );
          if (is_subscription_request) {
            current_subscription = this._validateCaptureSubscription(
              request.subscription,
              current_transaction,
              request.authorizer,
              get(request, "pathSubscriptionId", "")
            );
            return forkJoin([
              this._retrieveFinalAmountAndSubscription(
                defaultTo(request.captureRequest.amount, undefined),
                TransactionTypeEnum.PREAUTH,
                current_subscription
              ),
              this._validateCaptureByPreauthTransactionReference(
                get(transaction, "transaction_reference", "")
              ),
            ]);
          }
          return forkJoin([of(undefined), of(false)]);
        }
      ),
      mergeMap(
        ([response]: [FinalAmountAndSubscription | undefined, boolean]) => {
          if (is_subscription_request && response !== undefined) {
            current_subscription = response.modifiedSubscription;
            request.captureRequest.amount = response.finalAmount;
            // ADD: current_subscription_transaction = { ...current_transaction, amount: response.finalAmount}
          }
          return this._checkConvertedAmount(
            request.captureRequest.amount
              ? request.captureRequest.amount
              : {
                  currency: <CurrencyEnum>current_transaction.currency_code,
                  iva: current_transaction.iva_value,
                  subtotalIva: current_transaction.subtotal_iva,
                  subtotalIva0: current_transaction.subtotal_iva0,
                }
          );
        }
      ),
      mergeMap(([response, amount]: [ConvertionResponse, Amount]) =>
        this._validateCaptureAmount(response, amount, current_transaction)
      ),
      mergeMap(
        ([response, amount, last_transaction]: [
          ConvertionResponse,
          Amount,
          Transaction | undefined
        ]) => {
          const platform_name: string = is_subscription_request
            ? get(current_subscription, PLATFORM_NAME_PATH, "")
            : get(current_token, PLATFORM_NAME_PATH, "");

          if (is_card_request)
            current_token = this._getNewToken(current_token, response);

          set(request, "captureRequest.amount", amount);
          set(request, "last_transaction", last_transaction);
          set(request, "platformName", platform_name);
          const unified_request: UnifiedChargesPreauthRequest =
            this._buildUnifiedTrxRuleRequest(
              current_token,
              request,
              current_transaction,
              capture_reference
            );

          return forkJoin([this._invokeTrxRule(unified_request), of(amount)]);
        }
      ),
      mergeMap(
        ([trx_rule_response, amount]: [InvokeTrxRuleResponse, Amount]) => {
          current_trx_rule = trx_rule_response;
          current_processor = trx_rule_response.processor;
          const provider = this._getProviderVariant(
            current_processor.processor_name,
            get(request, MERCHANT_SANDBOX, false)
          );
          const validated_provider = this._validateMerchantIdProcessor(
            provider,
            current_processor.public_id,
            current_processor.processor_name,
            current_transaction.bin_card,
            trx_rule_response.trxRuleResponse.body.integration,
            {
              ...request,
              vaultToken: get(current_transaction, "vault_token"),
            },
            trx_rule_response.trxRuleResponse.body.completeTransactionType
          );

          this._putTracerData({
            country: get(current_transaction, "country", ""),
            currency: get(current_transaction, "currency_code", ""),
            merchantId: current_transaction.merchant_id,
            merchantName: current_transaction.merchant_name,
            processorName: current_transaction.processor_name,
            transactionReference: current_token.transactionReference,
          });

          return (
            isEqual(current_processor.processor_name, ProcessorEnum.KUSHKI)
              ? this._validateCaptureByPreauthTransactionReference(
                  get(current_transaction, "transaction_reference", "")
                )
              : of(true)
          ).pipe(
            mergeMap(() =>
              this._processUnifiedCapture(
                request,
                context,
                amount,
                current_processor,
                current_transaction,
                capture_reference,
                current_trx_rule,
                current_token,
                validated_provider
              )
            )
          );
        }
      ),
      catchError((err: ChargeError) =>
        iif(
          () => err instanceof AurusError || err instanceof KushkiError,
          this._processChargeOrCaptureError(
            <AurusError | KushkiError>err,
            request.captureRequest,
            request.authorizer,
            current_processor,
            current_token,
            request.merchant,
            TransactionRuleTypeEnum.CAPTURE,
            get(current_trx_rule, INTEGRATION_PATH, "aurus"),
            get(current_trx_rule, "body.completeTransactionType"),
            current_transaction
          ),
          throwError(() => err)
        )
      ),
      switchMap(
        ([capture_transaction, aurus_response]: [Transaction, AurusResponse]) =>
          this._buildCaptureResponse(
            request.captureRequest,
            current_transaction,
            current_processor,
            aurus_response,
            capture_transaction,
            current_token
          )
      ),
      tag("Card Service | unifiedCapture")
    );
  }

  public capture(
    event: IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext>,
    context: IContext
  ): Observable<object> {
    return this._storage
      .getItem<DynamoMerchantFetch>(TABLES.merchants, {
        public_id: event.requestContext.authorizer.merchantId,
      })
      .pipe(
        mergeMap((merchant: DynamoMerchantFetch | undefined) => {
          if (merchant === undefined) throw new KushkiError(ERRORS.E004);

          return this._buildUnifiedCaptureRequest(
            merchant,
            event.body,
            event.requestContext.authorizer
          );
        }),
        mergeMap((ucRequest: UnifiedCaptureRequest) =>
          this.unifiedCapture(ucRequest, context)
        ),
        tag("Card Service | capture")
      );
  }

  public charges(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    _context: Context
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() => {
        const total_amount: number = CardService.sFullAmount(event.body.amount);

        return iif(
          () => this._isValidCitMit(event.body, total_amount),
          of(true),
          throwError(() => new KushkiError(ERRORS.E001))
        );
      }),
      mergeMap(() => this._getContactDetails(event)),
      mergeMap(
        (
          eventModified: IAPIGatewayEvent<
            ChargesCardRequest,
            null,
            null,
            AuthorizerContext
          >
        ) => this._normalizeEvent(eventModified)
      ),
      mergeMap(
        (
          normalizedEvent: IAPIGatewayEvent<
            ChargesCardRequest,
            null,
            null,
            AuthorizerContext
          >
        ) => this._buildUnifiedChargePreauthRequest(normalizedEvent, false)
      ),
      mergeMap((request: UnifiedChargesPreauthRequest) =>
        this.unifiedChargesOrPreAuth(request, _context)
      )
    );
  }

  public createDefaultServices(
    event: IAPIGatewayEvent<
      CreateDefaultServicesRequest,
      null,
      null,
      AuthorizerContext
    >
  ): Observable<CreateDefaultServicesResponse> {
    const merchant_id: string = event.body.merchantId;
    const request: IRequestContext<AuthorizerContext> = event.requestContext;
    const visa: string = "VISA";
    const mc: string = "MASTERCARD";

    request.authorizer.merchantId = merchant_id;

    return of(1).pipe(
      mergeMap(() => this._getSemaphoreData(merchant_id, request)),
      map((data: { body: MerchantResponse }) =>
        this._buildSemaphoreBody(defaultTo(data.body.publicId, ""))
      ),
      mergeMap((body: object) =>
        this._lambda.invokeFunction<{ sempahore: UpdateSemaphoreResponse }>(
          `usrv-billing-core-${process.env.USRV_STAGE}-createUpdateSemaphore`,
          {
            body,
            requestContext: request,
          }
        )
      ),
      catchError((err: KushkiError) => throwError(() => err)),
      map(() => ({
        activeServices: ["smartlinks"],
        cards: [visa, mc],
        conditions: "",
        status: StatusCodeEnum.OK,
        validationCharges: "",
      })),
      tag("CardService | createDefaultServices")
    );
  }

  public unifiedChargesOrPreAuth(
    request: UnifiedChargesPreauthRequest,
    context: Context
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() => this._handleUnifiedChargesPreauth(request, context)),
      tag("Card Service | unifiedChargesOrPreAuth")
    );
  }

  public preAuthorization(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    context: Context
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() => this._buildUnifiedChargePreauthRequest(event, true)),
      mergeMap((request: UnifiedChargesPreauthRequest) =>
        this.unifiedChargesOrPreAuth(request, context)
      ),
      tag("CardService | preAuthorization")
    );
  }

  public chargeMethod(input: ChargeInput): Observable<Transaction> {
    const send_to_sift: boolean = this._checkSiftScience(
      input.transactionType,
      input.currentToken,
      input.currentMerchant
    );

    return of(1).pipe(
      switchMap(() =>
        this._executeCharge({ ...input, siftScience: send_to_sift })
      ),
      switchMap((data: object) => {
        if (get(data, "code") === "228")
          return forkJoin([
            this._executeFailoverCharge(input),
            this._handleChargeOrCaptureAurusError(
              <AurusError>data,
              input.event,
              input.authorizerContext,
              input.processor,
              input.currentToken,
              input.currentMerchant,
              {
                ip: defaultTo(input.currentToken.ip, ""),
                maskedCardNumber: defaultTo(
                  input.currentToken.maskedCardNumber,
                  ""
                ),
                user_agent: get(input, "currentToken.userAgent", ""),
              },
              undefined,
              get(input, RULE_INTEGRATION_PATH),
              get(
                input,
                INTEGRATION_METHOD_PATH,
                WebpayIntegrationTypeEnum.SOAP
              )
            ),
          ]);

        return forkJoin([of(<AurusResponse>data), of({})]);
      }),
      mergeMap(([aurus_response]: [AurusResponse, object]) =>
        this._checkCredibancoError(aurus_response)
      ),
      switchMap(([aurus_response]: [AurusResponse, object]) => {
        this._setCardFields(input, aurus_response);
        unset(input.event, "tokenObject");

        const sqs_charge_event: ProcessRecordRequest = {
          aurusChargeResponse: aurus_response,
          authorizerContext: input.authorizerContext,
          country: get(input, CURRENT_MERCHANT_COUNTRY_PATH, "NA"),
          error: undefined,
          integration: get(input, RULE_INTEGRATION_PATH, "aurus"),
          integrationMethod: get(
            input,
            INTEGRATION_METHOD_PATH,
            WebpayIntegrationTypeEnum.SOAP
          ),
          isAft: get(input, "isAft"),
          merchant: input.currentMerchant,
          merchantId: input.authorizerContext.merchantId,
          merchantName: input.currentMerchant.merchant_name,
          partner: get(input, PARTNER_VALIDATOR_PATH, ""),
          plccInfo: input.plccInfo,
          processor: input.processor,
          requestEvent: input.event,
          ruleInfo: input.ruleInfo,
          siftValidation: send_to_sift,
          tokenInfo: input.currentToken,
          transaction: undefined,
          trxRuleResponse: get(input, "trxRuleResponse.body"),
          trxType: input.transactionType,
          validateSiftTrxRule: get(
            input,
            "trxRuleResponse.body.hasSiftMigrated",
            false
          ),
          whitelist: get(input, "trxRuleResponse.body.whitelist", false),
        };

        return this._sendChargeSQS(sqs_charge_event);
      }),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      tag("CardService | chargeMethod")
    );
  }

  public chargeDeleteGateway(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() =>
        forkJoin([
          this._queryTrx(
            IndexEnum.transaction_ticket_number,
            "ticket_number",
            event.pathParameters.ticketNumber
          ),
          this._querySubsTrx(
            IndexEnum.subs_trx_ticket_number_index,
            "ticketNumber",
            event.pathParameters.ticketNumber
          ),
        ])
      ),
      mergeMap(
        ([transaction, subscription]: [Transaction[], SubscriptionDynamo[]]) =>
          iif(
            () =>
              transaction.length === 0 &&
              subscription.length === 0 &&
              process.env.IS_ECOMMERCE_ENABLE === "true" &&
              defaultTo(get(event.body, "voidCounter"), 0) < 2,
            this._invokeTrxChargeDeleteGateway(event),
            this._chargeDeleteGateway(event, transaction, subscription)
          )
      ),
      tag("CardService | chargeDeleteGateway")
    );
  }

  public chargeBack(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >
  ): Observable<boolean | ChargebackResponse> {
    return of(1).pipe(
      mergeMap(() => this._getTransactionByPaymentMethod(event)),
      mergeMap((dynamoResponse: DynamoQueryResponse<Transaction>) =>
        iif(
          () =>
            dynamoResponse.items.length === 0 &&
            process.env.IS_ECOMMERCE_ENABLE === "true" &&
            defaultTo(get(event.body, "voidCounter"), 0) < 2,
          this._invokeTrxChargeback(event),
          this._chargeBack(event, dynamoResponse)
        )
      ),
      mergeMap((response: ChargebackResponse) =>
        iif(
          () => get(event.body, "isFullResponse", false),
          of(response),
          of(true)
        )
      ),
      tag("CardService | chargeBack")
    );
  }

  public chargeDelete(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object> {
    const transaction_id: string = v4();
    let sale_trx: Transaction;

    return of(1).pipe(
      mergeMap(() =>
        this._queryTrx(
          IndexEnum.transaction_ticket_number,
          "ticket_number",
          event.pathParameters.ticketNumber
        )
      ),
      switchMap((transaction: Transaction[]) => {
        if (transaction.length === 0) throw new KushkiError(ERRORS.E067);
        if (
          transaction[0].merchant_id !==
          event.requestContext.authorizer.merchantId
        )
          throw new KushkiError(ERRORS.E020);
        sale_trx = transaction[0];

        this._invalidateTransactionType(sale_trx.transaction_type);

        return forkJoin([
          of(transaction[0]),
          this._getMerchant(transaction[0].merchant_id),
        ]);
      }),
      switchMap(
        ([transaction, merchant]: [Transaction, DynamoMerchantFetch]) => {
          if (
            !isEqual(transaction.transaction_type, TransactionTypeEnum.PREAUTH)
          )
            this._validateVoidTimeLimit(transaction, merchant);
          return forkJoin([of(transaction), of(merchant)]);
        }
      ),
      switchMap(([transaction, merchant]: [Transaction, DynamoMerchantFetch]) =>
        forkJoin([
          this._queryTrx(
            IndexEnum.transaction_sale_ticket_number,
            "sale_ticket_number",
            event.pathParameters.ticketNumber
          ),
          this._getCaptureTrxFromPreauth(transaction),
          this._checkPartialRefund(event, transaction, merchant),
          of(transaction),
          of(merchant),
        ])
      ),
      switchMap(
        ([sales_trxs, capture_trx, partial_trx_refund, transaction, merchant]: [
          Transaction[],
          Transaction | undefined,
          PartialTransactionRefund,
          Transaction,
          DynamoMerchantFetch
        ]) => {
          const processor_channel: string | undefined = get(
            transaction,
            "processor_channel"
          );

          this._putTracerData({
            country: get(sale_trx, "country", ""),
            currency: get(sale_trx, "currency_code", ""),
            merchantId: merchant.public_id,
            merchantName: merchant.merchant_name,
            processorName: sale_trx.processor_name,
            transactionReference: transaction_id,
          });

          return iif(
            () =>
              sales_trxs.length === 0 ||
              defaultTo(get(transaction, "pendingAmount"), 0) > 0, // TODO: validate
            this._verifyInitVoid(
              sale_trx,
              transaction_id,
              event,
              partial_trx_refund,
              merchant,
              capture_trx,
              processor_channel
            ),
            this._responseVoidInfo(
              sale_trx,
              event,
              sales_trxs[0],
              get(merchant, "country", "")
            )
          );
        }
      ),
      tag("CardService | chargeDelete")
    );
  }

  // tslint:disable-next-line:max-func-body-length
  public tokenCharge(
    request: TokenChargeRequest,
    context: Context
  ): Observable<object> {
    let current_merchant: DynamoMerchantFetch;
    let current_token: DynamoTokenFetch;
    let current_processor: DynamoProcessorFetch;
    let transaction_reference: string;
    const event: ChargeOTPRequest = {
      amount: request.amount,
      channel: request.channel,
      contactDetails: request.contactDetails,
      metadata: request.metadata,
      token: "",
    };
    const context_authorizer: AuthorizerContext = {
      credentialAlias: get(request, this._requestcontextcredentialAlias),
      credentialId: get(request, this._requestcontextcredentialId),
      credentialMetadata: get(request, this._requestcontextcredentialMetadata),
      hierarchyConfig: get(request, this._requestHierarchyConfig, {}),
      kushkiMetadata: get(request, "requestContext.kushkiMetadata"),
      merchantId: request.merchantIdKushki,
      privateMerchantId: "",
      publicCredentialId: get(request, this._requestcontextpublicCredentialId),
      publicMerchantId: "",
    };
    const is_object_hierarchy_config = isObject(
      context_authorizer.hierarchyConfig
    );

    return of(1).pipe(
      mergeMap(() => this._fetchDynamoMerchant(request.merchantIdKushki)),
      mergeMap((merchant: DynamoMerchantFetch) =>
        forkJoin([
          of(merchant),
          this._invokeTransactionRuleProcessor({
            detail: {
              credentialId: get(request, this._requestcontextcredentialId),
            },
            hierarchyConfig: is_object_hierarchy_config
              ? context_authorizer.hierarchyConfig
              : JSON.parse(<string>context_authorizer.hierarchyConfig),
            isTokenCharge: true,
            merchantId: request.merchantIdKushki,
            sandboxEnable: get(merchant, "sandboxEnable", false),
            transactionKind: "card",
          }),
        ])
      ),
      mergeMap(
        ([merchant, rule_processor]: [
          DynamoMerchantFetch,
          LambdaTransactionRuleResponse
        ]) => {
          current_merchant = merchant;
          transaction_reference = v4();
          const sandbox_enable: boolean = this._getSandboxEnable(
            get(merchant, "sandboxEnable", false),
            rule_processor.processor
          );
          const provider_variant: CardProviderEnum = this._getProviderVariant(
            rule_processor.processor,
            sandbox_enable
          );

          const sandbox_token_request: SandboxTokenRequest = {
            amount: {
              currency: request.currency,
              ...request.amount,
            },
            cardHolderName: get(request, "cardHolderName", ""),
            maskedCardNumber: get(request, "maskedCardNumber", ""),
            tokenType: request.tokenType,
          };

          const token_request:
            | AurusTokenLambdaRequest
            | SandboxTokenLambdaRequest = sandbox_enable
            ? this._buildTokenSandboxRequest(
                sandbox_token_request,
                rule_processor,
                {
                  body: {
                    convertedCurrency: get(
                      sandbox_token_request,
                      CURRENCY_PATH
                    ),
                    isOriginalAmount: true,
                    newAmount: CardService.sFullAmount(
                      sandbox_token_request.amount
                    ),
                  },
                }
              )
            : {
                cardHolderName: get(request, "cardHolderName", ""),
                completeTransactionType: rule_processor.completeTransactionType,
                credentials: rule_processor.credentials,
                currency: <CurrencyEnum>request.currency,
                isDeferred: false,
                merchantId: rule_processor.publicId,
                processorName: rule_processor.processor,
                processorPrivateId: rule_processor.privateId,
                tokenType: request.tokenType,
                totalAmount: request.totalAmount,
                transactionReference: transaction_reference,
                vaultToken: request.vaultToken,
              };

          return forkJoin([
            of(rule_processor.plcc),
            this._handleTokenProvider(
              token_request,
              provider_variant,
              rule_processor.publicId,
              rule_processor.processor,
              CardService._getBinByMasquedCard(
                get(request, "maskedCardNumber", "")
              ),
              get(rule_processor, "integration", "aurus"),
              get(rule_processor, "completeTransactionType")
            ),
          ]);
        }
      ),
      mergeMap(
        ([plcc, response]: [
          string | undefined,
          [TokensCardResponse, string]
        ]) =>
          this._handleTokenResponse(
            plcc,
            response[0],
            CardService.getValidBinNumber(request),
            get(request, "cardHolderName", ""),
            get(current_merchant, "country", "")
          )
      ),
      mergeMap(
        ([token_response, bin_info]: [
          TokensCardResponse,
          DynamoBinFetch | undefined
        ]) =>
          forkJoin([
            of(token_response),
            this._checkConvertedAmount(request.amount),
            of(bin_info),
          ])
      ),
      mergeMap(
        ([token_response, conversion_response, bin_info]: [
          TokensCardResponse,
          [ConvertionResponse, Amount],
          DynamoBinFetch | undefined
        ]) => {
          current_token = this._buildTokenDynamoForTokenCharge(
            token_response,
            <DynamoBinFetch>bin_info,
            request,
            context_authorizer.merchantId,
            transaction_reference,
            request.userId,
            request.sessionId
          );
          current_token = this._getNewToken(
            current_token,
            conversion_response[0]
          );
          set(current_token, "ip", get(request, "ip"));
          event.token = token_response.token;

          const body_trx_rule: RequestBodyTrxRule = {
            credentialId: get(request, this._requestcontextcredentialId),
            currency: get(request, CURRENCY_PATH, CurrencyEnum.USD),
            customer: get(request, "contactDetails", {}),
            hierarchyConfig: is_object_hierarchy_config
              ? context_authorizer.hierarchyConfig
              : JSON.parse(
                  <string>get(request, this._requestHierarchyConfig, "{}")
                ),
            ignoreWarnings: true,
            isDeferred: false,
            merchantCountry: get(current_merchant, "country", ""),
            merchantId: request.merchantIdKushki,
            sandboxEnable: get(current_merchant, "sandboxEnable", false),
          };

          return forkJoin([
            this._invokeTrxRuleTokenCharge(
              current_token,
              body_trx_rule,
              TransactionRuleTypeEnum.CHARGE,
              true
            ),
            of(conversion_response[1]),
            this._saveDynamoToken(current_token),
          ]);
        }
      ),
      catchError((err: Error) =>
        this._handleTrxRuleChargeError(
          err,
          event,
          context_authorizer,
          current_processor,
          current_token,
          current_merchant,
          false,
          TransactionRuleTypeEnum.CHARGE,
          false,
          {
            ip: get(current_token, "ip", ""),
            maskedCardNumber: get(current_token, "maskedCardNumber", ""),
          }
        )
      ),
      concatMap(([data, amount]: [InvokeTrxRuleResponse, Amount, boolean]) => {
        current_processor = data.processor;
        const cybersource_info: Cybersource = get(
          data,
          "trxRuleResponse.body.cybersource",
          {}
        ) as Cybersource;

        set(event, "fullResponse", true);
        set(event, "tokenId", current_token.id);
        set(event, "usrvOrigin", UsrvOriginEnum.CARD);

        if (!isEmpty(cybersource_info))
          set(current_token, "3ds", { ...cybersource_info });

        return this._handleProcessCharge(
          amount,
          current_token,
          current_merchant,
          TransactionRuleTypeEnum.CHARGE,
          event,
          context_authorizer,
          data,
          context,
          <TokenTypeEnum>request.tokenType
        );
      }),
      tag("CardService | tokenCharge")
    );
  }

  public reAuthorization(
    event: IAPIGatewayEvent<
      ReauthorizationRequest,
      null,
      null,
      AuthorizerContext
    >
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() =>
        this._getOriginalTransaction(get(event.body, "ticketNumber", ""))
      ),
      mergeMap((originalTransaction: Transaction) =>
        this._trxMethodReauthorization(event, originalTransaction)
      ),
      tag("CardService | reAuthorization")
    );
  }

  public validateAccount(
    event: IAPIGatewayEvent<
      AccountValidationRequest,
      null,
      null,
      AuthorizerContext
    >
  ): Observable<AccountValidationResponse> {
    let dynamo_merchant_fetch: DynamoMerchantFetch;
    let dynamo_token_fetch: DynamoTokenFetch;
    let trx_rule_response: InvokeTrxRuleResponse;

    return of(1).pipe(
      mergeMap(() =>
        this._fetchDynamoMerchant(event.requestContext.authorizer.merchantId)
      ),
      switchMap((dynamoMerchant: DynamoMerchantFetch) =>
        forkJoin([
          this._storage.updateTokenValue(event.body.token, v4()),
          of(dynamoMerchant),
        ])
      ),
      catchError((err: AWSError) => {
        if (err.name === TOKEN_USED_ERROR) throw new KushkiError(ERRORS.E049);
        return throwError(() => err);
      }),
      switchMap(
        ([dynamo_token, dynamo_merchant]: [
          DynamoTokenFetch | undefined,
          DynamoMerchantFetch
        ]) => {
          if (dynamo_token === undefined) throw new KushkiError(ERRORS.E041);
          if (
            get(dynamo_token, TRANSACTION_MODE, "") !==
            TransactionModeEnum.ACCOUNT_VALIDATION
          )
            throw new KushkiError(ERRORS.E041);

          const unified_trx_rule: UnifiedChargesPreauthRequest =
            this._buildTrxRuleRequest(
              event.body,
              event.requestContext.authorizer,
              dynamo_merchant,
              dynamo_token
            );

          return forkJoin([
            this._invokeTrxRule(unified_trx_rule),
            of(dynamo_token),
            of(dynamo_merchant),
          ]);
        }
      ),
      switchMap(
        ([invoke_response, dynamo_token, dynamo_merchant]: [
          InvokeTrxRuleResponse,
          DynamoTokenFetch,
          DynamoMerchantFetch
        ]) => {
          dynamo_merchant_fetch = dynamo_merchant;
          dynamo_token_fetch = dynamo_token;
          trx_rule_response = invoke_response;
          const sandbox_enable: boolean = this._getSandboxEnable(
            get(dynamo_merchant, "sandboxEnable", false),
            invoke_response.processor.processor_name
          );

          const body_account_validation =
            this._buildAccountValidationRequestBody(
              dynamo_merchant,
              dynamo_token,
              invoke_response,
              event.body,
              sandbox_enable
            );

          return forkJoin([
            of(invoke_response),
            of(dynamo_token),
            of(dynamo_merchant),
            this._handleAccountValidationProvider(
              event.requestContext.authorizer,
              body_account_validation,
              this._getProviderVariant(
                invoke_response.processor.processor_name,
                sandbox_enable
              ),
              dynamo_merchant.publicId,
              invoke_response.processor.processor_name,
              get(body_account_validation, "card.bin", ""),
              get(invoke_response, "trxRuleResponse.body.integration", "aurus")
            ),
          ]);
        }
      ),
      catchError((err: Error) =>
        this._handleValidateAccountError(
          err,
          event.body,
          dynamo_merchant_fetch,
          dynamo_token_fetch,
          trx_rule_response,
          event.requestContext
        )
      ),
      mergeMap(
        ([invoke_response, dynamo_token, dynamo_merchant, acq_card_response]: [
          InvokeTrxRuleResponse,
          DynamoTokenFetch,
          DynamoMerchantFetch,
          AcqCardResponse
        ]) =>
          forkJoin([
            this._saveTransactionValidateAccount(
              acq_card_response,
              event.body,
              dynamo_merchant,
              dynamo_token,
              invoke_response,
              event.requestContext
            ),
            of(dynamo_token),
            of(acq_card_response),
          ])
      ),
      map(
        ([put_result, dynamo_token, acq_card_response]: [
          boolean,
          DynamoTokenFetch,
          AcqCardResponse
        ]) =>
          this._buildResponseValidateAccount(
            put_result,
            dynamo_token,
            acq_card_response
          )
      ),
      tag("CardService | _validateAccount")
    );
  }

  public automaticVoidStream(
    event: IDynamoDbEvent<TransactionDynamo>
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => event.Records.length !== 0,
          this._processAutomaticVoid(event.Records),
          of(true)
        )
      ),
      catchError(() => of(true)),
      tag("CardService | AutomaticVoidStream")
    );
  }

  public updateReAuthVoidStatus(
    event: IEventBusDetail<IDynamoRecord<ChargebackTransaction>>
  ): Observable<boolean> {
    return of(event.payload).pipe(
      mergeMap((record: IDynamoRecord<ChargebackTransaction>) => {
        const trx: ChargebackTransaction = get(record, PAYLOAD.DYNAMO_IMAGE);

        return this._updateReAuthTransactionCustomOp(trx);
      }),
      tag("CardService | updateReAuthVoidStatus")
    );
  }

  public update3dsTokenInfo(
    event: ThreeDSTokenInfoRequest
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.getItem<DynamoTokenFetch>(TABLES.tokens, {
          id: event.token,
        })
      ),
      catchError(() => throwError(new KushkiError(ERRORS.E002))),
      map((transaction: DynamoTokenFetch | undefined) => {
        if (isEmpty(transaction)) throw new KushkiError(ERRORS.E002);

        const security_identity_request:
          | ISecurityIdentityRequest[]
          | ISecurityIdentity[] = CardService._setSecureServiceData(
          <ISecurityIdentityRequest[]>get(transaction, "securityIdentity", []),
          event,
          false
        );

        // Info: To delete duplicate and non updated array security identity item in this scenario
        security_identity_request.splice(1, 1);
        const kushki_info: IKushkiInfo = <IKushkiInfo>transaction.kushkiInfo!;
        const request: IRootRequest = {
          kushkiInfo: defaultTo(kushki_info, {
            authorizer: "credential",
            resource: "/card",
          }),
          securityIdentity: security_identity_request,
        };
        const traceability_data: IRootResponse =
          this._coreFormatter.dataFormatter(request);

        const cybersource_details = this._getCybersourceDetails({
          ...event,
          transactionRuleInfo: { cybersource: event.cybersource },
        });

        return {
          "3ds": cybersource_details,
          secureId: event.secureId,
          secureService: event.secureService,
          securityIdentity: traceability_data.securityIdentity,
        };
      }),
      mergeMap((threeDSTokenInfo: object) =>
        this._storage.updateValues(
          TABLES.tokens,
          {
            id: event.token,
          },
          threeDSTokenInfo
        )
      ),
      tag("CardService | update3dsTokenInfo")
    );
  }

  private _getTransactionByPaymentMethod(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >
  ): Observable<DynamoQueryResponse<Transaction>> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () =>
            isEqual(
              event.body.paymentMethod,
              PaymentSubMethodTypeEnum.CARD_PRESENT
            ),
          defer(() => this._getPosTransaction(event)),
          defer(() => this._getCPTransaction(event))
        )
      ),
      tag("CardService | _getTransactionByPaymentMethod")
    );
  }

  private _getCPTransaction(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >
  ): Observable<DynamoQueryResponse<Transaction>> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () =>
            isEqual(
              event.body.paymentMethod,
              PaymentSubMethodTypeEnum.CARD_VPC
            ),
          defer(() => this._getVPCTransaction(event)),
          defer(() => this._getTransaction(event))
        )
      ),
      tag("CardService | _getCPTransaction")
    );
  }

  private _getTransaction(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >
  ): Observable<DynamoQueryResponse<Transaction>> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.queryTransactionByTicketNumber<Transaction>(
          event.pathParameters.ticketNumber
        )
      ),
      tag("CardService | _getTransaction")
    );
  }

  private _getPosTransaction(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >
  ): Observable<DynamoQueryResponse<Transaction>> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: DynamoQueryResponse<Transaction> }>(
          `usrv-acq-pos-analytics-${process.env.USRV_STAGE}-getTransactionByReference`,
          {
            body: {
              // TicketNumber field of pathParameters is transaction reference when it is pos transaction.
              transaction_reference: event.pathParameters.ticketNumber,
            },
          }
        )
      ),
      mergeMap((data: { body: DynamoQueryResponse<Transaction> }) => {
        const res: DynamoQueryResponse<Transaction> =
          data.body.items.length > 0
            ? this._mapPosTransaction(data.body)
            : data.body;

        return of(res);
      }),
      tag("CardService | _getPosTransaction")
    );
  }

  private _getVPCTransaction(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >
  ): Observable<DynamoQueryResponse<Transaction>> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: GetVPCResponse }>(
          `usrv-acq-incoming-${process.env.USRV_STAGE}-getVpcTransaction`,
          {
            body: {
              // TicketNumber field of pathParameters is transaction reference when it is vpc transaction.
              transaction_reference: event.pathParameters.ticketNumber,
            },
          }
        )
      ),
      mergeMap((data: { body: GetVPCResponse }) => {
        const res: DynamoQueryResponse<Transaction> = this._mapGetVPCResponse(
          data.body
        );

        return of(res);
      }),
      tag("CardService | _getVPCTransaction")
    );
  }

  private _mapPosTransaction(
    body: DynamoQueryResponse<Transaction>
  ): DynamoQueryResponse<Transaction> {
    const transaction: Transaction = body.items[0];

    dotObject.move("amount.subtotal_iva", "amount.subtotalIva", transaction);
    dotObject.move("amount.subtotal_iva0", "amount.subtotalIva0", transaction);
    dotObject.move("merchant_category", "category_merchant", transaction);
    dotObject.set(
      "currency_code",
      get(transaction, CURRENCY_PATH, ""),
      transaction
    );
    dotObject.set(
      "bin_type",
      get(transaction, "bin_card", "").length,
      transaction
    );
    dotObject.set("iva_value", get(transaction, "amount.iva", 0), transaction);
    dotObject.set(
      "amount.ice",
      get(transaction, "amount.extra_taxes.ice", 0),
      transaction
    );
    dotObject.set(
      "ice_value",
      get(transaction, "amount.extra_taxes.ice", 0),
      transaction
    );
    dotObject.move("masked_credit_card", "maskedCardNumber", transaction);
    dotObject.move("mcc", "mccCode", transaction);
    dotObject.set(
      "original_bin",
      get(transaction, "bin_card", ""),
      transaction
    );
    dotObject.set(
      "user_agent",
      get(transaction, "security.user_agent", ""),
      transaction
    );

    return { ...body, items: [deepCleaner(transaction)] };
  }

  private _mapGetVPCResponse(
    data: GetVPCResponse
  ): DynamoQueryResponse<Transaction> {
    const transactions: VpcTransaction[] = get(data, "items", []);
    const mapped_transactions: Transaction[] = transactions.map(
      (trx: VpcTransaction) => this._mapVPCTransaction(trx)
    );

    return { items: mapped_transactions };
  }

  private _mapVPCTransaction(trx: VpcTransaction): Transaction {
    const bin_type: string = get(trx, "bin_type", "").toString();
    const currency_code: string = get(trx, "currency_code_iso_code", "");
    const sub_total_iva: number = get(trx, "subtotal_iva_amount", 0);
    const sub_total_iva0: number = get(trx, "subtotal_iva0_amount", 0);
    const transaction: Transaction = {
      ...trx,
      currency_code,
      transaction_id: get(trx, "transaction_id", ""),
      ticket_number: get(trx, "ticket_number", ""),
      approval_code: get(trx, "authorization_code", ""),
      approved_transaction_amount: get(
        trx,
        "parsed_total_authorized_amount",
        0
      ),
      created: get(trx, "created_timestamp", 0),
      merchant_id: get(trx, "merchant_info_id", ""),
      merchant_name: get(trx, "merchant_name", ""),
      payment_brand: capitalize(get(trx, "franchise", "")),
      processor_bank_name: get(trx, "processor_bank_name", ""),
      processor_id: get(trx, "processor_id", ""),
      recap: get(trx, "recap", ""),
      request_amount: get(trx, "parsed_source_amount", 0),
      subtotal_iva: sub_total_iva,
      subtotal_iva0: sub_total_iva0,
      sync_mode: get(trx, "sync_mode_type", "api"),
      last_four_digits: get(trx, "last_four_digits", ""),
      public_id: get(trx, "processor_merchant_id", ""),
      processor_type: get(trx, "processor_type", "").toLowerCase(),
      bin_type: get(trx, "bin_card", "").length,
      iva_value: get(trx, "iva_value", 0),
      transaction_status: get(trx, "transaction_status", ""),
      processor_name: get(trx, "processor_name", ""),
      card_holder_name: get(trx, "card_holder_name", ""),
      bin_card: get(trx, "bin_card", ""),
      card_type: bin_type,
      transaction_type: get(
        trx,
        "kushki_transaction_type",
        get(trx, "transaction_type", "")
      ),
    };

    dotObject.move("bin_country_name", "card_country", transaction);
    dotObject.move("bin_country_code", "card_country_code", transaction);
    dotObject.move("foreign_card_indicator", "foreign_card", transaction);
    dotObject.move("prepaid_indicator", "prepaid", transaction);
    dotObject.move("merchant_category_code", "mccCode", transaction);
    dotObject.move("kushki_response_code", "response_code", transaction);
    dotObject.move("channel_type", "channel", transaction);

    dotObject.set(CURRENCY_PATH, currency_code, transaction);
    dotObject.set("amount.iva", get(trx, "iva_value", 0), transaction);
    dotObject.set("amount.subtotalIva", sub_total_iva, transaction);
    dotObject.set("amount.subtotalIva0", sub_total_iva0, transaction);

    unset(transaction, "authorization_code");
    unset(transaction, "created_timestamp");
    unset(transaction, "merchant_info_id");
    unset(transaction, "parsed_source_amount");
    unset(transaction, "parsed_total_authorized_amount");
    unset(transaction, "sync_mode_type");

    return transaction;
  }

  private _validateSubsRefund(
    subscription: SubscriptionDynamo,
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() =>
        forkJoin([of(subscription), this._getMerchant(subscription.merchantId)])
      ),
      map(
        ([subscription, merchant]: [SubscriptionDynamo, DynamoMerchantFetch]) =>
          this._validateVoidTimeLimit(
            {
              ...subscription,
              card_country: get(subscription, "cardCountry", ""),
              processor_name: get(subscription, "processorName", ""),
            },
            merchant
          )
      ),
      mergeMap(() =>
        this._lambda.invokeFunction(
          `usrv-subscriptions-${process.env.USRV_STAGE}-subscriptionChargesDelete`,
          {
            amount: get(event, AMOUNT_PATH, {}),
            credentialInfo: {
              alias: get(event, this._requestcontextcredentialAlias, ""),
              credentialId: get(event, this._requestcontextcredentialId, ""),
              metadata: get(event, this._requestcontextcredentialMetadata, ""),
              publicCredentialId: get(
                event,
                this._requestcontextpublicCredentialId,
                ""
              ),
            },
            fullResponse: get(event, "body.fullResponse", false),
            path: event.path,
            ticketNumber: event.pathParameters.ticketNumber,
          }
        )
      ),
      catchError((err: KushkiError | Error) => throwError(() => err)),
      tag("CardService | _validateSubsRefund")
    );
  }

  private _chargeDeleteGateway(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    transaction: Transaction[],
    subscription: SubscriptionDynamo[]
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => this._isAdminVoidPath(event.path),
          this._handleChargeDeleteGateway(event, transaction),
          this._handleValidationAndCheckPendingValues(event, transaction)
        )
      ),
      catchError((err: KushkiError | Error) => {
        const is_kushki_error_code_k067: boolean =
          err instanceof KushkiError && err.code === "K067";

        return iif(
          () => is_kushki_error_code_k067 && subscription.length > 0,
          this._validateSubsRefund(subscription[0], event),
          throwError(() => err)
        );
      }),
      tag("CardService | _chargeDeleteGateway")
    );
  }

  private _chargeBack(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >,
    dynamoResponse: DynamoQueryResponse<Transaction>
  ): Observable<ChargebackResponse> {
    return of(1).pipe(
      map(() => {
        const transactions: Transaction[] = dynamoResponse.items;

        if (transactions.length === 0) throw new KushkiError(ERRORS.E020);

        return transactions[0];
      }),
      mergeMap((trx: Transaction) => {
        if (isEmpty(trx.country)) return this._buildTrxWithCountry(trx);

        return of(trx);
      }),
      mergeMap((transaction: Transaction) =>
        forkJoin([
          of(transaction),
          this._storage.getDynamoMerchant(transaction.merchant_id),
        ])
      ),
      switchMap(
        ([charge_trx, merchant]: [
          Transaction,
          DynamoMerchantFetch | undefined
        ]) => {
          this._putTracerData({
            country: get(charge_trx, "country", ""),
            currency: get(
              charge_trx,
              "currency_code",
              get(charge_trx, "amount.currency")
            ),
            merchantId: get(
              charge_trx,
              "public_id",
              get(charge_trx, "merchant_id", "")
            ),
            merchantName: get(charge_trx, "merchant_name", ""),
            processorName: get(charge_trx, "processor_name", ""),
            transactionReference: get(charge_trx, "transaction_id", ""),
          });
          set(charge_trx, "emails", event.body.emails);

          set(charge_trx, "webhooks", charge_trx.webhooksChargeback);
          unset(charge_trx, "webhooksChargeback");

          return this._lambda.invokeFunction<{ body: ChargebackResponse }>(
            `${process.env.CHARGEBACK_LAMBDA}`,
            {
              body: {
                ...charge_trx,
                categoryMerchant: get(merchant, "merchantCategory", ""),
                credentialAlias: get(charge_trx, "credential_alias", ""),
                credentialId: get(charge_trx, "credential_id", ""),
                credentialMetadata: get(charge_trx, "credential_metadata", ""),
                publicCredentialId: get(charge_trx, "public_credential_id", ""),
                socialReason: get(merchant, "socialReason", ""),
                taxId: get(merchant, "taxId", ""),
                paymentSubmethodType: get(event, "body.paymentMethod", ""),
                businessUnit: get(event, "body.businessUnit", ""),
                cancelOperations: get(event, "body.cancellationOperations", []),
                chargebackType: get(event, "body.chargebackType", ""),
                documentationReceptionDate: get(
                  event,
                  "body.documentationReceptionDate",
                  0
                ),
                reasonCode: get(event, "body.reasonCode", ""),
                reasonDescription: get(event, "body.reasonDescription", ""),
                incomingSource: get(event, "body.incomingSource", ""),
                sourceReference: get(event, "body.sourceReference", ""),
              },
            }
          );
        }
      ),
      map((response: { body: ChargebackResponse }) => response.body),
      tag("CardService | _chargeBack")
    );
  }

  private _invokeTrxChargeDeleteGateway(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object> {
    const voidCounter: number =
      defaultTo(get(event.body, "voidCounter"), 0) + 1;

    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<object>(
          `${process.env.LAMBDA_ECOMM_CARD_CHARGE_DELETE_GATEWAY_ARN}`,
          { ...event, body: { ...event.body, voidCounter } }
        )
      ),
      map((data: object) => get(data, "body", {})),
      catchError((err: KushkiError | Error) => throwError(() => err)),
      tag("CardService | _invokeTrxChargeDeleteGateway")
    );
  }

  private _invokeTrxChargeback(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >
  ): Observable<ChargebackResponse> {
    const voidCounter: number =
      defaultTo(get(event.body, "voidCounter"), 0) + 1;
    const isFullResponse: boolean = get(event.body, "isFullResponse", false);

    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: ChargebackResponse }>(
          `${process.env.LAMBDA_ECOMM_CARD_CHARGEBACK_ARN}`,
          {
            ...event,
            body: { ...event.body, voidCounter, isFullResponse },
          }
        )
      ),
      map((response: { body: ChargebackResponse }) => response.body),
      tag("CardService | _invokeTrxChargeback")
    );
  }

  private _putTracerData(tracerInfo: TracerInfo): void {
    for (const key of Object.keys(tracerInfo))
      this._tracer.putAnnotation(key, tracerInfo[key]);
  }

  private _updateReAuthTransactionCustomOp(
    transaction: ChargebackTransaction
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.updateValues(
          TABLES.transaction_custom_ops,
          {
            transaction_reference: transaction.saleTransactionReference,
          },
          {
            void_ticket_number: transaction.ticketNumber,
            voided: "true",
          },
          "attribute_exists(transaction_reference)"
        )
      ),
      catchError((err: Error) => {
        this._rollbar.critical(
          `Error al marcar re autorización anulada ${transaction.transactionReference}`
        );
        this._logger.error(err);
        return throwError(() => err);
      })
    );
  }

  private _buildSemaphoreBody(merchantId: string): object {
    const ommited: string = "omitted";
    const complete: string = "complete";
    const pending: string = "pending";

    return {
      isNew: false,
      publicMerchantId: merchantId,
      stepBasicData: {
        status: complete,
      },
      stepConfigRatesAndInvoice: {
        processors: {
          card: ommited,
          cash: ommited,
          transfer: ommited,
        },
        statusDiscount: pending,
        statusInvoice: pending,
        statusRates: pending,
      },
      stepProcessor: {
        statusDeferred: pending,
        statusMerchantRules: pending,
        statusProcessor: pending,
        statusRetryRules: pending,
      },
      stepServices: {
        status: ommited,
      },
      stepUsers: {
        status: pending,
      },
    };
  }

  private _buildCardsBody(): object {
    return {
      acceptCreditCards: ["visa", "masterCard"],
      commission: false,
      sandboxEnable: false,
      sift_science: {
        BaconProdApiKey: "",
        BaconSandboxApiKey: "",
        ProdAccountId: "",
        ProdApiKey: "",
        SandboxAccountId: "",
        SandboxApiKey: "",
      },
      whiteList: true,
    };
  }

  private _isAdminVoidPath(urlPath): boolean {
    return /^\/card\/v[0-9]\/admin\/charges\/[0-9]+$/.test(urlPath);
  }

  private _isOCTApiGatewayPath(urlPath: string): boolean {
    return /^.*?\/v[0-9]\/crypto\/oct$/.test(urlPath);
  }

  private _tokenCreationProcess(params: {
    body: TokensCardBody;
    requestContext: IRequestContext<AuthorizerContext>;
    headers: IGenericHeaders;
    merchantDynamo: DynamoMerchantFetch | undefined;
    processorName: string;
    merchantID: string;
    transactionReference: string;
    isAwsRequest: boolean;
    isSandboxEnable: boolean;
    baseTokenInfo?: BaseTokenInfo;
  }): Observable<TokenDynamo> {
    return of(1).pipe(
      mergeMap(() =>
        this._executeTokenTransaction(
          params.body,
          TokenTypeEnum.TRANSACTION,
          params.isSandboxEnable,
          get(params.body, "transactionRuleInfo.publicId", ""),
          params.processorName,
          params.transactionReference,
          get(params.body, "transactionRuleInfo.currencyCode"),
          params.baseTokenInfo
        )
      ),
      mergeMap((data: TokensCardResponse) =>
        forkJoin([
          of(data),
          this._executeFailoverTokenIsRequired(
            params.body,
            params.isSandboxEnable,
            params.transactionReference,
            get(params, "baseTokenInfo.isTokenless", false)
          ),
        ])
      ),
      mergeMap(
        ([token_response, failover_token_response]: [
          TokensCardResponse,
          TokensCardResponse | undefined
        ]) => {
          if (failover_token_response !== undefined)
            token_response.failoverToken = failover_token_response.token;

          return this._saveToken(
            params.requestContext.authorizer,
            params.body,
            token_response,
            params.merchantID,
            params.headers,
            params.isAwsRequest,
            params.transactionReference,
            params.merchantDynamo,
            get(params, "baseTokenInfo.isTokenless", false)
          );
        }
      )
    );
  }

  private _mapTransactionRuleBodyToInfo(
    transactionRule: LambdaTransactionRuleResponse
  ): TransactionRuleInfo {
    const transaction_rule_info: TransactionRuleInfo = {
      alias: get(transactionRule, "alias"),
      categoryModel: get(transactionRule, "categoryModel"),
      commerceCodeOneClickMall: get(
        transactionRule,
        "commerceCodeOneClickMall"
      ),
      completeTransactionType: get(transactionRule, "completeTransactionType"),
      credentials: get(transactionRule, "credentials"),
      currencyCode: get(transactionRule, "currencyCode"),
      integration: get(transactionRule, "integration"),
      failOverProcessor: get(transactionRule, "failOverProcessor"),
      key: get(transactionRule, "key"),
      merchantCategoryCode: get(transactionRule, "merchantCategoryCode"),
      omitCVV: get(transactionRule, "omitCVV"),
      partnerValidator: get(transactionRule, "partnerValidator"),
      password: get(transactionRule, "password"),
      plcc: get(transactionRule, "plcc"),
      privateId: transactionRule.privateId,
      processor: transactionRule.processor,
      processorCode: get(transactionRule, "processorCode"),
      processorMerchantId: get(transactionRule, "processorMerchantId"),
      processorType: get(transactionRule, "processorType"),
      publicId: get(transactionRule, "publicId"),
      retailerId: get(transactionRule, "retailerId"),
      rules: get(transactionRule, "rules"),
      whiteList: get(transactionRule, "whitelist", "").toString(),
    };

    return transaction_rule_info;
  }

  private _mapTokenlessToTokenCharge(
    transactionRuleInfo: TransactionRuleInfo,
    tokenlessBody: TokenlessChargeCardBody,
    totalAmount: number
  ): TokensCardBody {
    return {
      totalAmount,
      transactionRuleInfo,
      binInfo: tokenlessBody.binInfo,
      cardInfo: tokenlessBody.cardInfo,
      currency: tokenlessBody.amount.currency,
      cvv: get(tokenlessBody, "cvv"),
      kushkiInfo: tokenlessBody.kushkiInfo,
      transactionCardId: tokenlessBody.transactionCardId,
      transactionMode: tokenlessBody.transactionMode,
      vaultToken: tokenlessBody.vaultToken,
    };
  }

  private _createTokenLessToken(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >,
    merchantDynamo: DynamoMerchantFetch,
    transactionRuleResponse: LambdaTransactionRuleResponse,
    baseTokenInfo: BaseTokenInfo
  ): Observable<TokenDynamo> {
    return of(1).pipe(
      mergeMap(() => {
        const transaction_mode: string = get(
          event,
          this._requestTransactionMode,
          ""
        );
        const total_amount: number = baseTokenInfo.totalAmount;
        if (
          transaction_mode === TransactionModeEnum.ACCOUNT_VALIDATION &&
          total_amount !== 0
        )
          throw new KushkiError(ERRORS.E001);

        if (get(event, "body.binInfo.invalid", false))
          set(event, "body.binInfo", undefined);

        const merchant_id: string = get(event, MERCHANT_ID_AUTHORIZER, "");
        const prepared_body: TokenlessChargeCardBody = this._prepareBody(
          event.body,
          TransactionRuleInvokeTypeEnum.TOKENLESS_CHARGE
        ) as TokenlessChargeCardBody;

        const processor_name: string = get(
          transactionRuleResponse,
          "processor",
          ""
        );
        if (
          this._isTrxNotAllowedWithoutCvv(
            get(event, "body.cvv", ""),
            get(transactionRuleResponse, "omitCVV", true),
            processor_name,
            transaction_mode
          )
        ) {
          this._rollbar.warn("Transacción no permitida sin ccv2.");
          throw new KushkiError(ERRORS.E015);
        }
        const is_sandbox_enable: boolean = this._getSandboxEnable(
          defaultTo(
            get(merchantDynamo, "sandboxEnable"),
            get(event, SANDBOX_ENABLE_PATH, false)
          ),
          processor_name
        );

        return of({
          is_sandbox_enable,
          merchant_id,
          processor_name,
          total_amount,
          tokenless_body: prepared_body,
        });
      }),
      mergeMap(
        (response: {
          is_sandbox_enable: boolean;
          merchant_id: string;
          processor_name: string;
          total_amount: number;
          tokenless_body: TokenlessChargeCardBody;
        }) => {
          const is_aws_request: boolean = "KSH_AWS_REQUEST_ID" in event;
          const transaction_rule_info: TransactionRuleInfo =
            this._mapTransactionRuleBodyToInfo(transactionRuleResponse);
          const tokens_card_body: TokensCardBody =
            this._mapTokenlessToTokenCharge(
              transaction_rule_info,
              response.tokenless_body,
              response.total_amount
            );

          return this._tokenCreationProcess({
            merchantDynamo,
            body: tokens_card_body,
            requestContext: event.requestContext,
            headers: event.headers,
            processorName: response.processor_name,
            merchantID: response.merchant_id,
            transactionReference: baseTokenInfo.transactionReference,
            isAwsRequest: is_aws_request,
            isSandboxEnable: response.is_sandbox_enable,
            baseTokenInfo,
          });
        }
      )
    );
  }

  private _getProcessorRequest(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >,
    merchant: DynamoMerchantFetch,
    baseTokenInfo: BaseTokenInfo
  ): object {
    const request: TokenlessChargeCardBody = event.body;
    const is_object_hierarchy_config: boolean = isObject(
      get(event, this._requestHierarchyConfig, {})
    );
    const ip: string = get(event, "headers.X-FORWARDED-FOR", "")
      .split(",")[0]
      .trim();
    const card_type: string = get(request, CARD_TYPE_PATH, "na");

    return {
      isTokenCharge: false,
      detail: {
        bank: this._getBankOrBrand(request.binInfo, "bank"),
        bin: get(request, BIN_PATH, ""),
        brand: this._getBankOrBrand(
          request.binInfo,
          get(request, "binInfo.brand", TransactionKindEnum.CARD)
        ),
        cardHolderName: get(request, CARD_INFO_CARD_HOLDER_NAME, ""),
        country: this._getCountryTokenlessCharge(request),
        credentialId: get(event, this._requestcontextcredentialId), // TODO: Validar de que autorizador se saca
        currency: request.amount.currency,
        customer: get(request, "contactDetails", {}),
        deferred: get(request, DEFERRED_PATH, {}),
        email: get(request, CONTACT_DETAILS, ""),
        ignoreWarnings: request.ignoreWarnings,
        ip: defaultTo(ip, ""),
        isCreditCard: is_credit_map[card_type.toLowerCase()], // TODO: Validar lógica para TBK
        isDeferred: defaultTo(request.isDeferred, false).toString(),
        lastFourDigits: defaultTo(request.cardInfo.lastFourDigits, ""),
        maskedCardNumber: defaultTo(request.cardInfo.maskedCardNumber, ""),
        metadata: get(request, "metadata", {}),
        orderDetails: get(request, ORDER_DETAILS_PATH),
        phoneNumber: get(request, CONTACT_DETAILS_PHONE_NUMBER, ""),
        processor: this._getProcessor(request),
        productDetails: request.productDetails,
        totalAmount: baseTokenInfo.totalAmount.toString(),
        transactionCardId: get(request, "transactionCardId", ""),
        transactionCreated: get(baseTokenInfo, "transactionCreated", 0),
        transactionReference: get(baseTokenInfo, "transactionReference", ""),
        transactionType: TransactionRuleInvokeTypeEnum.TOKENLESS_CHARGE,
        vaultToken: request.vaultToken,
      },
      hierarchyConfig: is_object_hierarchy_config
        ? get(event, this._requestHierarchyConfig, {})
        : JSON.parse(get(event, this._requestHierarchyConfig, "{}")),
      merchantCountry: get(merchant, "country", ""),
      merchantId: get(merchant, "public_id"),
      sandboxEnable: get(merchant, "sandboxEnable", false),
      transactionKind: TransactionKindEnum.CARD,
    };
  }

  private _isTrxNotAllowedWithoutCvv(
    cvv: string,
    omitCVV: boolean,
    processor: string,
    transactionMode: string
  ): boolean {
    const omit_subsequent_cvv: boolean =
      transactionMode === TokensEnum.SUBSEQUENT_RECURRENCE &&
      processor === ProcessorEnum.KUSHKI;

    return !omitCVV && cvv === "" && !omit_subsequent_cvv;
  }

  private _handleChargeDeleteGateway(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    transaction: Transaction[]
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() => {
        if (transaction.length === 0) throw new KushkiError(ERRORS.E067);
        return of(transaction);
      }),
      mergeMap(() => {
        const is_valid_request: boolean =
          CustomValidators.validateVoidCardRequest(get(event, "body"));

        if (!is_valid_request) throw new KushkiError(ERRORS.E001);
        return this.chargeDelete(event);
      }),
      tag("CardService | _handleChargeDeleteGateway")
    );
  }

  private _validateReceivable(
    merchantId: string
  ): Observable<ReceivableResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: ReceivableResponse }>(
          `usrv-dispersions-${process.env.USRV_STAGE}-validateReceivable`,
          {
            pathParameters: {
              merchantId,
            },
          }
        )
      ),
      map((data: { body: ReceivableResponse }) => data.body),
      tag("CardService | _validateReceivable")
    );
  }

  private _checkPendingValues(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    merchantId: string,
    transaction: Transaction[]
  ): Observable<object> {
    const callValidate: string =
      UtilsService.getLambdaValues().CALL_VALIDATE_RECEIVABLE || "false";

    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => callValidate === "true",
          this._validateReceivable(merchantId),
          of({ isReceivable: false })
        )
      ),
      mergeMap((receivable: ReceivableResponse) =>
        iif(
          () =>
            receivable.isReceivable &&
            get(transaction, "[0].processor_name") === ProcessorEnum.KUSHKI &&
            get(transaction, "[0].country") === CountryEnum.MEXICO,
          throwError(() => new KushkiError(ERRORS.E150)),
          this._handleChargeDeleteGateway(event, transaction)
        )
      ),
      tag("CardService | _checkPendingValues")
    );
  }

  private _queryTrx(
    index: IndexEnum,
    field: string,
    value: string
  ): Observable<Transaction[]> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.query<Transaction>(
          TABLES.transaction,
          index,
          field,
          value
        )
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      tag("CardService | _queryTrx")
    );
  }

  private _querySubsTrx(
    index: IndexEnum,
    field: string,
    value: string
  ): Observable<SubscriptionDynamo[]> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.query<SubscriptionDynamo>(
          TABLES.subs_transaction,
          index,
          field,
          value
        )
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      tag("CardService | _querySubsTrx")
    );
  }

  private _buildTrxWithCountry(trx: Transaction): Observable<Transaction> {
    return of(1).pipe(
      mergeMap(() => this._storage.getDynamoMerchant(trx.merchant_id)),
      mergeMap((merchantInfo: DynamoMerchantFetch) =>
        of({
          ...trx,
          country: get(merchantInfo, "country", ""),
        })
      ),
      tag("CardService | _buildTrxWithCountry")
    );
  }

  private _handleTokenProvider(
    request: AurusTokenLambdaRequest | SandboxTokenLambdaRequest,
    provider: CardProviderEnum,
    processorId: string,
    processor: string,
    bin: string,
    integration?: string,
    completeTrxType?: string,
    isTokenCharge?: boolean
  ): Observable<[TokensCardResponse, string]> {
    return of(1).pipe(
      mergeMap(() => {
        provider = this._validateMerchantIdProcessor(
          provider,
          processorId,
          processor,
          bin,
          integration,
          undefined,
          completeTrxType
        );

        return forkJoin([
          this._providers
            .filter(
              (service: IProviderService) => service.variant === provider
            )[0]
            .tokens(request, isTokenCharge),
          of(provider),
        ]);
      }),
      tag("CardService | _handleTokenProvider")
    );
  }

  private _getProviderVariant(
    processor: string,
    sandboxEnable: boolean
  ): CardProviderEnum {
    return sandboxEnable
      ? CardProviderEnum.SANDBOX
      : defaultTo(PROVIDER_BY_PROCESSOR[processor], CardProviderEnum.AURUS);
  }

  // tslint:disable-next-line:cognitive-complexity
  private _validateMerchantIdProcessor(
    provider: CardProviderEnum,
    processorId: string,
    processor: string,
    bin?: string,
    integration?: string,
    request?: UnifiedChargesPreauthRequest | UnifiedCaptureRequest,
    completeTrxType?: string
  ): CardProviderEnum {
    const is_subscription_transaction: boolean =
      get(request, "usrvOrigin", "") === UsrvOriginEnum.SUBSCRIPTIONS;

    if (
      !PROCESSORS.includes(processor) ||
      provider === CardProviderEnum.SANDBOX
    )
      return provider;

    if (processor === ProcessorEnum.CREDIMATIC) {
      return this._validateCredimaticIntegration(processor, integration);
    }

    if (processor === ProcessorEnum.DATAFAST) {
      return this._validateDatafastIntegration(processor, integration);
    }

    if (
      processor === ProcessorEnum.NIUBIZ ||
      processor === ProcessorEnum.VISANET
    )
      return this._validateProcessorIntegration(processor, integration);

    const complete_trx_type: CompleteTransactionTypeEnum = <
      CompleteTransactionTypeEnum
    >defaultTo(completeTrxType, CompleteTransactionTypeEnum.SOAP);

    // istanbul ignore next
    if (
      processor === ProcessorEnum.TRANSBANK &&
      (complete_trx_type === CompleteTransactionTypeEnum.REST ||
        complete_trx_type === CompleteTransactionTypeEnum.MALL)
    )
      // istanbul ignore next
      return CardProviderEnum.TRANSBANK;

    const processors: DirectIntegrationProcessorIds = JSON.parse(
      `${process.env.DIRECT_INTEGRATION_PROCESSOR_IDS}`
    );
    const merchants_processor: string[] = get(
      processors,
      PROVIDER_BY_PROCESSOR[processor].toLowerCase(),
      ""
    ).split(",");

    const bins: DirectIntegrationBins = JSON.parse(
      `${process.env.DIRECT_INTEGRATION_BINS}`
    );

    const is_old_subs: boolean =
      isEmpty(get(request, "vaultToken")) && is_subscription_transaction;

    if (merchants_processor.includes("all") && !is_old_subs) return provider;

    if (!merchants_processor.includes(processorId) || is_old_subs)
      return CardProviderEnum.AURUS;

    const processor_bins: string[] = get(bins, `${processorId}`, "").split(",");

    this._logger.info("Card Service", {
      bins,
      merchants_processor,
      processor_bins,
      processorId,
      processors,
    });

    return this._validateProcessorBins(
      processor_bins,
      processor,
      bin,
      provider
    );
  }

  private _validateProcessorBins(
    processorBins: string[],
    processor: string,
    bin: string | undefined,
    provider: CardProviderEnum
  ): CardProviderEnum {
    if (
      processorBins.length === 1 &&
      processorBins[0] === "all" &&
      (processor === ProcessorEnum.BILLPOCKET ||
        processor === ProcessorEnum.KUSHKI)
    )
      return processor === ProcessorEnum.BILLPOCKET
        ? CardProviderEnum.BILLPOCKET
        : CardProviderEnum.KUSHKI;

    if (
      (processor === ProcessorEnum.BILLPOCKET ||
        processor === ProcessorEnum.KUSHKI) &&
      !processorBins.includes(defaultTo(bin, ""))
    )
      return CardProviderEnum.AURUS;

    if (processor === ProcessorEnum.KUSHKI) return CardProviderEnum.KUSHKI;

    return provider;
  }

  private _validateCredimaticIntegration(
    processor: string,
    integration?: string
  ) {
    const credimatic_direct: string = UtilsService.getCredimaticDirectEnabled();
    if (
      integration === DIRECT ||
      credimatic_direct === DirectMerchantEnabledEnum.ALL
    ) {
      return PROVIDER_BY_PROCESSOR[processor];
    }

    return CardProviderEnum.AURUS;
  }

  private _validateDatafastIntegration(
    processor: string,
    integration?: string
  ) {
    const datafast_direct: string = UtilsService.getDatafastDirectEnabled();
    if (
      integration === DIRECT ||
      datafast_direct === DirectMerchantEnabledEnum.ALL
    ) {
      return PROVIDER_BY_PROCESSOR[processor];
    }

    return CardProviderEnum.AURUS;
  }

  private _validateProcessorIntegration(
    processor: string,
    integration?: string
  ): CardProviderEnum {
    return integration === DIRECT
      ? PROVIDER_BY_PROCESSOR[processor]
      : CardProviderEnum.AURUS;
  }

  private _handleChargeProvider(
    request: ChargeInput,
    provider: CardProviderEnum,
    merchantId: string,
    processorName: string
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() => {
        provider = this._validateMerchantIdProcessor(
          provider,
          merchantId,
          processorName,
          request.currentToken.bin,
          get(request, RULE_INTEGRATION_PATH),
          request.event,
          get(request, INTEGRATION_METHOD_PATH)
        );

        return this._providers
          .filter(
            (service: IProviderService) => service.variant === provider
          )[0]
          .charge(request);
      }),
      tag("CardService | _handleChargeProvider")
    );
  }

  private _handlePreAthorizationProvider(
    input: ChargeInput,
    provider: CardProviderEnum,
    processor: string,
    integration?: string
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._providers
          .filter(
            (service: IProviderService) =>
              service.variant ===
              this._validateMerchantIdProcessor(
                provider,
                input.processor.public_id,
                processor,
                get(input, "currentToken.binInfo.bin", ""),
                integration,
                input.event,
                get(input, INTEGRATION_METHOD_PATH)
              )
          )[0]
          .preAuthorization(input)
      ),
      tag("CardService | _handleChargeProvider")
    );
  }

  private _getSandboxEnable(
    sandboxEnable: boolean,
    processor: string
  ): boolean {
    const stage: string = `${process.env.USRV_STAGE}`;
    const processor_sandbox: boolean =
      PROCESSORS_SANDBOX.includes(processor) &&
      PROCESSOR_SANDBOX_STAGES.includes(stage);

    if (processor_sandbox) this._logger.info(`Sandbox Processor ${processor}`);

    sandboxEnable = processor_sandbox ? processor_sandbox : sandboxEnable;

    return stage !== EnvironmentEnum.PRIMARY ? sandboxEnable : false;
  }

  private _checkCredibancoError(
    aurusResponse: AurusResponse
  ): Observable<[AurusResponse, object]> {
    return of(1).pipe(
      mergeMap(() => {
        if (
          get(aurusResponse, PROCESSOR_NAME_DETAILS_PATH, "") ===
            ProcessorEnum.CREDIBANCO &&
          get(aurusResponse, "approved_amount", "") === "0.00" &&
          get(aurusResponse, APPROVAL_CODE_PATH, "") === "000000"
        ) {
          this._rollbar.warn(`${ERRORS.E026.message} : Credibanco bug`);
          throw new KushkiError(ERRORS.E026);
        }

        return forkJoin([of(aurusResponse), of({})]);
      }),
      tag("CardService | _checkCredibancoError")
    );
  }

  private _executeFailoverTokenIsRequired(
    body: TokensCardBody,
    sandboxEnable: boolean,
    transactionReference: string,
    isTokenless?: boolean
  ): Observable<TokensCardResponse | undefined> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => !Boolean(get(body, "transactionRuleInfo.failOverProcessor")),
          of(undefined),
          this._executeTokenTransaction(
            body,
            TokenTypeEnum.TRANSACTION,
            sandboxEnable,
            <string>get(body, "transactionRuleInfo.failOverProcessor.publicId"),
            <string>(
              get(body, "transactionRuleInfo.failOverProcessor.processor")
            ),
            transactionReference
          )
        )
      ),
      catchError((err: KushkiError) => {
        if (isTokenless) return of(undefined);

        return throwError(err);
      }),
      tag("CardService | _executeFailoverTokenIsRequired")
    );
  }

  private _executeFailoverCharge(
    input: ChargeInput
  ): Observable<AurusResponse> {
    return of(1).pipe(
      concatMap(() => {
        input.processor = {
          acquirer_bank: get(
            input,
            "trxRuleResponse.body.failOverProcessor.acquirerBank"
          ),
          category_model: get(
            input,
            "trxRuleResponse.body.failOverProcessor.categoryModel"
          ),
          created: 0,
          merchant_id: input.authorizerContext.merchantId,
          private_id: get(
            input,
            "trxRuleResponse.body.failOverProcessor.privateId",
            ""
          ),
          processor_code: get(
            input,
            "trxRuleResponse.body.failOverProcessor.processorCode"
          ),
          processor_name: get(
            input,
            "trxRuleResponse.body.failOverProcessor.processor",
            ""
          ),
          processor_type: get(
            input,
            "trxRuleResponse.body.failOverProcessor.processorType",
            ProcessorTypeEnum.GATEWAY
          ),
          public_id: get(
            input,
            "trxRuleResponse.body.failOverProcessor.publicId",
            ""
          ),
          subMerchantId: get(
            input,
            "trxRuleResponse.body.failOverProcessor.subMerchantId"
          ),
        };
        input.isFailoverRetry = true;

        return this._executeCharge(input);
      }),
      tag("CardService | _executeFailoverCharge")
    );
  }

  private _executeCharge(input: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => {
        const merchant_migrate: string[] =
          `${process.env.MERCHANT_MIGRATE_IDS}`.split(",");

        return iif(
          () =>
            get(input, "siftScience", false) &&
            !(
              merchant_migrate.includes(
                get(input, "currentMerchant.public_id")
              ) || merchant_migrate.includes("all")
            ),
          this._processWorkflows(
            input.currentMerchant,
            input.currentToken,
            input.event
          ),
          of(true)
        );
      }),
      switchMap(() => {
        this._checkExpiredToken(input);
        return this._checkAlreadyTokenUsed(input);
      }),
      switchMap(() => {
        this._validateCreatedTime(input);

        switch (input.transactionType) {
          case TransactionRuleTypeEnum.PREAUTHORIZATION:
            return this._executePreauthTransaction({
              ...input,
              event: {
                ...input.event,
                amount: input.amount,
              },
            });
          case TransactionRuleTypeEnum.CHARGE:
          default:
            return this._executeChargeTransaction({
              ...input,
              event: {
                ...input.event,
                amount: input.amount,
              },
            });
        }
      }),
      tag("CardService | _executeCharge")
    );
  }

  private _getNewToken(
    token: DynamoTokenFetch,
    convertionResponse: ConvertionResponse
  ): DynamoTokenFetch {
    return {
      ...token,
      convertedAmount: convertionResponse.body.isOriginalAmount
        ? undefined
        : {
            currency: convertionResponse.body.convertedCurrency,
            totalAmount: convertionResponse.body.newAmount,
          },
    };
  }

  private _getConvertedAmount(
    request: UnifiedChargesPreauthRequest,
    convertionResponse: ConvertionResponse
  ): Amount | undefined {
    return get(convertionResponse, "body.isOriginalAmount", false)
      ? undefined
      : <Amount>{
          ...request.amount,
          currency: get(
            convertionResponse,
            "body.convertedCurrency",
            CurrencyEnum.USD
          ),
          totalAmount: convertionResponse.body.newAmount,
        };
  }

  private _checkConvertedAmount(
    amount: Amount
  ): Observable<[ConvertionResponse, Amount]> {
    return of(1).pipe(
      mergeMap(() => {
        const total_amount = CardService.sFullAmount(amount);

        return amount.currency !== undefined &&
          amount.currency === CurrencyEnum.UF
          ? this._lambda.invokeFunction<ConvertionResponse>(
              `${process.env.CURRENCY_CONVERSION_LAMBDA}`,
              {
                body: {
                  amount: total_amount,
                  changeCurrency: CurrencyEnum.CLP,
                  currentCurrency: amount.currency,
                  timestamp: moment().valueOf(),
                },
              }
            )
          : of({
              body: {
                convertedCurrency: amount.currency!,
                isOriginalAmount: true,
                newAmount: total_amount,
              },
            });
      }),
      mergeMap((conversionResponse: ConvertionResponse) => {
        if (conversionResponse.body.isOriginalAmount === true)
          return forkJoin([of(conversionResponse), of(amount)]);

        const new_amount: Amount = {
          currency: <CurrencyEnum>conversionResponse.body.convertedCurrency,
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 0,
        };

        conversionResponse.body.newAmount = Math.round(
          conversionResponse.body.newAmount
        );

        if (amount.iva > 0) {
          const iva_list: { [k: string]: number } = JSON.parse(
            `${process.env.IVA_VALUES}`
          );
          const iva: number | undefined =
            iva_list[conversionResponse.body.convertedCurrency];

          new_amount.subtotalIva = Math.round(
            parseFloat(
              (conversionResponse.body.newAmount / (iva + 1)).toFixed(2)
            )
          );
          new_amount.iva = Math.round(
            parseFloat(
              (
                conversionResponse.body.newAmount - new_amount.subtotalIva
              ).toFixed(2)
            )
          );
        } else new_amount.subtotalIva0 = conversionResponse.body.newAmount;

        return forkJoin([of(conversionResponse), of(new_amount)]);
      }),
      tag("CardService | _checkConvertedAmount")
    );
  }

  private _getTransactionRuleType(
    body: ChargesCardRequest,
    preauth: boolean
  ): TransactionRuleTypeEnum {
    switch (true) {
      case preauth:
        return TransactionRuleTypeEnum.PREAUTHORIZATION;
      case get(body, "months", 0) > 0:
        return TransactionRuleTypeEnum.DEFERRED;
      case get(body, DEFERRED_MONTHS_PATH, 0) > 0:
        return TransactionRuleTypeEnum.DEFERRED;
      case get(body, this._subscriptionValidationPath, false):
        return TransactionRuleTypeEnum.SUBSCRIPTION_VALIDATION;
      default:
        return TransactionRuleTypeEnum.CHARGE;
    }
  }

  private _checkCurrencyRound(
    conversion: ConvertionResponse,
    currency?: string
  ): number {
    return currency !== undefined && currency === CurrencyEnum.UF
      ? Math.round(conversion.body.newAmount)
      : conversion.body.newAmount;
  }

  private _getPlccProcessor(
    authorizer: AuthorizerContext
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => this._getId(authorizer)),
      mergeMap((merchantId: string) =>
        this._lambda.invokeFunction<{ body: { plcc: boolean } }>(
          `usrv-transaction-rule-${process.env.USRV_STAGE}-getPlcc`,
          {
            body: {
              merchantId,
            },
          }
        )
      ),
      map((response: { body: { plcc: boolean } }) => response.body.plcc),
      tag("CardService | _getPlccProcessor")
    );
  }

  private _responseVoidInfo(
    chargeTransaction: Transaction,
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    voidTransaction: Transaction,
    merchantCountry: string
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        this._buildVoidResponse(
          event.body,
          { ...chargeTransaction, ...voidTransaction },
          chargeTransaction.original_bin || chargeTransaction.bin_card,
          chargeTransaction.ticket_number,
          merchantCountry
        )
      ),
      tag("CardService | _responseVoidInfo")
    );
  }

  private _verifyInitVoid(
    transactionVerify: Transaction,
    transactionId: string,
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    partialRefund: PartialTransactionRefund,
    merchant: DynamoMerchantFetch,
    captureTrx: Transaction | undefined,
    processorChannel?: string
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () => this._isVoidAvailable(transactionVerify, captureTrx),
          this._processInitVoid(
            transactionVerify,
            transactionId,
            event,
            partialRefund,
            merchant,
            processorChannel
          ),
          throwError(() => new KushkiError(ERRORS.E020))
        )
      ),
      tag("CardService | _verifyInitVoid")
    );
  }

  private _isVoidAvailable(
    transaction: Transaction,
    captureTrx: Transaction | undefined
  ): boolean {
    const processors_for_void_preauth: string[] = [
      ProcessorEnum.MCPROCESSOR,
      ProcessorEnum.CREDOMATIC,
      ProcessorEnum.KUSHKI,
      ProcessorEnum.PROSA,
      ProcessorEnum.FIS,
    ];

    return (
      (transaction.transaction_type === TransactionTypeEnum.PREAUTH &&
        processors_for_void_preauth.includes(transaction.processor_name) &&
        isUndefined(captureTrx)) ||
      (transaction.transaction_type === TransactionTypeEnum.PREAUTH &&
        transaction.processor_name === ProcessorEnum.TRANSBANK &&
        transaction.integration_method === TransbankTransactionTypeEnum.MALL) ||
      ![TransactionTypeEnum.VOID, TransactionTypeEnum.PREAUTH].includes(
        <TransactionTypeEnum>transaction.transaction_type
      )
    );
  }

  private _processInitVoid(
    chargeTransaction: Transaction,
    transactionId: string,
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    partialRefund: PartialTransactionRefund,
    merchant: DynamoMerchantFetch,
    processorChannel?: string
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        forkJoin([
          of(chargeTransaction),
          this._getProcessorForVoid(
            chargeTransaction.processor_id,
            chargeTransaction.merchant_id
          ),
          of(merchant),
        ])
      ),
      switchMap(
        (
          response: [
            Transaction,
            DynamoProcessorFetch | undefined,
            DynamoMerchantFetch
          ]
        ) =>
          forkJoin([
            of(response[0]),
            this._executeVoidTransaction(
              response,
              transactionId,
              event.requestContext.authorizer,
              partialRefund,
              get(event, AMOUNT_PATH),
              processorChannel,
              get(event, WEBHOOK_PATH),
              event.body
            ),
            of(response[1]),
          ])
      ),
      switchMap(
        (
          responseProcess: [
            Transaction,
            VoidChargeBackResponse,
            DynamoProcessorFetch | undefined
          ]
        ) => {
          const transaction_response: Transaction = {
            ...responseProcess[0],
            approved_transaction_amount: get(partialRefund, "requestAmount"),
            converted_amount: get(partialRefund, "convertedAmount"),
            mccCode: get(responseProcess[2], "sub_mcc_code", ""),
            request_amount: get(partialRefund, "requestAmount"),
            ticket_number: responseProcess[1].body.ticketNumber,
            transaction_id: responseProcess[1].body.transactionId,
            transaction_reference: transactionId,
          };

          if (processorChannel)
            transaction_response.processor_channel = processorChannel;

          return forkJoin([
            this._transactionService.processVoidRecord(
              event,
              transaction_response
            ),
            this._buildVoidResponse(
              event.body,
              transaction_response,
              transaction_response.original_bin ||
                transaction_response.bin_card,
              chargeTransaction.ticket_number,
              get(merchant, "country", "")
            ),
            this._updateTransactionSalePendingAmount(
              partialRefund,
              chargeTransaction
            ),
          ]);
        }
      ),
      concatMap(
        (
          responseTransaction: [
            Transaction,
            VoidCardResponse | VoidCardResponseV2,
            boolean
          ]
        ) => of(responseTransaction[1])
      ),
      tag("CardService | _processInitVoid")
    );
  }

  private _getProcessorForVoid(
    processorId: string,
    merchantId: string
  ): Observable<DynamoProcessorFetch | undefined> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: UpdateProcessorRequest }>(
          `usrv-transaction-rule-${process.env.USRV_STAGE}-getProcessor`,
          {
            pathParameters: {
              merchantId,
              processorId,
            },
          }
        )
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      map((response: { body: UpdateProcessorRequest }) => ({
        acquirer_bank: get(response, "body.acquirerBank"),
        category_model: get(response, "body.categoryModel"),
        created: 0,
        merchant_id: merchantId,
        private_id: get(response, "body.privateId", ""),
        processor_code: get(response, "body.processorCode"),
        processor_merchant_id: get(response, "body.processorMerchantId"),
        processor_name: response.body.processorName,
        processor_type: get(
          response,
          PROCESSOR_TYPE_PATH,
          ProcessorTypeEnum.GATEWAY
        ),
        public_id: get(response, "body.publicId", ""),
        sub_mcc_code: get(response, this._getMccCode),
        terminal_id: get(response, "body.terminalId"),
        unique_code: get(response, "body.uniqueCode"),
      })),
      catchError((err: Error | KushkiError) => {
        if (err instanceof KushkiError) throw err;
        return of(undefined);
      }),
      tag("CardService | _getProcessorForVoid")
    );
  }

  private _updateTransactionSalePendingAmount(
    partialRefund: PartialTransactionRefund,
    chargeTransaction: Transaction
  ): Observable<boolean> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () =>
            partialRefund.status || get(partialRefund, "partialVoid", false),
          this._storage.updateValues(
            `${process.env.DYNAMO_TRANSACTION}`,
            {
              created: chargeTransaction.created,
              transaction_id: chargeTransaction.transaction_id,
            },
            {
              pendingAmount: partialRefund.pendingAmount,
            }
          ),
          of(true)
        )
      )
    );
  }

  private _validatePlccBin(
    bin: string,
    merchantCountry: string
  ): Observable<{ flag: string; brand: string }> {
    return of(1).pipe(
      concatMap(() =>
        // TODO change EC value when we sync country in merchant T-T
        this._getBinInfo(bin, true, merchantCountry)
      ),
      map((binInfo: DynamoBinFetch | undefined) => {
        if (get(binInfo, "bin", "").startsWith("EC"))
          return { flag: "1", brand: get(binInfo, "brand", "") };

        return { flag: "0", brand: "" };
      }),
      tag("CardService | _validatePlccBin")
    );
  }

  private _buildVoidRequest(
    transaction: Transaction,
    amount?: VoidAmount | undefined
  ): RequestedVoid {
    let validated_amount: object;

    // tslint:disable-next-line:prefer-conditional-expression
    if (isUndefined(amount) || isEmpty(amount))
      validated_amount = this._getAmountTrx(transaction);
    else validated_amount = amount;

    return {
      ...dotObject.transform(this._requestVoid, transaction),
      amount: validated_amount,
    };
  }

  private _getAmountTrx(transaction: Transaction): object {
    return {
      currency: transaction.currency_code,
      extraTaxes: transaction.taxes,
      ice: transaction.ice_value,
      iva: transaction.iva_value,
      subtotalIva: transaction.subtotal_iva,
      subtotalIva0: transaction.subtotal_iva0,
    };
  }

  private _buildCaptureResponse(
    captureRequest: CaptureCardRequest,
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    aurusData: AurusResponse,
    captureTransaction: Transaction,
    token: DynamoTokenFetch
  ): Observable<SimplifyResponse | ChargesCardResponse> {
    return of(1).pipe(
      mergeMap(() => {
        const version: boolean | string = get(
          captureRequest,
          "fullResponse",
          false
        );

        unset(transaction, "ticket_number");
        delete transaction.amount;
        delete transaction.transactionDetails;
        delete transaction.transaction_details;
        delete transaction.social_reason;
        delete transaction.category_merchant;
        delete transaction.tax_id;
        delete transaction.card_country_code;
        delete transaction.card_country;
        delete transaction.mccCode;
        delete transaction.integration_method;

        return iif(
          () =>
            (captureRequest.fullResponse !== undefined && version === true) ||
            version === "v2",
          this._processfullResponseCapture(
            transaction,
            processor,
            aurusData,
            captureTransaction,
            version === true
              ? FullResponseVersionEnum.V1
              : FullResponseVersionEnum.V2,
            token
          ),
          of({
            ticketNumber: aurusData.ticket_number,
            transactionReference: get(transaction, "transaction_reference", ""),
          })
        );
      })
    );
  }

  private _processfullResponseCapture(
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    aurusData: AurusResponse,
    captureTransaction: Transaction,
    version: FullResponseVersionEnum.V1 | FullResponseVersionEnum.V2,
    token: DynamoTokenFetch
  ): Observable<ChargesCardResponse> {
    return of(1).pipe(
      map(() =>
        ResponseBuilder.getCaptureFullResponse(
          transaction,
          processor,
          aurusData,
          captureTransaction,
          token.binInfo,
          version
        )
      ),
      tag("CardService | _processfullResponseCapture")
    );
  }

  private _buildUnifiedCaptureRequest(
    cMerchant: DynamoMerchantFetch,
    event: CaptureCardRequest,
    cAuthorizer: AuthorizerContext
  ): Observable<UnifiedCaptureRequest> {
    return of(1).pipe(
      mergeMap(() => {
        const unified_capture: UnifiedCaptureRequest = {
          authorizer: cAuthorizer,
          captureRequest: event,
          merchant: cMerchant,
          usrvOrigin: UsrvOriginEnum.CARD,
        };

        return of(unified_capture);
      }),
      tag("CardService | _buildUnifiedCaptureRequest")
    );
  }

  // tslint:disable-next-line:max-func-body-length
  private _buildChargeResponse(
    fullResponse: FullResponseType,
    sqsFlag: string,
    processor: DynamoProcessorFetch,
    trx: Transaction,
    creditType: string,
    transactionType: string,
    vaultResponse: VaultResponse,
    event: UnifiedChargesPreauthRequest,
    trxRuleResponse: LambdaTransactionRuleBodyResponse,
    bin: BinFetchType,
    currentToken: DynamoTokenFetch
  ): ChargesCardResponse | PreauthFullResponseV2 | AurusChargesResponse {
    let response:
      | ChargesCardResponse
      | PreauthFullResponseV2
      | AurusChargesResponse;
    const is_preauth: boolean =
      transactionType.toLowerCase() ===
      TransactionTypeEnum.PREAUTH.toLowerCase();
    let omit_paths: string[] = [
      "ticket_number",
      "amount",
      "transactionDetails",
      "transaction_details",
      "processor_id",
      "credential_id",
      "credential_alias",
      "token_type",
      "security",
      "user_agent",
      "purchase_Number",
      "purchase_number",
      "processor_transaction_id",
      "vault_token",
      "plcc",
      "interest_amount",
      "isAft",
      "processor_merchant_id",
      "action",
      "credential_metadata",
      "public_credential_id",
      "integration",
      "consortium_name",
      "authorizerContext",
      "credentialId",
      "cvv",
      "expiryYear",
      "expiryMonth",
      "merchant",
      "merchantCountry",
      "tokenCreated",
      "tokenCurrency",
      "tokenId",
      "tokenType",
      "transactionKind",
      "userAgent",
      "usrvOrigin",
      "vaultToken",
      "cardTypeBin",
      "tokenObject",
      "card_country",
      "card_country_code",
      "mccCode",
      "integration_method",
      "req",
      "KSH_AWS_REQUEST_ID",
      "KSH_LAMBDA_FUNCTION",
      "isSubscriptionCharge",
      "processorInfo",
      "social_reason",
      "bin_type",
      "transactionCardHolderName",
      "transactionEmail",
      "kushki_info",
      "security_identity",
      "send_cvv",
    ];

    const is_subscription_trx: boolean = get(event, "usrvOrigin", "").includes(
      UsrvOriginEnum.SUBSCRIPTIONS
    );

    if (is_subscription_trx) {
      const subs_paths: string[] = [
        "buy_order",
        "card_type",
        "count",
        "country",
        "failOverSubscription",
        "foreign_card",
        "ip",
        "issuing_bank",
      ];

      omit_paths = omit_paths.filter(
        (value: string) => value !== "processor_id"
      );
      omit_paths = omit_paths.concat(subs_paths);
    }

    const transaction_data: Transaction = <Transaction>omit(trx, omit_paths);

    const mapped_full_response: string = this._mappedFullResponse(
      fullResponse,
      sqsFlag
    );

    const is_transbank_processor =
      get(trx, "processor_name") === ProcessorEnum.TRANSBANK;

    const is_3ds_response_customer: boolean = this._isCustomerResponse(
      trx.customer_merchant_id
    );

    switch (mapped_full_response) {
      case FullResponseVersionEnum.V2:
        response = ResponseBuilder.getPreauthAndChargeFullResponseV2(
          trx,
          bin,
          is_transbank_processor,
          trxRuleResponse,
          event,
          ...(is_3ds_response_customer ? [currentToken] : [])
        );
        break;
      case FullResponseVersionEnum.V1:
        response = {
          details: <Details>camelcaseKeys({
            ...transaction_data,
            binInfo: this._summarizeBinInfo(bin),
            cardCountry: get(bin, CardService.sCountryName),
            metadata: !is_preauth ? transaction_data.metadata : undefined,
            processorName:
              trx.processor_name === ProcessorEnum.BILLPOCKET
                ? ProcessorEnum.PROSA_AGR
                : trx.processor_name,
            rules: [],
          }),
          ticketNumber: trx.ticket_number,
          transactionReference: get(trx, "transaction_reference", ""),
        };

        if (is_transbank_processor)
          set(response, "details.binInfo.type", trx.card_type);

        // istanbul ignore next
        if (!isEmpty(creditType))
          set(response, "details.creditType", creditType);
        if (!Boolean(processor.acquirer_bank)) break;

        dotObject.copy(
          "acquirer_bank",
          ACQUIRER_BANK_TARGET_STRING,
          processor,
          response
        );

        break;

      case "aurusReponse":
        response = ResponseBuilder.getPreauthAndChargeAurusResponse(
          trx,
          bin,
          is_transbank_processor,
          event
        );
        return response;
      default:
        response = {
          ticketNumber: trx.ticket_number,
          transactionReference: get(trx, "transaction_reference", ""),
        };
        break;
    }

    const merchants_without_trx_reference: string[] =
      `${process.env.DENY_TRX_REFERENCE}`.split(",");

    // istanbul ignore next
    if (merchants_without_trx_reference.includes(trx.merchant_id))
      unset(response, "transactionReference");

    response = this._setVaultTokenResponse(response, vaultResponse);

    unset(response, "details.amount.totalAmount");
    unset(response, "details.cardTypeBin");
    unset(response, "details.cardCountryCode");
    unset(response, "details.taxId");

    return response;
  }

  private _isCustomerResponse(customerMerchantId: string | undefined): boolean {
    return JSON.parse(
      process.env["3DS_RESPONSE_CUSTOMER"] || JSON.stringify([])
    ).includes(customerMerchantId);
  }

  private _mappedFullResponse(
    fullResponse: FullResponseType,
    sqsFlag: string
  ): string {
    let mapped_full_response: string = "none";

    if (fullResponse === true) mapped_full_response = "v1";
    if (fullResponse === "v2") mapped_full_response = "v2";
    if (sqsFlag === "aurusReponse") mapped_full_response = "aurusReponse";

    return mapped_full_response;
  }

  private _validateBinInformation(
    bin: string,
    privateCard: boolean,
    merchantCountry: string
  ): Observable<DynamoBinFetch | undefined> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => bin.startsWith("0"),
          throwError(() => new KushkiError(ERRORS.E029)),
          of(true)
        )
      ),
      mergeMap(() => this._getBinInfo(bin, privateCard, merchantCountry)),
      mergeMap((dynamobin: DynamoBinFetch | undefined) => {
        if (get(dynamobin, "invalid", false) === true)
          throw new KushkiError(ERRORS.E029);
        return of(dynamobin);
      }),
      tag("CardService | _validateBin")
    );
  }

  // istanbul ignore next
  private _getBinInfo(
    bin: string,
    privateCard: boolean,
    merchantCountry: string
  ): Observable<DynamoBinFetch | undefined> {
    return of(1).pipe(
      switchMap(() =>
        this._lambda.invokeFunction<DynamoBinFetch, AccountInfoRequest>(
          `${process.env.GET_ACCOUNT_INFO_LAMBDA}`,
          {
            account: bin.replace(/\D/g, ""),
            apiRequest: false,
            isPrivateCard: privateCard,
            kshMerchantCountry: merchantCountry,
            origin: ECOMMERCE,
          }
        )
      ),
      catchError(() => of(undefined)),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      tag("CardService | _getBinInfo")
    );
  }

  /* eslint-disable max-params*/
  private _buildAurusChargeResponse(
    error: KushkiError,
    event: EventCharge,
    authorizerContext: AuthorizerContext,
    currentMerchant: DynamoMerchantFetch,
    currentToken: DynamoTokenFetch,
    processor: DynamoProcessorFetch,
    ruleInfo?: object,
    transactionType?: string,
    integration?: string,
    integrationMethod?: string,
    currentTransaction?: Transaction,
    partnerValidator?: string
  ): Observable<Transaction> {
    return of(currentToken).pipe(
      mergeMap((tokenFetch: DynamoTokenFetch) => {
        const aurus_response: AurusResponse = <AurusResponse>(
          error.getMetadata()
        );

        aurus_response.ticket_number = "";
        aurus_response.approved_amount = "0";
        aurus_response.transaction_id = nanoSeconds
          .now()
          .toString()
          .replace(",", "");
        aurus_response.recap = "";

        if (error.code === "K021") {
          dotObject.move("responseCode", "response_code", aurus_response);
          dotObject.move("responseText", "response_text", aurus_response);
        } else {
          aurus_response.response_code = error.code;
          aurus_response.response_text = error.getMessage();
        }

        aurus_response.transaction_details = {
          approvalCode: "",
          binCard: "",
          cardHolderName: "",
          cardType: "",
          isDeferred: get(event, DEFERRED_MONTHS_PATH) > 0 ? "Y" : "N",
          lastFourDigitsOfCard: "",
          merchantName: get(currentMerchant, "merchant_name", ""),
          processorBankName: "",
          processorName: "",
        };

        if (tokenFetch.binInfo !== undefined)
          aurus_response.transaction_details = {
            ...aurus_response.transaction_details,
            binCard: tokenFetch.binInfo.bin,
            cardType: get(tokenFetch, CARD_TYPE_PATH, ""),
            lastFourDigitsOfCard: tokenFetch.lastFourDigits,
            processorName: tokenFetch.binInfo.processor,
          };

        let new_processor: DynamoProcessorFetch = processor;

        if (isEmpty(get(processor, "public_id"))) {
          const metadata_error: object = error.getMetadata();

          new_processor = {
            ...processor,
            acquirer_bank: get(metadata_error, "processorInfo.acquirerBank"),
            category_model: get(metadata_error, "processorInfo.categoryModel"),
            created: 0,
            merchant_category_code: get(
              metadata_error,
              "processorInfo.merchantCategoryCode"
            ),
            merchant_id: currentMerchant.public_id,
            private_id: get(metadata_error, "processorInfo.privateId", ""),
            processor_name: get(metadata_error, "processorInfo.processor", ""),
            processor_type: get(
              metadata_error,
              "processorInfo.processorType",
              ""
            ),
            public_id: get(metadata_error, "processorInfo.publicId", ""),
            sub_mcc_code: get(metadata_error, "processorInfo.subMccCode"),
          };
        }

        set(
          aurus_response,
          PROCESSOR_NAME_DETAILS_PATH,
          new_processor.processor_name
        );
        unset(aurus_response, "processorInfo");

        return forkJoin([of(aurus_response), of(new_processor)]);
      }),
      concatMap(
        ([charge_aurus, new_processor]: [
          AurusResponse,
          DynamoProcessorFetch
        ]) => {
          const send_to_sift: boolean =
            this._checkSiftScience(
              defaultTo(transactionType, ""),
              currentToken,
              currentMerchant
            ) && error.code === "K021";
          const message_fields: MessageFields = get(
            error.getMetadata(),
            MESSAGE_FIELDS_DETAILS_PATH,
            {}
          );

          return this._startSavingTransaction({
            authorizerContext,
            error,
            integration,
            integrationMethod,
            ruleInfo,
            aurusChargeResponse: charge_aurus,
            country: get(currentMerchant, "country", "NA"),
            merchantId: authorizerContext.merchantId,
            merchantName: currentMerchant.merchant_name,
            messageFields: {
              ...message_fields,
              restricted: get(error.getMetadata(), "restricted"),
            },
            partner: defaultTo(partnerValidator, ""),
            processor: new_processor,
            requestEvent: event,
            siftValidation: send_to_sift,
            tokenInfo: currentToken,
            transaction: currentTransaction,
            trxType: transactionType,
          });
        }
      ),
      map((trx: Transaction) => trx),
      tag("Card Service | _buildAurusChargeResponse")
    );
  }

  private _setCardFields(
    input: ChargeInput,
    aurusResponse: AurusResponse
  ): void {
    const last_four_digits: string = defaultTo(
      get(input, CURRENT_MERCHANT_COUNTRY_PATH),
      get(aurusResponse, LAST_FOUR_DIGITS_DETAILS_PATH)
    );
    const bin: string = defaultTo(
      get(input, BIN_CURRENT_TOKEN_PATH),
      get(aurusResponse, BIN_CARD_DETAILS_PATH)
    );

    set(input, CURRENT_MERCHANT_COUNTRY_PATH, last_four_digits);
    set(input, BIN_CURRENT_TOKEN_PATH, bin);
    set(
      input,
      "currentToken.maskedCardNumber",
      `${ResponseBuilder.binLength(bin, true)}XXXX${last_four_digits}`
    );
  }

  private _sendChargeSQS(event: ProcessRecordRequest): Observable<Transaction> {
    const charge_obj: object = this._buildChargeObject(event);
    const transaction_obj: Transaction =
      this._transactionService.buildTransactionObject(event);

    return of(transaction_obj).pipe(
      mergeMap((trx: Transaction) => forkJoin([of(charge_obj), of(trx)])),
      mergeMap(([charge, trx]: [object, Transaction]) =>
        this._sqs.put(QUEUES.sqsChargesTransaction, {
          charge,
          merchant: event.merchant,
          token: event.tokenInfo,
          transaction: trx,
        })
      ),
      mapTo(transaction_obj),
      tag("CardService | _sendChargeSQS")
    );
  }

  private _startSavingTransaction(
    event: ProcessRecordRequest
  ): Observable<Transaction> {
    const transaction_obj: Transaction =
      this._transactionService.buildTransactionObject(event);

    return of(transaction_obj).pipe(
      switchMap((trx: Transaction) =>
        this._sqs.put(QUEUES.sqsCardTransaction, trx)
      ),
      mapTo(transaction_obj),
      tag("CardService | _startSavingTransaction")
    );
  }

  private _buildChargeObject(event: ProcessRecordRequest): object {
    const is_aft: boolean | undefined = event.isAft;
    const channel_crypto: string = "crypto";
    const add_time: number = 86400000;
    const length_date: number = 10;
    const input_event_paths: string[] = [
      TOTAL_AMOUNT,
      "authorizerContext",
      "binInfo",
      "cardHolderName",
      "credentialId",
      "cvv",
      "expiryMonth",
      "expiryYear",
      "ip",
      "isAft",
      "isOCT",
      "isDeferred",
      "lastFourDigits",
      "merchant",
      "merchantCountry",
      "paymentBrand",
      "tokenCreated",
      "tokenCurrency",
      "tokenId",
      "tokenType",
      "transactionKind",
      "transactionType",
      "userAgent",
      "usrvOrigin",
      "vaultToken",
      "maskedCardNumber",
      "merchantId",
      "createSubscriptionMetadata",
    ];

    let input_event: object = cloneDeep(get(event, "requestEvent"));
    let credit_type: string = get(
      event.requestEvent,
      "deferred.creditType",
      ""
    );

    input_event = omit(input_event, input_event_paths);

    if (is_aft) set(input_event, "processor_channel", channel_crypto);
    if (
      credit_type.length === 2 &&
      get(event.aurusChargeResponse, "transaction_details.processorName") ===
        ProcessorEnum.DATAFAST
    )
      credit_type = `0${get(event.requestEvent, "deferred.creditType", "")}`;

    return {
      ...input_event,
      channel: event.requestEvent.channel,
      creditType: get(event.aurusChargeResponse, "creditType"),
      deferred: {
        ...get(event, "requestEvent.deferred", {}),
        credit_type,
      },
      details: event.aurusChargeResponse.transaction_details,
      expirationTime: Number(
        (new Date().getTime() + add_time).toString().slice(0, length_date)
      ),
      ticketNumber: event.aurusChargeResponse.ticket_number,
      transactionId: event.aurusChargeResponse.transaction_id,
      transactionReference: event.tokenInfo.transactionReference,
    };
  }

  private _fetchDynamoMerchant(
    merchantId: string
  ): Observable<DynamoMerchantFetch> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
          public_id: merchantId,
        })
      ),
      map((merchant: DynamoMerchantFetch | undefined) => {
        if (merchant === undefined) throw new KushkiError(ERRORS.E004);

        return merchant;
      }),
      tag("Card Service | _fetchDynamoMerchant")
    );
  }

  private _deferredOptionsError(isBrazil?: boolean) {
    return of(1).pipe(
      mergeMap(() => {
        const msg: string = "La opción de diferido enviada no es válida.";
        const err = !isBrazil ? ERRORS.E322 : ERRORS.E001;

        this._rollbar.critical(msg);
        return throwError(() => new KushkiError(err, msg));
      })
    );
  }

  private _validateCentralAmericaWithProcessorAndDeferredOptions(
    currentProcessor: string | undefined,
    processor: string | undefined,
    deferredOptions: DeferredOptionsType,
    currentDeferredOptions: Deferred | undefined
  ): boolean {
    return (
      currentProcessor === processor &&
      !this._validateCurrentDeferredWithDeferredOptions(
        currentDeferredOptions,
        deferredOptions
      )
    );
  }

  private _validateBrazilDeferredOptions(
    deferredOptions: DeferredOptionsType,
    deferred: Deferred | undefined,
    transactionType: string
  ): boolean {
    let has_options: boolean = !isEmpty(deferred) && !isEmpty(deferredOptions);

    if (has_options && typeof deferredOptions !== "boolean")
      has_options = deferredOptions!.some(
        (item: DeferredOption) =>
          get(item, "merchantMonths", [""]).includes(
            deferred!.months.toString()
          ) && get(item, "deferredType", [""]).includes(deferred!.creditType)
      );
    if (transactionType.toUpperCase() !== TransactionTypeEnum.DEFERRED)
      has_options = true;

    this._logger.info("CardService | _validateBrazilDeferredOptions", {
      deferred,
      deferredOptions,
    });
    return has_options;
  }

  private _validateCurrentDeferredWithDeferredOptions(
    deferred: Deferred | undefined,
    deferredOptions: DeferredOptionsType
  ): boolean {
    let flag: boolean = isEmpty(deferred);

    if (
      deferred !== undefined &&
      deferredOptions !== undefined &&
      typeof deferredOptions !== "boolean"
    )
      flag = deferredOptions.some(
        (item: DeferredOption) =>
          get(item, "months", [""]).includes(deferred.months.toString()) &&
          get(item, "deferredType", [""]).includes(deferred.creditType)
      );

    return flag;
  }

  private isValidCurrency(
    tokenCurrency: string,
    requestCurrency: string | undefined
  ): boolean {
    return (
      requestCurrency !== undefined &&
      requestCurrency !== "" &&
      !isEmpty(tokenCurrency) &&
      tokenCurrency !== requestCurrency
    );
  }

  private _createCybersourceData(data: InvokeTrxRuleResponse): Cybersource {
    const cybersource: Cybersource = {
      authentication: true,
      detail: {
        acsURL: get(data, "trxRuleResponse.body.cybersource.detail.acsURL", ""),
        authenticationTransactionId: get(
          data,
          "trxRuleResponse.body.cybersource.detail.authenticationTransactionId",
          ""
        ),
        cavv: get(data, "trxRuleResponse.body.cybersource.detail.cavv", ""),
        commerceIndicator: get(
          data,
          "trxRuleResponse.body.cybersource.detail.commerceIndicator",
          ""
        ),
        directoryServerTransactionID: get(
          data,
          "trxRuleResponse.body.cybersource.detail.directoryServerTransactionID",
          ""
        ),
        dsTransactionId: get(
          data,
          "trxRuleResponse.body.cybersource.detail.dsTransactionId",
          ""
        ),
        eci: get(data, "trxRuleResponse.body.cybersource.detail.eci", ""),
        eciRaw: get(data, "trxRuleResponse.body.cybersource.detail.eciRaw", ""),
        paReq: get(data, "trxRuleResponse.body.cybersource.detail.paReq", ""),
        paresStatus: get(
          data,
          "trxRuleResponse.body.cybersource.detail.paresStatus",
          ""
        ),
        proxyPan: get(
          data,
          "trxRuleResponse.body.cybersource.detail.proxyPan",
          ""
        ),
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        specificationVersion: get(
          data,
          "trxRuleResponse.body.cybersource.detail.specificationVersion"
        ),
        ucafAuthenticationData: get(
          data,
          "trxRuleResponse.body.cybersource.detail.ucafAuthenticationData",
          ""
        ),
        ucafCollectionIndicator: get(
          data,
          "trxRuleResponse.body.cybersource.detail.ucafCollectionIndicator",
          ""
        ),
        veresEnrolled: get(
          data,
          "trxRuleResponse.body.cybersource.detail.veresEnrolled",
          ""
        ),
        xid: get(data, "trxRuleResponse.body.cybersource.detail.xid", ""),
      },
    };

    return deepCleaner(cybersource);
  }

  private _createCybersourceDataFromRequest(
    data: UnifiedChargesPreauthRequest
  ): Cybersource {
    return deepCleaner({
      authentication: true,
      detail: {
        cavv: get(data, "threeDomainSecure.cavv"),
        directoryServerTransactionID: get(
          data,
          "threeDomainSecure.directoryServerTransactionID"
        ),
        eci: get(data, "threeDomainSecure.eci"),
        specificationVersion: get(
          data,
          "threeDomainSecure.specificationVersion"
        ),
        ucafAuthenticationData: get(data, "threeDomainSecure.ucaf"),
        ucafCollectionIndicator: get(
          data,
          "threeDomainSecure.collectionIndicator"
        ),
        xid: get(data, "threeDomainSecure.xid"),
      },
    });
  }

  private _handleProcessCharge(
    amount: Amount,
    currentToken: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch,
    transactionType: TransactionRuleTypeEnum,
    body: ChargesCardRequest | UnifiedChargesPreauthRequest,
    authorizerContext: AuthorizerContext,
    data: InvokeTrxRuleResponse,
    context: Context,
    tokenType: TokenTypeEnum,
    convertedAmount?: Amount | undefined
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() => {
        const charge_input: ChargeInput = UtilsService.buildChargeInput(
          amount,
          currentToken,
          currentMerchant,
          transactionType,
          body,
          authorizerContext,
          data,
          context,
          tokenType,
          convertedAmount
        );

        // *INFO: This was implemented due core logger had a long delay to log the info
        // tslint:disable-next-line:no-console
        console.info(
          "CardService | charge input",
          omit(charge_input, PRIVATE_PATHS_OMIT)
        );
        return this._processCharge(charge_input);
      }),
      tag("CardService | _handleProcessCharge")
    );
  }

  private _handleThresholdAmountError(): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        this._rollbar.warning(
          "Monto de la transacción es diferente al monto de la venta inicial."
        );
        return throwError(
          new KushkiError(ERRORS.E220, ERRORS.E220.message, {})
        );
      })
    );
  }

  private _validateThresholdAmount(
    token: DynamoTokenFetch,
    amount: Amount,
    merchant: DynamoMerchantFetch
  ): boolean {
    return (
      Number(
        Math.abs(token.amount - CardService.sFullAmount(amount)).toFixed(2)
      ) > Number(`${process.env.THRESHOLD_AMOUNT}`) &&
      // TODO: THIS FIX WAS CREATED BECAUSE TUENTI MAKE TOKEN WITH AURUS AND CHARGE BY HERE -.-
      token.created !== 0 &&
      // TODO: FIX FOR CLARO EC MERCHANTS
      !`${process.env.CLARO_EC_MERCHANTS}`
        .split(",")
        .includes(merchant.public_id)
    );
  }

  private _validateCreatedTime(input: ChargeInput): void {
    const thirty_minutes: number = 1800000;
    const time: number = new Date().getTime();
    const real_time_stamp: string = time.toString();

    if (
      !(
        Number(real_time_stamp) - input.currentToken.created >=
        thirty_minutes
      ) ||
      input.currentToken.created === 0
    )
      return;

    throw new AurusError(
      AurusErrorCodeEnum.AURUS577,
      AURUS_ERROR_MESSAGE_TOKEN,
      {
        approvalCode: "",
        binCard: input.currentToken.bin,
        cardHolderName: input.currentToken.cardHolderName,
        cardType: get(input, TOKEN_BIN_INFO_TYPE, ""),
        isDeferred: input.currentToken.isDeferred ? "Y" : "N",
        lastFourDigitsOfCard: input.currentToken.lastFourDigits,
        merchantName: input.currentMerchant.merchant_name,
        processorBankName: "",
        processorCode: AurusErrorCodeEnum.AURUS577,
        processorName: input.trxRuleResponse.body.processor,
      }
    );
  }

  private _handleTrxRuleChargeError(
    err: Error,
    event: EventCharge,
    authorizerContext: AuthorizerContext,
    processor: DynamoProcessorFetch,
    currentToken: DynamoTokenFetch | undefined,
    currentMerchant: DynamoMerchantFetch | undefined,
    fullResponse: FullResponseType,
    transactionType: TransactionRuleTypeEnum,
    isTokenlessCharge: boolean,
    ruleInfo?: object,
    integrationMethod?: string
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const event_metadata: object | undefined = get(
          event,
          "metadata",
          undefined
        );

        if (isTokenlessCharge) set(event, "isTokenless", isTokenlessCharge);

        if (
          (err instanceof KushkiError &&
            includes(KUSHKI_HANDLED_ERRORS, err.code)) ||
          (err instanceof KushkiError && isTokenlessCharge)
        )
          return forkJoin([
            of(event_metadata),
            this._handleChargeOrCaptureKushkiError(
              err,
              event,
              authorizerContext,
              processor,
              currentToken,
              currentMerchant,
              ruleInfo,
              transactionType,
              undefined,
              integrationMethod
            ),
          ]);

        return forkJoin([of(event_metadata), of(undefined)]);
      }),
      mergeMap(
        ([event_metadata, saved_trx]: [
          object | undefined,
          Transaction | undefined
        ]) => {
          if (
            err instanceof KushkiError &&
            (err.code === "K322" || err.code === "K220")
          ) {
            const metadata: object = err.getMetadata();

            if (event_metadata !== undefined) {
              set(metadata, "metadata", event_metadata);
              err.setMetadata(metadata);
            }

            err = this._setErrorMetadataFullResponseV2(
              err,
              saved_trx,
              get(currentToken, "transactionReference", ""),
              fullResponse,
              get(event, "usrvOrigin", "")
            );
          }

          return throwError(() => err);
        }
      ),
      tag("cardService | _handleTrxRuleChargeError")
    );
  }

  private _processCharge(input: ChargeInput): Observable<object> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () =>
            !isEmpty(input.event.threeDomainSecure) &&
            isUndefined(input.event.secureService) &&
            !this._validateExternalThreeDSResponse(
              input.event.threeDomainSecure,
              get(input.currentToken, BIN_BRAND)
            ),
          throwError(
            new KushkiError(ERRORS.E322, ERRORS.E322.message, {
              rules: [
                {
                  code: DeclinedAuthentication3DSEnum.ERROR_CODE,
                  message: DeclinedAuthentication3DSEnum.ERROR_MESSAGE,
                },
              ],
            })
          ),
          of(true)
        )
      ),
      mergeMap(() => {
        let credit_type: string = "";

        input.ruleInfo = {
          ip: defaultTo(input.currentToken.ip, ""),
          maskedCardNumber: input.currentToken.maskedCardNumber,
          user_agent: get(input, "currentToken.userAgent", ""),
        };

        if (!isEmpty(get(input, "event.deferred.creditType", "")))
          credit_type = get(input, "event.deferred.creditType", "");

        return forkJoin([
          this.chargeMethod(input),
          of(input.trxRuleResponse),
          of(credit_type),
        ]);
      }),
      catchError((err: ChargeError) => this._checkForErrorInCharge(err, input)),
      switchMap(
        (data: [Transaction, LambdaTransactionRuleBodyResponse, string]) => {
          const full_response: boolean = Boolean(
            get(input, CardService.sFullResponsePath, false)
          );
          let bin_data: BinFetchType;

          if (full_response) bin_data = input.currentToken.binInfo;

          return forkJoin([
            of(data[0]),
            of(data[1]),
            of(data[2]),
            of(bin_data),
            this._changeTokenTypeToSubscription(input),
          ]);
        }
      ),
      mergeMap(
        ([trx, trx_response, credit_type, bin, vault_token]: [
          Transaction,
          LambdaTransactionRuleBodyResponse,
          string,
          BinFetchType,
          VaultResponse
        ]) =>
          forkJoin([
            of(
              this._buildChargeResponse(
                get(input, CardService.sFullResponsePath, false),
                get(input, CardService.sqsFlagPath, "false"),
                input.processor,
                trx,
                credit_type,
                input.transactionType,
                vault_token,
                input.event,
                input.trxRuleResponse,
                bin,
                input.currentToken
              )
            ),
            of(trx),
            of(trx_response),
          ])
      ),
      concatMap(
        ([response, trx, trx_rule]: [
          object,
          Transaction,
          LambdaTransactionRuleBodyResponse
        ]) => {
          if (!Boolean(input.isFailoverRetry)) return of(response);

          return this._checkIfFailoverIsOk(
            response,
            trx,
            input.lambdaContext,
            trx_rule
          );
        }
      ),
      tag("CardService | _processCharge")
    );
  }

  private _checkIfFailoverIsOk(
    response: object,
    trx: Transaction,
    lambdaContext: Context,
    trxRule: LambdaTransactionRuleBodyResponse
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() => {
        if (lambdaContext.getRemainingTimeInMillis() >= 18000)
          return of(response);

        return this._checkIfVoidFailoverTransaction(trx, trxRule);
      }),
      map((rs: object) => rs),
      tag("CardService | _checkIfFailoverIsOk")
    );
  }

  private _checkIfVoidFailoverTransaction(
    trx: Transaction,
    trxRule: LambdaTransactionRuleBodyResponse
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() => {
        if (trx.transaction_status !== TransactionStatusEnum.APPROVAL)
          return of({ message: TransactionStatusEnum.DECLINED });

        return this._lambda.invokeFunction(`${process.env.CHARGEBACK_LAMBDA}`, {
          body: {
            ...trx,
            credentialAlias: get(trx, "credential_alias", ""),
            credentialId: get(trx, "credential_id", ""),
            credentialMetadata: get(trx, "credential_metadata", ""),
            integration: get(trxRule, INTEGRATION_PATH, ""),
            publicCredentialId: get(trx, "public_credential_id", ""),
          },
        });
      }),
      map((rs: object | string) => ({
        message: `FailoverVoid - ${JSON.stringify(rs)}`,
      })),
      tag("CardService | _checkIfVoidFailoverTransaction")
    );
  }

  private _getToken(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<DynamoTokenFetch> {
    return of(1).pipe(
      switchMap(() => this._storage.updateTokenValue(event.body.token, v4())),
      catchError((err: AWSError) => {
        if (err.name === TOKEN_USED_ERROR)
          return this._alreadyUsedToken(event.body.token);
        return throwError(() => err);
      }),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      map((dynamoToken: DynamoTokenFetch | undefined) => {
        const merchant_ids: string = `${process.env.MERCHANT_IDS_TUENTI}`;
        const merchant_id_list: string[] = merchant_ids.split(",");

        if (merchant_id_list.includes(get(event, MERCHANT_ID_AUTHORIZER)))
          return CardService._validateTokenExists(
            dynamoToken,
            event.body.token,
            event.requestContext.authorizer.merchantId
          );

        if (dynamoToken === undefined)
          return {
            amount: 0,
            bin: "",
            created: 0,
            currency: "",
            id: "",
            ip: "",
            lastFourDigits: "",
            maskedCardNumber: "",
            merchantId: "",
            transactionReference: "",
          };

        if (
          !isEmpty(dynamoToken.id) &&
          dynamoToken.merchantId !== event.requestContext.authorizer.merchantId
        )
          throw new KushkiError(ERRORS.E040);

        return dynamoToken;
      }),
      tag("CardService | _getToken")
    );
  }

  private _alreadyUsedToken(token): Observable<DynamoTokenFetch | undefined> {
    return of(1).pipe(
      switchMap(() =>
        this._storage.getItem<DynamoTokenFetch>(TABLES.tokens, {
          id: token,
        })
      ),
      mergeMap((tokenDynamo: DynamoTokenFetch | undefined) => {
        if (tokenDynamo) set(tokenDynamo, "alreadyUsed", true);
        return of(tokenDynamo);
      }),
      tag("CardService | _alreadyUsedToken")
    );
  }

  private _checkExpiredToken(chargeInput: ChargeInput) {
    if (chargeInput.currentToken.id !== "") return;

    throw new AurusError(
      AurusErrorCodeEnum.AURUS577,
      AURUS_ERROR_MESSAGE_TOKEN,
      {
        approvalCode: "",
        binCard: chargeInput.currentToken.bin,
        cardHolderName: chargeInput.currentToken.cardHolderName,
        cardType: get(chargeInput, TOKEN_BIN_INFO_TYPE, ""),
        lastFourDigitsOfCard: chargeInput.currentToken.lastFourDigits,
        merchantName: chargeInput.currentMerchant.merchant_name,
        processorBankName: "",
        processorCode: AurusErrorCodeEnum.AURUS577,
        processorName: chargeInput.trxRuleResponse.body.processor,
      }
    );
  }

  private _checkAlreadyTokenUsed(data: ChargeInput): Observable<void> {
    return of(1).pipe(
      mergeMap(() =>
        forkJoin([
          this._storage.queryReservedWord<Transaction>(
            TABLES.transaction,
            IndexEnum.transaction_tokenIndex,
            "token",
            data.currentToken.id,
            "#token"
          ),
          of(data.currentToken),
        ])
      ),
      map(([subscription]: [Transaction[], DynamoTokenFetch]) => {
        if (subscription.length > 0)
          throw new AurusError(
            AurusErrorCodeEnum.AURUS577,
            AURUS_ERROR_MESSAGE_TOKEN,
            {
              approvalCode: "",
              binCard: data.currentToken.bin,
              cardHolderName: data.currentToken.cardHolderName,
              cardType: get(data, TOKEN_BIN_INFO_TYPE, ""),
              lastFourDigitsOfCard: data.currentToken.lastFourDigits,
              merchantName: data.currentMerchant.merchant_name,
              processorBankName: "",
              processorCode: AurusErrorCodeEnum.AURUS577,
              processorName: data.trxRuleResponse.body.processor,
            }
          );
      }),
      tag("CardService | _checkAlreadyTokenUsed")
    );
  }

  private _getMerchant(
    publicMerchantId: string
  ): Observable<DynamoMerchantFetch> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
          public_id: publicMerchantId,
        })
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      switchMap((merchant: DynamoMerchantFetch | undefined) => {
        if (merchant === undefined) throw new KushkiError(ERRORS.E004);

        return of(merchant);
      }),
      tag("Card Service | _getMerchant")
    );
  }

  private _validateCitMit(
    request: TokenlessChargeCardBody | ChargesCardRequest,
    totalAmount: number
  ): boolean {
    if (has(request, CitMitEnum.transactionMode)) {
      return (
        this._validateCardAmount(request, totalAmount) ||
        this._validateRecurrenceAmount(request, totalAmount)
      );
    }

    return (
      has(request, CitMitEnum.externalSubscriptionID) &&
      !isEmpty(request.externalSubscriptionID)
    );
  }

  private _validateRecurrenceAmount(
    request: TokenlessChargeCardBody | ChargesCardRequest,
    totalAmount: number
  ): boolean {
    return (
      (request.transactionMode === TransactionModeEnum.INITIAL_RECURRENCE ||
        request.transactionMode ===
          TransactionModeEnum.SUBSEQUENT_RECURRENCE) &&
      totalAmount > 0
    );
  }

  private _validateCardAmount(
    request: TokenlessChargeCardBody | ChargesCardRequest,
    totalAmount: number
  ): boolean {
    return (
      (request.transactionMode === TransactionModeEnum.INITIAL_RECURRENCE ||
        request.transactionMode === TransactionModeEnum.VALIDATE_CARD) &&
      totalAmount !== 0
    );
  }

  private _checkForErrorInCharge(
    err: ChargeError,
    input: ChargeInput
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => this._handleNormalErrorFlow(err, input)),
      tag("CardService | _checkForErrorInCharge")
    );
  }

  // istanbul ignore next
  private _handleNormalErrorFlow(
    err: ChargeError,
    input: ChargeInput
  ): Observable<never> {
    if (err instanceof AurusError || err instanceof KushkiError)
      return of(1).pipe(
        switchMap(() =>
          this._processChargeOrCaptureError(
            err,
            input.event,
            input.authorizerContext,
            input.processor,
            input.currentToken,
            input.currentMerchant,
            input.transactionType,
            get(input, RULE_INTEGRATION_PATH),
            get(input, INTEGRATION_METHOD_PATH),
            undefined,
            get(input, PARTNER_VALIDATOR_PATH)
          )
        ),
        tag("CardService | _handleNormalErrorFlow")
      );

    return throwError(() => err);
  }

  private _remapAurusError(
    error: AurusError,
    tokenFetch: DynamoTokenFetch,
    processor: DynamoProcessorFetch
  ): AurusResponse {
    const metadata: AurusResponse = <AurusResponse>error.getMetadata();

    metadata.response_code = error.code;
    metadata.response_text = error.getMessage();
    metadata.ticket_number = "";
    metadata.approved_amount = "0";
    metadata.transaction_id = nanoSeconds.now().toString().replace(",", "");
    metadata.recap = "";
    dotObject.move("approvalCode", APPROVAL_CODE_PATH, metadata);
    dotObject.move(
      "cardHolderName",
      "transaction_details.cardHolderName",
      metadata
    );
    dotObject.move(
      "lastFourDigitsOfCard",
      LAST_FOUR_DIGITS_DETAILS_PATH,
      metadata
    );
    dotObject.move("cardType", "transaction_details.cardType", metadata);
    dotObject.move("binCard", BIN_CARD_DETAILS_PATH, metadata);
    dotObject.move("processorName", PROCESSOR_NAME_DETAILS_PATH, metadata);
    dotObject.move(
      "processorBankName",
      "transaction_details.processorBankName",
      metadata
    );
    dotObject.move("isDeferred", IS_DEFERRED_DETAILS_PATH, metadata);
    dotObject.move("merchantName", MERCHANT_NAME_DETAILS_PATH, metadata);
    dotObject.move(
      "conciliationId",
      "transaction_details.conciliationId",
      metadata
    );

    if (error.code.startsWith("5")) {
      set(
        metadata,
        IS_DEFERRED_DETAILS_PATH,
        Boolean(tokenFetch.isDeferred) ? "Y" : "N"
      );
      set(metadata, BIN_CARD_DETAILS_PATH, get(tokenFetch, BIN_PATH));
      set(
        metadata,
        PROCESSOR_NAME_DETAILS_PATH,
        get(processor, "processor_name", "AURUS")
      );
    }

    return metadata;
  }

  private _processWorkflows(
    currentMerchant: DynamoMerchantFetch,
    token: DynamoTokenFetch,
    chargeBody: UnifiedChargesPreauthRequest
  ): Observable<boolean> {
    return of(1).pipe(
      switchMap(() =>
        this._antifraud.getWorkflows(
          currentMerchant,
          <Required<DynamoTokenFetch>>token,
          chargeBody
        )
      ),
      map((workflowResponse: SiftScienceWorkflowsResponse) => {
        const score: number =
          currentMerchant.sift_science.SiftScore !== undefined
            ? currentMerchant.sift_science.SiftScore
            : Number(process.env.SIFT_SCORE);

        if (
          workflowResponse.score_response !== undefined &&
          workflowResponse.score_response.scores.payment_abuse.score > score
        )
          throw new KushkiError(ERRORS.E021, undefined, {
            responseCode: "K021 | siftScore",
            responseText: "Declined by siftScore.",
          });

        const decision_ids: { id: string; workflowName: string }[] = [];

        if (
          workflowResponse.score_response !== undefined &&
          workflowResponse.score_response.workflow_statuses !== undefined
        )
          workflowResponse.score_response.workflow_statuses.forEach(
            (status: { history: History; config_display_name: string }) => {
              status.history.forEach(
                (history: {
                  app: string;
                  name: string;
                  config?: { decision_id?: string };
                }) => {
                  if (
                    !(
                      history.app === CardService.sSiftScienceDecision &&
                      history.config !== undefined &&
                      history.config.decision_id !== undefined
                    )
                  )
                    return;
                  decision_ids.push({
                    id: history.config.decision_id,
                    workflowName: status.config_display_name,
                  });
                }
              );
            }
          );

        return decision_ids;
      }),
      switchMap((decisions: { id: string; workflowName: string }[]) =>
        iif(
          () => decisions.length >= 1,
          this._processWorkflowDecisions(decisions, currentMerchant),
          of(true)
        )
      )
    );
  }

  private _processWorkflowDecisions(
    decisions: { id: string; workflowName: string }[],
    merchant: DynamoMerchantFetch
  ): Observable<boolean> {
    return from(decisions).pipe(
      mergeMap((decision: { id: string; workflowName: string }) =>
        forkJoin([
          this._antifraud.getDecision(merchant, decision.id),
          of(decision),
        ])
      ),
      reduce(
        (
          _: boolean,
          siftDecisionResponse: [
            SiftScienceDecisionResponse,
            { id: string; workflowName: string }
          ]
        ) => {
          if (
            siftDecisionResponse[0].type === CardService.sSiftScienceBlockType
          )
            throw new KushkiError(ERRORS.E021, undefined, {
              responseCode: `${siftDecisionResponse[1].workflowName}|${siftDecisionResponse[0].name}`,
              responseText: siftDecisionResponse[0].description,
            });

          return true;
        },
        false
      ),
      tag("CardService | _processWorkflowDecisions")
    );
  }

  private _prepareBody(
    body: TokensCardBody | TokenlessChargeCardBody,
    trxType?: TransactionRuleInvokeTypeEnum
  ): TokensCardBody | TokenlessChargeCardBody {
    let path: string = "currency";

    if (trxType === TransactionRuleInvokeTypeEnum.TOKENLESS_CHARGE) {
      path = CURRENCY_PATH;
    }

    if (isUndefined(get(body, path))) set(body, path, CurrencyEnum.USD);

    body.cardInfo.cardHolderName = CardService.transformCardName(
      body.cardInfo.cardHolderName
    );
    const bin_length: number = get(body, "binInfo.binType", 6);

    body.cardInfo.bin = body.cardInfo.bin.slice(0, bin_length);
    CardService._validateBin(body.cardInfo.bin);

    return body;
  }

  private _invokeTransactionRuleProcessor(
    request: object
  ): Observable<LambdaTransactionRuleResponse> {
    return this._lambda
      .invokeFunction<{ body: LambdaTransactionRuleResponse }>(
        `${process.env.LAMBDA_RULE}`,
        {
          body: {
            ...request,
          },
        }
      )
      .pipe(
        map(
          (response: { body: LambdaTransactionRuleResponse }) => response.body
        ),
        tag("CardService | _invokeTransactionRuleProcessor")
      );
  }

  /* eslint-disable max-params*/
  private _processChargeOrCaptureError(
    err: AurusError | KushkiError,
    event: EventCharge,
    authorizerContext: AuthorizerContext,
    processor: DynamoProcessorFetch,
    currentToken: DynamoTokenFetch | undefined,
    currentMerchant: DynamoMerchantFetch | undefined,
    transactionType?: string,
    integration?: string,
    integrationMethod?: string,
    currentTransaction?: Transaction,
    partnerValidator?: string
  ): Observable<never> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () => err instanceof AurusError,
          this._handleChargeOrCaptureAurusError(
            <AurusError>err,
            event,
            authorizerContext,
            processor,
            <DynamoTokenFetch>currentToken,
            <DynamoMerchantFetch>currentMerchant,
            {
              ip:
                currentToken === undefined
                  ? ""
                  : defaultTo(currentToken.ip, ""),
              maskedCardNumber:
                currentToken === undefined ? "" : currentToken.maskedCardNumber,
            },
            transactionType,
            integration,
            integrationMethod,
            currentTransaction,
            partnerValidator
          ),
          this._handleChargeOrCaptureKushkiError(
            err,
            event,
            authorizerContext,
            processor,
            currentToken,
            currentMerchant,
            {
              ip:
                currentToken === undefined
                  ? ""
                  : defaultTo(currentToken.ip, ""),
              maskedCardNumber:
                currentToken === undefined ? "" : currentToken.maskedCardNumber,
            },
            transactionType,
            integration,
            integrationMethod,
            currentTransaction,
            partnerValidator
          )
        )
      ),
      concatMap((savedTrx: Transaction | undefined) => {
        if (err.code === "322")
          err = new AurusError("322", ERRORS.E322.message, err.getMetadata());

        const is_3ds_response_customer: boolean = this._isCustomerResponse(
          get(savedTrx, "customer_merchant_id")
        );

        err = this._setErrorMetadataFullResponseV2(
          err,
          savedTrx,
          get(currentToken, "transactionReference", ""),
          get(event, "fullResponse", false),
          get(event, "usrvOrigin", ""),
          is_3ds_response_customer ? currentToken : undefined
        );

        return throwError(() => err);
      }),
      tag("CardService | _processChargeError")
    );
  }

  /* eslint-disable max-params*/
  private _handleChargeOrCaptureAurusError(
    err: AurusError,
    event: EventCharge,
    authorizerContext: AuthorizerContext,
    processor: DynamoProcessorFetch,
    tokenFetch: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch,
    ruleInfo?: object,
    transactionType?: string,
    integration?: string,
    integrationMethod?: string,
    currentTransaction?: Transaction,
    partnerValidator?: string
  ): Observable<Transaction> {
    return of(1).pipe(
      map(() => err.getMetadata<AurusResponse | TransactionDetails>()),
      switchMap((metadata: AurusResponse | TransactionDetails | object) => {
        if ("transaction_details" in metadata)
          metadata.transaction_details.merchantName =
            currentMerchant.merchant_name;
        const message_fields: MessageFields | undefined = get(
          metadata,
          MESSAGE_FIELDS_DETAILS_PATH
        );

        return iif(
          () =>
            Object.keys(metadata).includes("transaction_id") &&
            !isEmpty(get(metadata, "transaction_id")),
          of(1).pipe(
            switchMap(() =>
              this._startSavingTransaction({
                authorizerContext,
                integration,
                integrationMethod,
                processor,
                ruleInfo,
                aurusChargeResponse: <AurusResponse>metadata,
                country: get(currentMerchant, "country", "NA"),
                error: err,
                isAft: undefined,
                merchant: undefined,
                merchantId: currentMerchant.public_id,
                messageFields: message_fields,
                merchantName: currentMerchant.merchant_name,
                partner: defaultTo(partnerValidator, undefined),
                plccInfo: undefined,
                requestEvent: event,
                siftValidation: undefined,
                tokenInfo: tokenFetch,
                transaction: currentTransaction,
                trxType: transactionType,
                validateSiftTrxRule: undefined,
                whitelist: undefined,
              })
            )
          ),
          of(1).pipe(
            switchMap(() =>
              this._startSavingTransaction({
                authorizerContext,
                integration,
                integrationMethod,
                processor,
                ruleInfo,
                aurusChargeResponse: this._remapAurusError(
                  err,
                  tokenFetch,
                  processor
                ),
                country: get(currentMerchant, "country", "NA"),
                error: err,
                merchantId: currentMerchant.public_id,
                merchantName: currentMerchant.merchant_name,
                partner: defaultTo(partnerValidator, undefined),
                requestEvent: event,
                tokenInfo: tokenFetch,
                transaction: currentTransaction,
                trxType: transactionType,
              })
            )
          )
        );
      }),
      tag("CardService | _handleChargeOrCaptureAurusError")
    );
  }

  /* eslint-disable max-params*/
  private _handleChargeOrCaptureKushkiError(
    err: Error,
    event: EventCharge,
    authorizerContext: AuthorizerContext,
    processor: DynamoProcessorFetch,
    currentToken: DynamoTokenFetch | undefined,
    currentMerchant: DynamoMerchantFetch | undefined,
    ruleInfo?: object,
    transactionType?: string,
    integration?: string,
    integrationMethod?: string,
    currentTransaction?: Transaction,
    partnerValidator?: string
  ): Observable<Transaction | undefined> {
    return iif(
      () => currentToken === undefined || currentMerchant === undefined,
      of(undefined),
      of(1).pipe(
        switchMap(() =>
          this._buildAurusChargeResponse(
            <KushkiError>err,
            event,
            authorizerContext,
            <DynamoMerchantFetch>currentMerchant,
            <DynamoTokenFetch>currentToken,
            processor,
            ruleInfo,
            transactionType,
            integration,
            integrationMethod,
            currentTransaction,
            partnerValidator
          )
        ),
        tag("CardService | _handleChargeOrCaptureKushkiError")
      )
    );
  }

  private _buildVoidResponse(
    body: VoidBody,
    trx: Transaction,
    binNumber: string,
    saleTicketNumber: string | undefined,
    merchantCountry
  ): Observable<VoidCardResponse | VoidCardResponseV2> {
    const path_full_response: boolean | "v2" | undefined = get(
      body,
      "fullResponse"
    );
    const is_full_response: boolean =
      !isEmpty(body) &&
      path_full_response !== undefined &&
      (path_full_response === true ||
        path_full_response === FullResponseVersionEnum.V2);
    const version_full_response: string =
      get(body, "fullResponse", true) === true
        ? FullResponseVersionEnum.V1
        : FullResponseVersionEnum.V2;

    return of(1).pipe(
      switchMap(() =>
        iif(
          () => is_full_response,
          this._buildVoidFullResponse(
            binNumber,
            trx,
            trx.acquirer_bank,
            saleTicketNumber,
            version_full_response,
            merchantCountry,
            body?.externalReferenceId
          ),
          of({
            ticketNumber: trx.ticket_number,
            transactionReference: get(trx, "transaction_reference", ""),
          })
        )
      ),
      tag("CardService | _buildVoidResponse")
    );
  }

  private _buildVoidFullResponse(
    bin: string,
    trx: Transaction,
    acquirerBank: string | undefined,
    saleTicketNumber: string | undefined,
    fullResponse: string,
    merchantCountry: string,
    externalReferenceId: string | undefined
  ): Observable<VoidCardResponse | VoidCardResponseV2> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => !isEmpty(bin),
          this._getBinInfo(bin, false, merchantCountry),
          of(undefined)
        )
      ),
      mergeMap((binFetch: DynamoBinFetch | undefined) =>
        iif(
          () => fullResponse === FullResponseVersionEnum.V2,
          this._retrieveVoidFullResponseV2(
            binFetch,
            acquirerBank,
            saleTicketNumber,
            trx,
            externalReferenceId
          ),
          this._retrieveVoidFullResponseV1(
            binFetch,
            acquirerBank,
            saleTicketNumber,
            trx
          )
        )
      ),
      tag("CardService | _buildVoidFullResponse")
    );
  }

  private _retrieveVoidFullResponseV2(
    binFetch: DynamoBinFetch | undefined,
    acquirerBank: string | undefined,
    saleTicketNumber: string | undefined,
    trx: Transaction,
    externalReferenceId: string | undefined
  ): Observable<VoidCardResponseV2> {
    return of(1).pipe(
      mergeMap(() =>
        of(
          ResponseBuilder.getVoidFullResponseV2(
            binFetch,
            acquirerBank,
            saleTicketNumber,
            trx,
            externalReferenceId
          )
        )
      ),
      tag("CardService | _retrieveVoidFullResponseV2")
    );
  }

  private _retrieveVoidFullResponseV1(
    binFetch: DynamoBinFetch | undefined,
    acquirerBank: string | undefined,
    saleTicketNumber: string | undefined,
    trx: Transaction
  ): Observable<VoidCardResponse> {
    return of(1).pipe(
      mergeMap(() =>
        of(
          ResponseBuilder.getVoidFullResponseV1(
            binFetch,
            acquirerBank,
            saleTicketNumber,
            trx
          )
        )
      ),
      tag("CardService | _retrieveVoidFullResponseV1")
    );
  }

  private _summarizeBinInfo(binFetch: BinFetchType): object {
    return binFetch !== undefined && binFetch.info !== undefined
      ? // istanbul ignore next
        { bank: binFetch.bank, type: binFetch.info.type }
      : { bank: null, type: null };
  }

  private _prepareTransactionRuleResponsePlcc(
    request: UnifiedChargesPreauthRequest,
    trxResponse: LambdaTransactionRuleBodyResponse
  ): Observable<InvokeTrxRuleResponse> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () =>
            get(trxResponse, "body.plcc", "0") === "1" &&
            !get(request, "isTokenless", false),
          forkJoin([
            this._validatePlccBin(
              get(request, TOKEN_BIN_PATH),
              get(request, "merchantCountry", "")
            ),
            of(trxResponse),
          ]),
          forkJoin([of({ flag: "0", brand: "" }), of(trxResponse)])
        )
      ),
      map(
        ([plcc_information, trx_response]: [
          { flag: string; brand: string },
          LambdaTransactionRuleBodyResponse
        ]) =>
          this._buildInvokeTrxRuleResponse(
            trx_response,
            request.merchant.merchantId,
            plcc_information
          )
      ),
      tag("CardService | _prepareTransactionRuleResponsePlcc")
    );
  }

  private _invokeTrxRule(
    request: UnifiedChargesPreauthRequest,
    isTokenCharge?: boolean
  ): Observable<InvokeTrxRuleResponse> {
    return of(1).pipe(
      switchMap(() =>
        this._lambda.invokeFunction<LambdaTransactionRuleBodyResponse>(
          `${process.env.LAMBDA_RULE}`,
          this._getRulePayload(request, isTokenCharge)
        )
      ),
      switchMap((transactionRuleResponse: LambdaTransactionRuleBodyResponse) =>
        this._prepareTransactionRuleResponsePlcc(
          request,
          transactionRuleResponse
        )
      ),
      tag("CardService | _invokeTrxRule")
    );
  }

  private _invokeTrxRuleTokenCharge(
    dynamoToken: DynamoTokenFetch,
    request: RequestBodyTrxRule,
    transactionType: TransactionRuleTypeEnum,
    isTokenCharge?: boolean
  ): Observable<InvokeTrxRuleResponse> {
    return of(1).pipe(
      switchMap(() => {
        const transaction_rule_payload: TransactionRulePayload = {
          transactionType,
          credentialId: request.credentialId,
          currency: request.currency,
          customer: get(request, "customer", {}),
          deferred: get(request, DEFERRED_PATH, {}),
          hierarchyConfig: get(request, "hierarchyConfig", {}),
          ignoreWarnings: request.ignoreWarnings,
          isDeferred: request.isDeferred,
          merchantCountry: get(request, "merchantCountry", ""),
          merchantId: request.merchantId,
          orderDetails: get(request, ORDER_DETAILS_PATH),
          productDetails: get(request, PRODUCT_DETAILS_PATH),
          sandboxEnable: get(request, "sandboxEnable", false),
          sellerUserId: get(request, "sellerUserId", ""),
          token: dynamoToken,
        };

        return this._lambda.invokeFunction<LambdaTransactionRuleBodyResponse>(
          `${process.env.LAMBDA_RULE}`,
          this._getRulePayloadTK(transaction_rule_payload, isTokenCharge)
        );
      }),
      switchMap((trxResponse: LambdaTransactionRuleBodyResponse) =>
        iif(
          () => get(trxResponse, "body.plcc", "0") === "1",
          forkJoin([
            of(trxResponse),
            this._validatePlccBin(
              dynamoToken.bin,
              get(request, "merchantCountry", "")
            ),
          ]),
          forkJoin([of(trxResponse), of({ flag: "0", brand: "" })])
        )
      ),
      map(
        ([trx_response, plcc_information]: [
          LambdaTransactionRuleBodyResponse,
          { flag: string; brand: string }
        ]) =>
          this._buildInvokeTrxRuleResponse(
            trx_response,
            request.merchantId,
            plcc_information
          )
      ),
      tag("CardService | _invokeTrxRuleTokenCharge")
    );
  }

  private _buildDynamoProcessor(
    trxResponse: LambdaTransactionRuleBodyResponse,
    merchantId: string
  ): DynamoProcessorFetch {
    return {
      acquirer_bank: get(trxResponse, "body.acquirerBank"),
      category_model: get(trxResponse, "body.categoryModel"),
      created: 0,
      is_business_partner: get(trxResponse.body, "isBusinessPartner", false),
      jurisdiction: get(trxResponse.body, "jurisdiction", ""),
      merchant_category_code: get(trxResponse.body, "merchantCategoryCode", ""),
      merchant_id: merchantId,
      password: get(trxResponse.body, "password", ""),
      private_id: get(trxResponse, "body.privateId", ""),
      processor_code: get(trxResponse, "body.processorCode"),
      processor_merchant_id: get(trxResponse.body, "processorMerchantId", ""),
      processor_name: get(trxResponse, "body.processor", ""),
      processor_type: get(
        trxResponse,
        PROCESSOR_TYPE_PATH,
        ProcessorTypeEnum.GATEWAY
      ),
      public_id: get(trxResponse.body, "publicId", ""),
      retailer_id: get(trxResponse.body, "retailerId", ""),
      soft_descriptor: get(trxResponse.body, "softDescriptor", ""),
      subMCProcessor: get(trxResponse.body, "subMCProcessor", ""),
      terminal_id: get(trxResponse, "body.terminalId"),
      unique_code: get(trxResponse, "body.uniqueCode"),
      username: get(trxResponse.body, "username", ""),
    };
  }

  private _buildInvokeTrxRuleResponse(
    trxResponse: LambdaTransactionRuleBodyResponse,
    merchantId: string,
    plccInfo: PlccInfo
  ): InvokeTrxRuleResponse {
    const body: InvokeTrxRuleResponse = {
      plccInfo,
      apiKey: get(trxResponse, "key", ""),
      processor: this._buildDynamoProcessor(trxResponse, merchantId),
      trxRuleResponse: trxResponse,
    };

    if (!isEmpty(get(trxResponse, this._getMccCode, "")))
      body.processor.sub_mcc_code = get(trxResponse, this._getMccCode, "");

    return body;
  }

  private _getRulePayload(
    request: UnifiedChargesPreauthRequest,
    isTokenCharge?: boolean
  ): object {
    const is_object_hierarchy_config: boolean = isObject(
      get(request, HIERARCHY_PATH, {})
    );
    const is_object_merchant_data: boolean = isObject(
      get(request, MERCHANT_DATA_PATH, {})
    );
    const merchant_data: object = is_object_merchant_data
      ? get(request, MERCHANT_DATA_PATH, {})
      : JSON.parse(get(request, MERCHANT_DATA_PATH, "{}"));
    const usrv_origin: string = get(request, "usrvOrigin", UsrvOriginEnum.CARD);
    const card_type: string = Boolean(get(request, CARD_TYPE_PATH))
      ? get(request, CARD_TYPE_PATH)
      : "na";
    const common_trx_rule_request: object = {
      body: {
        isTokenCharge,
        constitutionalCountry: get(request, "constitutionalCountry", ""),
        detail: {
          bank: this._getBankOrBrand(request.binInfo, "bank"),
          bin: get(request, TOKEN_BIN_PATH, ""),
          brand: this._getBankOrBrand(
            request.binInfo,
            get(request, "paymentBrand", TransactionKindEnum.CARD)
          ),
          cardHolderName: get(request, "transactionCardHolderName", ""),
          country: this._getCountry(request),
          credentialId: defaultTo(
            get(request, "authorizerContext.credentialId"),
            request.credentialId
          ),
          currency: request.amount.currency,
          customer: get(request, "contactDetails", {}),
          cybersourceApiValidation: get(
            request,
            "tokenObject.cybersourceApiValidation"
          ),
          deferred: get(request, DEFERRED_PATH, {}),
          email: get(request, "transactionEmail", ""),
          ignoreWarnings: request.ignoreWarnings,
          ip: defaultTo(request.ip, ""),
          isCreditCard:
            request.provider === CardProviderEnum.TRANSBANK_WEBPAY
              ? is_credit_map[CardService._getWebpayCardType(request)]
              : is_credit_map[card_type.toLowerCase()],
          isDeferred: defaultTo(request.isDeferred, false).toString(),
          lastFourDigits: defaultTo(request.lastFourDigits, ""),
          maskedCardNumber: defaultTo(request.maskedCardNumber, ""),
          metadata: get(request, "metadata", {}),
          orderDetails: get(request, ORDER_DETAILS_PATH),
          otpData: {
            chargeData: {
              // So trx-rule not crash without secureId if merchant is with Otp but the transaction fail to deliver a secureId (very strange case)
              secureServiceId: this._getSecureServiceId(request),
            },
          },
          phoneNumber: get(request, "transactionPhoneNumber", ""),
          processor: this._getProcessor(request),
          productDetails: request.productDetails,
          secureService: request.secureService,
          sellerUserId: get(request, "sellerUserId", ""),
          sessionId: defaultTo(request.sessionId, ""),
          totalAmount: get(request, "amount.totalAmount", 0).toString(),
          transactionCardId: get(request, "transactionCardId", ""),
          transactionCreated: get(
            request,
            "tokenCreated",
            new Date().getTime()
          ),
          transactionReference: request.transactionReference,
          transactionType: <TransactionRuleTypeEnum>request.transactionType,
          userId: defaultTo(request.userId, ""),
          vaultToken: request.vaultToken,
        },
        hierarchyConfig: is_object_hierarchy_config
          ? get(request, HIERARCHY_PATH, {})
          : JSON.parse(get(request, HIERARCHY_PATH, "{}")),
        merchantCountry: get(request, "merchantCountry", ""),
        merchantData: {
          ...merchant_data,
          channel: get(request, "platformName", ""),
        },
        merchantId: request.merchantId,
        sandboxEnable: get(request, MERCHANT_SANDBOX, false),
        transactionKind: TransactionKindEnum.CARD,
      },
    };

    this._addSubsFields(usrv_origin, request, common_trx_rule_request);
    this._addCommissionsFields(usrv_origin, common_trx_rule_request);

    return common_trx_rule_request;
  }

  private _addCommissionsFields(
    usrvOrigin: string,
    commonTrxRuleRequest: object
  ): void {
    const is_commission_trx: boolean = usrvOrigin.includes(
      UsrvOriginEnum.COMMISSION
    );

    if (!is_commission_trx) return;

    const ommit_paths_details_commission: string[] = [
      "deferred",
      "customer",
      "credentialId",
      "currency",
      "ignoreWarnings",
      "orderDetails",
      "productDetails",
      "sellerUserId",
      "userId",
    ];
    const ommit_paths_commission: string[] = [
      "merchantCountry",
      "sandboxEnable",
    ];

    unset(commonTrxRuleRequest, "body.detail.otpData");
    set(
      commonTrxRuleRequest,
      "body.detail.transactionType",
      TransactionRuleTypeEnum.CHARGE
    );
    omit(
      get(commonTrxRuleRequest, "body.detail"),
      ommit_paths_details_commission
    );
    omit(commonTrxRuleRequest, ommit_paths_commission);
  }

  private _addSubsFields(
    usrvOrigin: string,
    request: UnifiedChargesPreauthRequest,
    commonTrxRuleRequest: object
  ): void {
    const is_subscription_trx: boolean = usrvOrigin.includes(
      UsrvOriginEnum.SUBSCRIPTIONS
    );
    const is_subscription_validation: boolean = get(
      request,
      this._subscriptionValidationPath,
      false
    );

    if (!(is_subscription_trx && !is_subscription_validation)) return;

    if (is_subscription_trx && !this._isUnifiedTransactionOnDemand(request))
      set(commonTrxRuleRequest, "body.detail.isDeferred", "false");

    set(
      commonTrxRuleRequest,
      `body.detail.otpData.chargeData.isSubscriptionCharge`,
      request.isSubscriptionCharge
    );
    set(
      commonTrxRuleRequest,
      "body.detail.ignoreSqsSubscription",
      request.isSubscriptionCharge
    );
    set(
      commonTrxRuleRequest,
      "body.detail.transactionType",
      defaultTo(
        SUBSCRIPTIONS_TYPE_RECORD[request.transactionType],
        SubsTransactionRuleEnum.CHARGE
      )
    );
  }

  private _getRulePayloadTK(
    transactionRulePayload: TransactionRulePayload,
    isTokenCharge?: boolean
  ): object {
    return {
      body: {
        isTokenCharge,
        detail: {
          bank: this._getBankOrBrand(
            transactionRulePayload.token.binInfo,
            "bank"
          ),
          bin: defaultTo(transactionRulePayload.token.bin, ""),
          brand: this._getBankOrBrand(
            transactionRulePayload.token.binInfo,
            "card"
          ),
          country:
            get(transactionRulePayload, "token.binInfo.info.country.name") ===
            undefined
              ? ""
              : get(
                  transactionRulePayload.token.binInfo,
                  CardService.sCountryName,
                  ""
                ),
          credentialId: transactionRulePayload.credentialId,
          currency: transactionRulePayload.currency,
          customer: transactionRulePayload.customer,
          deferred: get(transactionRulePayload, DEFERRED_PATH, {}),
          ignoreWarnings: transactionRulePayload.ignoreWarnings,
          ip: defaultTo(transactionRulePayload.token.ip, ""),
          isCreditCard: this._getCreditCard(transactionRulePayload),
          isDeferred: defaultTo(
            transactionRulePayload.isDeferred,
            false
          ).toString(),
          lastFourDigits: defaultTo(
            transactionRulePayload.token.lastFourDigits,
            ""
          ),
          maskedCardNumber: defaultTo(
            transactionRulePayload.token.maskedCardNumber,
            ""
          ),
          orderDetails: get(transactionRulePayload, ORDER_DETAILS_PATH),
          processor: isEmpty(
            get(transactionRulePayload, "token.binInfo.processor")
          )
            ? ""
            : get(transactionRulePayload, "token.binInfo.processor", ""),
          productDetails: get(transactionRulePayload, "productDetails"),
          sellerUserId: get(transactionRulePayload, "sellerUserId"),
          sessionId: defaultTo(transactionRulePayload.token.sessionId, ""),
          totalAmount: transactionRulePayload.token.amount.toString(),
          transactionCreated: get(
            transactionRulePayload,
            "token.created",
            new Date().getTime()
          ),
          transactionReference: get(
            transactionRulePayload,
            "token.transactionReference",
            ""
          ),
          transactionType: transactionRulePayload.transactionType,
          userId: defaultTo(transactionRulePayload.token.userId, ""),
        },
        hierarchyConfig: get(transactionRulePayload, "hierarchyConfig", {}),
        merchantCountry: transactionRulePayload.merchantCountry,
        merchantId: transactionRulePayload.merchantId,
        sandboxEnable: transactionRulePayload.sandboxEnable,
        transactionKind: "card",
      },
    };
  }

  private _getSecureServiceId(request: UnifiedChargesPreauthRequest) {
    return get(request, "secureId") !== undefined ? request.secureId : "NA";
  }

  private _getProcessor(
    request: UnifiedChargesPreauthRequest | TokenlessChargeCardBody
  ) {
    return request.binInfo === undefined
      ? ""
      : defaultTo(request.binInfo.processor, "");
  }

  // istanbul ignore next
  private _getCountry(request: UnifiedChargesPreauthRequest): string {
    return !isUndefined(get(request, BIN_INFO_COUNTRY_NAME))
      ? get(request, BIN_INFO_COUNTRY_NAME)
      : isUndefined(get(request, "binInfo.info.country"))
      ? ""
      : get(request.binInfo, CardService.sCountryName, "");
  }

  private _getCountryTokenlessCharge(request: TokenlessChargeCardBody): string {
    const country_name: string = get(request, BIN_INFO_COUNTRY_NAME, "");
    const optional_country_name: string = get(request, COUNTRY_NAME, "");

    switch (true) {
      case !isEmpty(country_name):
        return country_name;
      case !isEmpty(optional_country_name):
        return optional_country_name;
      default:
        return "";
    }
  }

  private _getBankOrBrand(
    binInfo: DynamoBinFetch | undefined,
    type: string
  ): string {
    return binInfo === undefined
      ? ""
      : defaultTo(type === "bank" ? binInfo.bank : binInfo.brand, "");
  }

  private _getCreditCard(
    transactionRulePayload: TransactionRulePayload
  ): string {
    const type: string | null | undefined = get(
      transactionRulePayload.token.binInfo,
      "info.type"
    );

    return type === undefined || type === null
      ? "true"
      : get(
          transactionRulePayload.token.binInfo,
          "info.type",
          ""
        ).toLowerCase() === "debit"
      ? "false"
      : "true";
  }

  // tslint:disable-next-line:cognitive-complexity
  private _buildToken(
    authorizer: AuthorizerContext,
    body: TokensCardBody,
    tokenResponse: TokensCardResponse,
    merchantId: string,
    headers: IGenericHeaders,
    isAwsRequest: boolean,
    transactionReference: string,
    traceabilityData: object,
    merchantDynamo: DynamoMerchantFetch | undefined,
    isTokenlessCharge?: boolean
  ): Observable<TokenDynamo> {
    return of(1).pipe(
      // tslint:disable-next-line:max-func-body-length
      map(() => {
        const expiration_time: Date = new Date();
        const user_agent: string | undefined = get(headers, "USER-AGENT");
        const ip_validation: string = get(headers, "X-FORWARDED-FOR", "")
          .split(",")[0]
          .trim();

        expiration_time.setMonth(expiration_time.getMonth() + 6);

        const response: TokenDynamo = {
          merchantId,
          transactionReference,
          accountType: get(body, "accountType"),
          amount: body.totalAmount,
          bin: defaultTo(
            get(body, BIN_PATH),
            defaultTo(get(body, "cardInfo.bin"), "XXXXXX")
          ).replace(/\D/g, ""),
          cardHolderName: get(body, CARD_INFO_CARD_HOLDER_NAME, ""),
          created: new Date().getTime(),
          credentialInfo: {
            alias: authorizer.credentialAlias,
            credentialId: authorizer.credentialId,
            metadata: authorizer.credentialMetadata,
          },
          currency: get(body, "currency", CurrencyEnum.USD),
          expirationTime: Number(
            expiration_time.getTime().toString().slice(0, 10)
          ),
          id: tokenResponse.token,
          isBlockedCard: get(body, "cardInfo.isBlocked", false),
          isDeferred: get(body, "isDeferred", false),
          lastFourDigits: get(body, CARD_INFO_LAST_FOUR_DIGITS, "XXXX"),
          maskedCardNumber: get(body, CARD_INFO_MASKED_CARD_NUMBER, ""),
          sendCvv: !isEmpty(get(body, "cvv", "")),
          tokenStatus: defaultTo(isTokenlessCharge, false)
            ? TokenStatusEnum.PROCESSED
            : TokenStatusEnum.CREATED,
          transactionCardId: get(body, "transactionCardId", ""),
          vaultToken: body.vaultToken,
          ...traceabilityData,
        };

        if (
          !isEmpty(merchantDynamo) &&
          body.contactDetails &&
          merchantDynamo.country === CountryEnum.BRAZIL
        )
          set(response, "contactDetails", body.contactDetails);

        if (!isAwsRequest && new RegExp(RegexEnum.ip).test(ip_validation))
          response.ip = ip_validation;

        if (!isEmpty(body.sessionId) && !isEmpty(body.userId)) {
          response.sessionId = <string>body.sessionId;
          response.userId = <string>body.userId;
        }

        if (
          !isEmpty(body.transactionRuleInfo.secureId) &&
          !isEmpty(body.transactionRuleInfo.secureService)
        ) {
          response.secureId = body.transactionRuleInfo.secureId;
          response.secureService = body.transactionRuleInfo.secureService;
        }

        if (!isEmpty(body.transactionRuleInfo.cybersource))
          response["3ds"] = this._getCybersourceDetails(body);

        if (!isEmpty(user_agent)) response.userAgent = user_agent;

        if (Boolean(tokenResponse.settlement))
          response.settlement = tokenResponse.settlement;

        if (!isEmpty(body.binInfo)) response.binInfo = body.binInfo;

        if (!isEmpty(tokenResponse.failoverToken))
          response.failoverToken = tokenResponse.failoverToken;

        if (!isEmpty(tokenResponse.convertedAmount))
          response.convertedAmount = tokenResponse.convertedAmount;

        if (!isEmpty(body.transactionMode))
          response.transactionMode = body.transactionMode;

        if (UtilsService.hasCybersourceApiValidationUrl(body))
          response.cybersourceApiValidation = true;

        set(response, "expiryMonth", get(body, "cardInfo.expiryMonth"));
        set(response, "expiryYear", get(body, "cardInfo.expiryYear"));

        let bin_info = get(response, "binInfo.info", undefined);

        bin_info = omit(bin_info, BIN_INFO_PATHS);
        set(response, "binInfo.info", bin_info);

        return deepCleaner(response);
      })
    );
  }

  private _getCybersourceDetails(
    body: TokensCardBody | ThreeDSTokenInfoRequest
  ): Cybersource {
    const details: Cybersource = {
      authentication: get(
        body.transactionRuleInfo,
        "cybersource.authentication",
        false
      ),
      detail: {
        acsURL: get(body.transactionRuleInfo, "cybersource.detail.acsURL"),
        authenticationTransactionId: get(
          body.transactionRuleInfo,
          "cybersource.detail.authenticationTransactionId"
        ),
        cavv: get(body.transactionRuleInfo, "cybersource.detail.cavv"),
        commerceIndicator: get(
          body.transactionRuleInfo,
          "cybersource.detail.commerceIndicator"
        ),
        eci: get(body.transactionRuleInfo, "cybersource.detail.eci"),
        paReq: get(body.transactionRuleInfo, "cybersource.detail.paReq"),
        paresStatus: get(
          body.transactionRuleInfo,
          "cybersource.detail.paresStatus"
        ),
        proxyPan: get(body.transactionRuleInfo, "cybersource.detail.proxyPan"),
        specificationVersion: get(
          body.transactionRuleInfo,
          "cybersource.detail.specificationVersion"
        ),
        veresEnrolled: get(
          body.transactionRuleInfo,
          "cybersource.detail.veresEnrolled"
        ),
        xid: get(body.transactionRuleInfo, "cybersource.detail.xid"),
      },
    };

    return deepCleaner(details);
  }

  private _saveToken(
    authorizer: AuthorizerContext,
    body: TokensCardBody,
    tokenResponse: TokensCardResponse,
    merchantId: string,
    headers: IGenericHeaders,
    isAwsRequest: boolean,
    transactionReference: string,
    merchantDynamo: DynamoMerchantFetch | undefined,
    isTokenlessCharge?: boolean
  ): Observable<TokenDynamo> {
    return of(1).pipe(
      mergeMap(() =>
        CardService.getTraceabilityData(
          body,
          defaultTo(tokenResponse.providerVariant, ""),
          this._coreFormatter
        )
      ),
      mergeMap((data: IRootResponse) =>
        this._buildToken(
          authorizer,
          body,
          tokenResponse,
          merchantId,
          headers,
          isAwsRequest,
          transactionReference,
          data,
          merchantDynamo,
          isTokenlessCharge
        )
      ),
      switchMap((data: TokenDynamo) =>
        forkJoin([of(data), this._storage.put(data, TABLES.tokens)])
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      map(([data]: [TokenDynamo, boolean]) => data)
    );
  }

  public static getTraceabilityData(
    body: TokensCardBody | SaveDeclineTrxRequest,
    provider: string,
    coreFormatter: IDataFormatter,
    isDeclinedTrxRequest?: boolean
  ): Observable<IRootResponse> {
    return of(1).pipe(
      mergeMap(() => {
        const security_identity_request: ISecurityIdentityRequest[] =
          CardService._buildSecurityIdentityRequest(
            body,
            provider,
            defaultTo(isDeclinedTrxRequest, false)
          );
        const request: IRootRequest = {
          kushkiInfo: get(body, "kushkiInfo", {}),
          securityIdentity: security_identity_request,
        };

        return of(coreFormatter.dataFormatter(request));
      }),
      tag("CardService |  getTraceabilityData")
    );
  }

  private static _buildSecurityIdentityRequest(
    body: TokensCardBody | SaveDeclineTrxRequest,
    provider: string,
    isDeclinedTrxRequest: boolean
  ): ISecurityIdentityRequest[] {
    const trx_rule_response: TransactionRuleInfo | SaveDeclineTrxRequest =
      isDeclinedTrxRequest ? body : get(body, "transactionRuleInfo");
    const response: ISecurityIdentityRequest[] = [
      defaultTo(
        SECURE_IDENTITY_PROVIDER[provider],
        SECURE_IDENTITY_PROVIDER[CardProviderEnum.KUSHKI]
      ),
    ];

    const security_identity_request: ISecurityIdentityRequest[] =
      CardService._setSecureServiceData(
        response,
        trx_rule_response,
        isDeclinedTrxRequest
      );

    if (isDeclinedTrxRequest)
      security_identity_request.forEach((item: ISecurityIdentityRequest) =>
        set(item, "info.status", TransactionStatusEnum.DECLINED)
      );

    return security_identity_request;
  }

  private static _setSecureServiceData(
    response: ISecurityIdentityRequest[],
    trxRuleResponse:
      | TransactionRuleInfo
      | SaveDeclineTrxRequest
      | ThreeDSTokenInfoRequest,
    isDeclinedTrxRequest: boolean
  ): ISecurityIdentityRequest[] {
    const secure_service: string = get(trxRuleResponse, "secureService", "");

    if (isEmpty(secure_service)) return response;

    const secure_service_traceability: ISecurityIdentityRequest =
      SECURE_IDENTITY_SECURE_SERVICE[secure_service];
    const specification_version: string = isDeclinedTrxRequest
      ? defaultTo(get(trxRuleResponse.security, "3ds.specificationVersion"), "")
      : defaultTo(
          get(trxRuleResponse.cybersource, "detail.specificationVersion", ""),
          ""
        );

    if (secure_service === PartnerValidatorEnum.THREEDS)
      set(secure_service_traceability, "info.version", specification_version);

    if (secure_service_traceability)
      return [...response, secure_service_traceability];

    return response;
  }

  private _getIsMerchantTest(merchantId: string): Observable<boolean> {
    return of(1).pipe(
      switchMap(() =>
        process.env.USRV_STAGE !== EnvironmentEnum.PRIMARY
          ? this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
              public_id: merchantId,
            })
          : of(undefined)
      ),
      map((merchant: DynamoMerchantFetch | undefined) =>
        get(merchant, "sandboxEnable", false)
      ),
      tag("CardService |  _getIsMerchantTest")
    );
  }

  private _getIsMerchantTestUnified(
    merchant: DynamoMerchantFetch
  ): Observable<boolean> {
    return of(1).pipe(
      switchMap(() =>
        process.env.USRV_STAGE !== EnvironmentEnum.PRIMARY
          ? of(merchant)
          : of(undefined)
      ),
      map((response: DynamoMerchantFetch | undefined) =>
        get(response, "sandboxEnable", false)
      ),
      tag("CardService |  _getIsMerchantTestUnified")
    );
  }

  private _executeCurrencyConversion(
    currency: string,
    totalAmount: number
  ): Observable<ConvertionResponse> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => currency === CurrencyEnum.UF,
          of(1).pipe(
            mergeMap(() =>
              this._lambda.invokeFunction<ConvertionResponse>(
                `${process.env.CURRENCY_CONVERSION_LAMBDA}`,
                {
                  body: {
                    amount: totalAmount,
                    changeCurrency: CurrencyEnum.CLP,
                    currentCurrency: currency,
                    timestamp: moment().valueOf(),
                  },
                }
              )
            ),
            mergeMap((conversionResponse: ConvertionResponse) => {
              conversionResponse.body.newAmount = Math.round(
                conversionResponse.body.newAmount
              );

              return of(conversionResponse);
            })
          ),
          of({
            body: {
              convertedCurrency: currency,
              isOriginalAmount: true,
              newAmount: totalAmount,
            },
          })
        )
      ),
      tag("CardService | _executeCurrencyConversion")
    );
  }

  private _checkTokenlessAmount(
    baseTokenInfo: BaseTokenInfo,
    currency: CurrencyEnum,
    totalAmount: number
  ): Observable<ConvertionResponse> {
    if (get(baseTokenInfo, "isTokenless", false))
      return of(baseTokenInfo.convertionResponse!);
    return this._executeCurrencyConversion(currency, totalAmount);
  }

  private _executeTokenTransaction(
    body: TokensCardBody,
    tokenType: string,
    sandboxEnable: boolean,
    publicId: string,
    processor: string,
    transactionReference: string,
    trxRuleCurrency?: string,
    baseTokenInfo?: BaseTokenInfo
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._checkTokenlessAmount(
          baseTokenInfo!,
          <CurrencyEnum>body.currency,
          body.totalAmount
        )
      ),
      switchMap((conversionResponse: ConvertionResponse) => {
        if (
          !isEmpty(trxRuleCurrency) &&
          !isUndefined(trxRuleCurrency) &&
          get(conversionResponse, "body.convertedCurrency") !== trxRuleCurrency
        )
          throw new KushkiError(ERRORS.E055);

        const provider_variant: CardProviderEnum = this._getProviderVariant(
          processor,
          sandboxEnable
        );

        const request: AurusTokenLambdaRequest | SandboxTokenLambdaRequest =
          sandboxEnable
            ? this._getSandboxTokenLambdaRequest(
                body,
                conversionResponse,
                publicId,
                processor,
                tokenType
              )
            : this._getTokenLambdaRequest(
                body,
                conversionResponse,
                transactionReference,
                publicId
              );

        return forkJoin([
          of(conversionResponse),
          this._handleTokenProvider(
            request,
            provider_variant,
            publicId,
            processor,
            body.cardInfo.bin,
            get(body, "transactionRuleInfo.integration", "aurus"),
            get(body, "transactionRuleInfo.completeTransactionType")
          ),
        ]);
      }),
      map(
        ([conversion_response, tokens_response]: [
          ConvertionResponse,
          [TokensCardResponse, string]
        ]) => {
          if (conversion_response.body.isOriginalAmount !== undefined)
            return {
              ...tokens_response[0],
              providerVariant: tokens_response[1],
            };

          return {
            ...tokens_response[0],
            convertedAmount: {
              currency: conversion_response.body.convertedCurrency,
              totalAmount: Math.round(conversion_response.body.newAmount),
            },
            providerVariant: tokens_response[1],
          };
        }
      ),
      tag("CardService | _executeTokenTransaction")
    );
  }

  private _getTokenLambdaRequest(
    body: TokensCardBody,
    conversionResponse: ConvertionResponse,
    transactionReference: string,
    publicId: string
  ): AurusTokenLambdaRequest {
    return {
      transactionReference,
      brand: get(body, BIN_BRAND),
      cardHolderName: body.cardInfo.cardHolderName,
      completeTransactionType: body.transactionRuleInfo.completeTransactionType,
      credentials: body.transactionRuleInfo.credentials,
      currency: <CurrencyEnum>conversionResponse.body.convertedCurrency,
      isCardValidation: false,
      isDeferred: get(body, "isDeferred"),
      merchantId: publicId,
      months: body.months,
      omitCVV: get(body, TRANSACTION_RULE_OMIT_CVV),
      processorName: get(body, PROCESSOR_PATH),
      processorPrivateId: get(body, "transactionRuleInfo.privateId"),
      tokenType: TokenTypeEnum.TRANSACTION,
      totalAmount: this._checkCurrencyRound(conversionResponse, body.currency),
      vaultToken: body.vaultToken,
    };
  }

  private _getSandboxTokenLambdaRequest(
    body: TokensCardBody,
    conversionResponse: ConvertionResponse,
    publicId: string,
    processorName: string,
    tokenType: string
  ): SandboxTokenLambdaRequest {
    return {
      tokenType,
      body: {
        card: {
          expiryMonth: "10",
          expiryYear: "50",
          name: get(body, CARD_INFO_CARD_HOLDER_NAME, ""),
          number: get(body, CARD_INFO_MASKED_CARD_NUMBER, ""),
        },
        currency: <CurrencyEnum>conversionResponse.body.convertedCurrency,
        isDeferred: body.isDeferred,
        totalAmount: this._checkCurrencyRound(
          conversionResponse,
          body.currency
        ),
      },
      mid: publicId,
      omitCVV: get(body, TRANSACTION_RULE_OMIT_CVV),
      processorName,
    };
  }

  private _executePreauthTransaction(
    input: ChargeInput
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => this._getIsMerchantTestUnified(input.currentMerchant)),
      switchMap((isTestMerchant: boolean) =>
        this._handlePreAthorizationProvider(
          input,
          this._getProviderVariant(
            input.processor.processor_name,
            isTestMerchant
          ),
          input.processor.processor_name,
          get(input, RULE_INTEGRATION_PATH, "aurus")
        )
      ),
      tag("CardService | _executePreauthTransaction")
    );
  }

  private _executeChargeTransaction(
    input: ChargeInput
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => this._getIsMerchantTestUnified(input.currentMerchant)),
      switchMap((isTestMerchant: boolean) => {
        const provider_variant: CardProviderEnum = this._getProviderVariant(
          input.processor.processor_name,
          isTestMerchant
        );

        return this._handleChargeProvider(
          input,
          provider_variant,
          input.processor.public_id,
          input.processor.processor_name
        );
      }),
      tag("CardService | _executeChargeTransaction")
    );
  }

  private _executeVoidTransaction(
    response: [
      Transaction,
      DynamoProcessorFetch | undefined,
      DynamoMerchantFetch
    ],
    transactionId: string,
    authorizerContext: AuthorizerContext,
    partialRefund: PartialTransactionRefund,
    amount?: VoidAmount | undefined,
    processorChannel?: string,
    webhooks?: WebhooksRequestChargeback[],
    voidRequest?: VoidBody
  ): Observable<VoidChargeBackResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<VoidChargeBackResponse>(
          `${process.env.ASYNC_VOID_LAMBDA}`,
          {
            body: this._buildPayloadInvokeVoid(
              response,
              transactionId,
              authorizerContext,
              partialRefund,
              amount,
              processorChannel,
              webhooks,
              voidRequest
            ),
          }
        )
      ),
      tag("CardService | _executeVoidTransaction")
    );
  }

  private _buildPayloadInvokeVoid(
    response: [
      Transaction,
      DynamoProcessorFetch | undefined,
      DynamoMerchantFetch
    ],
    transactionId: string,
    authorizerContext: AuthorizerContext,
    partialRefund: PartialTransactionRefund,
    amount?: VoidAmount | undefined,
    processorChannel?: string,
    webhooks?: WebhooksRequestChargeback[],
    voidRequest?: VoidBody
  ): RequestedVoid {
    const response_transaction: Transaction = response[0];
    let partial_void: boolean | undefined = get(partialRefund, "partialVoid");
    const partial_void_validator: boolean =
      this._checkCountryProcessorToPartialVoid(
        get(response[1], "processor_name", ""),
        get(response[0], "country", "")
      );

    if (!isUndefined(partial_void) && partial_void_validator)
      partial_void = partial_void_validator;

    const body: RequestedVoid = {
      ...this._buildVoidRequest(response_transaction, amount),
      approvedTransactionAmount: get(partialRefund, "requestAmount"),
      binInfo: {
        bank: get(response_transaction, "issuing_bank", ""),
        bin: get(response_transaction, "bin_card", ""),
        brand: get(response_transaction, "payment_brand", ""),
        country: UtilsService.getCountryISO(
          get(response_transaction, "card_country", "")
        ),
        originalBinFullLength: get(response_transaction, "original_bin", ""),
        prepaid: get(response_transaction, "prepaid", false),
        type: get(response_transaction, "card_type", ""),
      },
      commerceCode: get(response[1], "commerceCode"),
      consortiumName: get(response_transaction, "consortium_name", ""),
      convertedAmount: get(partialRefund, "convertedAmount"),
      credentialAlias: get(response_transaction, "credential_alias", ""),
      credentialId: get(response_transaction, "credential_id", ""),
      credentialMetadata: get(response_transaction, "credential_metadata", ""),
      customerMerchantId: get(response_transaction, "customer_merchant_id", ""),
      forceRefund: partialRefund.status,
      id: transactionId,
      integration: get(response[0], "integration", "aurus"),
      integrationMethod: get(response[0], "integration_method", ""),
      isSandboxTransaction:
        get(response[2], "sandboxEnable", false) &&
        process.env.USRV_STAGE !== EnvironmentEnum.PRIMARY,
      kushkiMetadata: authorizerContext.kushkiMetadata,
      ownerId: get(response_transaction, "owner_id", ""),
      partialVoid: defaultTo(partial_void, false),
      privateProcessorId: get(response[1], "private_id", ""),
      processorMerchantId: get(
        response_transaction,
        "processor_merchant_id",
        get(response[1], "processor_merchant_id", "")
      ),
      processorTransactionId: get(
        response_transaction,
        "processor_transaction_id"
      ),
      publicCredentialId: get(response_transaction, "public_credential_id", ""),
      purchaseNumber: get(response_transaction, "purchase_number"),
      recap: get(response_transaction, "recap"),
      requestAmount: partialRefund.requestAmount,
      saleApprovalCode: response_transaction.approval_code,
      saleCreated: response_transaction.created,
      saleTransactionReference: get(
        response_transaction,
        "transaction_reference",
        ""
      ),
      subMerchant: get(response_transaction, "subMerchant"),
      terminalId: get(response[1], "terminal_id", ""),
      transactionReference: transactionId,
      uniqueCode: get(response[1], "unique_code", ""),
      externalReferenceId: get(voidRequest, "externalReferenceId", undefined),
      metadata: defaultTo(
        get(voidRequest, "metadata", undefined),
        get(response_transaction, "metadata")
      ),
    };

    if (!isEmpty(get(response[1], "sub_mcc_code")))
      body.mccCode = get(response[1], "sub_mcc_code", "");

    if (processorChannel) body.processorChannel = processorChannel;

    if (webhooks) set(body, "webhooks", webhooks);

    this._logger.info("CardService | _buildPayloadInvokeVoid | body", body);

    return body;
  }

  private _checkCountryProcessorToPartialVoid(
    processorName: string,
    country: string
  ): boolean {
    const selected_country_processor: string = `${country}_${processorName.replace(
      " ",
      "_"
    )}`;
    const partial_void: string = defaultTo(
      PARTIAL_VOID_BY_COUNTRY_PROCESSOR[selected_country_processor],
      ""
    );

    return partial_void === MethodsEnum.PARTIAL_VOID;
  }

  private _refundCompleteTransaction(
    transaction: Transaction
  ): PartialTransactionRefund {
    if (transaction.currency_code === CurrencyEnum.UF) {
      const converted_amount: number = get(
        transaction,
        "converted_amount.totalAmount",
        0
      );

      return {
        convertedAmount: {
          currency: get(transaction, "converted_amount.currency"),
          totalAmount: converted_amount,
        },
        pendingAmount: 0,
        requestAmount: converted_amount,
        status: false,
      };
    }
    return {
      pendingAmount: 0,
      requestAmount: get(transaction, "request_amount", 0),
      status: false,
    };
  }

  private _getCaptureTrxFromPreauth(
    trx: Transaction
  ): Observable<Transaction | undefined> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => trx.transaction_type === TransactionTypeEnum.PREAUTH,
          this._queryTrx(
            IndexEnum.preauth_trx_reference_index,
            "preauth_transaction_reference",
            defaultTo(trx.transaction_reference, "reference")
          ),
          of([])
        )
      ),
      mergeMap((trxs: Transaction[]) =>
        iif(() => trxs.length > 0, of(trxs[0]), of(undefined))
      ),
      tag("CardService | _getCaptureTrxFromPreauth")
    );
  }

  private _checkPartialRefund(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    transaction: Transaction,
    merchant: DynamoMerchantFetch
  ): Observable<PartialTransactionRefund> {
    return of(1).pipe(
      mergeMap(() => {
        const transaction_currency: string = get(transaction, "currency_code");
        const amount: object = defaultTo(get(event.body, "amount"), {});
        const refund_currency: string = get(amount, "currency", "");
        const response: PartialTransactionRefund = {
          pendingAmount: 0,
          requestAmount: 0,
          status: false,
        };
        const pending_amount: number = defaultTo(
          get(transaction, "pendingAmount"),
          -1
        );

        if (isEmpty(amount)) {
          if (pending_amount !== -1) throw new KushkiError(ERRORS.E038);

          return of(this._refundCompleteTransaction(transaction));
        }

        if (refund_currency !== transaction_currency)
          throw new KushkiError(ERRORS.E042);

        const transaction_amount: number =
          transaction.approved_transaction_amount;

        return this._calculateAmountToRefund(
          amount,
          pending_amount,
          transaction_amount,
          response,
          merchant,
          transaction,
          refund_currency
        );
      }),
      tag("CardService | _checkPartialRefund")
    );
  }

  private _getAmountToRefund(
    amountToRefund: number,
    transaction: Transaction,
    refundCurrency: string
  ): [number, string] {
    if (amountToRefund === 0) throw new KushkiError(ERRORS.E039);

    if (refundCurrency === CurrencyEnum.UF) {
      const transaction_amount_uf: number = CardService.sFullAmount(
        transaction.amount
      );

      return [
        Math.trunc(
          (amountToRefund / transaction_amount_uf) *
            get(transaction, "converted_amount.totalAmount")
        ),
        CurrencyEnum.CLP,
      ];
    }
    return [amountToRefund, refundCurrency];
  }

  private _calculateAmountToRefund(
    amount: object,
    pendingAmount: number,
    transactionAmount: number,
    response: PartialTransactionRefund,
    merchant: DynamoMerchantFetch,
    transaction: Transaction,
    refundCurrency: string
  ): Observable<PartialTransactionRefund> {
    return of(1).pipe(
      mergeMap(() => {
        const requested_amount_to_refund: number = CardService.sFullAmount(
          <Amount>amount
        );
        const [amount_to_refund, converted_currency] = this._getAmountToRefund(
          requested_amount_to_refund,
          transaction,
          refundCurrency
        );
        const compare_value: number =
          pendingAmount === -1 ? transactionAmount : pendingAmount;

        if (amount_to_refund > compare_value)
          return throwError(() => new KushkiError(ERRORS.E023));

        response.requestAmount = amount_to_refund;

        if (amount_to_refund === transactionAmount) {
          response.convertedAmount =
            refundCurrency === CurrencyEnum.UF
              ? {
                  currency: converted_currency,
                  totalAmount: amount_to_refund,
                }
              : undefined;

          return of(response);
        }

        if (pendingAmount === -1) pendingAmount = 0;

        return of(
          this._buildPartialRefundByCountry(
            get(merchant, "country", ""),
            pendingAmount,
            transactionAmount,
            amount_to_refund,
            converted_currency,
            refundCurrency,
            get(transaction, "transaction_type", ""),
            transaction.processor_name,
            transaction.processor_channel
          )
        );
      }),
      tag("CardService | _calculateAmountToRefund")
    );
  }

  private _changeTokenTypeToSubscription(
    input: ChargeInput
  ): Observable<VaultResponse> {
    return of(1).pipe(
      mergeMap(() => {
        const vault_token: string | undefined = get(
          input.currentToken,
          "vaultToken"
        );

        const is_card_trx: boolean = get(
          input,
          "event.usrvOrigin",
          UsrvOriginEnum.CARD
        ).includes(UsrvOriginEnum.CARD);

        if (
          get(input, "event.saveCard", false) &&
          !isEmpty(vault_token) &&
          is_card_trx
        )
          return this._lambda.invokeFunction<{ body: { token: string } }>(
            `usrv-vault-${process.env.USRV_STAGE}-changeTokenType`,
            {
              body: {
                token: vault_token,
              },
            }
          );

        return of({ body: { token: undefined } });
      }),
      map((response: { body: { token?: string } }) => ({
        expiryMonth: get(input.currentToken, "expiryMonth"),
        expiryYear: get(input.currentToken, "expiryYear"),
        saveCard: get(input, "event.saveCard", false),
        vaultToken: get(response, "body.token"),
      })),
      tag("CardService | _changeTokenTypeToSubscription")
    );
  }

  private _invokeGetDeferredLambda(
    request: GetDeferredRequest
  ): Observable<IDeferredResponse[]> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<GetDeferredResponse>(
          `usrv-deferred-${process.env.USRV_STAGE}-getDeferred`,
          request
        )
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      map((response: GetDeferredResponse) => response.deferred),
      tag("CardService | _invokeGetDeferredLambda")
    );
  }

  private _buildPartialRefundByCountry(
    country: string,
    pendingAmount: number,
    transactionAmount: number,
    amountToRefund: number,
    convertedCurrency: string,
    refundCurrency: string,
    transactionType: string,
    processorName: string,
    processorChannel?: string
  ): PartialTransactionRefund {
    if (!AVAILABLE_COUNTRIES_PARTIAL_VOID.includes(country))
      throw new KushkiError(ERRORS.E041);

    if (PARTIAL_VOID_DISABLED_PROCESSOR.includes(processorName))
      throw new KushkiError(ERRORS.E041);

    const base_amount: number =
      pendingAmount === 0 ? transactionAmount : pendingAmount;

    const partial_refund: PartialTransactionRefund = {
      convertedAmount:
        country === CountryEnum.CHILE && refundCurrency === CurrencyEnum.UF
          ? {
              currency: convertedCurrency,
              totalAmount: amountToRefund,
            }
          : undefined,
      partialVoid: this._checkPartialVoid(country, processorName),
      pendingAmount: Number((base_amount - amountToRefund).toFixed(2)),
      requestAmount: amountToRefund,
      status: country !== CountryEnum.CHILE,
    };

    this._checkAmountsForRefund(
      partial_refund,
      processorName,
      transactionType,
      processorChannel
    );

    if (PARTIAL_VOID_PROCESSORS.includes(<ProcessorEnum>processorName))
      partial_refund.status = false;

    return partial_refund;
  }

  private _checkAmountsForRefund(
    partialRefund: PartialTransactionRefund,
    processorName: string,
    transactionType: string,
    processorChannel?: string
  ) {
    const processor_channel_crypto: string = "crypto";

    if (
      partialRefund.pendingAmount > 0 &&
      (processorChannel === processor_channel_crypto ||
        (processorName === ProcessorEnum.KUSHKI &&
          this._isInvalidTransactionTypeForPartialACQRefund(transactionType)))
    )
      throw new KushkiError(ERRORS.E041);
  }

  private _isInvalidTransactionTypeForPartialACQRefund(
    transactionType: string
  ): TransactionTypeEnum | undefined {
    const conditions: TransactionTypeEnum[] = [
      TransactionTypeEnum.REAUTH,
      TransactionTypeEnum.PREAUTH,
    ];

    return conditions.find(
      (condition: TransactionTypeEnum) => condition === transactionType
    );
  }

  private _checkPartialVoid(country: string, processorName: string): boolean {
    return (
      country === CountryEnum.CHILE ||
      PARTIAL_VOID_PROCESSORS.includes(<ProcessorEnum>processorName)
    );
  }

  private _setErrorMetadataFullResponseV2(
    error: KushkiError | AurusError,
    savedTrx: Transaction | undefined,
    trxReference: string,
    fullResponse: FullResponseType,
    usrvOrigin: string,
    currentToken?: DynamoTokenFetch
  ): KushkiError | AurusError {
    let metadata: object = error.getMetadata();

    unset(metadata, "security3Ds");

    metadata = {
      ...metadata,
      transactionReference: trxReference,
    };

    const is_subscription_trx: boolean = usrvOrigin.includes(
      UsrvOriginEnum.SUBSCRIPTIONS
    );
    if (
      fullResponse === "v2" &&
      savedTrx !== undefined &&
      !is_subscription_trx
    ) {
      metadata = {
        ...ResponseBuilder.getErrorMetadataV2(savedTrx, metadata, currentToken),
      };
      metadata = deepCleaner(metadata);
    }

    const merchants_without_trx_reference: string[] =
      `${process.env.DENY_TRX_REFERENCE}`.split(",");

    /* tslint:disable:no-string-literal */
    // istanbul ignore next
    if (
      merchants_without_trx_reference.includes(get(savedTrx, "merchant_id", ""))
    )
      delete metadata["transactionReference"];

    if (error instanceof KushkiError) error.setMetadata(metadata);
    else return new AurusError(error.code, error.getMessage(), metadata);

    return error;
  }

  private _checkSiftScience(
    transactionType: string,
    currentToken: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch
  ): boolean {
    return (
      (transactionType === TransactionRuleTypeEnum.CHARGE ||
        transactionType === TransactionRuleTypeEnum.PREAUTHORIZATION ||
        transactionType === TransactionRuleTypeEnum.DEFERRED ||
        transactionType === TransactionRuleTypeEnum.SUBSCRIPTION_VALIDATION) &&
      currentToken.userId !== undefined &&
      currentToken.sessionId !== undefined &&
      !isEmpty(get(currentMerchant, "sift_science.ProdAccountId"))
    );
  }

  private _isEnableDeferredOptions(merchant: DynamoMerchantFetch): boolean {
    if (
      includes(COUNTRIES_ALWAYS_ACTIVE_DEFERRED, get(merchant, "country", ""))
    )
      return true;

    const deferred_option: DeferredOption[] | boolean = get(
      merchant,
      "deferredOptions",
      false
    );

    if (typeof deferred_option === "boolean") return deferred_option;

    return !isEmpty(deferred_option);
  }

  private _setVaultTokenResponse(
    response: ChargesCardResponse | PreauthFullResponseV2,
    vaultResponse: VaultResponse
  ): ChargesCardResponse | PreauthFullResponseV2 {
    if (
      get(vaultResponse, "saveCard", false) &&
      !isEmpty(get(vaultResponse, "vaultToken"))
    ) {
      set(response, "vaultToken", get(vaultResponse, "vaultToken"));
      set(response, "expiryYear", get(vaultResponse, "expiryYear"));
      set(response, "expiryMonth", get(vaultResponse, "expiryMonth"));
    }

    return response;
  }

  private _isKushkiInternational(
    processor: DynamoProcessorFetch,
    request: UnifiedChargesPreauthRequest
  ): boolean {
    const merchant_country: string = UtilsService.getCountryISO(
      get(request, MERCHANT_COUNTRY)
    );
    const card_country: string = UtilsService.getCountryISO(
      get(request, COUNTRY_NAME)
    );
    const is_local: boolean = isEqual(
      merchant_country.toUpperCase(),
      card_country.toUpperCase()
    );

    return (
      isEqual(request.usrvOrigin, UsrvOriginEnum.CARD) &&
      isEqual(processor.processor_name, ProcessorEnum.KUSHKI) &&
      !is_local
    );
  }

  private _isDeferred(request: UnifiedChargesPreauthRequest): boolean {
    const deferred_months: number = get(request, DEFERRED_MONTHS_PATH, 0);
    const has_months: boolean = get(request, "months", deferred_months) > 1;

    return Boolean(request.isDeferred) || has_months;
  }

  private _checkAft(
    processor: DynamoProcessorFetch,
    request: UnifiedChargesPreauthRequest
  ): boolean {
    const sub_mcc_code: string = get(processor, "sub_mcc_code", "").trim();

    const mcc_include: boolean = JSON.parse(`${process.env.AFT_MCC}`).includes(
      sub_mcc_code
    );

    const brand: string = get(request, BIN_BRAND, "").trim().toUpperCase();

    return (
      mcc_include &&
      brand === CardBrandEnum.VISA.toUpperCase() &&
      processor.processor_name === ProcessorEnum.KUSHKI
    );
  }

  private _validateExternalThreeDSData(
    request: UnifiedChargesPreauthRequest,
    cardBrand: string
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        of(
          isEqual(cardBrand.toUpperCase(), CardBrandEnum.VISA.toUpperCase())
            ? CustomValidators.validateThreeDSExternalDataByVisa(
                request.threeDomainSecure!
              )
            : CustomValidators.validateThreeDSExternalDataByMC(
                request.threeDomainSecure!
              )
        )
      ),
      mergeMap((res: boolean) => {
        if (!res)
          return throwError(
            () =>
              new KushkiError(ERRORS.E001, ERRORS.E001.message, {
                ...this._buildGenericErrorInChargeResponse(request, "K001"),
              })
          );

        return of(true);
      }),
      tag("CardService | _validateExternalThreeDSData")
    );
  }

  private _validateExternalThreeDSResponse(
    threeDSData: ThreeDomainSecure,
    cardBrand: string
  ): boolean {
    if (defaultTo(threeDSData.acceptRisk, false)) return true;

    if (isEqual(cardBrand.toUpperCase(), CardBrandEnum.VISA.toUpperCase()))
      return VALID_ECI_FOR_VISA.includes(threeDSData.eci);

    return VALID_ECI_FOR_MC.includes(threeDSData.eci);
  }

  private _buildGenericErrorInChargeResponse(
    request: UnifiedChargesPreauthRequest,
    processorCode: string
  ): object {
    return {
      processorCode,
      approvalCode: "",
      binCard: get(request, BIN_PATH, ""),
      cardHolderName: get(request, "cardHolderName", ""),
      cardType: get(request, CARD_TYPE_PATH, ""),
      lastFourDigitsOfCard: get(request, "lastFourDigits", ""),
      merchantName: get(request, "merchant.merchantName", ""),
      processorBankName: "",
      processorName: "NA",
    };
  }

  private _buildChargeInputForError(
    request: UnifiedChargesPreauthRequest,
    context: Context
  ): ChargeInput {
    return {
      amount: request.amount,
      authorizerContext: request.authorizerContext,
      currentMerchant: {
        country: get(request, MERCHANT_COUNTRY),
        merchant_name: request.merchant.merchantName,
        public_id: request.merchant.merchantId,
        sift_science: {},
      },
      currentToken: request.tokenObject,
      event: request,
      isFailoverRetry: false,
      lambdaContext: context,
      plccInfo: { brand: "", flag: "" },
      processor: {
        created: 0,
        merchant_id: request.merchant.merchantId,
        private_id: "",
        processor_name: "",
        processor_type: "",
        public_id: "",
      },
      tokenType: "",
      transactionType: "",
      trxRuleResponse: {
        body: {
          privateId: "",
          processor: "",
          publicId: "",
        },
      },
    };
  }

  // tslint:disable-next-line:max-func-body-length cognitive-complexity
  private _unifiedChargesPreauthValidations(
    request: UnifiedChargesPreauthRequest,
    context: Context,
    token_fetch: DynamoTokenFetch,
    current_merchant: DynamoMerchantFetch,
    is_otp: boolean
  ): Observable<
    [
      DynamoTokenFetch,
      UnifiedChargesPreauthRequest,
      [ConvertionResponse, Amount]
    ]
  > {
    const is_commission: boolean = Boolean(
      request.usrvOrigin === UsrvOriginEnum.COMMISSION
    );
    const is_subscription_validation: boolean = get(
      request,
      this._subscriptionValidationPath,
      false
    );

    const is_subscription: boolean =
      Boolean(request.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !isEmpty(request.vaultToken) &&
      !is_subscription_validation;

    console.log("TokenFetch | _handleUnifiedChargesPreauth", token_fetch);
    console.log(UNIFIED_CHARGE_TAG, omit(request, PRIVATE_PATHS_OMIT));
    const is_card_transaction: boolean = get(
      request,
      "usrvOrigin",
      UsrvOriginEnum.CARD
    ).includes(UsrvOriginEnum.CARD);

    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => !!request.tokenAlreadyUsed,
          throwError(
            new AurusError(
              AurusErrorCodeEnum.AURUS577,
              AURUS_ERROR_MESSAGE_TOKEN,
              {
                ...this._buildGenericErrorInChargeResponse(
                  request,
                  AurusErrorCodeEnum.AURUS577
                ),
              }
            )
          ),
          of(true)
        )
      ),
      mergeMap(() =>
        iif(
          () =>
            !isEmpty(request.threeDomainSecure) &&
            isUndefined(request.secureService),
          this._validateExternalThreeDSData(
            request,
            get(token_fetch, BIN_BRAND)
          ),
          of(true)
        )
      ),
      catchError((error: Error) =>
        this._checkForErrorInCharge(
          error,
          this._buildChargeInputForError(request, context)
        )
      ),
      mergeMap(() => {
        if (
          is_commission ||
          is_subscription_validation ||
          is_otp ||
          is_subscription
        )
          return this._handleNewToken(
            current_merchant,
            request,
            is_subscription_validation,
            is_otp,
            is_subscription
          );

        return of(token_fetch);
      }),
      mergeMap((token: DynamoTokenFetch) => {
        token_fetch = token;
        request.tokenObject = token;
        request.binInfo = token.binInfo;
        request.tokenId = token_fetch.id;
        return forkJoin(
          of(token),
          of(request),
          this._verifyDeferredAndTokenConditions(
            current_merchant,
            token_fetch,
            request
          )
        );
      })
    );
  }

  private _mapFromTokenlessToUnifiedRequest(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >,
    tokenDynamo: TokenDynamo,
    merchantDynamo: DynamoMerchantFetch,
    hierarchyMerchant: DynamoMerchantFetch | undefined,
    transactionRuleProcessor: LambdaTransactionRuleResponse,
    baseTokenInfo: BaseTokenInfo,
    transactionType: TransactionRuleTypeEnum
  ): UnifiedChargesPreauthRequest {
    const request: TokenlessChargeCardBody = event.body;
    const is_preauth =
      transactionType === TransactionRuleTypeEnum.PREAUTHORIZATION;

    if (
      isEmpty(get(request, "initialRecurrenceReference")) &&
      tokenDynamo.transactionMode === TransactionModeEnum.SUBSEQUENT_RECURRENCE
    )
      throw new KushkiError(ERRORS.E053);

    const unified_request: UnifiedChargesPreauthRequest = {
      ...event.body,
      transactionType,
      airlineCode: get(request, "airlineCode"),
      authorizerContext: {
        ...get(event, "requestContext.authorizer"),
        hierarchyConfig: JSON.parse(
          get(event, this._requestHierarchyConfig, "{}")
        ),
      },
      binInfo: get(tokenDynamo, "binInfo"),
      cardHolderName: get(tokenDynamo, "cardHolderName", ""),
      convertionResponse: get(baseTokenInfo, "convertionResponse"),
      convertedAmount: get(baseTokenInfo, "convertedAmount"),
      credentialId: get(event, this._requestcontextcredentialId),
      ...(request.citMit ? { citMit: get(request, "citMit") } : {}),
      expiryMonth: get(tokenDynamo, "expiryMonth"),
      expiryYear: get(tokenDynamo, "expiryYear"),
      externalSubscriptionID: get(request, "externalSubscriptionID"),
      failOverToken: get(tokenDynamo, "failoverToken"),
      ignoreWarnings: get(request, "ignoreWarnings", false),
      ip: get(tokenDynamo, "ip"),
      isBlockedCard: get(tokenDynamo, "isBlockedCard", false),
      isDeferred: get(tokenDynamo, "isDeferred", false),
      isOCT: this._isOCTApiGatewayPath(event.path),
      isPreauth: is_preauth,
      isTokenless: baseTokenInfo.isTokenless,
      lastFourDigits: get(tokenDynamo, "lastFourDigits"),
      maskedCardNumber: get(tokenDynamo, "maskedCardNumber"),
      merchant: {
        ...merchantDynamo,
        country: get(merchantDynamo, "country"),
        deferredOptions: !isUndefined(hierarchyMerchant)
          ? get(hierarchyMerchant, "deferredOptions")
          : get(merchantDynamo, "deferredOptions"),
        merchantId: get(
          merchantDynamo,
          "public_id",
          event.requestContext.authorizer.merchantId
        ),
        merchantName: get(merchantDynamo, "merchant_name"),
        sandboxEnable: get(merchantDynamo, "sandboxEnable"),
        siftScience: get(merchantDynamo, "sift_science"),
        taxId: get(merchantDynamo, "taxId"),
        whiteList: get(merchantDynamo, "whiteList"),
      },
      merchantCountry: get(merchantDynamo, "country"),
      merchantId: get(
        merchantDynamo,
        "public_id",
        get(event, MERCHANT_ID_AUTHORIZER, "")
      ),
      metadata: get(request, "metadata", {}),
      paymentBrand: get(tokenDynamo, BIN_BRAND),
      processorToken: get(request, "initialRecurrenceReference"),
      productDetails: get(request, "productDetails"),
      secureId: get(tokenDynamo, "secureId"),
      secureService: get(tokenDynamo, "secureService"),
      sessionId: get(tokenDynamo, "sessionId"),
      settlement: get(tokenDynamo, "settlement"),
      subMerchant: get(request, "subMerchant") as SubMerchantDynamo | undefined,
      threeDomainSecure: get(request, "threeDomainSecure") as
        | ThreeDomainSecureRequestObject
        | undefined,
      token: tokenDynamo.id,
      tokenAlreadyUsed: get(tokenDynamo, "alreadyUsed", false),
      tokenCreated: get(tokenDynamo, "created"),
      tokenCurrency: get(tokenDynamo, "currency"),
      tokenId: get(tokenDynamo, "id"),
      tokenObject: { ...tokenDynamo, ip: get(tokenDynamo, "ip", "") },
      tokenType: TokenTypeEnum.TRANSACTION,
      transactionCardHolderName: get(tokenDynamo, "cardHolderName", ""),
      transactionCardId: get(tokenDynamo, "transactionCardId", ""),
      transactionEmail: get(request, "contactDetails.email", ""),
      transactionKind: TransactionKindEnum.CARD,
      transactionPhoneNumber: get(request, "contactDetails.phoneNumber", ""),
      transactionReference: baseTokenInfo.transactionReference,
      transactionRuleResponse: { body: transactionRuleProcessor },
      userAgent: get(tokenDynamo, "userAgent"),
      userId: get(tokenDynamo, "userId"),
      usrvOrigin: defaultTo(process.env.USRV_NAME, "usrv-card"),
      vaultToken: get(tokenDynamo, "vaultToken"),
    };

    set(request, TOTAL_AMOUNT, baseTokenInfo.totalAmount);

    return unified_request;
  }

  private _isValidCitMit(
    request: TokenlessChargeCardBody | ChargesCardRequest,
    totalAmount: number
  ): boolean {
    if (!has(request, CitMitEnum.citMit)) {
      return true;
    }

    return this._validateCitMit(request, totalAmount);
  }

  private _tokenlessTransactionByType(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >,
    transactionType: TransactionRuleTypeEnum,
    context: Context
  ): Observable<object> {
    let base_token_info: BaseTokenInfo = {
      isTokenless: true,
      totalAmount: CardService.sFullAmount(event.body.amount),
      transactionReference: v4(),
      transactionCreated: new Date().getTime(),
    };
    const request: TokenlessChargeCardBody = event.body;
    let merchant_dynamo: DynamoMerchantFetch;
    let transaction_rule_response: LambdaTransactionRuleResponse;

    return of(1).pipe(
      mergeMap(() => this._checkConvertedAmount(event.body.amount)),
      mergeMap(([response, amount]: [ConvertionResponse, Amount]) => {
        base_token_info = {
          ...base_token_info,
          convertionResponse: { ...response },
          convertedAmount: { ...amount },
        };

        return iif(
          () => this._isValidCitMit(request, base_token_info.totalAmount),
          of(true),
          throwError(() => new KushkiError(ERRORS.E001))
        );
      }),
      mergeMap(() =>
        this._getMerchant(event.requestContext.authorizer.merchantId)
      ),
      mergeMap((merchant: DynamoMerchantFetch) => {
        merchant_dynamo = merchant;

        return forkJoin([
          of(merchant),
          this._invokeTransactionRuleProcessor({
            ...this._getProcessorRequest(event, merchant, base_token_info),
          }),
        ]);
      }),
      mergeMap(
        ([merchant, transactionRule]: [
          DynamoMerchantFetch,
          LambdaTransactionRuleResponse
        ]) => {
          transaction_rule_response = transactionRule;

          return forkJoin([
            this._getDeferredHierarchyMerchant(event),
            this._createTokenLessToken(
              event,
              merchant,
              transactionRule,
              base_token_info
            ),
          ]);
        }
      ),
      catchError((err: KushkiError) => {
        const avoid_save_errors: string[] = ["K001", "K004", "K027"];

        if (
          isUndefined(merchant_dynamo) &&
          avoid_save_errors.includes(err.code)
        ) {
          return throwError(() => err);
        }

        const ip: string =
          get(event.headers, "X-FORWARDED-FOR") || "".split(",")[0].trim();
        const merchant_id = event.requestContext.authorizer.merchantId;
        const processor: DynamoProcessorFetch = this._buildDynamoProcessor(
          { body: transaction_rule_response },
          merchant_id
        );
        const dynamoToken: DynamoTokenFetch = {
          ip,
          amount: base_token_info.totalAmount,
          bin: defaultTo(
            get(request, BIN_PATH),
            defaultTo(get(request, "cardInfo.bin"), "XXXXXX")
          ).replace(/\D/g, ""),
          created: 0,
          currency: get(request, CURRENCY_PATH, "").toString(),
          id: "",
          lastFourDigits: request.cardInfo.lastFourDigits,
          maskedCardNumber: request.cardInfo.maskedCardNumber,
          merchantId: merchant_id,
          transactionReference: base_token_info.transactionReference,
        };
        set(event, "isTokenless", base_token_info.isTokenless);

        return this._handleTrxRuleChargeError(
          err,
          request,
          event.requestContext.authorizer,
          processor,
          dynamoToken,
          merchant_dynamo,
          request.fullResponse,
          transactionType,
          base_token_info.isTokenless,
          {
            ip,
            maskedCardNumber: get(event.body, CARD_INFO_MASKED_CARD_NUMBER, ""),
          }
        );
      }),
      mergeMap(
        ([hierarchyMerchantDynamo, tokenDynamo]: [
          DynamoMerchantFetch | undefined,
          TokenDynamo
        ]) => {
          const unified_request: UnifiedChargesPreauthRequest =
            this._mapFromTokenlessToUnifiedRequest(
              event,
              tokenDynamo,
              merchant_dynamo,
              hierarchyMerchantDynamo,
              transaction_rule_response,
              base_token_info,
              transactionType
            );

          return this.unifiedChargesOrPreAuth(unified_request, context);
        }
      ),
      tag("CardService | _tokenlessChargeByTransactionType")
    );
  }

  private _getDeferredHierarchyMerchant(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >
  ): Observable<DynamoMerchantFetch | undefined> {
    const hierarchy_config: HierarchyConfig = JSON.parse(
      get(event, this._requestHierarchyConfig, "{}")
    );
    const deferred_merchant_id: string = get(
      hierarchy_config,
      this._processingDeferred,
      ""
    );

    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => isEmpty(deferred_merchant_id),
          defer(() => of(undefined)),
          defer(() => this._getMerchant(deferred_merchant_id))
        )
      ),
      tag("CardService | _getDeferredHierarchyMerchant")
    );
  }

  private _handleUnifiedChargesPreauth(
    request: UnifiedChargesPreauthRequest,
    context: Context
  ): Observable<object> {
    const current_merchant: DynamoMerchantFetch =
      this._buildDynamoMerchant(request);
    const is_otp: boolean = Boolean(
      request.usrvOrigin === UsrvOriginEnum.TRX_RULE
    );
    let converted_amount: Amount | undefined;
    let processor: DynamoProcessorFetch;
    let token_fetch: DynamoTokenFetch = {
      ...this._buildBodyTokenFetch(request),
      ...request.tokenObject,
    };

    this._logger.info("TokenFetch | _handleUnifiedChargesPreauth", token_fetch);
    this._logger.info(UNIFIED_CHARGE_TAG, request);
    const is_card_transaction: boolean = get(
      request,
      "usrvOrigin",
      UsrvOriginEnum.CARD
    ).includes(UsrvOriginEnum.CARD);

    return of(1).pipe(
      mergeMap(() =>
        this._prepareUnifiedChargePreauth(
          request,
          context,
          token_fetch,
          current_merchant,
          is_otp
        )
      ),
      mergeMap(
        ([convertedAmount, data, amount, modifiedRequest, modifiedToken]: [
          Amount | undefined,
          InvokeTrxRuleResponse,
          Amount,
          UnifiedChargesPreauthRequest,
          DynamoTokenFetch
        ]) => {
          converted_amount = convertedAmount;
          request = modifiedRequest;
          token_fetch = modifiedToken;
          const ksk_acq_vars: KushkiAcqVars = JSON.parse(
            `${process.env.KUSHKI_ADQUIRER_VARS}`
          );
          const is_kushki_international: boolean = this._isKushkiInternational(
            data.processor,
            request
          );
          const is_deferred: boolean = this._isDeferred(request);
          const trx_type: TransactionTypeEnum = request.isPreauth
            ? TransactionTypeEnum.PREAUTH
            : TransactionTypeEnum.CHARGE;

          if (
            is_kushki_international &&
            is_deferred &&
            ksk_acq_vars.SWITCH_INT_DEFERRED
          ) {
            set(request, TOKEN_DEFERRED_PATH, false);
            set(request, "transactionType", trx_type);
            set(request, "isDeferred", false);
            unset(request, "months");
            unset(request, "deferred");
          }
          unset(request, "isPreauth");
          unset(request, "convertionResponse");

          return forkJoin([of(data), of(amount)]);
        }
      ),
      mergeMap(([data, amount]: [InvokeTrxRuleResponse, Amount]) => {
        const deferred_options = request.merchant.deferredOptions;

        processor = data.processor;
        this._putTracerData({
          country: get(request, "merchant.country", ""),
          currency: get(request, CURRENCY_PATH, ""),
          merchantId: request.merchant.merchantId,
          merchantName: request.merchant.merchantName,
          processorName: processor.processor_name,
          transactionReference: request.tokenObject.transactionReference,
          transactionType: request.transactionType,
        });
        this._validateExternalSubscription(request, data);
        this._setSubMerchantInUnifiedRequest(
          request,
          data.trxRuleResponse.body
        );

        const is_aft: boolean = this._checkAft(processor, request);
        const trx_rule_currency = get(
          data,
          "trxRuleResponse.body.currencyCode"
        );

        if (
          !isEmpty(trx_rule_currency) &&
          !isUndefined(trx_rule_currency) &&
          !isEmpty(
            get(converted_amount, "currency", request.amount.currency)
          ) &&
          !isUndefined(
            get(converted_amount, "currency", request.amount.currency)
          ) &&
          trx_rule_currency !==
            get(converted_amount, "currency", request.amount.currency)
        )
          return throwError(() => new KushkiError(ERRORS.E055));

        if (
          is_aft &&
          request.transactionType.toUpperCase() === TransactionTypeEnum.PREAUTH
        )
          return throwError(
            () => new KushkiError(ERRORS.E041, ERRORS.E041.message)
          );

        if (is_aft && request.isDeferred)
          return throwError(
            () => new KushkiError(ERRORS.E901, ERRORS.E901.message)
          );

        if (is_aft) set(request, "isAft", is_aft);

        return iif(
          () => is_card_transaction,
          iif(
            () => processor.processor_name === ProcessorEnum.FIS,
            this._validateDeferredBrazil(
              request.deferred,
              deferred_options,
              data,
              amount,
              request.transactionType,
              request.merchant.merchantId
            ),
            this._validateCentralAmericaDeferred(
              request.deferred,
              processor.processor_name,
              deferred_options,
              data,
              amount
            )
          ),
          forkJoin([of(data), of(amount)])
        );
      }),
      mergeMap(([data, amount]: [InvokeTrxRuleResponse, Amount]) => {
        if (
          this.isValidCurrency(request.tokenCurrency, request.amount.currency)
        )
          throw new KushkiError(ERRORS.E205);
        return forkJoin([of(data), of(amount)]);
      }),
      catchError((err: Error) =>
        this._handleTrxRuleChargeError(
          err,
          request,
          request.authorizerContext,
          processor,
          token_fetch,
          current_merchant,
          request.fullResponse,
          <TransactionRuleTypeEnum>request.transactionType,
          false,
          {
            ip: get(token_fetch, "ip", ""),
            maskedCardNumber: get(token_fetch, "maskedCardNumber", ""),
          }
        )
      ),
      concatMap(([data, amount]: [InvokeTrxRuleResponse, Amount]) => {
        processor = data.processor;
        const has_active_3ds: boolean = !isEmpty(
          get(data, "trxRuleResponse.body.cybersource")
        );

        if (has_active_3ds) {
          const cybersource: Cybersource = this._createCybersourceData(data);

          this._logger.info(CYBERSOURCE_TAG, cybersource);
          set(token_fetch, "3ds", cybersource);
        }

        if (!has_active_3ds && !isEmpty(get(request, "threeDomainSecure"))) {
          const cybersource: Cybersource =
            this._createCybersourceDataFromRequest(request);

          this._logger.info("CardService | cybersource", cybersource);
          set(token_fetch, "3ds", cybersource);
        }

        return forkJoin([
          of(data),
          of(amount),
          this._checkExpirationCardTime(request),
        ]);
      }),
      concatMap(
        ([data, amount, is_invalid_card]: [
          InvokeTrxRuleResponse,
          Amount,
          boolean
        ]) => {
          if (is_invalid_card)
            return throwError(
              () =>
                new KushkiError(ERRORS.E017, ERRORS.E017.message, {
                  data,
                  processorName: processor.processor_name,
                  transactionReference: request.transactionReference,
                })
            );

          if (
            amount.currency === CurrencyEnum.MXN &&
            processor.processor_name !== ProcessorEnum.PROSA &&
            processor.processor_name !== ProcessorEnum.KUSHKI &&
            request.deferred !== undefined &&
            request.transactionType ===
              TransactionRuleTypeEnum.PREAUTHORIZATION &&
            is_card_transaction
          )
            return throwError(
              () => new KushkiError(ERRORS.E901, ERRORS.E901.message, {})
            );

          return this._handleProcessCharge(
            amount,
            token_fetch,
            current_merchant,
            <TransactionRuleTypeEnum>request.transactionType,
            request,
            request.authorizerContext,
            data,
            context,
            <TokenTypeEnum>request.tokenType,
            converted_amount
          );
        }
      ),
      catchError((err: Error) =>
        iif(
          () => err instanceof KushkiError && err.code === "K017",
          this._handleDeclineTrxByExpirationDate(
            <KushkiError>err,
            request,
            token_fetch,
            current_merchant,
            context,
            converted_amount
          ),
          throwError(() => err)
        )
      ),
      tag("CardService | _handleUnifiedChargesPreauth")
    );
  }

  private _conditionalCallTransactionRule(
    request: UnifiedChargesPreauthRequest,
    isOtp: boolean
  ): Observable<InvokeTrxRuleResponse> {
    const existing_transaction_rule:
      | LambdaTransactionRuleBodyResponse
      | undefined = get(request, "transactionRuleResponse");

    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => !isUndefined(existing_transaction_rule),
          defer(() =>
            this._prepareTransactionRuleResponsePlcc(
              request,
              existing_transaction_rule!
            )
          ),
          defer(() => this._invokeTrxRule(request, isOtp))
        )
      ),
      tag("CardService | _conditionalCallTransactionRule")
    );
  }

  private _prepareUnifiedChargePreauth(
    request: UnifiedChargesPreauthRequest,
    context: Context,
    token_fetch: DynamoTokenFetch,
    current_merchant: DynamoMerchantFetch,
    is_otp: boolean
  ): Observable<
    [
      Amount | undefined,
      InvokeTrxRuleResponse,
      Amount,
      UnifiedChargesPreauthRequest,
      DynamoTokenFetch
    ]
  > {
    return of(1).pipe(
      switchMap(() =>
        this._unifiedChargesPreauthValidations(
          request,
          context,
          token_fetch,
          current_merchant,
          is_otp
        )
      ),
      switchMap(
        ([modifiedToken, modifiedRequest, [response, amount]]: [
          DynamoTokenFetch,
          UnifiedChargesPreauthRequest,
          [ConvertionResponse, Amount]
        ]) => {
          this._validateTokenizedDeferredTrx(modifiedRequest, modifiedToken);

          return forkJoin([
            of(this._getConvertedAmount(modifiedRequest, response)),
            this._conditionalCallTransactionRule(modifiedRequest, is_otp),
            of(amount),
            of(modifiedRequest),
            of(modifiedToken),
          ]);
        }
      )
    );
  }

  private _handleDeclineTrxByExpirationDate(
    err: KushkiError,
    request: UnifiedChargesPreauthRequest,
    tokenFetch: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch,
    context: Context,
    convertedAmount: Amount | undefined
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const input: ChargeInput = UtilsService.buildChargeInput(
          request.amount,
          tokenFetch,
          currentMerchant,
          <TransactionRuleTypeEnum>request.transactionType,
          request,
          request.authorizerContext,
          get(err.getMetadata(), "data")!,
          context,
          <TokenTypeEnum>request.tokenType,
          convertedAmount
        );

        delete err.getMetadata()["data"];

        return this._checkForErrorInCharge(err, input);
      }),
      tag("CardService | _handleDeclineTrxByExpirationDate")
    );
  }

  private _buildDynamoMerchant(
    request: UnifiedChargesPreauthRequest
  ): DynamoMerchantFetch {
    return {
      ...request.merchant,
      merchant_name: request.merchant.merchantName,
      public_id: request.merchant.merchantId,
      sift_science: get(request, "merchant.siftScience"),
    };
  }

  private _validateTokenizedDeferredTrx(
    request: UnifiedChargesPreauthRequest,
    tokenFetch: DynamoTokenFetch
  ) {
    if (
      tokenFetch.isDeferred &&
      request.deferred === undefined &&
      request.months === undefined
    ) {
      this._rollbar.critical("Transacción tokenizada como diferido.");
      throw new KushkiError(ERRORS.E013);
    }
  }

  private _validateCentralAmericaDeferred(
    deferred: Deferred | undefined,
    processorName: string,
    deferredOptions: DeferredOptionsType,
    data: InvokeTrxRuleResponse,
    amount: Amount
  ): Observable<[InvokeTrxRuleResponse, Amount]> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () =>
            this._validateCentralAmericaWithProcessorAndDeferredOptions(
              processorName,
              ProcessorEnum.CREDOMATIC,
              deferredOptions,
              deferred
            ),
          this._deferredOptionsError(),
          forkJoin([of(data), of(amount)])
        )
      ),
      tag("CardService | _validateCentralAmericaDeferred")
    );
  }

  private _validateDeferredBrazil(
    deferred: Deferred | undefined,
    deferredOptions: DeferredOptionsType,
    data: InvokeTrxRuleResponse,
    amount: Amount,
    transactionType: string,
    merchantId: string
  ): Observable<[InvokeTrxRuleResponse, Amount]> {
    return of(1).pipe(
      mergeMap(() =>
        UtilsService.validateRequestHierarchyMerchant(
          this._storage,
          this._logger,
          merchantId,
          HierarchyEnum.CN010
        )
      ),
      mergeMap((merchantNodeId: string) =>
        UtilsService.getCustomerInfo(
          this._storage,
          this._logger,
          merchantNodeId
        )
      ),
      mergeMap((merchant: DynamoMerchantFetch | undefined) =>
        iif(
          () => merchant !== undefined && !isEmpty(merchant.deferredOptions),
          of(get(merchant, "deferredOptions", [])),
          of(deferredOptions)
        )
      ),
      mergeMap((deferredOp: DeferredOptionsType) =>
        iif(
          () =>
            this._validateBrazilDeferredOptions(
              deferredOp,
              deferred,
              transactionType
            ),
          forkJoin([of(data), of(amount)]),
          this._deferredOptionsError(true)
        )
      ),
      tag("CardService | _validateDeferredBrazil")
    );
  }

  private _verifyDeferredAndTokenConditions(
    currentMerchant: DynamoMerchantFetch,
    tokenFetch: DynamoTokenFetch,
    request: UnifiedChargesPreauthRequest
  ): Observable<[ConvertionResponse, Amount]> {
    return of(1).pipe(
      mergeMap(() => {
        if (
          request.transactionType === TransactionRuleTypeEnum.DEFERRED &&
          !this._isEnableDeferredOptions(currentMerchant)
        )
          throw new KushkiError(ERRORS.E028);

        return iif(
          () =>
            this._validateThresholdAmount(
              tokenFetch,
              request.amount,
              currentMerchant
            ),
          this._handleThresholdAmountError(),
          this._validateTokenlessAmount(request)
        );
      }),
      tag("CardService | _verifyDeferredAndTokenConditions")
    );
  }

  private _validateTokenlessAmount(
    request: UnifiedChargesPreauthRequest
  ): Observable<[ConvertionResponse, Amount]> {
    if (get(request, "isTokenless", false))
      return of([request.convertionResponse!, request.convertedAmount!]);
    return this._checkConvertedAmount(request.amount);
  }

  private _buildBodyTokenFetch(
    request: UnifiedChargesPreauthRequest
  ): DynamoTokenFetch {
    return <DynamoTokenFetch>omitBy(
      {
        "3ds": request["3ds"],
        amount: get(request, TOTAL_AMOUNT, 0),
        bin: get(request, BIN_PATH),
        binInfo: request.binInfo,
        cardHolderName: request.cardHolderName,
        created: request.tokenCreated,
        currency: request.tokenCurrency,
        expiryMonth: get(request, "expiryMonth", ""),
        expiryYear: get(request, "expiryYear", ""),
        failoverToken: request.failOverToken,
        id: request.tokenId,
        ip: request.ip,
        isDeferred: Boolean(request.isDeferred),
        lastFourDigits: request.lastFourDigits,
        maskedCardNumber: request.maskedCardNumber,
        merchantId: request.merchant.merchantId,
        secureId: request.secureId,
        secureService: request.secureService,
        sessionId: request.sessionId,
        settlement: get(request, "settlement"),
        tokenType: request.tokenType,
        transactionCardId: request.transactionCardId,
        transactionReference: request.transactionReference,
        userAgent: request.userAgent,
        userId: get(request, "userId", ""),
        vaultToken: request.vaultToken,
      },
      isUndefined
    );
  }

  private _buildUnifiedChargePreauthRequest(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    preauth: boolean
  ): Observable<UnifiedChargesPreauthRequest> {
    return of(1).pipe(
      mergeMap(() => {
        const is_valid_path: boolean = this._validateEventPathActive(
          get(event, "path", "")
        );

        if (!is_valid_path) throw new KushkiError(ERRORS.E041);

        const hierarchy_config: HierarchyConfig = JSON.parse(
          get(event, this._requestHierarchyConfig, "{}")
        );
        const deferred: string = get(
          hierarchy_config,
          this._processingDeferred,
          ""
        );

        if (!isEmpty(deferred)) return this._getMerchant(deferred);

        return of(undefined);
      }),
      mergeMap((hierarchyMerchant: DynamoMerchantFetch | undefined) => {
        const auth_merchant: string =
          event.requestContext.authorizer.merchantId;

        return forkJoin([
          this._getMerchant(auth_merchant),
          of(hierarchyMerchant),
        ]);
      }),
      mergeMap(
        ([merchant, hierarchy_merchant]: [
          DynamoMerchantFetch,
          DynamoMerchantFetch | undefined
        ]) => {
          const transaction_type: TransactionRuleTypeEnum =
            this._getTransactionRuleType(event.body, preauth);

          return forkJoin([
            this._getToken(event),
            of(merchant),
            of(transaction_type),
            of(hierarchy_merchant),
          ]);
        }
      ),
      mergeMap(
        ([token, merchant, transaction_type, hierarchy_merchant]: [
          DynamoTokenFetch,
          DynamoMerchantFetch,
          TransactionRuleTypeEnum,
          DynamoMerchantFetch | undefined
        ]) =>
          this._mapUnifiedChargeValues(
            event,
            merchant,
            token,
            transaction_type,
            hierarchy_merchant,
            preauth
          )
      ),
      tag("CardService | _buildUnifiedChargePreauthRequest")
    );
  }

  private _mapUnifiedChargeValues(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    merchant: DynamoMerchantFetch,
    token: DynamoTokenFetch,
    transactionType: TransactionRuleTypeEnum,
    hierarchyMerchant: DynamoMerchantFetch | undefined,
    isPreauth: boolean
  ): Observable<UnifiedChargesPreauthRequest> {
    return of(1).pipe(
      // tslint:disable-next-line:max-func-body-length
      mergeMap(() => {
        if (
          isEmpty(get(event, "body.initialRecurrenceReference")) &&
          token.transactionMode === TransactionModeEnum.SUBSEQUENT_RECURRENCE
        )
          throw new KushkiError(ERRORS.E053);

        if (isEmpty(get(event, "body.amount.currency")))
          set(event, "body.amount.currency", token.currency);

        const total_amount: number =
          event.body.amount.iva +
          event.body.amount.subtotalIva +
          event.body.amount.subtotalIva0;

        const request: UnifiedChargesPreauthRequest = {
          ...event.body,
          isPreauth,
          transactionType,
          airlineCode: get(event, "body.airlineCode"),
          authorizerContext: {
            ...get(event, "requestContext.authorizer"),
            hierarchyConfig: JSON.parse(
              get(event, this._requestHierarchyConfig, "{}")
            ),
            merchantData: JSON.parse(
              get(event, this._requestMerchantData, "{}")
            ),
          },
          binInfo: get(token, "binInfo"),
          cardHolderName: get(token, "cardHolderName", ""),
          constitutionalCountry: get(merchant, "constitutionalCountry"),
          credentialId: get(event, this._requestcontextcredentialId),
          expiryMonth: get(token, "expiryMonth"),
          expiryYear: get(token, "expiryYear"),
          externalSubscriptionID: get(event, "body.externalSubscriptionID"),
          failOverToken: get(token, "failoverToken"),
          ignoreWarnings: get(event, "body.ignoreWarnings", false),
          ip: get(token, "ip"),
          isBlockedCard: get(token, "isBlockedCard", false),
          isDeferred: get(token, "isDeferred", false),
          isOCT: this._isOCTApiGatewayPath(event.path),
          lastFourDigits: get(token, "lastFourDigits"),
          maskedCardNumber: get(token, "maskedCardNumber"),
          merchant: {
            ...merchant,
            country: get(merchant, "country"),
            deferredOptions: !isUndefined(hierarchyMerchant)
              ? get(hierarchyMerchant, "deferredOptions")
              : get(merchant, "deferredOptions"),
            merchantId: get(
              merchant,
              "public_id",
              event.requestContext.authorizer.merchantId
            ),
            merchantName: get(merchant, "merchant_name"),
            sandboxEnable: get(merchant, "sandboxEnable"),
            siftScience: get(merchant, "sift_science"),
            taxId: get(merchant, "taxId"),
            whiteList: get(merchant, "whiteList"),
          },
          merchantCountry: get(merchant, "country"),
          merchantId: get(
            merchant,
            "public_id",
            get(event, MERCHANT_ID_AUTHORIZER, "")
          ),
          metadata: get(event.body, "metadata", {}),
          paymentBrand: get(token, BIN_BRAND),
          platformName: get(token, "kushkiInfo.platformName", ChannelEnum.API),
          processorToken: get(event, "body.initialRecurrenceReference"),
          productDetails: get(event, "body.productDetails"),
          secureId: get(token, "secureId"),
          secureService: get(token, "secureService"),
          sessionId: get(token, "sessionId"),
          settlement: get(token, "settlement"),
          subMerchant: get(event, "body.subMerchant") as
            | SubMerchantDynamo
            | undefined,
          threeDomainSecure: get(event, "body.threeDomainSecure") as
            | ThreeDomainSecureRequestObject
            | undefined,
          tokenAlreadyUsed: get(token, "alreadyUsed", false),
          tokenCreated: get(token, "created"),
          tokenCurrency: get(token, "currency"),
          tokenId: get(token, "id"),
          tokenObject: token,
          tokenType: TokenTypeEnum.TRANSACTION,
          transactionCardHolderName: get(token, "cardHolderName", ""),
          transactionCardId: get(token, "transactionCardId", ""),
          transactionEmail: get(event, "body.contactDetails.email", ""),
          transactionKind: "card",
          transactionPhoneNumber: get(
            event,
            "body.contactDetails.phoneNumber",
            ""
          ),
          transactionReference: get(token, "transactionReference"),
          userAgent: get(token, "userAgent"),
          userId: get(token, "userId"),
          usrvOrigin: defaultTo(process.env.USRV_NAME, "usrv-card"),
          vaultToken: get(token, "vaultToken"),
        };

        set(request, TOTAL_AMOUNT, total_amount);

        return of(request);
      }),
      tag("CardService | _mapUnifiedChargeValues")
    );
  }

  private _getPreauthTransactionAndToken(
    ticketNumber: string,
    merchantId: string,
    isCardRequest: boolean,
    requestCurrency: string
  ): Observable<[Transaction, DynamoTokenFetch | undefined]> {
    return this._storage
      .query<Transaction>(
        TABLES.transaction,
        IndexEnum.transaction_ticket_number,
        "ticket_number",
        ticketNumber,
        {
          FilterExpression:
            "#transaction_type = :transaction_type_value AND #merchant_id = :merchant_id_value",
          ExpressionAttributeNames: {
            "#transaction_type": "transaction_type",
            "#merchant_id": "merchant_id",
          },
          ExpressionAttributeValues: {
            ":transaction_type_value": TransactionTypeEnum.PREAUTH,
            ":merchant_id_value": merchantId,
          },
        }
      )
      .pipe(
        map((transactions: Transaction[]) => transactions[0]),
        map((transaction: Transaction | undefined) => {
          if (transaction === undefined) throw new KushkiError(ERRORS.E041);

          if (
            requestCurrency !== transaction.currency_code &&
            !isEmpty(requestCurrency)
          )
            throw new KushkiError(ERRORS.E042);

          return transaction;
        }),
        mergeMap((transaction: Transaction) => {
          if (isCardRequest)
            return forkJoin([
              of(transaction),
              this._storage.getItem<DynamoTokenFetch>(TABLES.tokens, {
                id: transaction.token,
              }),
            ]);

          return forkJoin([of(transaction), of(undefined)]);
        }),
        tag("Card Service | _getPreauthTransaction")
      );
  }

  private _validateCaptureSubscription(
    subscription: SubscriptionDynamo | undefined,
    trx: Transaction,
    authorizer: AuthorizerContext,
    pathSubscriptionId: string
  ): SubscriptionDynamo {
    if (subscription === undefined) throw new KushkiError(ERRORS.E050);

    if (subscription.merchantId !== authorizer.merchantId)
      throw new KushkiError(ERRORS.E040);

    if (
      trx.subscription_id !== pathSubscriptionId ||
      trx.merchant_id !== authorizer.merchantId
    )
      throw new KushkiError(ERRORS.E043);

    return subscription;
  }

  private _validateCaptureToken(
    token: DynamoTokenFetch | undefined,
    transaction: Transaction,
    bodyToken: string,
    merchantId: string,
    subscription: SubscriptionDynamo | undefined
  ) {
    return CardService._checkTokenExists(
      token,
      transaction,
      bodyToken,
      merchantId,
      subscription
    );
  }

  private _performSum(num1: number, num2: number): number {
    const decimals: number = Math.pow(10, 2);
    const sum: number =
      Math.round(num1 * decimals) + Math.round(num2 * decimals);

    return sum / decimals;
  }

  private _getAmountAndLastTrx(
    amountPreAuth: number,
    transactions: Transaction[]
  ): Observable<{ amount: number; last_trx?: Transaction }> {
    return of(1).pipe(
      mergeMap(() => this._getAmount(amountPreAuth, transactions)),
      tag("CardService | _getAmountAndLastTrx")
    );
  }

  private _getAmount(
    amountPreAuth: number,
    transactions: Transaction[]
  ): Observable<{ amount: number; last_trx?: Transaction }> {
    return of(1).pipe(
      mergeMap(() => {
        const last_transaction: Transaction | undefined = first(transactions);
        const amount: number = get(
          last_transaction,
          "accumulated_amount",
          amountPreAuth
        );

        return of({
          amount,
          last_trx: last_transaction,
        });
      }),
      tag("CardService | _getAmount")
    );
  }

  private _getInfoForValidateCapture(
    original: Transaction
  ): Observable<[number, Transaction | undefined]> {
    const amount_pre_auth: number = original.approved_transaction_amount;

    return of(1).pipe(
      mergeMap(() =>
        this._storage.queryTransactionBySeqIdAndCreated<Transaction>(
          original.ticket_number
        )
      ),
      mergeMap((transactions: Transaction[]) =>
        this._getAmountAndLastTrx(amount_pre_auth, transactions)
      ),
      mergeMap((res: { amount: number; last_trx?: Transaction }) =>
        forkJoin([of(res.amount), of(res.last_trx)])
      ),
      tag("CardService | _getInfoForValidateCapture")
    );
  }

  private _validateCaptureAmountWithPreAuth(
    response: ConvertionResponse,
    amount: Amount,
    transaction: Transaction
  ): Observable<[ConvertionResponse, Amount, Transaction | undefined]> {
    return of(1).pipe(
      mergeMap(() => {
        const valid_percentage_over_amount: number = 20;

        if (
          transaction.approved_transaction_amount *
            (1 + valid_percentage_over_amount / 100) <
          CardService.sFullAmount(amount)
        )
          throw new KushkiError(ERRORS.E012);
        return forkJoin([of(response), of(amount), of(undefined)]);
      }),
      tag("CardService | _validateCaptureAmountWithPreAuth")
    );
  }

  private _validateCaptureAmountWithPreauthReauth(
    response: ConvertionResponse,
    amount: Amount,
    transaction: Transaction
  ): Observable<[ConvertionResponse, Amount, Transaction | undefined]> {
    return of(1).pipe(
      mergeMap(() => this._getInfoForValidateCapture(transaction)),
      mergeMap(
        ([total_amount, last_trx]: [number, Transaction | undefined]) => {
          const request_amount: number = CardService.sFullAmount(amount);
          const kushki_vars: KushkiAcqVars =
            KushkiAcqService.getKushkiAcqVars();
          const capture_amount_percentage: number = get(
            kushki_vars,
            CAPTURE_PERCENTAGE,
            100
          );
          const max_amount: number =
            total_amount * (capture_amount_percentage / 100 + 1);

          if (request_amount > max_amount) throw new KushkiError(ERRORS.E012);

          return forkJoin([of(response), of(amount), of(last_trx)]);
        }
      ),
      tag("CardService | _validateCaptureAmountWithPreauthReauth")
    );
  }

  private _validateCaptureAmount(
    response: ConvertionResponse,
    amount: Amount,
    transaction: Transaction
  ): Observable<[ConvertionResponse, Amount, Transaction | undefined]> {
    const is_kushki_processor: boolean =
      transaction.processor_name === ProcessorEnum.KUSHKI;

    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => is_kushki_processor,
          this._validateCaptureAmountWithPreauthReauth(
            response,
            amount,
            transaction
          ),
          this._validateCaptureAmountWithPreAuth(response, amount, transaction)
        )
      ),
      tag("Card Service | unifiedCapture | _validateCaptureAmount")
    );
  }

  private _retrieveFinalAmountAndSubscription(
    requestAmount: Amount | undefined,
    origin: string,
    subscription: SubscriptionDynamo
  ): Observable<FinalAmountAndSubscription> {
    return of(1).pipe(
      mergeMap(() => this._retrieveOnlyFinalAmount(requestAmount, origin)),
      mergeMap((amount: Amount) => {
        const bin_number: string | undefined = get(subscription, BIN_PATH);

        return forkJoin([
          of(amount),
          this._getBinFromDynamo(
            bin_number,
            get(subscription, "merchantCountry", "")
          ),
        ]);
      }),
      map(([amount, bin_fetch]: [Amount, DynamoBinFetch | undefined]) => {
        const modified_subscription: SubscriptionDynamo =
          bin_fetch !== undefined
            ? { ...subscription, binInfo: bin_fetch }
            : { ...subscription };

        return {
          finalAmount: amount,
          modifiedSubscription: modified_subscription,
        };
      }),
      tag("CardService | _retrieveFinalAmountAndSubscription")
    );
  }

  private _retrieveOnlyFinalAmount(
    requestAmount: Amount | undefined,
    origin: string
  ): Observable<Amount> {
    return of(1).pipe(
      mergeMap(() => {
        const currency: Currency = <Currency>get(requestAmount, "currency");

        if (
          requestAmount !== undefined &&
          CardService.sFullAmount(requestAmount) > 0
        )
          return of({ ...requestAmount, currency });

        this._rollbar.warn(`Subscripcion: ${ERRORS.E039.message} - ${origin}`);
        throw new KushkiError(ERRORS.E039);
      }),
      tag("CardService | _retrieveOnlyFinalAmount")
    );
  }

  private _getBinFromDynamo(
    binNumber: string | undefined,
    merchantCountry: string
  ): Observable<DynamoBinFetch | undefined> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => Boolean(binNumber),
          this._getBinInfo(binNumber!, false, merchantCountry),
          of(undefined)
        )
      ),
      tag("CardService | _getBinFromDynamo")
    );
  }

  private _validateCaptureByPreauthTransactionReference(
    preauthTransactionReference: string
  ): Observable<boolean> {
    return this._storage
      .query<SubscriptionTransactionDynamo>(
        `${process.env.DYNAMO_TRANSACTION}`,
        IndexEnum.preauth_trx_reference_index,
        `preauth_transaction_reference`,
        preauthTransactionReference
      )
      .pipe(
        map((transaction: SubscriptionTransactionDynamo[]) => {
          if (
            filter(
              transaction,
              (trx: SubscriptionTransactionDynamo) =>
                trx.transaction_type === TransactionTypeEnum.CAPTURE &&
                trx.transaction_status === TransactionStatusEnum.APPROVAL
            ).length > 0
          )
            throw new KushkiError(ERRORS.E051);

          return true;
        })
      );
  }

  private _buildUnifiedTrxRuleRequest(
    currentToken: DynamoTokenFetch,
    request: UnifiedCaptureRequest,
    preauthTransaction: Transaction,
    transactionReference: string
  ): UnifiedChargesPreauthRequest {
    return {
      transactionReference,
      "3ds": get(currentToken, "3ds", undefined),
      amount: get(request, "captureRequest.amount"),
      authorizerContext: request.authorizer,
      binInfo: get(currentToken, "binInfo", undefined),
      cardHolderName: get(request, "cardHolderName", ""),
      channel: get(request, "channel", ""),
      contactDetails: get(preauthTransaction, "contact_details", {}),
      credentialId: get(request, this._requestcontextcredentialId),
      cvv: get(currentToken, "cvv", ""),
      expiryMonth: get(currentToken, "expiryMonth", ""),
      expiryYear: get(currentToken, "expiryYear", ""),
      failOverToken: get(currentToken, "failoverToken", ""),
      ignoreWarnings: true,
      ip: get(request, "ip", ""),
      isDeferred: false,
      lastFourDigits: get(currentToken, "lastFourDigits", ""),
      maskedCardNumber: get(currentToken, "maskedCardNumber", ""),
      merchant: {
        country: get(request, MERCHANT_COUNTRY, ""),
        deferredOptions: get(request, "merchant.deferredOptions", ""),
        merchantId: get(request, "merchant.publicId", ""),
        merchantName: get(request, "merchant.merchant_name", ""),
        sandboxEnable: get(request, MERCHANT_SANDBOX, false),
        siftScience: get(request, "merchant.sift_science", ""),
        taxId: get(request, "merchant.taxId", ""),
        whiteList: get(request, "merchant.whiteList", ""),
      },
      merchantCountry: get(request, MERCHANT_COUNTRY, ""),
      merchantId: get(currentToken, "merchantId", ""),
      metadata: get(request, "captureRequest.metadata"),
      paymentBrand: get(currentToken, BIN_BRAND, ""),
      platformName: get(request, "platformName", ""),
      plccMetadataId: get(currentToken, "plccMetadataId", ""),
      secureId: get(currentToken, "secureId", ""),
      secureService: get(currentToken, "secureService", ""),
      sessionId: get(currentToken, "sessionId", ""),
      settlement: get(currentToken, "settlement", 0),
      subMetadataId: get(currentToken, "subMetadataId", ""),
      tokenCreated: get(currentToken, "created", 0),
      tokenCurrency: get(request, CURRENCY_PATH, CurrencyEnum.USD),
      tokenId: get(currentToken, "id", ""),
      tokenObject: currentToken,
      tokenType: get(request, "token.tokenType", ""),
      transactionCardHolderName: get(
        request,
        "captureRequest.contactDetails.cardHolderName",
        get(preauthTransaction, "card_holder_name", "")
      ),
      transactionEmail: get(
        request,
        "captureRequest.contactDetails.email",
        get(preauthTransaction, "contact_details.email", "")
      ),
      transactionKind: TransactionKindEnum.CARD,
      transactionPhoneNumber: get(
        request,
        "captureRequest.contactDetails.phoneNumber",
        get(preauthTransaction, "contact_details.phone_number", "")
      ),
      transactionType: TransactionRuleTypeEnum.CAPTURE,
      userAgent: get(currentToken, "userAgent", ""),
      userId: get(request, "token.userId"),
      usrvOrigin: get(request, "usrvOrigin", "usrv-card"),
      vaultToken: get(request, "token.vaultToken"),
    };
  }

  private _processUnifiedCapture(
    request: UnifiedCaptureRequest,
    context: Context,
    amount: Amount,
    currentProcessor: DynamoProcessorFetch,
    currentTransaction: Transaction,
    captureReference: string,
    currentTrxRule: InvokeTrxRuleResponse,
    currentToken: DynamoTokenFetch,
    provider: CardProviderEnum
  ): Observable<[Transaction, AurusResponse]> {
    return of(1).pipe(
      mergeMap(() => {
        const capture_request: CaptureInput = {
          context,
          currentToken,
          authorizerContext: request.authorizer,
          body: {
            ...request.captureRequest,
            amount,
          },
          lastTransaction: request.last_transaction,
          merchantId: get(request, "token.merchantId"),
          processor: currentProcessor,
          taxId: get(request, "merchant.taxId"),
          tokenTrxReference: currentToken.transactionReference,
          transaction: currentTransaction,
          trxReference: captureReference,
          trxRuleResponse: currentTrxRule.trxRuleResponse,
          usrvOrigin: request.usrvOrigin,
        };

        return this._providers
          .filter(
            (service: IProviderService) => service.variant === provider
          )[0]
          .capture(capture_request);
      }),
      mergeMap((aurusResponse: AurusResponse) => {
        const aurus_data: AurusResponse = cloneDeep(aurusResponse);
        const has_active_3ds: boolean = !isEmpty(
          get(currentTransaction, "security.3ds")
        );
        const processor_name: string = currentTrxRule.processor.processor_name;

        if (has_active_3ds && processor_name === ProcessorEnum.KUSHKI) {
          const cybersourceOriginalTrx: Cybersource = {
            authentication: true,
            detail: {
              ...get(currentTransaction.security, "3ds"),
              ucafAuthenticationData: get(
                currentTransaction.security,
                "3ds.ucaf"
              ),
            },
          };

          this._logger.info(CYBERSOURCE_TAG, cybersourceOriginalTrx);
          set(currentToken, "3ds", cybersourceOriginalTrx);
        }

        return forkJoin([
          this._startSavingTransaction({
            aurusChargeResponse: aurusResponse,
            authorizerContext: request.authorizer,
            country: get(request.merchant, "country", ""),
            error: undefined,
            integration: get(
              currentTrxRule.trxRuleResponse,
              "body.integration",
              "aurus"
            ),
            integrationMethod: get(
              currentTrxRule.trxRuleResponse,
              "body.completeTransactionType"
            ),
            isAft: undefined,
            merchant: request.merchant,
            merchantId: get(request.merchant, "public_id", ""),
            merchantName: get(request.merchant, "merchant_name", ""),
            partner: get(currentTrxRule, PARTNER_VALIDATOR_PATH),
            plccInfo: get(currentTrxRule, "plccInfo"),
            processor: currentProcessor,
            requestEvent: {
              ...request.captureRequest,
              amount,
            },
            ruleInfo: undefined,
            siftValidation: undefined,
            tokenInfo: currentToken,
            transaction: currentTransaction,
            trxType: TransactionRuleTypeEnum.CAPTURE,
            validateSiftTrxRule: undefined,
            whitelist: undefined,
          }),
          of(aurus_data),
        ]);
      }),
      tag("CardService | _processUnifiedCapture")
    );
  }

  private _checkExpirationCardTime(
    request: UnifiedChargesPreauthRequest
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        const expiry_year_length = get(request.expiryYear, "length", 0);
        const expiry_month_length = get(request.expiryMonth, "length", 0);
        const is_valid_expiry_year = expiry_year_length === 2;
        const is_valid_expiry_month = expiry_month_length === 2;
        const is_subscription: boolean = Boolean(
          request.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS
        );

        return iif(
          () =>
            is_valid_expiry_year && is_valid_expiry_month && is_subscription,
          this._validateExpirationTime(request),
          of(false)
        );
      }),
      tag("CardService | _checkExpirationCardTime")
    );
  }

  private _getPreviousEndOfMonth(
    expiryYear: string,
    expiryMonth: string
  ): moment.Moment {
    return moment([
      moment(expiryYear, "YY").format("YYYY"),
      Number(expiryMonth) - 1,
    ]);
  }

  private _validateExpirationTime(
    request: UnifiedChargesPreauthRequest
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        const start_date = this._getPreviousEndOfMonth(
          <string>request.expiryYear,
          <string>request.expiryMonth
        );
        const end_date = moment(start_date).endOf("month");
        const is_subscription: boolean = Boolean(
          request.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS
        );

        const is_subscription_validation: boolean = get(
          request,
          this._subscriptionValidationPath,
          false
        );

        if (this._isExpiredDate(end_date) && request.vaultToken !== undefined)
          return forkJoin([
            of(true),
            this._execDeleteCreditInfo(request),
            iif(
              () => is_subscription && !is_subscription_validation,
              this._updateSubscriptionVaultToken(
                <string>request.subscriptionId,
                <string>request.merchantId
              ),
              of(false)
            ),
          ]);
        return forkJoin([
          of(this._isExpiredDate(end_date)),
          of(undefined),
          of(undefined),
        ]);
      }),
      map(
        ([condition]: [boolean, boolean | undefined, boolean | undefined]) =>
          condition
      ),
      tag("CardService | _validateExpirationTime")
    );
  }

  private _execDeleteCreditInfo(
    request: UnifiedChargesPreauthRequest
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        const item: SubscriptionTokenDelete = {
          createdAt: request.tokenCreated,
          expirationTime: moment().add(45, "days").unix(),
          id: <string>request.subscriptionId,
          vaultToken: request.vaultToken!,
        };

        return this._storage.put(item, `${process.env.DYNAMO_TOKENS_DELETE}`);
      }),
      catchError(() => of(true)),
      mapTo(true),
      tag("SubscriptionService | _execDeleteCreditInfo")
    );
  }

  private _updateSubscriptionVaultToken(
    subscriptionId: string,
    merchantId: string
  ): Observable<boolean | undefined> {
    return this._getSubscriptionDynamo(subscriptionId, merchantId).pipe(
      mergeMap((subscription: SubscriptionDynamo | undefined) =>
        this._updateSubscription(<SubscriptionDynamo>subscription)
      )
    );
  }

  private _updateSubscription(
    subscription: SubscriptionDynamo
  ): Observable<boolean> {
    delete subscription.vaultToken;
    return of(1).pipe(
      switchMap(() =>
        this._storage.put(
          {
            ...subscription,
          },
          TABLES.subs_subscription
        )
      ),
      tag("Card Service | _updateSubscription")
    );
  }

  private _getSubscriptionDynamo(
    subscriptionId: string,
    merchantId: string
  ): Observable<SubscriptionDynamo | undefined> {
    return of(1).pipe(
      switchMap(() =>
        this._storage.getItem<SubscriptionDynamo>(TABLES.subs_subscription, {
          id: `${subscriptionId}${merchantId}`,
        })
      ),
      tag("Card Service | _getSubscriptionDynamo")
    );
  }

  private _isExpiredDate(endDate: moment.Moment): boolean {
    return (
      moment(endDate.toDate()).unix() <
      Number((new Date().getTime() + 1800000).toString().slice(0, 10))
    );
  }

  private _getOriginalTransaction(
    ticketNumber: string
  ): Observable<Transaction> {
    return this._storage
      .query<Transaction>(
        TABLES.transaction,
        IndexEnum.transaction_ticket_number,
        AggTransactionEnum.ticket_number,
        ticketNumber
      )
      .pipe(
        map((transactions: Transaction[]) => transactions[0]),
        map((transaction: Transaction | undefined) => {
          if (transaction === undefined) throw new KushkiError(ERRORS.E004);
          const new_transaction = transaction;

          new_transaction.transaction_status = "declined";

          if (get(transaction, "available") === false)
            throw new KushkiError(ERRORS.E041);

          const transaction_type = get(transaction, "transaction_type", "");

          if (
            transaction_type !== TransactionTypeEnum.PREAUTH &&
            transaction_type !== TransactionTypeEnum.REAUTH
          )
            throw new KushkiError(ERRORS.E041);

          return transaction;
        }),

        tag("Card Service | _getPreauthTransaction")
      );
  }

  private _trxMethodReauthorization(
    event: IAPIGatewayEvent<
      ReauthorizationRequest,
      null,
      null,
      AuthorizerContext
    >,
    transaction: Transaction
  ): Observable<object> {
    let amount: Amount;
    let reauth_input: ReauthInput;

    return of(1).pipe(
      mergeMap(() =>
        this._invokeTransactionRuleProcessor({
          detail: {
            credentialId: get(event, this._requestcontextcredentialId),
          },
          hierarchyConfig: JSON.parse(
            get(event, this._requestHierarchyConfig, "{}") || "{}"
          ),
          isTokenCharge: true,
          merchantId: transaction.merchant_id,
          sandboxEnable: get(event.requestContext, "sandboxEnable", false),
          transactionKind: "card",
        })
      ),
      map((data: LambdaTransactionRuleResponse) =>
        this._validateReauthTransaction(
          data,
          get(event.body.amount, "currency"),
          transaction
        )
      ),
      mergeMap((data: LambdaTransactionRuleResponse) => {
        amount = {
          currency: get(event.body.amount, "currency"),
          extraTaxes: {
            agenciaDeViaje: get(event.body.amount, "extraTaxes.travelAgency"),
            iac: get(event.body.amount, "extraTaxes.iac"),
            propina: get(event.body.amount, "extraTaxes.tip"),
            tasaAeroportuaria: get(
              event.body.amount.extraTaxes,
              "extraTaxes.airportTax"
            ),
          },
          ice: get(event.body.amount, "ice"),
          iva: get(event.body.amount, "iva"),
          subtotalIva: get(event.body.amount, "subtotalIva"),
          subtotalIva0: get(event.body.amount, "subtotalIva0"),
        };

        reauth_input = {
          merchantId: transaction.merchant_id,
          processorName: ProcessorEnum.KUSHKI,
          publicId: data.publicId,
          trxRuleResponse: data,
        };

        set(
          reauth_input,
          "requestInput.ticket_number",
          event.body.ticketNumber
        );

        this._logger.info("CardService | reauth input", reauth_input);

        return forkJoin([
          of(data),
          this._executeReauthTransaction(
            reauth_input,
            transaction,
            amount,
            event.requestContext.authorizer
          ),
        ]);
      }),
      catchError((err: Error) =>
        this._handleReAuthorizationError(
          err,
          amount,
          get(reauth_input, "processorName", ""),
          transaction
        )
      ),
      mergeMap(
        ([trx_rule, processor_resp]: [
          LambdaTransactionRuleResponse,
          AurusResponse
        ]) =>
          forkJoin([
            of(trx_rule),
            this._saveTransactionReauth(amount, processor_resp, transaction),
          ])
      ),
      mergeMap(
        ([trx_rule, new_transaction]: [
          LambdaTransactionRuleResponse,
          Transaction
        ]) =>
          of(
            this._buildReAuthResponse(
              get(event, "body.fullResponse", false) as FullResponseType,
              get(new_transaction, "ticket_number"),
              new_transaction,
              trx_rule
            )
          )
      ),
      tag("Card Service | _trxMethodReauthorization")
    );
  }

  private _validateReauthTransaction(
    data: LambdaTransactionRuleResponse,
    transactionCurrency: string,
    transaction: Transaction
  ): LambdaTransactionRuleResponse {
    if (get(data, "processor") !== ProcessorEnum.KUSHKI)
      throw new KushkiError(ERRORS.E041);

    if (transactionCurrency !== transaction.currency_code)
      throw new KushkiError(ERRORS.E042);

    return data;
  }

  private _executeReauthTransaction(
    input: ReauthInput,
    transaction: Transaction,
    amount: Amount,
    authorizerContext: AuthorizerContext
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => this._getIsMerchantTest(input.merchantId)),
      switchMap((isTestMerchant: boolean) =>
        this._handleReAthorizationProvider(
          input,
          this._getProviderVariant(input.processorName, isTestMerchant),
          input.processorName,
          transaction,
          amount,
          authorizerContext,
          get(input, "trxRuleResponse.integration", CardProviderEnum.KUSHKI)
        )
      ),
      tag("CardService | _executePreauthTransaction")
    );
  }

  private _handleReAthorizationProvider(
    input: ReauthInput,
    provider: CardProviderEnum,
    processor: string,
    transaction: Transaction,
    amount: Amount,
    authorizerContext: AuthorizerContext,
    integration?: string
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._providers
          .filter(
            (service: IProviderService) =>
              service.variant ===
              this._validateMerchantIdProcessor(
                provider,
                input.publicId,
                processor,
                integration
              )
          )[0]
          .reAuthorization(amount, authorizerContext, transaction)
      ),
      tag("CardService | _handleReAthorizationProvider")
    );
  }

  private _buildReAuthResponse(
    fullResponse: FullResponseType,
    ticketNumber: string,
    transaction: Transaction,
    trxRule: LambdaTransactionRuleResponse
  ): ChargesCardResponse | PreauthFullResponseV2 {
    let response: ChargesCardResponse | PreauthFullResponseV2;

    const omit_keys: string[] = [
      "user_agent",
      "purchase_Number",
      "purchase_number",
      "processor_transaction_id",
      "vault_token",
      "plcc",
      "public_credential_id",
      "integration",
      "consortium_name",
      "ticket_number",
      "amount",
      "transactionDetails",
      "transaction_details",
      "processor_id",
      "credential_id",
      "credential_alias",
      "token_type",
      "security",
      "interest_amount",
      "processor_merchant_id",
      "action",
      "credential_metadata",
    ];

    const transaction_data: Transaction = <Transaction>(
      omit(transaction, omit_keys)
    );

    switch (fullResponse) {
      case "v2":
        response = ResponseBuilder.getPreauthAndChargeFullResponseV2(
          transaction,
          undefined,
          false,
          { body: trxRule }
        );
        break;
      case "v1":
        response = {
          ticketNumber,
          details: <Details>camelcaseKeys({
            ...transaction_data,
            cardCountry: get(transaction, "country"),
            processorName: ProcessorEnum.KUSHKI,
            rules: get(trxRule, "body.rules.rules", []),
          }),
          transactionReference: get(transaction, "transaction_reference", ""),
        };
        break;
      default:
        response = {
          ticketNumber,
          transactionReference: get(transaction, "transaction_reference", ""),
        };
        break;
    }

    return response;
  }

  private _saveTransaction(transaction: Transaction): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => this._storage.put(transaction, TABLES.transaction)),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      tag("CardService | _saveTransaction")
    );
  }

  private _buildAccountValidationRequestBody(
    dynamoMerchant: DynamoMerchantFetch,
    dynamoToken: DynamoTokenFetch,
    invokeResponse: InvokeTrxRuleResponse,
    accountValidationRequest: AccountValidationRequest,
    sandboxEnable: boolean
  ): SandboxAccountValidationRequest | ValidateAccountLambdaRequest {
    return sandboxEnable
      ? this._buildAccountValidationSandboxRequest(
          dynamoMerchant,
          dynamoToken,
          accountValidationRequest.token
        )
      : this._buildAccountValidationRequest(
          invokeResponse,
          dynamoToken,
          dynamoMerchant,
          accountValidationRequest
        );
  }

  private _buildAccountValidationSandboxRequest(
    dynamoMerchant: DynamoMerchantFetch,
    dynamoToken: DynamoTokenFetch,
    token: string
  ): SandboxAccountValidationRequest {
    return {
      body: {
        country: dynamoMerchant.country,
        currency_code: <Currency>dynamoToken.currency,
        is_blocked_card: get(dynamoToken, "isBlockedCard", false),
        language_indicator: "es",
        merchant_identifier: dynamoToken.merchantId,
        plcc: "0",
        transaction_amount: {
          ICE: "0.00",
          IVA: "0.00",
          Subtotal_IVA: "0.00",
          Subtotal_IVA0: "0.00",
          Total_amount: "0.00",
        },
        transaction_card_id: get(dynamoToken, "transactionCardId", ""),
        transaction_reference: v4(),
        transaction_token: token,
      },
    };
  }

  private _buildAccountValidationRequest(
    trxRuleResponse: InvokeTrxRuleResponse,
    dynamoToken: DynamoTokenFetch,
    dynamoMerchant: DynamoMerchantFetch,
    accountValidationRequest: AccountValidationRequest
  ): ValidateAccountLambdaRequest {
    const country_bin: string = UtilsService.getCountryISO(
      get(dynamoToken, COUNTRY_NAME)
    );
    const card_acq_request: ValidateAccountLambdaRequest = {
      binInfo: {
        bank: get(dynamoToken, BIN_BANK, ""),
        bin: get(dynamoToken, BIN_PATH, ""),
        brand: get(dynamoToken, BIN_BRAND, "").toUpperCase(),
        brandProductCode: get(dynamoToken, BIN_BRAND_PRODUCT_CODE),
        country: country_bin,
        prepaid: get(dynamoToken, "binInfo.info.prepaid", false),
        type: get(dynamoToken, CARD_TYPE_PATH, "").toLowerCase(),
      },
      card: {
        bin: get(dynamoToken, "bin", ""),
        brand: get(dynamoToken, BIN_BRAND, ""),
        holderName: get(dynamoToken, "cardHolderName", ""),
        lastFourDigits: get(dynamoToken, "lastFourDigits", ""),
        type: get(dynamoToken, CARD_TYPE_PATH, "").toUpperCase(),
      },
      currency: get(dynamoToken, "currency", ""),
      isBlockedCard: get(dynamoToken, "isBlockedCard", false),
      maskedCardNumber: get(dynamoToken, "maskedCardNumber", ""),
      merchantAddress: get(dynamoMerchant, "address", ""),
      merchantCity: get(dynamoMerchant, "city", ""),
      merchantCountry: get(dynamoMerchant, "country"),
      merchantId: get(dynamoMerchant, "public_id", ""),
      merchantName: get(dynamoMerchant, "merchant_name", ""),
      merchantProvince: get(dynamoMerchant, "province", ""),
      merchantZipCode: get(dynamoMerchant, "zipCode", ""),
      processorBankName: get(trxRuleResponse, PROCESSOR_BANK_NAME_PATH, ""),
      processorId: get(trxRuleResponse, "processor.public_id", ""),
      processorType: get(trxRuleResponse, "processor.processor_type", ""),
      processorMerchantId: get(
        trxRuleResponse,
        "processor.processor_merchant_id",
        ""
      ),
      subMccCode: get(trxRuleResponse, "processor.sub_mcc_code", ""),
      subMerchant: accountValidationRequest.subMerchant,
      terminalId: get(trxRuleResponse, "processor.terminal_id", ""),
      tokenType: TokenTypeEnum.TRANSACTION,
      transactionCardId: get(dynamoToken, "transactionCardId", ""),
      transactionReference: get(dynamoToken, "transactionReference", ""),
      vaultToken: get(dynamoToken, "vaultToken", ""),
    };

    if (
      !isEmpty(dynamoToken["3ds"]) &&
      get(dynamoToken, "3ds.authentication") === true
    ) {
      set(card_acq_request, "3DS.cavv", get(dynamoToken, "3ds.detail.cavv"));
      set(card_acq_request, "3DS.eci", get(dynamoToken, "3ds.detail.eci"));
      set(card_acq_request, "3DS.xid", get(dynamoToken, "3ds.detail.xid"));
    }
    this._setSubMerchantInUnifiedRequest(
      card_acq_request,
      trxRuleResponse.trxRuleResponse.body
    );

    return card_acq_request;
  }

  private _handleAccountValidationProvider(
    authorizerContext: AuthorizerContext,
    request: SandboxAccountValidationRequest | ValidateAccountLambdaRequest,
    provider: CardProviderEnum,
    processorId: string,
    processor: string,
    bin: string,
    integration?: string
  ): Observable<AcqCardResponse> {
    return of(1).pipe(
      switchMap(() => {
        provider = this._validateMerchantIdProcessor(
          provider,
          processorId,
          processor,
          bin,
          integration
        );
        return this._providers
          .filter(
            (service: IProviderService) => service.variant === provider
          )[0]
          .validateAccount(
            authorizerContext,
            <SandboxAccountValidationRequest>request
          );
      }),
      tag("CardService | _handleAccountValidationProvider")
    );
  }

  private _buildDynamoTransaction(
    eventRequest: AccountValidationRequest,
    trxRuleResponse: InvokeTrxRuleResponse,
    dynamoToken: DynamoTokenFetch,
    dynamoMerchant: DynamoMerchantFetch,
    acqCardResponse: AcqCardResponse,
    requestContext: IRequestContext<AuthorizerContext>
  ): object {
    const is_successful: boolean =
      get(acqCardResponse, "response_code", "") === "000";

    const new_transaction = {
      acquirer_bank: get(trxRuleResponse, PROCESSOR_BANK_NAME_PATH, ""),
      amount: {
        currency: dynamoToken.currency,
        ice: 0,
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
      },
      approval_code: get(acqCardResponse, APPROVAL_CODE_PATH, ""),
      approved_transaction_amount: 0,
      bin_card: get(dynamoToken, "bin", ""),
      card_country: get(dynamoToken, COUNTRY_NAME, ""),
      card_country_code: get(dynamoToken, "binInfo.info.country.alpha2", ""),
      card_holder_name: get(dynamoToken, "cardHolderName", ""),
      card_type: get(dynamoToken, CARD_TYPE_PATH, "").toUpperCase(),
      category_merchant: get(dynamoMerchant, "merchantCategory", ""),
      consortium_name: get(dynamoToken, "binInfo.consortiumName", ""),
      country: get(dynamoMerchant, "country", ""),
      created: moment().valueOf(),
      credential_alias: requestContext.authorizer.credentialAlias,
      credential_id: requestContext.authorizer.credentialId,
      credential_metadata: requestContext.authorizer.credentialMetadata,
      currency_code: dynamoToken.currency,
      foreign_card:
        get(dynamoMerchant, "country", "") !==
        get(dynamoToken, COUNTRY_NAME, ""),
      ice_value: 0,
      issuing_bank: get(dynamoToken, "binInfo.info.bank.name", ""),
      iva_value: 0,
      last_four_digits: get(dynamoToken, "lastFourDigits", ""),
      maskedCardNumber: dynamoToken.maskedCardNumber,
      mccCode: get(trxRuleResponse, "trxRuleResponse.body.subMccCode", ""),
      merchant_id: requestContext.authorizer.merchantId,
      merchant_name: get(dynamoMerchant, "merchant_name", ""),
      payment_brand: get(dynamoToken, BIN_BRAND, ""),
      plcc: false,
      processor: {
        code: get(acqCardResponse, "processor_code", ""),
        message: get(acqCardResponse, "response_text", ""),
      },
      processor_bank_name: get(trxRuleResponse, "processor.acquirer_bank", ""),
      processor_id: get(trxRuleResponse, "processor.public_id", ""),
      processor_name: get(
        trxRuleResponse,
        "processor.processor",
        get(acqCardResponse, PROCESSOR_NAME_DETAILS_PATH, "")
      ),
      processor_transaction_id: get(
        acqCardResponse,
        "processor_transaction_id",
        ""
      ),
      processor_type: get(trxRuleResponse, "processor.processor_type", ""),
      public_credential_id: requestContext.authorizer.publicCredentialId,
      request_amount: 0,
      response_code: get(acqCardResponse, "response_code", ""),
      response_text: get(acqCardResponse, "response_text", ""),
      social_reason: dynamoMerchant.socialReason,
      subMerchant: get(eventRequest, "subMerchant"),
      subtotal_iva: 0,
      subtotal_iva0: 0,
      sync_mode: TransactionSyncModeEnum.ONLINE,
      tax_id: dynamoMerchant.taxId,
      transaction_id: get(acqCardResponse, "transaction_id", ""),
      transaction_reference: get(dynamoToken, "transactionReference", ""),
      transaction_status: is_successful
        ? TransactionStatusEnum.APPROVAL
        : TransactionStatusEnum.DECLINED,
      transaction_type: TransactionTypeEnum.ACCOUNT_VALIDATION,
    };

    if (is_successful)
      set(
        new_transaction,
        "ticket_number",
        get(acqCardResponse, "ticket_number", "")
      );

    return new_transaction;
  }

  private _buildResponseValidateAccount(
    putResult: boolean,
    dynamoToken: DynamoTokenFetch,
    acqCardResponse: AcqCardResponse
  ): AccountValidationResponse {
    this._logger.info("CardService | card validation | save transaction", {
      putResult,
    });

    return {
      approvalCode: get(acqCardResponse, APPROVAL_CODE_PATH, ""),
      paymentBrand: get(dynamoToken, BIN_BRAND, ""),
      responseCode: get(acqCardResponse, "response_code", ""),
      responseText: get(acqCardResponse, "response_text", ""),
      transactionReference: get(dynamoToken, "transactionReference", ""),
    };
  }

  private _processAutomaticVoid(
    records: IDynamoRecord<TransactionDynamo>[]
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => from(records)),
      mergeMap((record: IDynamoRecord<TransactionDynamo>) => {
        if (record.eventName !== DynamoEventNameEnum.REMOVE) return of(false);

        if (isEmpty(record.dynamodb)) throw new KushkiError(ERRORS.E020);

        return this._handlerChargeBack(
          get(record.dynamodb, "OldImage.transaction_reference", "")
        );
      }),
      toArray(),
      mapTo(true),
      tag("CardService | _processAutomaticVoid")
    );
  }

  private _handlerChargeBack(
    transactionReference: string
  ): Observable<boolean> {
    return this._storage
      .query<Transaction>(
        TABLES.transaction,
        IndexEnum.transactions_transaction_reference,
        IndexEnum.transaction_reference,
        transactionReference
      )
      .pipe(
        map((trxs: Transaction[]) => {
          if (trxs.length === 0) throw new KushkiError(ERRORS.E020);

          return trxs[0];
        }),
        mergeMap((trx: Transaction) => {
          const lambda_values: LambdaValues = UtilsService.getLambdaValues();
          const payload: object = {
            headers: {
              "PRIVATE-MERCHANT-ID": "",
            },
            httpMethod: "",
            isBase64Encoded: false,
            path: "",
            pathParameters: {
              ticketNumber: trx.ticket_number,
            },
            requestContext: {
              authorizer: {
                credentialId: trx.merchant_id,
                credentialsAlias: "",
                merchantId: trx.merchant_id,
                privateMerchantId: "",
                publicMerchantId: trx.merchant_id,
              },
            },
            resource: "",
          };

          return this._lambda.invokeFunction(
            `${lambda_values.DIRECT_VOID}`,
            payload
          );
        }),
        catchError((err: KushkiError | Error) => throwError(() => err)),
        mapTo(true),
        tag("CardService | _handleChargeBack")
      );
  }

  private _buildNewAurusTokenRequest(
    request: UnifiedChargesPreauthRequest,
    ruleProcessor: LambdaTransactionRuleResponse,
    conversionResponse: ConvertionResponse,
    transactionReference: string
  ): AurusTokenLambdaRequest {
    const is_subscription_validation: boolean = get(
      request,
      this._subscriptionValidationPath,
      false
    );

    return {
      transactionReference,
      cardHolderName: get(request, "cardHolderName", ""),
      completeTransactionType: ruleProcessor.completeTransactionType,
      credentials: ruleProcessor.credentials,
      currency: <CurrencyEnum>conversionResponse.body.convertedCurrency,
      cvv: request.cvv,
      isCardValidation: is_subscription_validation,
      isDeferred: get(request, "isDeferred", false) as boolean,
      merchantId: ruleProcessor.publicId,
      months: defaultTo(get(request, "deferred.months"), request.months),
      processorName: ruleProcessor.processor,
      processorPrivateId: ruleProcessor.privateId,
      tokenType: request.tokenType,
      totalAmount: this._checkCurrencyRound(
        conversionResponse,
        <CurrencyEnum>get(request.amount, "currency")
      ),
      vaultToken: get(request, "vaultToken", ""),
    };
  }

  private _validateExternalSubscription(
    request: UnifiedChargesPreauthRequest,
    data: InvokeTrxRuleResponse
  ) {
    const processor_name: string = get(data, "processor.processor_name", "");
    const is_kushki: boolean = isEqual(processor_name, ProcessorEnum.KUSHKI);
    const is_credimatic: boolean = isEqual(
      processor_name,
      ProcessorEnum.CREDIMATIC
    );
    const is_datafast: boolean = isEqual(
      processor_name,
      ProcessorEnum.DATAFAST
    );
    const integration_direct = isEqual(
      get(data, RULE_INTEGRATION_PATH, ""),
      DIRECT
    );
    const is_credimatic_datafast_direct =
      (is_datafast || is_credimatic) && integration_direct;

    const is_external_subscription_processor: boolean = get(
      data,
      "trxRuleResponse.body.externalSubscription",
      false
    );
    const external_subscription_id: string = get(
      request,
      "externalSubscriptionID",
      ""
    );

    if (
      !isEmpty(external_subscription_id) &&
      !is_external_subscription_processor &&
      (is_kushki || is_credimatic_datafast_direct)
    )
      throw new KushkiError(ERRORS.E555);
  }

  private _setSubMerchantInUnifiedRequest(
    request: UnifiedChargesPreauthRequest | ValidateAccountLambdaRequest,
    ruleProcessor: LambdaTransactionRuleResponse
  ) {
    const brand: string = get(
      request,
      BIN_BRAND,
      get(request, "binInfo.info.brand", "")
    );
    const service_provider: object = get(
      ruleProcessor,
      `serviceProvider.${brand.toLowerCase()}`,
      {}
    );
    const company_id: string = get(service_provider, "companyId", "");
    const payfact_id: string = get(service_provider, "payfactId", "");
    const facilitator_name: string = get(
      ruleProcessor,
      "serviceProvider.facilitatorName",
      ""
    );

    set(request, "subMerchant.isInRequest", !isUndefined(request.subMerchant));

    if (!isEmpty(company_id)) set(request, "subMerchant.idCompany", company_id);
    if (!isEmpty(facilitator_name))
      set(request, "subMerchant.facilitatorName", facilitator_name);

    if (!isEmpty(payfact_id))
      set(request, "subMerchant.idFacilitator", payfact_id);
  }

  private _isUnifiedTransactionOnDemand(
    request: UnifiedChargesPreauthRequest
  ): boolean {
    return (
      get(request, "subscriptionTrigger", "") ===
      SubscriptionTriggerEnum.ON_DEMAND
    );
  }

  // istanbul ignore next
  private _handleNewToken(
    merchant: DynamoMerchantFetch,
    request: UnifiedChargesPreauthRequest,
    isSubsValidation: boolean,
    isOTP: boolean,
    isSubscription: boolean
  ): Observable<DynamoTokenFetch> {
    let transaction_reference: string;
    let current_token: DynamoTokenFetch;
    let provider: string;

    return of(1).pipe(
      mergeMap(() =>
        this._invokeTransactionRuleProcessor(
          this._getInvokeTransactionRuleRequest(
            merchant,
            request,
            isSubsValidation,
            isOTP
          )
        )
      ),
      mergeMap((ruleProcessor: LambdaTransactionRuleResponse) =>
        forkJoin([
          of(ruleProcessor),
          this._executeCurrencyConversion(
            <CurrencyEnum>request.amount.currency,
            CardService.sFullAmount(request.amount)
          ),
        ])
      ),
      mergeMap(
        ([rule_processor, conversion_response]: [
          LambdaTransactionRuleResponse,
          ConvertionResponse
        ]) => {
          transaction_reference = v4();
          const sandbox_enable: boolean = this._getSandboxEnable(
            get(merchant, "sandboxEnable", false),
            rule_processor.processor
          );
          const provider_variant: CardProviderEnum = this._getProviderVariant(
            rule_processor.processor,
            sandbox_enable
          );
          const token_request:
            | AurusTokenLambdaRequest
            | SandboxTokenLambdaRequest = sandbox_enable
            ? this._buildTokenSandboxRequest(
                request,
                rule_processor,
                conversion_response
              )
            : this._buildNewAurusTokenRequest(
                request,
                rule_processor,
                conversion_response,
                transaction_reference
              );
          const masked_card_number: string = get(
            request,
            "maskedCardNumber",
            ""
          );

          return forkJoin([
            of(rule_processor.plcc),
            this._handleTokenProvider(
              token_request,
              provider_variant,
              rule_processor.publicId,
              rule_processor.processor,
              CardService._getBinByMasquedCard(masked_card_number),
              get(rule_processor, "integration", "aurus"),
              get(rule_processor, "completeTransactionType"),
              !(isSubsValidation || isOTP)
            ),
            of(conversion_response),
          ]);
        }
      ),
      mergeMap(
        ([plcc, token_response, conversion_response]: [
          string | undefined,
          [TokensCardResponse, string],
          ConvertionResponse
        ]) => {
          provider = token_response[1];

          return forkJoin([
            this._handleTokenResponse(
              plcc,
              token_response[0],
              CardService.getValidBinNumber(request),
              get(request, "cardHolderName", ""),
              get(merchant, "country", "")
            ),
            of(conversion_response),
          ]);
        }
      ),
      mergeMap(
        ([[token_response, bin_info], conversion_response]: [
          [TokensCardResponse, DynamoBinFetch | undefined],
          ConvertionResponse
        ]) =>
          forkJoin([of(token_response), of(bin_info), of(conversion_response)])
      ),
      mergeMap(
        ([token_response, bin_info, conversion_response]: [
          TokensCardResponse,
          DynamoBinFetch | undefined,
          ConvertionResponse
        ]) => {
          current_token = this._buildTokenDynamo(
            token_response,
            <DynamoBinFetch>bin_info,
            {
              ...request,
              vaultToken: get(request, "vaultToken", ""),
            },
            get(request, "merchantId", ""),
            transaction_reference,
            request.userId,
            request.sessionId
          );
          current_token = this._getNewToken(current_token, conversion_response);
          set(current_token, "ip", get(request, "ip"));
          current_token = this._addTraceabilityData(
            request,
            current_token,
            provider,
            isOTP,
            isSubscription,
            isSubsValidation
          );

          return this._saveDynamoToken(current_token);
        }
      ),
      mergeMap(() => of(current_token)),
      tag("Card Service | _handleNewToken")
    );
  }

  private _getInvokeTransactionRuleRequest(
    merchant: DynamoMerchantFetch,
    request: UnifiedChargesPreauthRequest,
    isSubsValidation: boolean,
    isOTP: boolean
  ): object {
    const is_object_hierarchy_config: boolean = isObject(
      get(request, HIERARCHY_PATH, {})
    );
    const is_object_merchant_data: boolean = isObject(
      get(request, MERCHANT_DATA_PATH, {})
    );
    const merchant_data: object = is_object_merchant_data
      ? get(request, MERCHANT_DATA_PATH, {})
      : JSON.parse(get(request, MERCHANT_DATA_PATH, "{}"));

    return {
      detail: {
        bank: get(request, "binInfo.bank", ""),
        brand: this._getBankOrBrand(
          request.binInfo,
          get(request, "paymentBrand", TransactionKindEnum.CARD)
        ),
        credentialId: request.credentialId,
        isDeferred: this._isUnifiedTransactionOnDemand(request)
          ? defaultTo(request.isDeferred, false).toString()
          : "false",
      },
      hierarchyConfig: is_object_hierarchy_config
        ? get(request, HIERARCHY_PATH, {})
        : JSON.parse(get(request, HIERARCHY_PATH, "{}")),
      isTokenCharge: isSubsValidation || isOTP,
      merchantData: {
        ...merchant_data,
        channel: get(request, "platformName", ""),
      },
      merchantId: request.merchantId,
      sandboxEnable: get(merchant, "sandboxEnable", false),
      transactionKind: "card",
    };
  }

  private _saveDynamoToken(
    currentToken: DynamoTokenFetch
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => this._storage.put(currentToken, TABLES.tokens)),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      tag("CardService | _saveDynamoToken")
    );
  }

  // istanbul ignore next
  private _buildTokenSandboxRequest(
    request: SandboxTokenRequest,
    ruleProcessor: LambdaTransactionRuleResponse,
    conversionResponse: ConvertionResponse
  ): SandboxTokenLambdaRequest {
    return {
      body: {
        card: {
          expiryMonth: "10",
          expiryYear: "20",
          name: get(request, "cardHolderName", ""),
          number: get(request, "maskedCardNumber", ""),
        },
        currency: <CurrencyEnum>get(request.amount, "currency"),
        isDeferred: false,
        totalAmount: this._checkCurrencyRound(
          conversionResponse,
          <CurrencyEnum>get(request.amount, "currency")
        ),
      },
      mid: ruleProcessor.publicId,
      processorName: ruleProcessor.processor,
      tokenType: request.tokenType,
    };
  }

  private _buildTokenDynamo(
    token: TokensCardResponse,
    binInfo: DynamoBinFetch,
    request: UnifiedChargesPreauthRequest,
    merchantId: string,
    transactionReference: string,
    userId?: string,
    sessionId?: string
  ): DynamoTokenFetch {
    const last_four_digits: string = get(request, "maskedCardNumber", "").slice(
      -4
    );
    const bin_masked_card: string = get(token, "card.maskedNumber");
    let masked_card: string = get(request, "maskedCardNumber", "");
    const transaction_card_id = get(request, "transactionCardId", "");

    // istanbul ignore next
    if (!isUndefined(bin_masked_card) && !isUndefined(binInfo)) {
      const bin_type: number = get(binInfo, "binType", 6);

      masked_card =
        bin_masked_card.substring(0, bin_type) +
        "X".repeat(bin_masked_card.length - (bin_type + 4)) +
        bin_masked_card.substring(
          bin_masked_card.length - 4,
          bin_masked_card.length
        );
    }

    const dynamo_token: DynamoTokenFetch = {
      merchantId,
      sessionId,
      transactionReference,
      userId,
      amount: CardService.sFullAmount(request.amount),
      bin: get(binInfo, "bin", "").replace(/\D/g, ""),
      binInfo: {
        ...binInfo,
        bank: get(binInfo, "bank", ""),
        bin: get(binInfo, "bin", "").replace(/\D/g, ""),
        brand: get(binInfo, "brand", ""),
        processor: get(binInfo, "processor"),
      },
      cardHolderName: get(token, CARD_NAME_PATH, ""),
      created: new Date().getTime(),
      currency: <CurrencyEnum>get(request.amount, "currency"),
      id: token.token,
      ip: "",
      isBlockedCard: get(request, "tokenObject.isBlockedCard"),
      isDeferred: false,
      lastFourDigits: defaultTo(
        get(token, "card.lastFourDigits"),
        last_four_digits
      ),
      maskedCardNumber: masked_card,
      transactionCardId: transaction_card_id,
      vaultToken: request.vaultToken,
    };

    if (!isEmpty(token.sessionId) && !isEmpty(token.userId)) {
      dynamo_token.sessionId = <string>token.sessionId;
      dynamo_token.userId = <string>token.userId;
    }

    if (request.channel !== ChannelEnum.OTP_CHANNEL) {
      set(dynamo_token, "secureId", request.secureId);
      set(dynamo_token, "secureService", request.secureService);
    }

    set(dynamo_token, COUNTRY_NAME, get(binInfo, CardService.sCountryName));
    set(dynamo_token, CARD_TYPE_PATH, get(binInfo, "info.type"));
    set(dynamo_token, "vaultToken", get(request, "vaultToken"));
    set(dynamo_token, "tokenType", get(request, "tokenType"));

    return dynamo_token;
  }

  private _addTraceabilityData(
    request: UnifiedChargesPreauthRequest,
    token: DynamoTokenFetch,
    provider: string,
    isOTP: boolean,
    isSubscription: boolean,
    isSubsValidation: boolean
  ): DynamoTokenFetch {
    let security_identity: (ISecurityIdentity | ISecurityIdentityRequest)[] =
      defaultTo(get(request, "tokenObject.securityIdentity"), []);
    const is_subs_or_otp: boolean = isOTP || isSubscription || isSubsValidation;
    const kushki_info: IKushkiInfoRequest | IKushkiInfo = get(
      request,
      "tokenObject.kushkiInfo",
      {}
    );

    if (!("originId" in kushki_info) && is_subs_or_otp) {
      const origin: string = isOTP
        ? OriginTypeEnum.OTP
        : isSubscription
        ? OriginTypeEnum.SUBSCRIPTION
        : OriginTypeEnum.SUBSCRIPTION_VALIDATION;

      set(kushki_info, "origin", origin);
    }

    if (!some(security_identity, ["identityCategory", "TOKEN"]))
      security_identity = [
        ...security_identity,
        {
          ...defaultTo(
            SECURE_IDENTITY_PROVIDER[provider],
            SECURE_IDENTITY_PROVIDER[CardProviderEnum.KUSHKI]
          ),
          info: {
            status: TransactionStatusEnum.APPROVAL,
          },
        },
      ];

    const kushki_info_response: IRootResponse =
      this._coreFormatter.dataFormatter({
        kushkiInfo: kushki_info,
        securityIdentity: security_identity,
      });

    set(token, "kushkiInfo", kushki_info_response.kushkiInfo);
    set(token, "securityIdentity", kushki_info_response.securityIdentity);

    return token;
  }

  // Deprecate after deploy
  private _buildTokenDynamoForTokenCharge(
    token: TokensCardResponse,
    bin: DynamoBinFetch,
    tokenChargeRequest: TokenChargeRequest,
    merchantId: string,
    transactionReference: string,
    userId?: string,
    sessionId?: string
  ): DynamoTokenFetch {
    const last_four_digits: string = get(
      tokenChargeRequest,
      "maskedCardNumber",
      ""
    ).slice(-4);
    const bin_masked_card: string = get(token, "card.maskedNumber");
    let masked_card: string = get(tokenChargeRequest, "maskedCardNumber", "");

    if (!isUndefined(bin_masked_card) && !isUndefined(bin)) {
      const bin_type: number = get(bin, "binType", 6);

      masked_card =
        bin_masked_card.substring(0, bin_type) +
        "X".repeat(bin_masked_card.length - (bin_type + 4)) +
        bin_masked_card.substring(
          bin_masked_card.length - 4,
          bin_masked_card.length
        );
    }

    const new_token: DynamoTokenFetch = {
      merchantId,
      sessionId,
      transactionReference,
      userId,
      amount: tokenChargeRequest.totalAmount,
      bin: get(bin, "bin", ""),
      binInfo: {
        bank: get(bin, "bank", ""),
        bin: get(bin, "bin", ""),
        brand: get(bin, "brand", ""),
        processor: get(bin, "processor"),
      },
      cardHolderName: get(token, CARD_NAME_PATH, ""),
      created: new Date().getTime(),
      currency: tokenChargeRequest.currency!,
      id: token.token,
      ip: "",
      isDeferred: false,
      lastFourDigits: defaultTo(
        get(token, "card.lastFourDigits"),
        last_four_digits
      ),
      maskedCardNumber: masked_card,
      vaultToken: tokenChargeRequest.vaultToken,
    };

    if (!isEmpty(token.sessionId) && !isEmpty(token.userId)) {
      new_token.sessionId = <string>token.sessionId;
      new_token.userId = <string>token.userId;
    }

    if (tokenChargeRequest.channel !== ChannelEnum.OTP_CHANNEL)
      set(new_token, "secureId", tokenChargeRequest.secureId);

    set(new_token, COUNTRY_NAME, get(bin, CardService.sCountryName));
    set(new_token, CARD_TYPE_PATH, get(bin, "info.type"));
    set(new_token, "vaultToken", get(tokenChargeRequest, "vaultToken"));
    set(new_token, "tokenType", get(tokenChargeRequest, "tokenType"));

    return new_token;
  }

  private _handleTokenResponse(
    plcc: string | undefined,
    tokenResponse: TokensCardResponse,
    bin: string,
    reqCardHolderName: string,
    merchantCountry: string
  ): Observable<[TokensCardResponse, DynamoBinFetch | undefined]> {
    return of(1).pipe(
      mergeMap(() => {
        const card_name: string = defaultTo(
          get(tokenResponse, CARD_NAME_PATH),
          reqCardHolderName
        );
        const is_private_card: boolean = plcc === "1";

        set(
          tokenResponse,
          CARD_NAME_PATH,
          CardService.transformCardName(card_name)
        );
        CardService._validateBin(bin);

        return forkJoin([
          of(tokenResponse),
          this._validateBinInformationWithoutThrowError(
            bin,
            is_private_card,
            merchantCountry
          ),
        ]);
      }),
      tag("CardService | _handleTokenResponse")
    );
  }

  // istanbul ignore next
  private _validateBinInformationWithoutThrowError(
    bin: string,
    privateCard: boolean,
    merchantCountry: string
  ): Observable<DynamoBinFetch | undefined> {
    return of(1).pipe(
      mergeMap(() => this._getBinInfo(bin, privateCard, merchantCountry)),
      mergeMap((dynamobin: DynamoBinFetch | undefined) => {
        if (get(dynamobin, "invalid", false) === true) return of(undefined);
        return of(dynamobin);
      })
    );
  }

  private _handleValidationAndCheckPendingValues(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    transaction: Transaction[]
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () =>
            JSON.parse(`${process.env.ENABLE_VALIDATE_TRX_EXPIRATION_TIME}`) ===
            true,
          this._validateTransactionExpirationTime(transaction),
          of(transaction)
        )
      ),
      mergeMap(() =>
        this._checkPendingValues(
          event,
          get(
            transaction[0],
            "merchant_id",
            get(event, MERCHANT_ID_AUTHORIZER, "")
          ),
          transaction
        )
      ),
      tag("CardService | _handleValidationAndCheckPendingValues")
    );
  }

  private _validateTransactionExpirationTime(
    transaction: Transaction[]
  ): Observable<Transaction[]> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<LambdaGetProcessorConfigurationResponse>(
          `usrv-refund-conciliation-${process.env.USRV_STAGE}-getProcessorConfiguration`,
          {
            queryStringParameters: {
              dateToVerify: moment(get(transaction, "[0].created")).format(
                "YYYY/MM/DD"
              ),
              processorName: get(transaction, "[0].processor_name", ""),
            },
          }
        )
      ),
      mergeMap((response: LambdaGetProcessorConfigurationResponse) => {
        if (
          moment()
            .utc()
            .isAfter(
              moment(
                new Date(
                  get(response, "body.expirationConsoleDay.dateResult", "")
                )
              ).utc()
            )
        )
          return throwError(() => new KushkiError(ERRORS.E050));

        return of(transaction);
      }),
      tag("CardService | _validateTransactionExpirationTime")
    );
  }

  private _getProcessorError(
    err: Error,
    processor: string
  ): Observable<AcqCardResponse | AurusResponse> {
    let metadata: object = {};

    if (
      !(err instanceof KushkiError || err instanceof AurusError) ||
      processor !== ProcessorEnum.KUSHKI
    )
      return throwError(() => err);

    metadata = defaultTo(err.getMetadata(), {});
    const message_fields: MessageFields = {
      ...get(metadata, MESSAGE_FIELDS_DETAILS_PATH, {}),
    };
    const restricted: boolean = get(metadata, "restricted", false);

    if (restricted) set(message_fields, "restricted", restricted);

    return of({
      approved_amount: "0",
      processor_code: get(metadata, "processor_code", ""),
      recap: "",
      response_code: get(metadata, "response_code", ""),
      response_text: get(metadata, "response_text", ""),
      ticket_number: "",
      transaction_details: {
        approvalCode: get(metadata, APPROVAL_CODE_PATH, ""),
        cardHolderName: get(metadata, "transaction_details.cardHolderName", ""),
        lastFourDigitsOfCard: get(metadata, LAST_FOUR_DIGITS_DETAILS_PATH, ""),
        cardType: get(metadata, "transaction_details.cardType", ""),
        conciliationId: get(metadata, "transaction_details.conciliationId"),
        binCard: get(metadata, BIN_CARD_DETAILS_PATH, ""),
        processorName: get(metadata, PROCESSOR_NAME_DETAILS_PATH, ""),
        processorBankName: get(
          metadata,
          "transaction_details.processorBankName",
          ""
        ),
        isDeferred: get(metadata, IS_DEFERRED_DETAILS_PATH, ""),
        merchantName: get(metadata, MERCHANT_NAME_DETAILS_PATH, ""),
        messageFields: message_fields,
      },
      transaction_id: get(
        metadata,
        "transaction_id",
        nanoSeconds.now().toString().replace(",", "")
      ),
      transaction_reference: get(metadata, "transaction_reference", ""),
    });
  }

  private _buildReauthTransaction(
    transaction: Transaction,
    response: AurusResponse,
    newAmount: Amount
  ): Transaction {
    const new_transaction: Transaction = cloneDeep(transaction);
    const response_code = get(response, "response_code", "");
    const is_approved = APPROVAL_CODES.includes(response_code);

    new_transaction.available = true;
    new_transaction.created = moment().utc().valueOf();
    new_transaction.voided = "false";
    new_transaction.ice_value = newAmount.ice;

    unset(new_transaction, "ticket_number");

    if (is_approved) {
      new_transaction.ticket_number = response.ticket_number;
      new_transaction.preauth_transaction_reference =
        transaction.transaction_reference;
      new_transaction.processor_transaction_id =
        response.processor_transaction_id;
      new_transaction.accumulated_amount = this._getAccumulatedAmount(
        transaction,
        response
      );
    } else {
      unset(new_transaction, "approval_code");
      unset(new_transaction, "recap");
    }

    new_transaction.sequence_created = this._getSequenceCreated(transaction);
    new_transaction.transaction_status = is_approved
      ? TransactionStatusEnum.APPROVAL
      : TransactionStatusEnum.DECLINED;

    new_transaction.sequence_id = transaction.sequence_id;
    new_transaction.transaction_id = response.transaction_id;
    new_transaction.approved_transaction_amount = Number(
      response.approved_amount
    );
    new_transaction.transaction_reference = response.transaction_reference;
    new_transaction.amount = newAmount;
    new_transaction.transaction_type = TransactionTypeEnum.REAUTH;
    new_transaction.subtotal_iva = newAmount.subtotalIva;
    new_transaction.subtotal_iva0 = newAmount.subtotalIva0;
    new_transaction.iva = newAmount.iva;
    new_transaction.request_amount = CardService.sFullAmount(newAmount);
    set(
      new_transaction,
      "processor.code",
      get(response, "processor_code", response_code)
    );
    set(new_transaction, "processor.message", response.response_text);

    if (transaction.transaction_type === TransactionTypeEnum.PREAUTH)
      new_transaction.sequence_id = transaction.ticket_number;

    set(new_transaction, "response_code", response_code);
    set(new_transaction, "response_text", get(response, "response_text", ""));

    const message_fields: MessageFields = get(
      response,
      MESSAGE_FIELDS_DETAILS_PATH,
      {}
    );

    if (!isEmpty(message_fields))
      set(new_transaction, "message_fields", message_fields);

    return new_transaction;
  }

  private _getAccumulatedAmount(
    transaction: Transaction,
    response: AurusResponse
  ): number {
    if (!isUndefined(transaction.accumulated_amount))
      return this._performSum(
        Number(response.approved_amount),
        get(transaction, "accumulated_amount", 0)
      );

    return this._performSum(
      Number(response.approved_amount),
      transaction.approved_transaction_amount
    );
  }

  private _getSequenceCreated(transaction: Transaction): number {
    if (!isUndefined(transaction.sequence_created))
      return transaction.sequence_created;

    return transaction.created;
  }

  private _saveTransactionReauth(
    amount: Amount,
    processorResponse: AurusResponse,
    transaction: Transaction
  ): Observable<Transaction> {
    return of(1).pipe(
      mergeMap(() => this._checkConvertedAmount(amount)),
      map((conversionResponse: [ConvertionResponse, Amount]) =>
        this._buildReauthTransaction(
          transaction,
          processorResponse,
          conversionResponse[1]
        )
      ),
      mergeMap((newTransaction: Transaction) =>
        forkJoin([this._saveTransaction(newTransaction), of(newTransaction)])
      ),
      mergeMap(
        ([saved_transaction, new_transaction]: [boolean, Transaction]) => {
          this._logger.info("CardService | save Status", { saved_transaction });

          return of(new_transaction);
        }
      ),
      tag("CardService | _saveTransactionReauth")
    );
  }

  private _saveTransactionValidateAccount(
    acqCardResponse: AcqCardResponse,
    eventRequest: AccountValidationRequest,
    dynamoMerchant: DynamoMerchantFetch,
    dynamoToken: DynamoTokenFetch,
    invokeResponse: InvokeTrxRuleResponse,
    requestContext: IRequestContext<AuthorizerContext>
  ): Observable<boolean> {
    this._logger.info(
      "CardService | card validation | processor response",
      acqCardResponse
    );
    const dynamo_transaction: object = this._buildDynamoTransaction(
      eventRequest,
      invokeResponse,
      dynamoToken,
      dynamoMerchant,
      acqCardResponse,
      requestContext
    );

    return this._storage.put(dynamo_transaction, TABLES.transaction);
  }

  private _buildTrxRuleRequest(
    bodyRequest: object,
    requestContext: AuthorizerContext,
    dynamoMerchant: DynamoMerchantFetch,
    dynamoToken: DynamoTokenFetch
  ): UnifiedChargesPreauthRequest {
    return {
      amount: {
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: get(bodyRequest, "totalAmount", 0),
      },
      authorizerContext: requestContext,
      cardHolderName: "",
      ignoreWarnings: false,
      isDeferred: false,
      lastFourDigits: "",
      maskedCardNumber: "",
      merchant: {
        ...dynamoMerchant,
        merchantId: dynamoMerchant.public_id,
        merchantName: dynamoMerchant.merchant_name,
      },
      merchantId: dynamoMerchant.public_id,
      tokenCreated: 0,
      tokenCurrency: "",
      tokenId: "",
      tokenObject: dynamoToken,
      tokenType: "transaction",
      transactionReference: "",
      transactionType: TransactionRuleTypeEnum.ACCOUNT_VALIDATION,
      usrvOrigin: "",
    };
  }

  private _buildTokenThreeDSObject(threeDS: Cybersource): object {
    return {
      acsURL: get(threeDS, "detail.acsURL", ""),
      authenticationTransactionId: get(
        threeDS,
        "detail.authenticationTransactionId",
        ""
      ),
      authRequired: get(threeDS, "authentication", false),
      paReq: get(threeDS, "detail.paReq", ""),
      specificationVersion: get(threeDS, "detail.specificationVersion", ""),
    };
  }

  private _handleReAuthorizationError(
    err: Error,
    amount: Amount,
    processor: string,
    transaction: Transaction
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => this._getProcessorError(err, processor)),
      mergeMap((acqCardResponse: AurusResponse) =>
        this._saveTransactionReauth(amount, acqCardResponse, transaction)
      ),
      mergeMap(() => throwError(() => err)),
      tag("CardService | _handleReAuthorizationError")
    );
  }

  private _getSemaphoreData(
    merchant_id: string,
    request: IRequestContext<AuthorizerContext>
  ): Observable<{ body: MerchantResponse }> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: WebhookSignatureResponse }>(
          `usrv-webhook-${process.env.USRV_STAGE}-getWebhookSignature`,
          {
            pathParameters: {
              merchantId: merchant_id,
            },
            requestContext: request,
          }
        )
      ),
      catchError(() => throwError(() => new KushkiError(ERRORS.E502))),
      mergeMap((data: { body: WebhookSignatureResponse }) =>
        this._lambda.invokeFunction(
          `kushki-usrv-webcheckout-${process.env.USRV_STAGE}-updateMerchant`,
          {
            body: {
              privateMerchantId: get(data.body, "webhookSignature", ""),
              status: true,
            },
            pathParameters: {
              merchantId: merchant_id,
            },
            requestContext: {
              authorizer: {
                merchantId: merchant_id,
              },
            },
          }
        )
      ),
      catchError(() => throwError(() => new KushkiError(ERRORS.E503))),
      concatMap(() => {
        const body = this._buildCardsBody();

        return this._lambda.invokeFunction(
          `usrv-card-${process.env.USRV_STAGE}-updateMerchant`,
          {
            body,
            pathParameters: {
              merchantId: merchant_id,
            },
            requestContext: request,
          }
        );
      }),
      catchError(() => throwError(() => new KushkiError(ERRORS.E501))),
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: MerchantResponse }>(
          `usrv-vpos-${process.env.USRV_STAGE}-getMerchantAdmin`,
          {
            pathParameters: {
              merchantId: merchant_id,
            },
            requestContext: request,
          }
        )
      ),
      catchError(() => throwError(() => new KushkiError(ERRORS.E504))),
      tag("CardService | _getSemaphoreData")
    );
  }

  private _handleValidateAccountError(
    err: Error,
    eventRequest: AccountValidationRequest,
    dynamoMerchant: DynamoMerchantFetch,
    dynamoToken: DynamoTokenFetch,
    trxRuleResponse: InvokeTrxRuleResponse,
    requestContext: IRequestContext<AuthorizerContext>
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        this._getProcessorError(
          err,
          get(trxRuleResponse, "processor.processor_name", "")
        )
      ),
      mergeMap((acqCardResponse: AcqCardResponse) =>
        this._saveTransactionValidateAccount(
          acqCardResponse,
          eventRequest,
          dynamoMerchant,
          dynamoToken,
          trxRuleResponse,
          requestContext
        )
      ),
      mergeMap(() => throwError(() => err)),
      tag("CardService | _handleValidateAccountError")
    );
  }

  private _invalidateTransactionType(transactionType: string) {
    if (transactionType === TransactionTypeEnum.REAUTH)
      throw new KushkiError(ERRORS.E041);
  }

  private _normalizeEvent(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<
    IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  > {
    return of(1).pipe(
      mergeMap(() => {
        const first_name: string = get(
          event,
          "body.contactDetails.firstName",
          ""
        );

        if (!isEmpty(first_name))
          set(
            event,
            "body.contactDetails.firstName",
            first_name.normalize("NFKC")
          );
        return of(event);
      })
    );
  }

  private _validateEventPathActive(eventPath: string): boolean {
    const is_oct: boolean = this._isOCTApiGatewayPath(eventPath);

    if (is_oct) return process.env.IS_ACTIVE_OCT === "true";

    return true;
  }

  private _getId(authorizer: AuthorizerContext): Observable<string> {
    return of(1).pipe(
      map(() => {
        if (typeof authorizer.hierarchyConfig === "string")
          authorizer.hierarchyConfig = JSON.parse(
            <string>get(authorizer, "hierarchyConfig", "{}")
          );

        const path: string = "hierarchyConfig.processing.processors";
        const merchant_id: string = get(authorizer, path);

        return merchant_id || authorizer.merchantId;
      }),
      tag("CardService | _getId")
    );
  }

  private _getContactDetails(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<
    IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  > {
    return of(1).pipe(
      mergeMap(() => {
        if (
          CountryEnum.BRAZIL ===
          get(event, "requestContext.authorizer.merchantCountry", "")
        )
          return this._validateContactDetails(event);

        return of(event);
      }),
      tag("CardService | _getContactDetails")
    );
  }

  private _validateContactDetails(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<
    IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  > {
    return of(1).pipe(
      switchMap(() =>
        this._storage.getItem<DynamoTokenFetch>(TABLES.tokens, {
          id: event.body.token,
        })
      ),
      mergeMap((tokenDynamo: DynamoTokenFetch | undefined) => {
        if (has(tokenDynamo, "contactDetails"))
          event.body.contactDetails = {
            documentNumber: get(
              tokenDynamo,
              "contactDetails.documentNumber",
              get(event.body, "contactDetails.documentNumber", "")
            ),
            documentType: get(
              tokenDynamo,
              "contactDetails.documentType",
              get(event.body, "contactDetails.documentType", "")
            ),
            email: get(
              tokenDynamo,
              CONTACT_DETAILS,
              get(event.body, CONTACT_DETAILS, "")
            ),
            firstName: get(
              tokenDynamo,
              "contactDetails.firstName",
              get(event.body, "contactDetails.firstName", "")
            ),
            lastName: get(
              tokenDynamo,
              "contactDetails.lastName",
              get(event.body, "contactDetails.lastName", "")
            ),
            phoneNumber: get(
              tokenDynamo,
              CONTACT_DETAILS_PHONE_NUMBER,
              get(event.body, CONTACT_DETAILS_PHONE_NUMBER, "")
            ),
            secondLastName: get(
              tokenDynamo,
              "contactDetails.secondLastName",
              get(event.body, "contactDetails.secondLastName", "")
            ),
          };
        return of(event);
      }),
      tag("CardService | _validateContactDetails")
    );
  }

  private _validateVoidTimeLimit(
    transaction: Transaction | SubscriptionDynamo,
    merchant: DynamoMerchantFetch
  ): void {
    const now: Date = new Date();
    const milli_to_day_converse: number = 1000 * 3600 * 24;

    const merchant_country: string = UtilsService.getCountryISO(
      get(merchant, TRX_COUNTRY, "")
    ).toLowerCase();
    const card_country: string = UtilsService.getCountryISO(
      get(transaction, TRX_CARD_COUNTRY, "")
    ).toLowerCase();
    const trx_scope: string = isEqual(merchant_country, card_country)
      ? SCOPE_DOM
      : SCOPE_INT;

    const env_time_limits: object = get(
      KushkiAcqService.getKushkiAcqVars(),
      REFUND_TIME_LIMIT,
      DEFAULT_TIME_LIMIT
    );

    let days_limit: number = get(
      env_time_limits,
      `${merchant_country}_${trx_scope}`,
      120
    );

    if (!isEqual(transaction.processor_name, ProcessorEnum.KUSHKI)) {
      days_limit = get(
        JSON.parse(`${process.env.ENV_VARS}`),
        "maxDaysRefunds",
        730
      );
    }

    const days_since_trx: number = Math.round(
      (now.getTime() - transaction.created) / milli_to_day_converse
    );

    if (days_since_trx > days_limit) {
      const err_msj: string = `time limit exceeded, max days: ${days_limit} days since trx: ${days_since_trx}`;

      isEqual(transaction.processor_name, ProcessorEnum.KUSHKI)
        ? this._logger.error(err_msj)
        : this._rollbar.warning(err_msj);

      throw new KushkiError(ERRORS.E052);
    }
  }
}
