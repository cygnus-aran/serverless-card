/**
 * SyncService file
 */
import {
  IDynamoDbEvent,
  IDynamoRecord,
  ILogger,
  IRecord,
  ISnsEvent,
  KushkiError,
} from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import dotObject = require("dot-object");
import { ERRORS } from "infrastructure/ErrorEnum";
import { IEventBusDetail } from "infrastructure/IEventBusDetail";
import { inject, injectable } from "inversify";
import { get, isEmpty, set } from "lodash";
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IEventBridgeGateway } from "repository/IEventBridgeGateway";
import { ISyncService } from "repository/ISyncService";
import { EMPTY, forkJoin, from, Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, last, mapTo, mergeMap, switchMap } from "rxjs/operators";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { ElasticProcessor } from "types/elastic_processor";
import { ProcessorResponse } from "types/processor_response";
import { MerchantFetch } from "types/remote/merchant_fetch";
import { ProcessorFetch } from "types/remote/processor_fetch";
import { TransactionSNS } from "types/transactionSNS";

/**
 * Implementation
 */
@injectable()
export class SyncService implements ISyncService {
  private readonly _dynamo: IDynamoGateway;
  private readonly _eventBridge: IEventBridgeGateway;
  private readonly _logger: ILogger;

  constructor(
    @inject(IDENTIFIERS.DynamoGateway) dynamo: IDynamoGateway,
    @inject(IDENTIFIERS.EventBridgeGateway) eventBridge: IEventBridgeGateway,
    @inject(CORE.Logger) logger: ILogger
  ) {
    this._dynamo = dynamo;
    this._eventBridge = eventBridge;
    this._logger = logger;
  }

  public syncMerchants(
    event: IEventBusDetail<IDynamoRecord<MerchantFetch>>
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        const record: IDynamoRecord<MerchantFetch> = event.payload;

        if (
          record.dynamodb === undefined ||
          record.dynamodb.NewImage === undefined
        )
          throw new KushkiError(ERRORS.E020);

        return forkJoin([
          of(record),
          this._dynamo.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: record.dynamodb.NewImage.publicMerchantId,
          }),
        ]);
      }),
      mergeMap(
        ([record, merchant]: [
          IDynamoRecord<MerchantFetch>,
          DynamoMerchantFetch | undefined
        ]) => {
          if (merchant === undefined)
            return this._dynamo.put(
              {
                acceptCreditCards: [],
                country: get(record, "dynamodb.NewImage.country", ""),
                merchant_name: get(record, "dynamodb.NewImage.name", ""),
                merchantCategory: get(
                  record,
                  "dynamodb.NewImage.categoryMerchant",
                  ""
                ),
                public_id: get(
                  record,
                  "dynamodb.NewImage.publicMerchantId",
                  ""
                ),
                sift_science: {},
                socialReason: get(record, "dynamodb.NewImage.socialReason", ""),
                taxId: get(record, "dynamodb.NewImage.taxId", ""),
              },
              TABLES.merchants
            );

          return this._dynamo.put(
            {
              ...merchant,
              country: get(record, "dynamodb.NewImage.country", ""),
              merchant_name: get(record, "dynamodb.NewImage.name", ""),
              merchantCategory: get(
                record,
                "dynamodb.NewImage.categoryMerchant",
                ""
              ),
              socialReason: get(record, "dynamodb.NewImage.socialReason", ""),
              taxId: get(record, "dynamodb.NewImage.taxId", ""),
            },
            TABLES.merchants
          );
        }
      ),
      catchError(() => of(EMPTY)),
      tag("SyncService | syncMerchants"),
      last(),
      mapTo(true)
    );
  }

  public syncAsyncTransactions(
    event: ISnsEvent<TransactionSNS>
  ): Observable<boolean> {
    return from(event.Records).pipe(
      mergeMap((data: IRecord<TransactionSNS>) =>
        forkJoin([
          of(data),
          this._dynamo.getDynamoMerchant(
            get(data.Sns.Message, "merchantId", "")
          ),
        ])
      ),
      mergeMap(
        ([data, merchant]: [IRecord<TransactionSNS>, DynamoMerchantFetch]) =>
          this._dynamo.put(
            this._buildTransaction(data.Sns.Message, merchant),
            TABLES.transaction
          )
      ),
      tag("SyncService | syncAsyncTransactions")
    );
  }

  public syncProcessors(
    _event: IDynamoDbEvent<ProcessorFetch>
  ): Observable<boolean> {
    return of(true);
  }

  public putEventBridgeProcessor(
    event: IDynamoDbEvent<ProcessorResponse>
  ): Observable<boolean> {
    return from(event.Records).pipe(
      switchMap((record: IDynamoRecord<ProcessorResponse>) => {
        const new_image_path = "dynamodb.NewImage";
        const old_image_path = "dynamodb.OldImage";
        const record_to_send: IDynamoRecord<ElasticProcessor> = {
          dynamodb: {
            NewImage: this._buildDynamoNewAndOldImage(record, new_image_path),
          },
          eventName: record.eventName,
        };

        if (!isEmpty(get(record, old_image_path)))
          set(
            record_to_send,
            old_image_path,
            this._buildDynamoNewAndOldImage(record, old_image_path)
          );

        this._logger.info("Put eventBridge", record_to_send);

        return this._eventBridge.putEvent(
          this._buildEventBridgeDetail(record_to_send),
          `${process.env.EVENT_BUS_PROCESSORS}`,
          `${process.env.DYNAMO_PROCESSOR}`,
          `${typeof record}`
        );
      }),
      tag("SyncService | putEventBridgeProcessor")
    );
  }

  private _buildDynamoNewAndOldImage(
    record: IDynamoRecord<ProcessorResponse>,
    path: string
  ): ElasticProcessor {
    const dynamo_image = get(record, path);

    return {
      alias: get(dynamo_image, "processorAlias"),
      apiKeyCompleteTransaction: get(dynamo_image, "apiKeyCompleteTransaction"),
      businessBank: get(dynamo_image, "businessBank"),
      businessBankAccountNumber: get(dynamo_image, "businessBankAccountNumber"),
      businessBankAccountType: get(dynamo_image, "businessBankAccountType"),
      categoryModel: get(dynamo_image, "categoryModel"),
      certificates: {
        completeTransaction:
          !isEmpty(get(dynamo_image, "certificates.completeTransaction")) ||
          !isEmpty(get(dynamo_image, "apiKeyCompleteTransaction")),
        firstData: !isEmpty(get(dynamo_image, "certificates.firstData")),
        oneClickMall: !isEmpty(get(dynamo_image, "commerceCodeOneClickMall")),
        webPay: !isEmpty(get(dynamo_image, "certificates.webPay")),
      },
      commerceCode: get(dynamo_image, "commerceCode"),
      commerceCodeOneClickMall: get(dynamo_image, "commerceCodeOneClickMall"),
      commerceCodeWebPay: get(dynamo_image, "commerceCodeWebPay"),
      corporateId: get(dynamo_image, "corporateId"),
      created: get(dynamo_image, "created"),
      credentials: get(dynamo_image, "credentials"),
      currency: get(dynamo_image, "currency"),
      deleteAt: get(dynamo_image, "deletedAt"),
      enableRestCompleteTransaction: get(
        dynamo_image,
        "enableRestCompleteTransaction"
      ),
      failOverProcessor: get(dynamo_image, "failOverProcessor"),
      isCrypto: get(dynamo_image, "isCrypto"),
      key: get(dynamo_image, "key"),
      lowerLimit: get(dynamo_image, "lowerLimit"),
      merchantCategoryCode: get(dynamo_image, "merchantCategoryCode"),
      merchantId: get(dynamo_image, "merchantId"),
      notificationEnable: get(dynamo_image, "notificationEnable"),
      omitCVV: get(dynamo_image, "omitCVV"),
      password: get(dynamo_image, "password"),
      paymentMethod: "card",
      plcc: get(dynamo_image, "plcc"),
      privateId: get(dynamo_image, "privateId"),
      processorCode: get(dynamo_image, "processorCode"),
      processorMerchantId: get(dynamo_image, "processorMerchantId"),
      processorName: get(dynamo_image, "processorName"),
      processorType: get(dynamo_image, "processorType"),
      publicProcessorId: get(dynamo_image, "publicId"),
      status: get(dynamo_image, "status"),
      subMccCode: get(dynamo_image, "subMccCode"),
      subTerminalId: get(dynamo_image, "subTerminalId"),
      terminalId: get(dynamo_image, "terminalId"),
      traceInfo: get(dynamo_image, "traceInfo"),
      uniqueCode: get(dynamo_image, "uniqueCode"),
      updatedAt: get(dynamo_image, "updatedAt"),
      upperLimit: get(dynamo_image, "upperLimit"),
      username: get(dynamo_image, "username"),
      webpayType: get(dynamo_image, "webpayType"),
    };
  }

  private _buildEventBridgeDetail(record: IDynamoRecord): object {
    return {
      action: record.eventName,
      mappingType: "dynamo",
      originUsrv: `${process.env.USRV_NAME}`,
      payload: record,
    };
  }

  private _buildTransaction(
    trx: TransactionSNS,
    merchant: DynamoMerchantFetch
  ): object {
    const transaction_result: object = {
      approval_code: trx.approval_code,
      approved_transaction_amount: trx.totalAmount,
      channel: trx.channel,
      country: get(merchant, "country", ""),
      customerMerchantId: get(trx, "customerMerchantId", trx.merchantId),
      merchant_name: get(merchant, "merchant_name", ""),
      ownerId: get(trx, "ownerId", trx.merchantId),
      request_amount: trx.totalAmount,
      sync_mode: "api",
      ticket_number: trx.ticketNumber,
      transaction_status: trx.status,
      transaction_type: trx.transactionType,
    };

    dotObject.copy("creditType", "creditType", trx, transaction_result);
    dotObject.copy("buyOrder", "buy_order", trx, transaction_result);
    dotObject.copy("token", "token", trx, transaction_result);
    dotObject.copy("amount", "amount", trx, transaction_result);
    dotObject.copy("subtotalIva", "subtotal_iva", trx, transaction_result);
    dotObject.copy("subtotalIva0", "subtotal_iva0", trx, transaction_result);
    dotObject.copy("ivaValue", "iva_value", trx, transaction_result);
    dotObject.copy("amount.extraTaxes", "taxes", trx, transaction_result);
    dotObject.copy("currency", "currency_code", trx, transaction_result);
    dotObject.copy("metadata", "metadata", trx, transaction_result);
    dotObject.copy("created", "created", trx, transaction_result);
    dotObject.copy("merchantId", "merchant_id", trx, transaction_result);
    dotObject.copy("paymentBrand", "payment_brand", trx, transaction_result);
    dotObject.copy(
      "lastFourDigits",
      "last_four_digits",
      trx,
      transaction_result
    );
    dotObject.copy("approvalCode", "approval_code", trx, transaction_result);
    dotObject.copy("status", "transaction_status", trx, transaction_result);
    dotObject.copy("processorId", "processor_id", trx, transaction_result);
    dotObject.copy("processorName", "processor_name", trx, transaction_result);
    dotObject.copy("processorType", "processor_type", trx, transaction_result);
    dotObject.copy("responseCode", "response_code", trx, transaction_result);
    dotObject.copy("responseText", "response_text", trx, transaction_result);
    dotObject.copy(
      "transactionReference",
      "transaction_reference",
      trx,
      transaction_result
    );
    dotObject.copy(
      "preauthTransactionReference",
      "preauth_transaction_reference",
      trx,
      transaction_result
    );
    dotObject.copy(
      "approvedTransactionAmount",
      "approved_transaction_amount",
      trx,
      transaction_result
    );
    dotObject.copy("totalAmount", "request_amount", trx, transaction_result);
    dotObject.copy("id", "transaction_id", trx, transaction_result);
    dotObject.copy("channel", "channel", trx, transaction_result);
    dotObject.copy("cardType", "card_type", trx, transaction_result);
    dotObject.copy(
      "convertedAmount",
      "converted_amount",
      trx,
      transaction_result
    );
    dotObject.copy("webpayType", "integration_method", trx, transaction_result);
    dotObject.copy(
      "preauthTransactionReference",
      "preauth_transaction_reference",
      trx,
      transaction_result
    );
    dotObject.copy(
      "webpayInitTransactionToken",
      "webpay_init_transaction_token",
      trx,
      transaction_result
    );

    if (trx.mccCode)
      dotObject.copy("mccCode", "mccCode", trx, transaction_result);

    if (trx.webhooks)
      dotObject.copy("webhooks", "webhooks", trx, transaction_result);

    if (!isEmpty(trx.kushkiInfo))
      dotObject.copy("kushkiInfo", "kushkiInfo", trx, transaction_result);
    if (!isEmpty(trx.securityIdentity))
      dotObject.copy(
        "securityIdentity",
        "securityIdentity",
        trx,
        transaction_result
      );

    return transaction_result;
  }
}
