/**
 * ISubscription Service file.
 */
import {
  AurusError,
  IAPIGatewayEvent,
  IDynamoDbEvent,
  ISQSEvent,
  KushkiError,
} from "@kushki/core";
import { SQSChargesInput } from "infrastructure/SQSChargesInput";
import { Observable } from "rxjs";
import { EventCharge } from "service/CardService";
import { AurusResponse } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CardTrxFailed } from "types/card_trx_failed";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import {
  LambdaTransactionRuleMetadataResponse,
  LambdaTransactionRuleResponse,
} from "types/lambda_transaction_rule_response";
import { RecordTransactionRequest } from "types/record_transaction_request";
import { SaveDeclineTrxRequest } from "types/save_decline_trx_request";
import { SyncTransactionStream } from "types/sync_transaction_stream";
import { Transaction } from "types/transaction";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { VoidCardRequest } from "types/void_card_request";
import { MessageFields } from "types/preauth_full_response_v2";

export type TrxsQueryStatusCreated = {
  startDate: number;
  endDate: number;
  transactionStatus: string;
};

export type ErrorType = KushkiError | AurusError | null;

export type ProcessRecordRequest = {
  requestEvent: EventCharge;
  authorizerContext: AuthorizerContext;
  aurusChargeResponse: AurusResponse;
  merchantId: string;
  tokenInfo: DynamoTokenFetch;
  merchantName: string;
  country: string;
  processor?: DynamoProcessorFetch;
  error?: ErrorType | null;
  saleTicketNumber?: string | null;
  ruleInfo?: object;
  plccInfo?: { flag: string; brand: string };
  trxType?: string;
  partner?: string;
  siftValidation?: boolean;
  whitelist?: boolean;
  isAft?: boolean;
  integration?: string;
  integrationMethod?: string;
  transaction?: Transaction;
  merchant?: DynamoMerchantFetch;
  validateSiftTrxRule?: boolean;
  trxRuleMetadata?: LambdaTransactionRuleMetadataResponse;
  processorChannel?: string;
  trxRuleResponse?: LambdaTransactionRuleResponse;
  messageFields?: MessageFields;
};

/**
 * Transaction Service Interface
 */
export interface ITransactionService {
  /**
   *  Save Transaction from Aurus
   */
  record(event: IAPIGatewayEvent<RecordTransactionRequest>): Observable<object>;

  /**
   *  Sync Transaction to elasticsearch
   */
  syncTransactions(
    event: IDynamoDbEvent<SyncTransactionStream>
  ): Observable<boolean>;

  /**
   * Save Card Trx Failed
   * @param event - SQS event
   */
  saveCardTrxFailed(event: ISQSEvent<CardTrxFailed>): Observable<boolean>;

  /**
   *  Sync Transaction to redshift
   */
  syncRedshift(
    event: IDynamoDbEvent<SyncTransactionStream>
  ): Observable<boolean>;

  /**
   *  Sync Transaction to billing
   */
  syncBilling(
    event: IDynamoDbEvent<SyncTransactionStream>
  ): Observable<boolean>;

  /**
   *  Process CardTransaction
   */
  processRecord(event: ProcessRecordRequest): Observable<Transaction>;

  /**
   * Process VoidTransactions
   * @param event - Api Gateway event
   * @param chargeTrx - charge transaction
   */
  processVoidRecord(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    chargeTrx: Transaction
  ): Observable<Transaction>;

  /**
   * Charge, preauth or capture SQS message poll
   * @param event - sqsEvent
   */
  saveCardTrxsSQS(event: ISQSEvent<Transaction>): Observable<boolean>;

  /**
   * Charge SQS message save
   * @param event - sqsEvent
   */
  saveChargesTrxsSQS(event: ISQSEvent<SQSChargesInput>);

  buildTransactionObject(request: ProcessRecordRequest): Transaction;

  /**
   * Save declined trx
   * @param request - SaveDeclineTrxRequest
   */
  saveDeclineTrx(request: SaveDeclineTrxRequest): Observable<boolean>;
}
export type VoidBody = VoidCardRequest | null | undefined;
