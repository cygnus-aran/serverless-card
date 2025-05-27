import { Observable } from "rxjs";
import { AurusCaptureRequest } from "types/aurus_capture_request";
import { AurusResponse } from "types/aurus_response";
import { CaptureCardRequest } from "types/capture_card_request";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { CardToken } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";

export interface ISandboxGateway {
  /**
   * Send a token request to SandBox Service
   * @param body - token request body information
   * @param mid - Public merchant id
   * @param tokenType - Transaction or Subscription token to request
   * @param processorName - Name of the Processor
   * @param transactionReference - UUID identifier of the transaction
   */
  tokensTransaction(
    body: CardToken,
    mid: string,
    tokenType: string,
    processorName: string
  ): Observable<TokensCardResponse>;

  /**
   * Send a charge request to SandBox Service
   * @param body - charge request body
   * @param mid - Private merchant id
   * @param trxReference
   * @param plccFlag
   * @param tokenInfo
   * @param merchantCountry
   * @param processorName
   */
  chargesTransaction(
    body: UnifiedChargesPreauthRequest,
    mid: string,
    trxReference: string,
    plccFlag: string,
    tokenInfo: DynamoTokenFetch,
    merchantCountry: string,
    processorName: string
  ): Observable<AurusResponse>;

  /**
   * Send a capture request to SandBox Service
   * @param body - capture request body information
   * @param transaction - transaction object
   * @param merchantId - Public merchant id
   */
  captureTransaction(
    body: CaptureCardRequest,
    transaction: Transaction,
    merchantId: string
  ): Observable<AurusResponse>;

  /**
   * Send a re-authorization request to the SandBox Service
   * @param request - Common kushki acq reauth request
   */
  reauthTransaction(request: AurusCaptureRequest): Observable<AurusResponse>;

  /**
   * Send a validateAccount request to SandBox Service
   * @param body - SandboxAccountValidationRequest request body
   */
  validateAccountTransaction(
    body: SandboxAccountValidationRequest
  ): Observable<AurusResponse>;
}
