/**
 * SubscriptionService file
 */
import {
  DynamoEventNameEnum,
  ErrorMapper,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE,
  IDynamoDbEvent,
  IDynamoRecord,
  IErrorMapperResponse,
  ILambdaGateway,
  ILogger,
  ISQSEvent,
  KushkiError,
} from "@kushki/core";
import {
  IdentityCodeEnum,
  ManagementTypesEnum,
  PartnerNameEnum,
  PaymentMethodsEnum,
  PlatformsCodesEnum,
} from "@kushki/core/lib/infrastructure/DataFormatterCatalogEnum";
import {
  IDataFormatter,
  IKushkiInfo,
  IKushkiInfoRequest,
  IRootResponse,
  ISecurityIdentity,
  ISecurityIdentityRequest,
} from "@kushki/core/lib/repository/IDataFormatter";
import { pascalCase } from "change-case";
import { IDENTIFIERS } from "constant/Identifiers";
import { RuleTransaction } from "constant/Resources";
import { TABLES } from "constant/Tables";
import deepCleaner = require("deep-cleaner");
import dotObject = require("dot-object");
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { CategoryTypeEnum } from "infrastructure/CategoryTypeEnum";
import { CountryEnum } from "infrastructure/CountryEnum";
import {
  ERROR_REJECTED_TRANSACTION,
  ErrorCode,
  ERRORS,
  RejectedTransactionEnum,
  SECURE_SERVICE_ERROR_CODES,
  WarningSecurityEnum,
} from "infrastructure/ErrorEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { PlatformsVersionEnum } from "infrastructure/KushkiInfoEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { ProcessorTypeEnum } from "infrastructure/ProcessorTypeEnum";
import {
  PartnerValidatorEnum,
  SECURE_SERVICE_PARTNERS,
  SECURITY_IDENTITY,
  SECURITY_PARTNERS,
} from "infrastructure/SecureIdentityEnum";
import { SecurityTypesEnum } from "infrastructure/SecurityTypesEnum";
import { SQSChargesInput } from "infrastructure/SQSChargesInput";
import { SubscriptionAttemptMessageEnum } from "infrastructure/SubscriptionAttemptMessageEnum";
import {
  SubscriptionTriggerEnum,
  SubscriptionTrxTypeEnum,
} from "infrastructure/SubscriptionEnum";
import { TokenTypeEnum } from "infrastructure/TokenTypeEnum";
import { TransactionActionEnum } from "infrastructure/TransactionActionEnum";
import { TransactionPriorityEnum } from "infrastructure/TransactionPriorityEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import {
  SuccessfulAuthentication3DSEnum,
  TransactionStatusEnum,
  TRX_OK_RESPONSE_CODE,
} from "infrastructure/TransactionStatusEnum";
import { TransactionSyncModeEnum } from "infrastructure/TransactionSyncModeEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import {
  cloneDeep,
  defaultTo,
  findIndex,
  get,
  has,
  includes,
  isEmpty,
  isEqual,
  isNil,
  isNull,
  isObject,
  isUndefined,
  omit,
  set,
  size,
  split,
  unset,
  without,
} from "lodash";
import moment = require("moment");
import nanoSeconds = require("nano-seconds");
import "reflect-metadata";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IEventBridgeGateway } from "repository/IEventBridgeGateway";
import { ISQSGateway } from "repository/ISQSGateway";
import {
  ITransactionService,
  ProcessRecordRequest,
  VoidBody,
} from "repository/ITransactionService";
import rollbar = require("rollbar");
import { forkJoin, from, iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  defaultIfEmpty,
  delay,
  filter,
  map,
  mapTo,
  mergeMap,
  switchMap,
  timeoutWith,
  toArray,
} from "rxjs/operators";
import { CardService, EventCharge } from "service/CardService";
import { UtilsService } from "service/UtilsService";
import { AccountInfoRequest } from "types/account_info_request";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CardTrxFailed } from "types/card_trx_failed";
import { DynamoChargeFetch } from "types/dynamo_charge_fetch";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { FailedSubscriptionRequest } from "types/failed_subscription_request";
import { InformSiftTransactionRequest } from "types/inform_sift_transaction_request";
import { LambdaTransactionRuleResponse } from "types/lambda_transaction_rule_response";
import { RecordTransactionRequest } from "types/record_transaction_request";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { SaveDeclineTrxRequest } from "types/save_decline_trx_request";
import { SyncTransactionStream } from "types/sync_transaction_stream";
import { Transaction } from "types/transaction";
import { UpdateProcessorRequest } from "types/update_processor_request";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { v4 } from "uuid";
import { MessageFields } from "types/preauth_full_response_v2";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";

interface IAurusTransaction {
  TRANSACTION_METADATA: string;
}

interface IAurusSubscription {
  SUBSCRIPTION_METADATA: string;
}

const ECOMMERCE: string = "ecommerce";

type DynamoProcessorReq = {
  code?: string;
  message?: string;
};

/**
 * Implementation
 */
@injectable()
export class TransactionService implements ITransactionService {
  private readonly _dynamoCondition: string =
    "attribute_not_exists(transaction_id)";
  private readonly _binInfoCardCountryPath: string =
    "binInfo.info.country.name";
  private readonly _binInfoCardAlphaPath: string =
    "binInfo.info.country.alpha2";
  private readonly _securityPath: string = "security.partner";
  private readonly _securityWhitelistPath: string = "security.whitelist";
  private readonly _processorsTypes: string[] = [
    ProcessorTypeEnum.TRADITIONAL,
    ProcessorTypeEnum.GATEWAY,
  ];
  private readonly _transactionRuleResponseCodePath: string = "rules[0].code";
  private readonly _transactionRuleResponseMessagePath: string =
    "rules[0].message";
  private readonly _security3DsCodePath: string = "security3Ds.code";
  private readonly _processorNamePath: string = "processor_name";
  private readonly _responseTextPath: string = "responseText";
  private readonly _responseTextSnakePath: string = "response_text";
  private readonly _secureIdPath: string = "secureId";
  private readonly _secureServicePath: string = "secureService";
  private readonly _metadataSubsValidationPath: string =
    "metadata.ksh_subscriptionValidation";
  private readonly _merchantDataAuthContext: string =
    "authorizerContext.merchantData";

  private static _buildDynamo(
    data: RecordTransactionRequest,
    context?: AuthorizerContext
  ): object {
    data.dateAndTimeTransaction = moment
      .utc(data.dateAndTimeTransaction, "DDMMYYYYHHmmss")
      .format("x");
    data.syncMode = defaultTo(data.syncMode, "api");
    if (data.ticketNumber === "") delete data.ticketNumber;
    if (data.saleTicketNumber === "") delete data.saleTicketNumber;
    if (data.extraTaxes === "") delete data.extraTaxes;
    const merchantID: string = get(context, "merchantId", "");
    const customerMerchantID: string = get(
      context,
      "customerMerchantId",
      merchantID
    );
    const ownerID: string = get(context, "ownerId", merchantID);

    dotObject.set("customer_merchant_id", customerMerchantID, data);
    dotObject.set("owner_id", ownerID, data);
    dotObject.move(
      "approvedTransactionAmount",
      "approved_transaction_amount",
      data
    );
    dotObject.move("acquirerBank", "acquirer_bank", data);
    dotObject.move("binType", "bin_type", data);
    dotObject.move("convertedAmount", "converted_amount", data);
    dotObject.move("subtotalIVA", "subtotal_iva", data);
    dotObject.move("subtotalIVA0", "subtotal_iva0", data);
    dotObject.move("dateAndTimeTransaction", "created", data);
    data.created = Number(data.created);
    dotObject.move("responseCode", "response_code", data);
    dotObject.move("partner", "partner", data);
    dotObject.move("integrationMethod", "integration_method", data);
    dotObject.move("processor", "processor", data);
    dotObject.move("ticketNumber", "ticket_number", data);
    dotObject.move("transactionType", "transaction_type", data);
    dotObject.move("approvalCode", "approval_code", data);
    dotObject.move("transactionStatus", "transaction_status", data);
    dotObject.move("syncMode", "sync_mode", data);
    dotObject.move("currencyCode", "currency_code", data);
    dotObject.move("merchantId", "merchant_id", data);
    dotObject.move("interestAmount", "interest_amount", data);
    dotObject.move("processorType", "processor_type", data);
    dotObject.move("processorId", "processor_id", data);
    dotObject.move("transactionId", "transaction_id", data);
    dotObject.move("extraTaxes", "taxes", data);
    dotObject.move("Metadata", "metadata", data);
    dotObject.move("subscription_metadata", "subscription_metadata", data);
    dotObject.move("subscriptionId", "subscription_id", data);
    dotObject.move("responseText", "response_text", data);
    dotObject.move("cardHolderName", "card_holder_name", data);
    dotObject.move("lastFourDigitsOfCard", "last_four_digits", data);
    dotObject.move("binCard", "bin_card", data);
    dotObject.move("paymentBrand", "payment_brand", data);
    dotObject.move("consortiumName", "consortium_name", data);
    dotObject.move("cardType", "card_type", data);
    dotObject.move("numberOfMonths", "number_of_months", data);
    dotObject.move("method", "method", data);
    dotObject.move("saleTicketNumber", "sale_ticket_number", data);
    dotObject.move("iceValue", "ice_value", data);
    dotObject.move("requestAmount", "request_amount", data);
    dotObject.move("ivaValue", "iva_value", data);
    dotObject.move("merchantName", "merchant_name", data);
    dotObject.move("processorName", "processor_name", data);
    dotObject.move("graceMonths", "grace_months", data);
    dotObject.move("creditType", "credit_type", data);
    dotObject.move("processorBankName", "processor_bank_name", data);
    dotObject.move("transactionReference", "transaction_reference", data);
    dotObject.move("conciliationId", "buy_order", data);
    dotObject.move("issuingBank", "issuing_bank", data);
    dotObject.move("contactDetails", "contact_details", data);
    dotObject.move("convertedAmount", "converted_amount", data);
    dotObject.move("country", "country", data);
    dotObject.move("foreignCard", "foreign_card", data);
    dotObject.move(
      "preauthTransactionReference",
      "preauth_transaction_reference",
      data
    );
    dotObject.move("processorTransactionId", "processor_transaction_id", data);
    dotObject.move("processorChannel", "processor_channel", data);
    dotObject.move("purchaseNumber", "purchase_number", data);
    dotObject.move("action", "action", data);
    dotObject.move("socialReason", "social_reason", data);
    dotObject.move("merchantCategory", "category_merchant", data);
    dotObject.move("consortiumName", "card_consortium_name", data);
    dotObject.move("taxId", "tax_id", data);
    dotObject.move("cardCountryCode", "card_country_code", data);
    dotObject.move("cardCountry", "card_country", data);
    dotObject.move("parentTicketNumber", "parent_ticket_number", data);
    dotObject.move("parentMerchantId", "parent_merchant_id", data);
    dotObject.move("responseTime", "response_time", data);
    dotObject.move("secureCode", "secure_code", data);
    dotObject.move("secureMessage", "secure_message", data);
    dotObject.move("secureReasonCode", "secure_reason_code", data);
    dotObject.copy("kushkiMetadata", "kushki_metadata", context, data);
    dotObject.copy("credentialId", "credential_id", context, data);
    dotObject.copy("credentialAlias", "credential_alias", context, data);
    dotObject.copy("credentialMetadata", "credential_metadata", context, data);
    dotObject.copy("publicCredentialId", "public_credential_id", context, data);
    dotObject.copy("integration", "integration", context, data);
    dotObject.copy("integrationMethod", "integration_method", context, data);
    dotObject.move("originalBin", "original_bin", data);
    dotObject.move("sendCvv", "send_cvv", data);
    dotObject.move("isInitialCof", "is_initial_cof", data);
    dotObject.move("merchantData", "merchant_data", data);
    dotObject.move("externalReferenceId", "external_reference_id", data);

    if (!Boolean(get(data, "transaction_reference")))
      delete data.transaction_reference;

    if (!isEmpty(get(data, "buyOrder")))
      dotObject.move("buyOrder", "buy_order", data);

    unset(data, "originalFullResponse");
    unset(data, "amount.totalAmount");
    unset(data, "authorizerContext");
    unset(data, "binInfo");
    unset(data, "card_type_bin");
    unset(data, "credentialId");
    unset(data, "cvv");
    unset(data, "expiryMonth");
    unset(data, "expiryYear");
    unset(data, "lastFourDigits");
    unset(data, "merchant");
    unset(data, "merchantCountry");
    unset(data, "tokenCreated");
    unset(data, "tokenCurrency");
    unset(data, "tokenId");
    unset(data, "tokenType");
    unset(data, "transactionKind");
    unset(data, "userAgent");
    unset(data, "usrvOrigin");
    unset(data, "vaultToken");
    unset(data, "req");

    delete data.commerceCode;
    unset(data, "isDeferred");
    delete data.processorPrivateId;

    return deepCleaner(data);
  }

  private readonly _storage: IDynamoGateway;
  private readonly _lambda: ILambdaGateway;
  private readonly _eventBridge: IEventBridgeGateway;
  private readonly _rollbar: rollbar;
  private readonly _logger: ILogger;
  private readonly _antifraud: IAntifraudGateway;
  private readonly _coreFormatter: IDataFormatter;
  private readonly _sqs: ISQSGateway;

  constructor(
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.AntifraudGateway) antifraud: IAntifraudGateway,
    @inject(IDENTIFIERS.EventBridgeGateway) eventBridge: IEventBridgeGateway,
    @inject(CORE.RollbarInstance) rollbarInstance: rollbar,
    @inject(CORE.Logger) logger: ILogger,
    @inject(CORE.DataFormatter) coreFormatter: IDataFormatter,
    @inject(IDENTIFIERS.SQSGateway) sqs: ISQSGateway
  ) {
    this._rollbar = rollbarInstance;
    this._storage = storage;
    this._lambda = lambda;
    this._eventBridge = eventBridge;
    this._logger = logger;
    this._coreFormatter = coreFormatter;
    this._antifraud = antifraud;
    this._sqs = sqs;
  }

  public record(
    event: IAPIGatewayEvent<RecordTransactionRequest>
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () =>
            this._validateRecord(
              event.body.merchantId,
              event.body.transactionReference
            ),
          this.cleanRecord(event),
          of({ status: "OK" })
        )
      )
    );
  }

  public cleanRecord(
    event: IAPIGatewayEvent<RecordTransactionRequest>
  ): Observable<object> {
    return of(1).pipe(
      delay(5000),
      switchMap(() =>
        forkJoin([
          this._storage.query<Transaction>(
            TABLES.transaction,
            IndexEnum.transaction_transaction_id,
            "transaction_id",
            event.body.transactionId
          ),
          this._storage.getItem<DynamoChargeFetch>(TABLES.charges, {
            transactionId: event.body.transactionId,
          }),
        ])
      ),
      mergeMap(
        ([transaction, dynamo_charge]: [
          Transaction[],
          DynamoChargeFetch | undefined
        ]) =>
          forkJoin([
            of(transaction),
            of(dynamo_charge),
            this._getBinInfo(
              event.body.binCard,
              get(dynamo_charge, "merchantCountry", "")
            ),
          ])
      ),
      map(
        (
          data: [
            Transaction[],
            DynamoChargeFetch | undefined,
            DynamoBinFetch | undefined
          ]
        ) => {
          const data_transactions: Transaction[] = data[0];
          const data_dynamo_charge: DynamoChargeFetch | undefined = data[1];

          if (
            data_dynamo_charge !== undefined &&
            data_dynamo_charge.deferred !== undefined
          ) {
            event.body.graceMonths = data_dynamo_charge.deferred.graceMonths;
            event.body.creditType = data_dynamo_charge.deferred.creditType;
            event.body.numberOfMonths = data_dynamo_charge.deferred.months;
          }

          const card_type: string = get(data[2], "info.type", "");
          const brand: string = get(data[2], "brand", "");

          event.body.paymentBrand = isEmpty(brand)
            ? get(event, "body.paymentBrand", "")
            : brand;

          event.body.cardType = isEmpty(card_type)
            ? "credit"
            : card_type.toLowerCase();

          return data_transactions;
        }
      ),
      switchMap((transactions: Transaction[]) =>
        iif(
          () => transactions.length === 0,
          this._processRecord(event),
          of(true)
        )
      ),
      tag("TransactionService | record"),
      map(() => ({ status: "OK" }))
    );
  }

  public syncTransactions(
    event: IDynamoDbEvent<SyncTransactionStream>
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => event.Records.length !== 0,
          this._syncToEventBridge(
            event.Records,
            `${process.env.EVENT_BUS_TRANSACTIONS}`,
            `${process.env.DYNAMO_TRANSACTION}`
          ),
          of(true)
        )
      ),
      tag("TransactionService | syncTransaction")
    );
  }

  public saveCardTrxFailed(
    event: ISQSEvent<CardTrxFailed>
  ): Observable<boolean> {
    return of(event.Records[0].body).pipe(
      mergeMap((trx: CardTrxFailed) =>
        this._lambda.invokeFunction<object>(
          `usrv-monitor-${process.env.USRV_STAGE}-sendOpsCustomAlert`,
          {
            body: JSON.stringify({
              description: get(trx, "transaction.transactionReference", ""),
              message: "Failed to update transaction",
              priority: TransactionPriorityEnum.CRITICAL,
            }),
          }
        )
      ),
      map(() => true),
      tag("TransactionService | saveCardTrxFailed")
    );
  }

  public syncBilling(
    _event: IDynamoDbEvent<SyncTransactionStream>
  ): Observable<boolean> {
    return of(true);
  }

  public syncRedshift(
    _event: IDynamoDbEvent<SyncTransactionStream>
  ): Observable<boolean> {
    return of(true);
  }

  public processRecord(request: ProcessRecordRequest): Observable<Transaction> {
    const record_trx_request = this._startBuildingTransactionObj(request);

    record_trx_request.maskedCardNumber = defaultTo(
      request.tokenInfo.maskedCardNumber,
      request.aurusChargeResponse.maskedCardNumber
    );

    return this._buildAndSaveTransaction(
      record_trx_request,
      request.authorizerContext
    ).pipe(tag("TransactionService | processRecord"));
  }

  public processVoidRecord(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    chargeTrx: Transaction
  ): Observable<Transaction> {
    return of(1).pipe(
      map(() => {
        const req_trx: Partial<RecordTransactionRequest> = {
          dateAndTimeTransaction: moment().format("DDMMYYYYHHmmss"),
          processorChannel: chargeTrx.processor_channel,
          saleTicketNumber: event.pathParameters.ticketNumber,
          syncMode: TransactionSyncModeEnum.ONLINE,
          ticketNumber: chargeTrx.ticket_number,
          transactionId: chargeTrx.transaction_id,
          transactionReference: chargeTrx.transaction_reference,
          transactionStatus: TransactionStatusEnum.INITIALIZED,
          transactionType: TransactionTypeEnum.VOID,
          externalReferenceId: event.body?.externalReferenceId,
        };
        set(req_trx, "Metadata", event.body?.metadata);

        if (!isEmpty(get(chargeTrx, "mccCode", "")))
          req_trx.mccCode = get(chargeTrx, "mccCode", "");

        return {
          ...this._mapVoidRecord(chargeTrx, req_trx),
        };
      }),
      switchMap((trx: Partial<RecordTransactionRequest>) =>
        this._buildAndSaveTransaction(trx, event.requestContext.authorizer)
      ),
      tag("TransactionService | processVoidRecord")
    );
  }

  public saveCardTrxsSQS(event: ISQSEvent<Transaction>): Observable<boolean> {
    return of(1).pipe(
      switchMap(() => {
        const transaction: Transaction = event.Records[0].body;

        return this._finishSavingTransaction(transaction);
      }),
      map(() => true),
      tag("CardService | saveCardTrxsSQS")
    );
  }

  public saveChargesTrxsSQS(
    event: ISQSEvent<SQSChargesInput>
  ): Observable<boolean> {
    return of(1).pipe(
      switchMap(() => {
        const transaction: Transaction = event.Records[0].body.transaction;

        return forkJoin([
          this._storage.put(event.Records[0].body.charge, TABLES.charges),
          this._finishSavingTransaction(transaction),
        ]);
      }),
      mergeMap(() =>
        this._validateSiftScienceCharge(
          event.Records[0].body.token,
          event.Records[0].body.merchant,
          event.Records[0].body.transaction.ticket_number
        )
      ),
      map(() => true),
      tag("TransactionService | saveChargesTrxsSQS")
    );
  }

  public saveDeclineTrx(request: SaveDeclineTrxRequest): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.query<DynamoTokenFetch>(
          TABLES.tokens,
          IndexEnum.tokens_secure_id_index,
          "secureId",
          get(request, "secureId", "")
        )
      ),
      mergeMap((dynamoToken: DynamoTokenFetch[]) =>
        iif(
          () => size(dynamoToken) > 0,
          of(dynamoToken[0]),
          this._buildDynamoTokenWithBinInfo(request)
        )
      ),
      mergeMap((transactionToken: DynamoTokenFetch) =>
        forkJoin([
          of(transactionToken),
          this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: request.merchantId,
          }),
        ])
      ),
      map(
        ([transaction_token, merchant]: [
          DynamoTokenFetch,
          DynamoMerchantFetch | undefined
        ]) =>
          this._buildDeclinedTransaction(transaction_token, request, merchant)
      ),
      mergeMap((transaction: Transaction) =>
        this._addTraceabilityData(request, transaction)
      ),
      mergeMap((transaction: Transaction) =>
        this._storage.put(transaction, TABLES.transaction)
      ),
      tag("TransactionService | saveDeclineTrx")
    );
  }

  public buildTransactionObject(request: ProcessRecordRequest): Transaction {
    let trx_request: Partial<RecordTransactionRequest> =
      this._startBuildingTransactionObj(request);

    trx_request = this._addTraceabilityInformation(request, trx_request);

    return this._finishBuildingTransactionObj(
      trx_request,
      request.authorizerContext,
      get(request, "requestEvent.tokenType", TokenTypeEnum.TRANSACTION)
    );
  }

  private _addTraceabilityData(
    request: SaveDeclineTrxRequest,
    transaction: Transaction
  ): Observable<Transaction> {
    return of(1).pipe(
      mergeMap(() => {
        const provider: string =
          request.transactionType === "token" ? CardProviderEnum.KUSHKI : "";

        return CardService.getTraceabilityData(
          request,
          provider,
          this._coreFormatter,
          true
        );
      }),
      mergeMap((traceabilityData: IRootResponse) =>
        of({ ...traceabilityData, ...transaction })
      ),
      tag("TransactionService | _addTraceabilityData")
    );
  }

  private _buildDynamoTokenWithBinInfo(
    request: SaveDeclineTrxRequest
  ): Observable<DynamoTokenFetch> {
    return of(1).pipe(
      mergeMap(() =>
        this._getBinInfo(get(request, "bin", ""), get(request, "country", ""))
      ),
      mergeMap((binInfo: DynamoBinFetch | undefined) => {
        if (isUndefined(binInfo))
          return throwError(() => new KushkiError(ERRORS.E002));

        const dynamo_token: object = {
          amount: Number(get(request, "requestAmount", 0)),
          bin: get(request, "bin", ""),
          binInfo: {
            ...binInfo,
          },
          cardHolderName: get(request, "cardHolderName", ""),
          created: new Date().getTime(),
          currency: get(request, "currency", ""),
          lastFourDigits: get(request, "lastFourDigits"),
          maskedCardNumber: get(request, "maskedCreditCard"),
          merchantId: get(request, "merchantId"),
          transactionCardId: get(request, "transactionCardId", ""),
        };

        return of(<DynamoTokenFetch>dynamo_token);
      }),
      tag("TransactionService | _buildDynamoTokenWithBinInfo")
    );
  }

  private _buildDeclinedTransaction(
    dynamoToken: DynamoTokenFetch,
    request: SaveDeclineTrxRequest,
    merchant: DynamoMerchantFetch | undefined
  ): Transaction {
    const card_country: string = get(
      dynamoToken,
      this._binInfoCardCountryPath,
      ""
    );
    const trx_country: string | undefined = get(request, "country");
    const bin_card: string = get(dynamoToken, "bin", "").replace(
      /[^0-9]+/g,
      ""
    );
    const card_type: string = get(dynamoToken, "binInfo.info.type", "");
    const currency: string = get(dynamoToken, "currency", "");
    const is_deferred: boolean = get(dynamoToken, "isDeferred", false);
    const last_four_digits: string = get(dynamoToken, "lastFourDigits");
    const subtotal_iva0: number = get(dynamoToken, "amount", 0);
    const trx_id: string = nanoSeconds.now().toString().replace(",", "");
    const trx_reference: string = v4();
    const foreign_card: boolean = trx_country === card_country;
    const is_ondemand_subscription: boolean =
      get(request, "transactionType") ===
      SubscriptionTrxTypeEnum.SUBSCRIPTION_ONDEMAND_TOKEN;
    const secure_reason_code: string = get(
      request,
      "security.3ds.reasonCode",
      ""
    );
    const secure_message: string = isEmpty(secure_reason_code)
      ? get(request, this._transactionRuleResponseMessagePath)
      : get(request, "security.3ds.message", "");

    const trx: object = {
      bin_card,
      card_country,
      card_type,
      last_four_digits,
      secure_message,
      secure_reason_code,
      subtotal_iva0,
      amount: {
        currency,
        ice: 0,
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: subtotal_iva0,
      },
      approved_transaction_amount: 0,
      bin_type: get(dynamoToken, "binInfo.binType"),
      card_country_code: get(dynamoToken, this._binInfoCardAlphaPath, ""),
      card_holder_name: get(dynamoToken, "cardHolderName", ""),
      country: trx_country,
      created: new Date().getTime(),
      credential_alias: get(dynamoToken, "credentialInfo.alias"),
      credential_id: get(dynamoToken, "credentialInfo.credentialId"),
      currency_code: currency,
      foreign_card: !foreign_card,
      fullResponse: false,
      ice_value: 0,
      ip: defaultTo(get(dynamoToken, "ip"), get(request, "security.ip")),
      issuing_bank: get(dynamoToken, "binInfo.bank", ""),
      iva_value: 0,
      maskedCardNumber: get(dynamoToken, "maskedCardNumber", ""),
      merchant_id: get(dynamoToken, "merchantId"),
      merchant_name: get(merchant, "merchant_name"),
      payment_brand: get(request, "paymentBrand", ""),
      plcc: false,
      processor_id: get(request, "processorId", "NA"),
      processor_name: get(request, "processorName", "NA"),
      processor_type: get(request, "processorType", ""),
      request_amount: Number(get(request, "requestAmount", 0)),
      response_code: RejectedTransactionEnum.K322,
      response_text: ERROR_REJECTED_TRANSACTION,
      rules: get(request, "rules"),
      secure_code: get(request, this._transactionRuleResponseCodePath, ""),
      secureId: get(request, "secureId"),
      secureService: get(request, "secureService"),
      security: get(request, "security"),
      subtotal_iva: 0,
      sync_mode: TransactionSyncModeEnum.ONLINE,
      token: get(dynamoToken, "id"),
      transaction_details: {
        binCard: bin_card,
        cardType: card_type,
        isDeferred: is_deferred ? "Y" : "N",
        lastFourDigitsOfCard: last_four_digits,
      },
      transaction_id: trx_id,
      transaction_reference: trx_reference,
      transaction_status: TransactionStatusEnum.DECLINED,
      transaction_type: is_deferred
        ? TransactionTypeEnum.DEFFERED
        : TransactionTypeEnum.SALE,
      vault_token: get(dynamoToken, "vaultToken"),
    };

    if (is_ondemand_subscription)
      set(trx, "subscriptionTrigger", SubscriptionTriggerEnum.ON_DEMAND);

    if (!isNil(request.transactionCardId))
      set(trx, "transactionCardId", request.transactionCardId);

    return <Transaction>trx;
  }

  private _validateRecord(
    merchantId: string,
    transactionReference?: string
  ): boolean {
    const merchant_ids_without_record_api: string[] =
      `${process.env.MERCHANT_WITHOUT_RECORD_API}`.split(",");

    return (
      `${process.env.MERCHANT_WITH_RECORD_API}`.includes(merchantId) ||
      (Boolean(transactionReference) &&
        !merchant_ids_without_record_api.includes(merchantId))
    );
  }

  private _addUndefinedFields(
    record: object,
    chargeRequest: EventCharge,
    tokenInfo: DynamoTokenFetch,
    plccInfo?: { flag: string; brand: string }
  ): object {
    const record_trx_request: Partial<RecordTransactionRequest> = {
      ...record,
    };

    if (get(chargeRequest, "deferred") !== undefined)
      record_trx_request.numberOfMonths = get(chargeRequest, "deferred.months");

    if (get(tokenInfo, "settlement") !== undefined)
      record_trx_request.settlement = tokenInfo.settlement;

    if (plccInfo !== undefined && plccInfo.brand !== "")
      record_trx_request.paymentBrand = pascalCase(plccInfo.brand);

    if (get(chargeRequest, "contactDetails") !== undefined)
      record_trx_request.contactDetails = {
        ...get(chargeRequest, "contactDetails", {}),
      };

    if (get(chargeRequest, "subscriptionTrigger") !== undefined)
      record_trx_request.subscriptionTrigger = get(
        chargeRequest,
        "subscriptionTrigger"
      );

    if (get(chargeRequest, "provider") !== undefined)
      record_trx_request.provider = get(chargeRequest, "provider");

    if (get(tokenInfo, "convertedAmount") !== undefined) {
      const breakdown_converted_amount: object =
        this._buildBreakdownConvertedAmount(
          <Amount>chargeRequest.amount,
          get(tokenInfo, "convertedAmount.totalAmount"),
          get(tokenInfo, "amount"),
          get(tokenInfo, "convertedAmount.currency")
        );

      record_trx_request.convertedAmount = {
        ...get(tokenInfo, "convertedAmount"),
        amount: breakdown_converted_amount,
      };
    }

    return record_trx_request;
  }

  private _buildBreakdownConvertedAmount(
    chargeAmount: Amount,
    convertedAmount: number,
    originalAmount: number,
    convertedCurrency: string
  ): object {
    const converted_amount_breakdown: object = {};

    if (isNil(chargeAmount)) return converted_amount_breakdown;

    Object.keys(chargeAmount).forEach((key: string) => {
      if (typeof chargeAmount[key] === "object" && !isNil(chargeAmount[key])) {
        Object.keys(chargeAmount[key]).forEach((secondaryKey: string) => {
          set(
            converted_amount_breakdown,
            `${key}.${secondaryKey}`,
            this._calculateBreakdownAmount(
              convertedAmount,
              chargeAmount[key][secondaryKey],
              originalAmount
            )
          );
        });
        return;
      }
      set(
        converted_amount_breakdown,
        key,
        this._calculateBreakdownAmount(
          convertedAmount,
          chargeAmount[key],
          originalAmount
        )
      );
    });

    return { ...converted_amount_breakdown, currency: convertedCurrency };
  }

  private _calculateBreakdownAmount(
    totalAmount: number,
    target: number | string,
    originalAmount: number
  ): number | string {
    if (typeof target === "string") return target;
    return Math.round((totalAmount * target) / originalAmount);
  }

  private _getTransactionType(
    trxType: string | undefined,
    isDeferred: string
  ): string {
    switch (trxType) {
      case TransactionRuleTypeEnum.PREAUTHORIZATION:
        return TransactionTypeEnum.PREAUTH;
      case TransactionRuleTypeEnum.CAPTURE:
        return TransactionTypeEnum.CAPTURE;
      default:
        return isDeferred === "Y"
          ? TransactionTypeEnum.DEFFERED
          : TransactionTypeEnum.SALE;
    }
  }

  private _getProcessorType(processor: DynamoProcessorFetch): string {
    let current_processor_type;
    const target_processor_type: string = get(
      processor,
      "processor_type",
      ""
    ).toLowerCase();

    if (includes(this._processorsTypes, target_processor_type))
      current_processor_type = ProcessorTypeEnum.GATEWAY;
    else if (target_processor_type === ProcessorTypeEnum.AGGREGATOR)
      current_processor_type = `${target_processor_type}_${get(
        processor,
        "category_model",
        CategoryTypeEnum.FORMAL
      ).toLowerCase()}`;
    else
      current_processor_type = `${ProcessorTypeEnum.AGGREGATOR}_${CategoryTypeEnum.FORMAL}`;

    return current_processor_type;
  }

  private _mapVoidRecord(
    chargeTrx: Transaction,
    voidTrx: Partial<RecordTransactionRequest>
  ): Partial<RecordTransactionRequest> {
    dotObject.copy("response_code", "responseCode", chargeTrx, voidTrx);
    dotObject.copy("response_text", "responseText", chargeTrx, voidTrx);
    dotObject.copy(
      "approved_transaction_amount",
      "approvedTransactionAmount",
      chargeTrx,
      voidTrx
    );
    dotObject.copy("converted_amount", "convertedAmount", chargeTrx, voidTrx);
    dotObject.copy("currency_code", "currencyCode", chargeTrx, voidTrx);
    dotObject.copy("taxes", "extraTaxes", chargeTrx, voidTrx);
    dotObject.copy("number_of_months", "numberOfMonths", chargeTrx, voidTrx);
    dotObject.copy("subtotal_iva", "subtotalIVA", chargeTrx, voidTrx);
    dotObject.copy("subtotal_iva0", "subtotalIVA0", chargeTrx, voidTrx);
    dotObject.copy("iva_value", "ivaValue", chargeTrx, voidTrx);
    dotObject.copy("ice_value", "iceValue", chargeTrx, voidTrx);
    dotObject.copy("grace_months", "graceMonths", chargeTrx, voidTrx);
    dotObject.copy("credit_type", "creditType", chargeTrx, voidTrx);
    dotObject.copy("request_amount", "requestAmount", chargeTrx, voidTrx);
    dotObject.copy("processor_id", "processorId", chargeTrx, voidTrx);
    dotObject.copy("merchant_id", "merchantId", chargeTrx, voidTrx);
    dotObject.copy("subscription_id", "subscriptionId", chargeTrx, voidTrx);
    dotObject.copy("ticket_number", "ticketNumber", chargeTrx, voidTrx);
    dotObject.copy(
      "sale_ticket_number",
      "saleTicketNumber",
      chargeTrx,
      voidTrx
    );
    dotObject.copy("processor_name", "processorName", chargeTrx, voidTrx);
    dotObject.copy("processor_channel", "processorChannel", chargeTrx, voidTrx);

    const metadata = get(voidTrx, "Metadata", undefined);
    if (metadata == undefined || isEmpty(metadata)) {
      dotObject.copy("metadata", "Metadata", chargeTrx, voidTrx);
    }

    return voidTrx;
  }

  private static _processRecordCharge(chargeRequest: EventCharge): EventCharge {
    dotObject.copy(
      "amount.currency",
      "currencyCode",
      chargeRequest,
      chargeRequest
    );
    dotObject.copy(
      "amount.extraTaxes",
      "extraTaxes",
      chargeRequest,
      chargeRequest
    );
    dotObject.copy("months", "numberOfMonths", chargeRequest, chargeRequest);
    dotObject.copy(
      "amount.subtotalIva",
      "subtotalIVA",
      chargeRequest,
      chargeRequest
    );
    dotObject.copy(
      "amount.subtotalIva0",
      "subtotalIVA0",
      chargeRequest,
      chargeRequest
    );
    dotObject.copy("amount.iva", "ivaValue", chargeRequest, chargeRequest);
    dotObject.copy("amount.ice", "iceValue", chargeRequest, chargeRequest);
    dotObject.move("metadata", "Metadata", chargeRequest);
    dotObject.copy(
      "deferred.graceMonths",
      "graceMonths",
      chargeRequest,
      chargeRequest
    );
    dotObject.copy(
      "deferred.creditType",
      "creditType",
      chargeRequest,
      chargeRequest
    );

    return chargeRequest;
  }

  private _validateSecurityInfo(tokenInfo: DynamoTokenFetch): boolean {
    return (
      get(tokenInfo, "secureId") !== undefined &&
      get(tokenInfo, "secureService") !== undefined
    );
  }

  private static _processRecordAurus(
    tokenInfo: DynamoTokenFetch,
    aurusChargeResponse: AurusResponse,
    processor?: DynamoProcessorFetch
  ): AurusResponse {
    const bin_info_brand_path: string = "binInfo.brand";

    // Number Mapping Rule
    dotObject.override = true;
    dotObject.object(aurusChargeResponse, {
      approved_amount: Number,
    });

    dotObject.move(
      "approved_amount",
      "approvedTransactionAmount",
      aurusChargeResponse
    );

    if (aurusChargeResponse.transaction_details) {
      // ServiceCustomTypes Mastercard hotfix
      if (Boolean(aurusChargeResponse.transaction_details.cardType))
        aurusChargeResponse.transaction_details.cardType = pascalCase(
          aurusChargeResponse.transaction_details.cardType
        );

      if (
        get(tokenInfo, "binInfo") !== undefined &&
        get(tokenInfo, bin_info_brand_path, undefined) !== undefined
      )
        aurusChargeResponse.transaction_details.cardType = pascalCase(
          get(tokenInfo, bin_info_brand_path)
        );

      if (
        Boolean(aurusChargeResponse.transaction_details.interestAmount) &&
        aurusChargeResponse.transaction_details.interestAmount !== "0.00" &&
        aurusChargeResponse.transaction_details.interestAmount !== "0.0" &&
        aurusChargeResponse.transaction_details.interestAmount !== "0"
      ) {
        dotObject.move(
          "transaction_details.interestAmount",
          "interestAmount",
          aurusChargeResponse
        );
        dotObject.object(aurusChargeResponse, {
          interestAmount: Number,
        });
      }

      // Mapping Logic
      dotObject.move("ticket_number", "ticketNumber", aurusChargeResponse);
      dotObject.copy("bin", "binCard", tokenInfo, aurusChargeResponse);
      dotObject.move("transaction_id", "transactionId", aurusChargeResponse);
      dotObject.copy(
        "transaction_details.cardType",
        "paymentBrand",
        aurusChargeResponse,
        aurusChargeResponse
      );
      dotObject.move("response_code", "responseCode", aurusChargeResponse);
      dotObject.move("response_text", "responseText", aurusChargeResponse);
      dotObject.copy(
        "transaction_details.processorBankName",
        "processorBankName",
        aurusChargeResponse,
        aurusChargeResponse
      );

      dotObject.move(
        "transaction_details.merchantName",
        "merchantName",
        aurusChargeResponse
      );
      dotObject.move(
        "transaction_details.cardHolderName",
        "cardHolderName",
        aurusChargeResponse
      );

      dotObject.copy(
        "lastFourDigits",
        "lastFourDigitsOfCard",
        tokenInfo,
        aurusChargeResponse
      );

      dotObject.move(
        "transaction_details.approvalCode",
        "approvalCode",
        aurusChargeResponse
      );
      dotObject.move(
        "transaction_details.processorName",
        "processorName",
        aurusChargeResponse
      );
      dotObject.move(
        "transaction_details.conciliationId",
        "conciliationId",
        aurusChargeResponse
      );
      dotObject.copy(
        "acquirer_bank",
        "acquirerBank",
        processor,
        aurusChargeResponse
      );
    }

    const mapped: AurusResponse = { ...aurusChargeResponse };

    dotObject.del("processorBankName", aurusChargeResponse);
    dotObject.del("transaction_details", aurusChargeResponse);
    dotObject.del("purchase_Number", mapped);
    dotObject.del("processor_transaction_id", mapped);

    return mapped;
  }

  private _getTotal(request: EventCharge): number {
    if (request.amount === undefined) return 0;

    let sum_taxes: number = 0;

    if (request.amount.ice !== undefined) sum_taxes += request.amount.ice;
    const extra_taxes: object | undefined = request.amount.extraTaxes;

    if (extra_taxes !== undefined)
      Object.keys(extra_taxes).forEach((key: string) => {
        sum_taxes += extra_taxes[key];
      });

    return Number(
      (
        request.amount.subtotalIva0 +
        request.amount.subtotalIva +
        request.amount.iva +
        sum_taxes
      ).toFixed(2)
    );
  }

  private _processRecord(
    event: IAPIGatewayEvent<RecordTransactionRequest>
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        forkJoin([
          this._storage.getItem<IAurusTransaction>(
            `${process.env.AURUS_TRANSACTION}`,
            {
              TRANSACTION_ID:
                event.body.ticketNumber !== undefined &&
                event.body.ticketNumber.length > 0
                  ? event.body.ticketNumber
                  : event.body.transactionId,
            }
          ),
          iif(
            () => event.body.subscriptionId !== "",
            this._storage.getItem<IAurusSubscription>(
              `${process.env.AURUS_SUBSCRIPTION}`,
              {
                SUBSCRIPTION_ID: event.body.subscriptionId,
              }
            ),
            of(undefined)
          ),
          this._getProcessorForRecord(event.body.merchantId),
        ])
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      map(
        (
          data: [
            IAurusTransaction | undefined,
            IAurusSubscription | undefined,
            DynamoProcessorFetch | undefined
          ]
        ) => {
          const transaction: IAurusTransaction | undefined = data[0];
          const subscription: IAurusSubscription | undefined = data[1];
          const processor: DynamoProcessorFetch | undefined = data[2];

          if (processor === undefined) throw new KushkiError(ERRORS.E003);
          event.body.processorId = event.body.merchantId;
          event.body.merchantId = processor.merchant_id;
          event.body.processorType = this._getProcessorType(processor);

          if (
            transaction !== undefined &&
            transaction.TRANSACTION_METADATA !== "NA"
          )
            event.body.Metadata = JSON.parse(transaction.TRANSACTION_METADATA);
          if (
            subscription !== undefined &&
            subscription.SUBSCRIPTION_METADATA !== "NA"
          )
            event.body.subscription_metadata = JSON.parse(
              subscription.SUBSCRIPTION_METADATA
            );

          return { ...event.body };
        }
      ),
      switchMap((record: RecordTransactionRequest) => this._saveRecord(record)),
      tag("TransactionService | _processRecord")
    );
  }

  private _getProcessorForRecord(
    processorId: string
  ): Observable<DynamoProcessorFetch | undefined> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: UpdateProcessorRequest }>(
          `usrv-transaction-rule-${process.env.USRV_STAGE}-getProcessor`,
          {
            headers: {
              invoke: processorId,
            },
            pathParameters: {
              processorId,
              merchantId: processorId,
            },
          }
        )
      ),
      map((response: { body: UpdateProcessorRequest }) => ({
        created: 0,
        merchant_id: response.body.merchantId,
        private_id: get(response, "body.privateId", ""),
        processor_name: response.body.processorName,
        processor_type: get(
          response,
          "body.processorType",
          ProcessorTypeEnum.GATEWAY
        ),
        public_id: get(response, "body.publicId", ""),
      })),
      catchError(() => of(undefined)),
      tag("TransactionService | _getProcessorForVoid")
    );
  }

  // istanbul ignore next
  private _getBinInfo(
    bin: string,
    merchantCountry: string
  ): Observable<DynamoBinFetch | undefined> {
    return of(1).pipe(
      switchMap(() =>
        this._lambda.invokeFunction<DynamoBinFetch, AccountInfoRequest>(
          `${process.env.GET_ACCOUNT_INFO_LAMBDA}`,
          {
            account: bin,
            apiRequest: false,
            isPrivateCard: false,
            kshMerchantCountry: merchantCountry,
            origin: ECOMMERCE,
          }
        )
      ),
      catchError(() => of(undefined)),
      tag("TransactionService | _getBinInfo")
    );
  }

  private _saveRecord(req: RecordTransactionRequest): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        forkJoin([
          this._existsSubscriptionTrx(req),
          this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: req.merchantId,
          }),
        ])
      ),
      mergeMap(
        ([exists_subs_trx, merchant_options]: [
          boolean,
          DynamoMerchantFetch | undefined
        ]) => {
          if (!req.subscriptionId && !exists_subs_trx) {
            const merchant_country: string = get(
              merchant_options,
              "country",
              ""
            );

            set(req, "country", merchant_country);
            return this._storage.put(
              TransactionService._buildDynamo({ ...req }),
              TABLES.transaction,
              this._dynamoCondition
            );
          }
          if (req.subscriptionId && !exists_subs_trx)
            return this._invokeSubscriptionsRecord(req);

          return of(false);
        }
      ),
      tag("TransactionService | _saveRecord")
    );
  }

  private _invokeSubscriptionsRecord(
    req: RecordTransactionRequest
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction(
          `usrv-subscriptions-${process.env.USRV_STAGE}-subscriptionsRecord`,
          req
        )
      ),
      mapTo(true),
      tag("TransactionService | _invokeSubscriptionsRecord")
    );
  }

  private _existsSubscriptionTrx(
    req: RecordTransactionRequest
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        let index_table = IndexEnum.subs_trx_ticket_number_index;
        let field_query = "ticketNumber";
        let trx_field = "ticketNumber";

        if (isEmpty(req.ticketNumber)) {
          index_table = IndexEnum.subs_trx_transaction_reference_index;
          field_query = "transactionReference";
          trx_field = "transactionReference";
        }
        return this._storage.query<Transaction>(
          TABLES.subs_transaction,
          index_table,
          field_query,
          get(req, trx_field, "")
        );
      }),
      map((transaction: Transaction[]) => transaction.length > 0),
      tag("TransactionService | _existsSubscriptionTrx")
    );
  }

  private _buildAndSaveTransaction(
    record: Partial<RecordTransactionRequest>,
    context: AuthorizerContext
  ): Observable<Transaction> {
    return of(
      this._finishBuildingTransactionObj(
        record,
        context,
        TokenTypeEnum.TRANSACTION
      )
    ).pipe(
      switchMap((transaction: Transaction) =>
        this._finishSavingTransaction(transaction)
      ),
      tag("TransactionService | _buildAndSaveTransaction")
    );
  }

  private _extractConciliationId(fullConciliation: string): string[] {
    return split(fullConciliation, "|", 2);
  }

  private _updateBinInfo(
    bin: string,
    cardType: string,
    merchantCountry: string
  ): Observable<boolean> {
    return this._getBinInfo(bin, merchantCountry).pipe(
      mergeMap((dynamoBin: DynamoBinFetch | undefined) => {
        if (!isNil(dynamoBin) && get(dynamoBin, "info.type", "") !== cardType) {
          set(dynamoBin, "info.type", cardType);
          return this._storage.put(
            dynamoBin,
            `${process.env.USRV_STAGE}-usrv-deferred-bins`
          );
        }

        return of(true);
      }),
      map((result: boolean) => result),
      tag("TransactionService | _updateBinInfo")
    );
  }

  private _syncToEventBridge(
    records: IDynamoRecord[],
    busName: string,
    source: string
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        from(records).pipe(
          filter(
            (record: IDynamoRecord) =>
              record.eventName !== DynamoEventNameEnum.REMOVE
          )
        )
      ),
      mergeMap((record: IDynamoRecord) =>
        this._eventBridge.putEvent(
          this._buildEventBridgeDetail(record),
          busName,
          source,
          `${typeof record}`
        )
      ),
      toArray(),
      mapTo(true),
      defaultIfEmpty(true),
      tag("SyncService | _syncToEventBridge")
    );
  }

  private _buildEventBridgeDetail(record: IDynamoRecord): object {
    return {
      action: record.eventName,
      mappingType: "dynamo",
      originUsrv: `${process.env.USRV_NAME}`,
      payload: record,
    };
  }

  /* eslint-disable sonarjs/cognitive-complexity*/
  private _startBuildingTransactionObj(
    request: ProcessRecordRequest
  ): Partial<RecordTransactionRequest> {
    const {
      requestEvent: request_event,
      authorizerContext: authorizer_context,
      aurusChargeResponse: aurus_charge_response,
      merchantId: merchant_id,
      tokenInfo: token_info,
      merchantName: merchant_name,
      country,
      processor,
      error = null,
      saleTicketNumber: sale_ticket_number = null,
      ruleInfo: rule_info = {},
      plccInfo: plcc_info,
      trxType: trx_type,
      partner = "",
      siftValidation: sift_validation,
      whitelist,
      isAft: is_aft,
      integration,
      integrationMethod: integration_method,
      validateSiftTrxRule: validate_sift_trx_rule,
      trxRuleMetadata: trx_rule_metadata,
      trxRuleResponse: trx_rule_res,
    } = request;

    let record_trx_request: Partial<RecordTransactionRequest> = {};
    const conditions_map = new Map<string, string | undefined>();
    const crypto_channel: string = "crypto";
    const has_external_3ds: boolean = !isEmpty(
      get(request_event, "threeDomainSecure", {})
    );

    conditions_map.set(TransactionActionEnum.OTP, TransactionActionEnum.OTP);
    conditions_map.set(
      TransactionActionEnum.SUBSCRIPTION,
      TransactionActionEnum.SUBSCRIPTION
    );
    conditions_map.set(
      TransactionTypeEnum.CAPTURE,
      record_trx_request.transactionReference
    );

    const full_response: boolean | string =
      get(request_event, "originalFullResponse", "") !== ""
        ? get(request_event, "originalFullResponse", "")
        : get(request_event, "fullResponse", "");

    record_trx_request.fullResponse = full_response;

    const channel: string = Boolean(get(request_event, "channel", ""))
      ? get(request_event, "channel", "").toLowerCase()
      : "";

    if (is_aft) set(record_trx_request, "processorChannel", crypto_channel);

    if (!isEmpty(get(request.requestEvent, "createSubscriptionMetadata", "")))
      set(
        record_trx_request,
        "createSubscriptionMetadata",
        get(request.requestEvent, "createSubscriptionMetadata")
      );

    const auth_context = get(authorizer_context, "kushkiMetadata.origin");

    record_trx_request.ticketNumber = aurus_charge_response.ticket_number;
    record_trx_request.action =
      conditions_map.get(channel) || conditions_map.get(auth_context);

    record_trx_request.cardType = get(token_info, "binInfo.info.type", "");
    record_trx_request.binType = get(token_info, "binInfo.binType", 0);

    set(record_trx_request, this._securityWhitelistPath, whitelist);

    const is_object_merchant_data: boolean = isObject(
      get(request, this._merchantDataAuthContext, {})
    );
    const merchant_data: object = is_object_merchant_data
      ? get(request, this._merchantDataAuthContext, {})
      : JSON.parse(get(request, this._merchantDataAuthContext, "{}"));

    record_trx_request.merchantData = {
      ...merchant_data,
      channel: get(request, "requestEvent.platformName", ""),
    };

    record_trx_request.transactionType = this._getTransactionType(
      trx_type,
      aurus_charge_response.transaction_details
        ? aurus_charge_response.transaction_details.isDeferred
        : "N"
    );

    UtilsService.validateIf(
      get(request_event, "deferred") !== undefined,
      () =>
        (record_trx_request.numberOfMonths = get(
          request_event,
          "deferred.months"
        ))
    );
    if (sale_ticket_number !== null)
      record_trx_request.saleTicketNumber = sale_ticket_number;

    record_trx_request.transactionReference = get(
      token_info,
      "transactionReference",
      ""
    );
    record_trx_request.preauthTransactionReference = conditions_map.get(
      record_trx_request.transactionType
    );

    if (record_trx_request.transactionType === TransactionTypeEnum.CAPTURE) {
      record_trx_request.preauthTransactionReference =
        record_trx_request.transactionReference;
      record_trx_request.socialReason = get(
        request.transaction,
        "social_reason",
        ""
      );
      record_trx_request.merchantCategory = get(
        request.transaction,
        "category_merchant",
        ""
      );
      record_trx_request.taxId = get(request.transaction, "tax_id", "");
    }

    if (
      record_trx_request.transactionType === TransactionTypeEnum.SALE ||
      record_trx_request.transactionType === TransactionTypeEnum.PREAUTH
    ) {
      record_trx_request.socialReason = get(
        request.merchant,
        "socialReason",
        ""
      );
      record_trx_request.merchantCategory = get(
        request.merchant,
        "merchantCategory",
        ""
      );
      record_trx_request.taxId = get(request.merchant, "taxId", "");
      record_trx_request.cardCountryCode = get(
        request.tokenInfo,
        this._binInfoCardAlphaPath,
        ""
      );
      record_trx_request.cardCountry = get(
        request.tokenInfo,
        this._binInfoCardCountryPath,
        ""
      );
    }
    record_trx_request.syncMode = TransactionSyncModeEnum.ONLINE;
    record_trx_request.transactionStatus = TransactionStatusEnum.APPROVAL;
    record_trx_request.requestAmount = this._getTotal(request_event);
    record_trx_request.dateAndTimeTransaction =
      moment().format("DDMMYYYYHHmmss");

    record_trx_request.processorId =
      processor === undefined ? "" : processor.public_id;
    record_trx_request.processorPrivateId = get(processor, "private_id", "");
    record_trx_request.merchantId = merchant_id;
    record_trx_request.processorType =
      processor === undefined
        ? ProcessorTypeEnum.GATEWAY
        : this._getProcessorType(processor);

    record_trx_request = {
      ...TransactionService._processRecordCharge(request_event),
      ...TransactionService._processRecordAurus(
        token_info,
        aurus_charge_response,
        processor
      ),
      ...record_trx_request,
      ...rule_info,
    };

    UtilsService.validateIf(
      get(record_trx_request, "creditType", "").length === 2 &&
        get(aurus_charge_response, "processorName") === ProcessorEnum.DATAFAST,
      () =>
        (record_trx_request.creditType = `0${record_trx_request.creditType}`)
    );

    record_trx_request.merchantName = merchant_name;
    record_trx_request.country = country;

    const bin_info_country: string = defaultTo(
      get(token_info, this._binInfoCardCountryPath, ""),
      ""
    );

    record_trx_request.foreignCard =
      country.toLowerCase() !== bin_info_country.toLowerCase();

    if (error !== null) {
      const metadata_error: object = error.getMetadata();

      record_trx_request.transactionStatus = TransactionStatusEnum.DECLINED;

      if (error instanceof KushkiError && error.code === "K322") {
        record_trx_request.rules = get(metadata_error, "rules", []);
        record_trx_request.security = {
          limitMerchant: get(metadata_error, "rules[0].limitMerchant"),
          limitProcessor: get(metadata_error, "rules[0].limitProcessor"),
          message: get(metadata_error, "baseMessage", ""),
        };

        const secure_code: string = get(
          metadata_error,
          this._transactionRuleResponseCodePath
        );

        record_trx_request.secureCode = secure_code;
        record_trx_request.secureMessage =
          secure_code === "K325"
            ? get(metadata_error, "security3Ds.message", "")
            : get(metadata_error, this._transactionRuleResponseMessagePath);
        set(
          record_trx_request,
          "secureReasonCode",
          get(metadata_error, this._security3DsCodePath, "")
        );
      }

      if (error instanceof KushkiError && error.code === "K021") {
        const resp_text: string = "responseText";

        record_trx_request.responseText = `${metadata_error[resp_text]}`;
        record_trx_request.responseCode = "K322";
      } else {
        record_trx_request.responseText = error.getMessage();
        record_trx_request.responseCode = error.code;
        const processor_name: string =
          record_trx_request.responseCode !== "006"
            ? "AURUS"
            : get(record_trx_request, "processorName", "");

        const processor_error: IErrorMapperResponse =
          ErrorMapper.mapProcessorError(
            processor_name,
            get(metadata_error, "processorCode", ""),
            country,
            record_trx_request.responseText
          );

        UtilsService.validateIf(
          error.code !== "K322" && error.code !== "K220",
          () =>
            (record_trx_request.processor = this._getProcessorError(
              metadata_error,
              processor_error,
              processor
            ))
        );
      }

      if (get(processor, this._processorNamePath) === ProcessorEnum.KUSHKI)
        record_trx_request.indicator_3ds = get(metadata_error, "indicator_3ds");

      UtilsService.validateIf(
        error.code === "228",
        () => delete record_trx_request.ticketNumber
      );
      if (error.code.startsWith("5"))
        record_trx_request.transactionReference = get(
          token_info,
          "transactionReference",
          ""
        );
    } else
      UtilsService.validateIf(
        get(processor, this._processorNamePath) === ProcessorEnum.KUSHKI,
        () => {
          record_trx_request.processor = {
            code: get(
              aurus_charge_response,
              "responseCode",
              get(aurus_charge_response, "response_code", "")
            ),
            message: get(
              aurus_charge_response,
              this._responseTextPath,
              get(aurus_charge_response, this._responseTextSnakePath, "")
            ),
          };
          record_trx_request.indicator_3ds = get(
            aurus_charge_response,
            "indicator_3ds"
          );
        }
      );

    record_trx_request.cardHolderName = get(token_info, "cardHolderName", "NA");
    record_trx_request.transactionCardId = get(
      token_info,
      "transactionCardId",
      ""
    );

    if (
      (get(request, "tokenInfo.secureService", "") ===
        SuccessfulAuthentication3DSEnum.THREEDS ||
        has_external_3ds) &&
      record_trx_request.transactionStatus === TransactionStatusEnum.APPROVAL
    ) {
      const response = {
        code: SuccessfulAuthentication3DSEnum.OK_CODE,
        message:
          has_external_3ds && isUndefined(token_info.secureService)
            ? SuccessfulAuthentication3DSEnum.OK_EXTERNAL_MESSAGE
            : SuccessfulAuthentication3DSEnum.OK_MESSAGE,
      };

      record_trx_request.rules = [response];
    }

    // Put paymentBrand for Aurus declined transactions
    if (
      record_trx_request.paymentBrand === "" &&
      token_info.binInfo !== undefined &&
      get(token_info, "binInfo.brand", undefined) !== undefined
    )
      record_trx_request.paymentBrand = pascalCase(token_info.binInfo.brand);

    record_trx_request.consortiumName = get(
      token_info,
      "binInfo.consortiumName",
      ""
    );
    record_trx_request.issuingBank = get(token_info, "binInfo.bank", "");

    if (this._validateSecurityInfo(token_info)) {
      const secure_id = get(token_info, this._secureIdPath);
      const secure_service = get(token_info, this._secureServicePath);
      record_trx_request.security = {
        id: secure_id,
        service: secure_service,
      };
      if (trx_type === TransactionRuleTypeEnum.CAPTURE) {
        set(record_trx_request, this._secureIdPath, secure_id);
        set(record_trx_request, this._secureServicePath, secure_service);
      }

      if (
        isEqual(
          token_info.secureService,
          SuccessfulAuthentication3DSEnum.THREEDS
        )
      )
        set(record_trx_request, "security.3dsMpi", SecurityTypesEnum.KUSHKI);
    }
    if (has_external_3ds && !this._validateSecurityInfo(token_info))
      set(record_trx_request, "security.3dsMpi", SecurityTypesEnum.MERCHANT);
    if (has_external_3ds && !has(request_event, "threeDomainSecure.acceptRisk"))
      set(record_trx_request, "threeDomainSecure.acceptRisk", false);
    if (!isEmpty(get(token_info, "3ds")))
      record_trx_request.security = {
        ...record_trx_request.security,
        "3ds": {
          cavv: get(token_info, "3ds.detail.cavv"),
          directoryServerTransactionID: get(
            token_info,
            "3ds.detail.directoryServerTransactionID"
          ),
          eci: defaultTo(
            get(token_info, "3ds.detail.eci"),
            get(token_info, "3ds.detail.eciRaw")
          ),
          specificationVersion: get(
            token_info,
            "3ds.detail.specificationVersion"
          ),
          ucaf: get(token_info, "3ds.detail.ucafAuthenticationData"),
          veresEnrolled: get(token_info, "3ds.detail.veresEnrolled"),
          xid: get(token_info, "3ds.detail.xid"),
        },
      };

    UtilsService.validateIf(!isNil(partner) && !isEmpty(partner), () =>
      set(record_trx_request, this._securityPath, [partner])
    );

    UtilsService.validateIf(
      sift_validation === true || validate_sift_trx_rule === true,
      () =>
        set(record_trx_request, this._securityPath, [
          ...get(record_trx_request, this._securityPath, []),
          "sift",
        ])
    );

    record_trx_request = this._addUndefinedFields(
      record_trx_request,
      request_event,
      token_info,
      plcc_info
    );

    record_trx_request.contactDetails = request_event.contactDetails;

    UtilsService.validateIf(
      record_trx_request.transactionStatus === TransactionStatusEnum.APPROVAL &&
        record_trx_request.transactionType === TransactionTypeEnum.SALE &&
        Math.abs(
          get(record_trx_request, "approvedTransactionAmount", 0) -
            get(record_trx_request, "requestAmount", 0)
        ) > Number(`${process.env.THRESHOLD_AMOUNT}`) &&
        // TODO: FIX FOR CLARO EC MERCHANTS
        !`${process.env.CLARO_EC_MERCHANTS}`.split(",").includes(merchant_id) &&
        isEmpty(token_info.convertedAmount),

      () =>
        this._rollbar.warn(
          `Invalid approvedTransactionAmount, approved: ${record_trx_request.approvedTransactionAmount} - requested: ${record_trx_request.requestAmount}`
        )
    );

    UtilsService.validateIf(
      !isEmpty(get(aurus_charge_response, "processor_transaction_id")),
      () =>
        set(
          record_trx_request,
          "processorTransactionId",
          get(aurus_charge_response, "processor_transaction_id")
        )
    );

    UtilsService.validateIf(
      !isEmpty(get(aurus_charge_response, "purchase_Number")),
      () =>
        set(
          record_trx_request,
          "purchaseNumber",
          get(aurus_charge_response, "purchase_Number")
        )
    );

    record_trx_request.acquirerBank = get(processor, "acquirer_bank");
    record_trx_request.commerceCode = get(processor, "commerce_code", "");
    set(record_trx_request, "vault_token", get(token_info, "vaultToken"));
    set(record_trx_request, "plcc", get(plcc_info, "flag", "0") === "1");

    UtilsService.validateIf(
      !isEmpty(get(processor, "processor_merchant_id")),
      () =>
        set(
          record_trx_request,
          "processor_merchant_id",
          get(processor, "processor_merchant_id")
        )
    );

    if (!isEmpty(get(processor, "sub_mcc_code")))
      set(record_trx_request, "mccCode", get(processor, "sub_mcc_code"));

    if (isEmpty(record_trx_request.mccCode))
      set(
        record_trx_request,
        "mccCode",
        get(processor, "merchant_category_code")
      );

    const account_type: string = get(aurus_charge_response, "account_type", "");

    UtilsService.validateIf(!isEmpty(account_type), () =>
      set(record_trx_request, "account_type", account_type)
    );

    record_trx_request.integration = integration;

    const is_commission_trx: boolean = get(
      request_event,
      "usrvOrigin",
      UsrvOriginEnum.CARD
    ).includes(UsrvOriginEnum.COMMISSION);

    if (is_commission_trx) {
      record_trx_request.commissionType = get(
        request_event,
        "originalCommissionType",
        ""
      );
      dotObject.copy(
        "commissionType",
        "commission_type",
        authorizer_context,
        record_trx_request
      );
      record_trx_request.recap = aurus_charge_response.recap;
      record_trx_request.parentMerchantId = get(
        request_event,
        "parentMerchantId"
      );
      record_trx_request.parentTicketNumber = get(
        request_event,
        "parentTicketNumber"
      );
    }

    if (
      get(trx_rule_metadata, "rules[0]") &&
      get(trx_rule_metadata, this._transactionRuleResponseCodePath) ===
        WarningSecurityEnum.K327
    ) {
      record_trx_request.secureCode = get(
        trx_rule_metadata,
        this._transactionRuleResponseCodePath,
        ""
      );
      record_trx_request.secureMessage = get(
        trx_rule_metadata,
        this._transactionRuleResponseMessagePath,
        ""
      );
    }

    if (
      request.trxType === TransactionRuleTypeEnum.CAPTURE &&
      request.country === CountryEnum.CHILE
    )
      set(
        record_trx_request,
        "buyOrder",
        get(request.transaction, "buy_order")
      );

    set(
      record_trx_request,
      "cardCountryCode",
      get(token_info, this._binInfoCardAlphaPath, "")
    );

    set(record_trx_request, "integrationMethod", integration_method);

    UtilsService.validateIf(
      !isEmpty(get(record_trx_request, "responseText")),
      () =>
        set(
          record_trx_request,
          "responseText",
          this._validateBreakLine(get(record_trx_request, "responseText", ""))
        )
    );

    set(
      record_trx_request,
      "originalBin",
      get(token_info.binInfo, "originalBinFullLength") || ""
    );
    set(
      record_trx_request,
      "prepaid",
      get(token_info, "binInfo.info.prepaid", false)
    );

    set(record_trx_request, "sendCvv", get(token_info, "sendCvv", undefined));
    set(
      record_trx_request,
      "isInitialCof",
      get(aurus_charge_response, "is_initial_cof")
    );

    record_trx_request = this._addTraceabilityInformation(
      request,
      record_trx_request
    );

    unset(record_trx_request, "subMerchant.isInRequest");
    unset(record_trx_request, "transactionRuleResponse");
    const messageFields: MessageFields = get(
      record_trx_request,
      "transaction_details.messageFields",
      {}
    );
    const restricted: boolean | undefined = get(
      aurus_charge_response,
      "restricted"
    );

    if (!isNil(restricted)) messageFields.restricted = restricted;

    delete record_trx_request.isAft;
    if (!isEmpty(messageFields))
      set(record_trx_request, "message_fields", messageFields);

    const rules: RuleTransaction[] = get(trx_rule_res, "rules.rules", []);
    if (!isEmpty(rules)) {
      set(record_trx_request, "rules", rules);
      set(
        record_trx_request,
        "secure_code",
        get(trx_rule_res, "rules.rules[0].code", "")
      );
      set(
        record_trx_request,
        "secure_message",
        get(trx_rule_res, "rules.rules[0].message", "")
      );
    }

    const external_reference_id: string = get(
      request,
      "requestEvent.externalReferenceId",
      ""
    );

    if (!isEmpty(external_reference_id))
      set(record_trx_request, "externalReferenceId", external_reference_id);

    return {
      ...omit(record_trx_request, "transaction_details.messageFields"),
    };
  }

  private _getProcessorError(
    metadataError: object,
    processorError: IErrorMapperResponse,
    processor?: DynamoProcessorFetch | undefined
  ): DynamoProcessorReq {
    if (get(processor, this._processorNamePath) === ProcessorEnum.KUSHKI)
      return {
        code: get(metadataError, "processor_code", ""),
        message: get(
          metadataError,
          this._responseTextPath,
          get(metadataError, this._responseTextSnakePath, "")
        ),
      };

    return {
      code: processorError.processorCode,
      message: processorError.processorMessage,
    };
  }

  private _getTrxStatusForPartner(
    partner: string,
    responseCode: string,
    trxRuleRules: LambdaTransactionRuleResponse,
    siftValidation: boolean,
    validateSiftTrxRule: boolean
  ): string {
    const rules: object = defaultTo(get(trxRuleRules, "rules.rules"), []).find(
      (rule: object) =>
        get(rule, "message", "").includes(SECURITY_PARTNERS[partner])
    );

    const approval_trx_rule: boolean = isEqual(
      get(rules, "code"),
      TRX_OK_RESPONSE_CODE
    );
    const approval_sift_trx: boolean =
      (validateSiftTrxRule && approval_trx_rule) ||
      (siftValidation && responseCode !== RejectedTransactionEnum.K322);

    return (partner !== PartnerValidatorEnum.SIFT_SCIENCE &&
      approval_trx_rule) ||
      (partner === PartnerValidatorEnum.SIFT_SCIENCE && approval_sift_trx)
      ? TransactionStatusEnum.APPROVAL
      : TransactionStatusEnum.DECLINED;
  }

  private _getTrxStatusForSecureService(
    partner: string,
    trxRules: object,
    trxRuleRules: LambdaTransactionRuleResponse
  ): string {
    const has_secure_service_error: boolean = defaultTo(
      <object[]>trxRules,
      []
    ).some((rule: object) =>
      SECURE_SERVICE_ERROR_CODES.includes(get(rule, "code", ""))
    );

    return !has_secure_service_error ||
      (partner === PartnerValidatorEnum.THREEDS &&
        isEqual(
          get(trxRuleRules, "cybersource.detail.reasonCode"),
          SuccessfulAuthentication3DSEnum.OK_REASON_CODE
        ))
      ? TransactionStatusEnum.APPROVAL
      : TransactionStatusEnum.DECLINED;
  }

  private _getTrxStatus(
    partner: string,
    responseCode: string,
    trxRules: object,
    trxRuleResponse: LambdaTransactionRuleResponse,
    siftValidation: boolean,
    siftValidationTrxRule: boolean
  ): string {
    return SECURE_SERVICE_PARTNERS.includes(partner)
      ? this._getTrxStatusForSecureService(partner, trxRules, trxRuleResponse)
      : this._getTrxStatusForPartner(
          partner,
          responseCode,
          trxRuleResponse,
          siftValidation,
          siftValidationTrxRule
        );
  }

  private _addTraceabilityInformation(
    event: ProcessRecordRequest,
    transaction: Partial<RecordTransactionRequest>
  ): Partial<RecordTransactionRequest> {
    const {
      trxRuleResponse: trx_rule_response,
      validateSiftTrxRule: validate_sift_trx_rule,
      siftValidation: sift_validation,
    } = event;
    const { securityIdentity: security_identity } = event.tokenInfo;

    const kushki_info = defaultTo(
      get(event, "requestEvent.kushkiInfo"),
      event.tokenInfo.kushkiInfo
    );

    const {
      security,
      rules: trx_rules,
      subscriptionId: subscription_id,
      responseCode: response_code,
    } = transaction;
    let security_identity_request: (
      | ISecurityIdentity
      | ISecurityIdentityRequest
    )[];

    const service: string = get(security, "service", "");
    const partners: {
      partner: string;
      partnerName: string;
      validated: boolean;
    }[] = without(
      [...defaultTo(security.partner, []), service].map((partner: string) =>
        cloneDeep(SECURITY_IDENTITY[partner])
      ),
      undefined
    );

    security_identity_request = defaultTo(
      <ISecurityIdentity[]>security_identity,
      []
    ).map((secureIdentity: ISecurityIdentity) => {
      const partner_name: string = secureIdentity.partnerName;

      if (
        partners.some(
          (partner: object) =>
            get(partner, "partnerName") === partner_name &&
            !(
              get(partner, "partnerName") === PartnerNameEnum.KUSHKI &&
              secureIdentity.identityCode === IdentityCodeEnum.SI001
            )
        )
      ) {
        const partner_index: number = findIndex(partners, {
          partnerName: partner_name,
        });

        set(secureIdentity, "info", {
          ...get(secureIdentity, "info", {}),
          status: this._getTrxStatus(
            partners[partner_index].partner,
            response_code!,
            trx_rules!,
            trx_rule_response!,
            sift_validation!,
            validate_sift_trx_rule!
          ),
        });

        partners[partner_index].validated = true;
      }

      return secureIdentity;
    });

    security_identity_request = defaultTo(partners, []).reduce(
      (
        secureIdentity: object[],
        partner: {
          partner: string;
          partnerName: string;
          validated: boolean;
        }
      ) => {
        if (!get(partner, "validated", false))
          return [
            ...secureIdentity,
            {
              info: {
                status: this._getTrxStatus(
                  get(partner, "partner", ""),
                  response_code!,
                  trx_rules!,
                  trx_rule_response!,
                  sift_validation!,
                  validate_sift_trx_rule!
                ),
              },
              partner: get(partner, "partner"),
            },
          ];

        return secureIdentity;
      },
      [...security_identity_request]
    ) as (ISecurityIdentity | ISecurityIdentityRequest)[];

    const kushki_info_request: IKushkiInfoRequest | IKushkiInfo = !isEmpty(
      kushki_info
    )
      ? <IKushkiInfoRequest | IKushkiInfo>kushki_info
      : {
          authorizer: ManagementTypesEnum.CREDENTIAL,
          platformId: PlatformsCodesEnum.KP001,
          platformVersion: PlatformsVersionEnum.LATEST,
          resource: subscription_id
            ? PaymentMethodsEnum.SUBSCRIPTIONS
            : PaymentMethodsEnum.CARD,
        };

    const kushki_info_response: IRootResponse =
      this._coreFormatter.dataFormatter({
        kushkiInfo: kushki_info_request,
        securityIdentity: security_identity_request,
      });

    set(transaction, "kushkiInfo", kushki_info_response.kushkiInfo);
    set(transaction, "securityIdentity", kushki_info_response.securityIdentity);

    return transaction;
  }

  private _isTransbankProcessorAndCardTypeCorrect(
    isTransbankProcessor: boolean,
    cardType: string,
    transaction: Transaction
  ): Observable<boolean> {
    const cardBrand: string = defaultTo(transaction.payment_brand, "") || "";
    const normalizedCardBrand: string = cardBrand
      .replace(" ", "")
      .toLowerCase();
    const isCardBinPartner: boolean =
      normalizedCardBrand === CardBrandEnum.VISA.toLowerCase() ||
      normalizedCardBrand === CardBrandEnum.COMPLETE_MASTERCARD.toLowerCase();

    return isTransbankProcessor &&
      !isEmpty(cardType) &&
      !isEmpty(transaction.bin_card) &&
      !isCardBinPartner
      ? this._updateBinInfo(
          transaction.bin_card,
          cardType,
          get(transaction, "country", "")
        )
      : of(false);
  }

  private _isTransBankTransactionRequest(
    record: Partial<RecordTransactionRequest>
  ): boolean {
    return record.processorName === ProcessorEnum.TRANSBANK;
  }

  private _isTransBankTransaction(record: Transaction): boolean {
    return record.processor_name === ProcessorEnum.TRANSBANK;
  }

  private _finishBuildingTransactionObj(
    record: Partial<RecordTransactionRequest>,
    context: AuthorizerContext,
    tokenType: string
  ): Transaction {
    const [is_transbank_conciliation, buy_order, card_type] =
      this._getTransBankConciliationDataTransactionRequest(record);

    if (is_transbank_conciliation) set(record, "conciliationId", buy_order);

    const trx = <Transaction>(
      TransactionService._buildDynamo(<RecordTransactionRequest>record, context)
    );

    trx.card_type_bin = card_type;
    trx.token_type = tokenType;
    trx.securityIdentity = defaultTo(trx.securityIdentity, []);

    return trx;
  }

  private _informSiftScienceTransactionRule(
    merchant: DynamoMerchantFetch,
    token: DynamoTokenFetch,
    totalAmount: number,
    transactionReference: string,
    ticketNumber: string
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        const payload: InformSiftTransactionRequest = {
          amount: totalAmount,
          currency: get(token, "currency", ""),
          merchantId: merchant.public_id,
          sessionId: get(token, "sessionId", ""),
          ticket_number: ticketNumber,
          transaction_reference: transactionReference,
          userId: get(token, "userId", ""),
        };

        this._logger.info("REQUEST SIFTSCIENCE: ", payload);
        return this._lambda.invokeAsyncFunction<InformSiftTransactionRequest>(
          `usrv-transaction-rule-${process.env.USRV_STAGE}-informSiftTransaction`,
          {
            body: {
              ...payload,
            },
          }
        );
      }),
      mapTo(true),
      tag("TransactionService | _informSiftScienceTransactionRule")
    );
  }

  private _validateSiftScience(
    currentToken: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch,
    ticketNumber: string
  ): Observable<boolean> {
    return iif(
      () =>
        currentToken.userId !== undefined &&
        currentToken.sessionId !== undefined &&
        !isEmpty(get(currentMerchant, "sift_science.ProdApiKey")),
      this._antifraud.transaction(currentMerchant, currentToken, ticketNumber),
      of(true)
    );
  }

  private _validateSiftScienceCharge(
    currentToken: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch,
    ticketNumber: string
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        const merchant_migrate: string[] =
          `${process.env.MERCHANT_MIGRATE_IDS}`.split(",");

        return iif(
          () =>
            merchant_migrate.includes(get(currentMerchant, "public_id")) ||
            merchant_migrate.includes("all"),
          this._informSiftScienceTransactionRule(
            currentMerchant,
            currentToken,
            currentToken.amount,
            currentToken.transactionReference,
            ticketNumber
          ),
          this._validateSiftScience(currentToken, currentMerchant, ticketNumber)
        );
      }),
      tag("TransactionService | _validateSiftScienceCharge")
    );
  }

  private _finishSavingTransaction(trx: Transaction): Observable<Transaction> {
    const card_type_bin = trx.card_type_bin || "";

    return of(trx).pipe(
      mergeMap((transaction: Transaction) => {
        if (!isEmpty(transaction.card_type_bin))
          delete transaction.card_type_bin;
        if (isEmpty(transaction.ticket_number))
          unset(transaction, "ticket_number");
        if (isEmpty(transaction.sale_ticket_number))
          delete transaction.sale_ticket_number;

        delete transaction.card_type_bin;

        return of(transaction);
      }),
      switchMap((transaction: Transaction) => {
        const transaction_card: Transaction = cloneDeep(transaction);

        if (!isEmpty(transaction.createSubscriptionMetadata))
          delete transaction_card.createSubscriptionMetadata;

        return forkJoin([
          of(transaction_card),
          this._storage.put(
            transaction_card,
            TABLES.transaction,
            this._dynamoCondition
          ),
          this._isTransbankProcessorAndCardTypeCorrect(
            this._isTransBankTransaction(trx),
            card_type_bin,
            transaction
          ),
          iif(
            () =>
              get(transaction, this._metadataSubsValidationPath, false) &&
              (transaction.transaction_status ===
                TransactionStatusEnum.DECLINED ||
                get(
                  transaction,
                  "createSubscriptionMetadata.subscriptionStatus"
                ) === TransactionStatusEnum.DECLINED),
            this._sendSubscriptionAttemptRequest(transaction),
            of(false)
          ),
        ]);
      }),
      mergeMap((data: [Transaction, boolean, boolean, boolean]) => {
        const transaction: Transaction = cloneDeep(data[0]);

        delete transaction.social_reason;
        delete transaction.category_merchant;
        delete transaction.tax_id;
        delete transaction.card_country_code;
        delete transaction.card_country;
        delete transaction.account_type;
        delete transaction.secure_code;
        delete transaction.secure_message;

        return of(transaction);
      }),
      tag("TransactionService | _finishSavingTransaction")
    );
  }

  private _isTransBankConciliationTransactionRequest(
    record: Partial<RecordTransactionRequest>
  ): boolean {
    const is_transbank_processor: boolean =
      this._isTransBankTransactionRequest(record);
    const conciliation_id: string = get(record, "conciliationId");

    return is_transbank_processor && !isEmpty(conciliation_id);
  }

  private _getTransBankConciliationDataTransactionRequest(
    record: Partial<RecordTransactionRequest>
  ): [boolean, string, string] {
    const is_transbank_conciliation_request =
      this._isTransBankConciliationTransactionRequest(record);

    if (is_transbank_conciliation_request) {
      const [buy_order, card_type] = this._extractConciliationId(
        get(record, "conciliationId")
      );

      return [is_transbank_conciliation_request, buy_order, card_type];
    }

    return [is_transbank_conciliation_request, "", ""];
  }

  private _validateBreakLine(responseText: string): string {
    return responseText.split("\n").join(" ");
  }

  private _sendSubscriptionAttemptRequest(
    transaction: Transaction
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => of(this._buildSubscriptionAttemptRequest(transaction))),
      mergeMap((request: FailedSubscriptionRequest) =>
        this._sqs.put(`${process.env.SQS_SAVE_ATTEMPT}`, request)
      ),
      tag("TransactionService | _sendSubscriptionAttemptRequest")
    );
  }

  private _buildSubscriptionAttemptRequest(
    transaction: Transaction
  ): FailedSubscriptionRequest {
    let code: string = ErrorCode.K006;
    let message: string = SubscriptionAttemptMessageEnum.K006;
    let description: string =
      get(transaction, this._responseTextSnakePath) ||
      SubscriptionAttemptMessageEnum.DEFAULT_MESSAGE_PROCESSOR_ERROR;

    let rule: RuleTransaction | undefined = get(transaction, "rules", []).find(
      (r: RuleTransaction) => r.code === RejectedTransactionEnum.K322
    );

    if (
      !isEmpty(
        get(transaction, "createSubscriptionMetadata.subscriptionStatus")
      )
    )
      rule = get(transaction, "createSubscriptionMetadata.rules[0]");

    if (!isUndefined(rule) && !isNull(rule)) {
      code = RejectedTransactionEnum.K322;
      message = SubscriptionAttemptMessageEnum.K322;
      description = get(
        rule,
        "message",
        SubscriptionAttemptMessageEnum.DEFAULT_MESSAGE_SECURITY_RULE
      );
    }

    return {
      code,
      description,
      message,
      amount: get(transaction, "createSubscriptionMetadata.amount"),
      binInfo: get(transaction, "binInfo"),
      cardHolderName: get(transaction, "card_holder_name"),
      contactDetails: get(transaction, "contact_details"),
      dayOfMonth: get(transaction, "createSubscriptionMetadata.dayOfMonth"),
      dayOfWeek: get(transaction, "createSubscriptionMetadata.dayOfWeek"),
      endDate: get(transaction, "createSubscriptionMetadata.endDate"),
      expiryMonth: get(transaction, "createSubscriptionMetadata.expiryMonth"),
      expiryYear: get(transaction, "createSubscriptionMetadata.expiryYear"),
      id: get(transaction, "createSubscriptionMetadata.attemptId"),
      ip: get(transaction, "createSubscriptionMetadata.ip"),
      lastFourDigits: get(transaction, "last_four_digits"),
      maskedCardNumber: get(transaction, "maskedCardNumber"),
      merchantCountry: get(transaction, "country"),
      merchantId: get(transaction, "merchant_id"),
      metadata: get(transaction, "metadata"),
      month: get(transaction, "createSubscriptionMetadata.month"),
      periodicity: get(transaction, "createSubscriptionMetadata.periodicity"),
      planName: get(transaction, "createSubscriptionMetadata.planName"),
      startDate: get(transaction, "createSubscriptionMetadata.startDate"),
      token: get(transaction, "createSubscriptionMetadata.token"),
      transactionReference: get(transaction, "transaction_reference"),
      userAgent: get(transaction, "createSubscriptionMetadata.userAgent"),
      vaultToken: get(transaction, "vault_token"),
    };
  }
}
