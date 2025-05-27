/**
 * Interface for Aurus Gateway.
 */
import { Context } from "aws-lambda";
import { Observable } from "rxjs";
import { ChargeInput } from "service/CardService";
import { AurusAmount } from "types/aurus_amount";
import { AurusCreateProcessorResponse } from "types/aurus_create_processor_response";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { CaptureCardRequest } from "types/capture_card_request";
import { CaptureSubscriptionRequest } from "types/capture_subscription_request";
import { CreateProcessorRequest } from "types/create_processor_request";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { CardToken } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { UpdateProcessorRequest } from "types/update_processor_request";
import { VoidCardRequest } from "types/void_card_request";

export interface ICardGateway {
  /**
   * Send Card requests
   */
  request(
    merchantCountry: string | undefined,
    body: object,
    method: string,
    headers: object
  ): Observable<object>;

  /**
   * Send a token request to Aurus
   * @param body - token request body information
   * @param mid - Public merchant id
   * @param tokenType - Transaction or Subscription token to request
   * @param processorName - Name of the Processor
   * @param transactionReference - UUID identifier of the transaction
   * @param context
   */
  tokensTransaction(
    body: CardToken,
    mid: string,
    tokenType: string,
    processorName: string,
    transactionReference: string,
    context: Context,
    merchantCountry?: string | undefined
  ): Observable<TokensCardResponse>;

  /**
   * Send a charge request to Aurus
   * @param input - details to executes the charge
   */
  chargesTransaction(input: ChargeInput): Observable<AurusResponse>;

  /**
   * Send a Pre Authorization request to Aurus
   * @param body - charge request body
   * @param processor - Dynamo processor
   * @param tokenInfo
   * @param transactionReference
   * @param context
   */
  preAuthorization(
    body: UnifiedChargesPreauthRequest,
    processor: DynamoProcessorFetch,
    tokenInfo: DynamoTokenFetch,
    transactionReference: string,
    context: Context,
    taxId?: string,
    merchantCountry?: string | undefined
  ): Observable<AurusResponse>;

  /**
   * Send a capture request to Aurus
   * @param body - capture request body information
   * @param transaction - transaction object
   * @param processor - Dynamo processor
   * @param context
   */
  captureTransaction(
    body: CaptureCardRequest,
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    context: Context,
    taxId?: string,
    subscription?: CaptureSubscriptionRequest
  ): Observable<AurusResponse>;

  /**
   * Void a card transaction
   * @param data - Voided TRX information
   * @param ticket - Ticket number
   * @param mid - Private merchant id
   * @param trxReference
   */
  voidTransaction(
    data: VoidCardRequest | null | undefined,
    ticket: string,
    mid: string,
    trxReference: string,
    merchantCountry?: string | undefined
  ): Observable<AurusResponse>;

  /**
   * Void a card transaction
   * @param data - Aurus TRX information
   * @param processorID - processor identifier
   * @param tokenAmount
   */
  buildAurusAmount(
    data:
      | Required<VoidCardRequest>
      | UnifiedChargesPreauthRequest
      | Required<CaptureCardRequest>,
    processorID: string,
    tokenAmount?: number
  ): Observable<AurusAmount>;

  /**
   * Create a processor
   * @param processorBody - Data of the processor to be created
   *  @param country - merchant country
   * @param merchantName
   */
  createProcessor(
    processorBody: CreateProcessorRequest,
    country: string | undefined,
    merchantName: string | undefined
  ): Observable<AurusCreateProcessorResponse>;

  /**
   * Update a processor
   * @param processorBody - Data of the processor to be updated
   * @param country - merchant country
   * @param merchantName
   */
  updateProcessor(
    processorBody: UpdateProcessorRequest,
    country: string | undefined,
    merchantName: string
  ): Observable<boolean>;

  /**
   * getAurusToken with usrv-vault
   * @param request - AurusTokenLambdaRequest
   */
  getAurusToken(
    request: AurusTokenLambdaRequest
  ): Observable<TokensCardResponse>;
}
