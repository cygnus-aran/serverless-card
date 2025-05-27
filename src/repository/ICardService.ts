/**
 * ICard Service file.
 */
import { IAPIGatewayEvent, IDynamoDbEvent, IDynamoRecord } from "@kushki/core";
import { Context } from "aws-lambda";
import { IEventBusDetail } from "infrastructure/IEventBusDetail";
import { IContext } from "repository/IContext";
import { Observable } from "rxjs";
import { ThreeDSTokenInfoRequest } from "types/3ds_token_info_request";
import { AccountValidationRequest } from "types/account_validation_request";
import { AuthorizerContext } from "types/authorizer_context";
import { BinInfo } from "types/bin_info";
import { BinParameters } from "types/bin_parameters";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargeBackRequest } from "types/chargeback_request";
import { ChargebackTransaction } from "types/chargeback_transaction";
import { ChargesCardRequest } from "types/charges_card_request";
import { CreateDefaultServicesRequest } from "types/create_card_request";
import { CreateDefaultServicesResponse } from "types/create_card_response";
import { ReauthorizationRequest } from "types/reauthorization_request";
import { IDeferredResponse } from "types/remote/deferred_response";
import { TokenResponse } from "types/remote/token_response";
import { TokenChargeRequest } from "types/token_charge_request";
import { TokensCardBody } from "types/tokens_card_body";
import { TransactionDynamo } from "types/transaction_dynamo";
import { UnifiedCaptureRequest } from "types/unified_capture_request";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { VoidCardRequest } from "types/void_card_request";
import { TokenlessChargeCardBody } from "types/tokenless_charge_card_body";
import { ChargebackPath } from "types/chargeback_path";
import { ChargebackResponse } from "types/chargeback_response";

/**
 * Card Service Interface
 */
export interface ICardService {
  /**
   *  Request a token from Aurus
   */
  tokens(
    event: IAPIGatewayEvent<TokensCardBody, null, null, AuthorizerContext>
  ): Observable<TokenResponse>;

  /**
   *  Request a unifiedCapture request
   * @param object - an UnifiedCaptureRequest
   * @param context
   */
  unifiedCapture(
    event: UnifiedCaptureRequest,
    context: IContext
  ): Observable<object>;

  /**
   *  Request a capture request to Aurus
   * @param event - an IApiGatewayEvent with charge body
   * @param context
   */
  capture(
    event: IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext>,
    context: Context
  ): Observable<object>;

  /**
   *  Request a charge request to Aurus
   * @param event - an IApiGatewayEvent with charge body
   * @param context - lambda context
   */
  charges(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    context: Context
  ): Observable<object>;

  /**
   *  Request a createDefaultServices request
   * @param event - an IApiGatewayEvent with charge body
   */
  createDefaultServices(
    event: IAPIGatewayEvent<
      CreateDefaultServicesRequest,
      null,
      null,
      AuthorizerContext
    >
  ): Observable<CreateDefaultServicesResponse>;

  /**
   *  Request a unified charge request
   * @param request - an UnifiedChargesPreauthRequest with charge body
   * @param context - lambda context
   */
  unifiedChargesOrPreAuth(
    request: UnifiedChargesPreauthRequest,
    context: Context
  ): Observable<object>;

  /**
   *  Request a pre Authorization  request to Aurus
   * @param event - an IApiGatewayEvent with charge body
   * @param context - lambda context
   */
  preAuthorization(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    context: Context
  ): Observable<object>;

  /**
   *  Void a transaction
   */
  chargeDelete(
    event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object>;

  /**
   *  Void a transaction in card and subscription services
   */
  chargeDeleteGateway(
    event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    context: IContext
  ): Observable<object>;

  /**
   * Void a chargeBack
   */
  chargeBack(
    event: IAPIGatewayEvent<
      ChargeBackRequest,
      ChargebackPath,
      null,
      AuthorizerContext
    >
  ): Observable<boolean | ChargebackResponse>;

  /**
   * Get deferred conditions with a specific bin
   */
  deferred(
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
  ): Observable<IDeferredResponse[]>;

  /**
   * Get bin info from a specific bin
   */
  binInfo(
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
  ): Observable<BinInfo>;

  /**
   * sqsWebhook static function
   */
  sqsWebhook(): Observable<boolean>;

  /**
   * tokenCharge is invoked from transaction-rule and subscription to request a charge.
   * @param request - TokenChargeRequest
   * @param context - lambda context
   */
  tokenCharge(
    request: TokenChargeRequest,
    context: Context
  ): Observable<object>;

  /**
   *  Request a re Authorization
   * @param event - an ReauthorizationRequest with reauth body
   * @param context - lambda context
   */
  reAuthorization(
    event: IAPIGatewayEvent<
      ReauthorizationRequest,
      null,
      null,
      AuthorizerContext
    >,
    context: Context
  ): Observable<object>;

  /**
   *  validateAccount validates a card based on a specific token
   * @param event - an IApiGatewayEvent with charge body
   * @param context
   */
  validateAccount(
    event: IAPIGatewayEvent<
      AccountValidationRequest,
      null,
      null,
      AuthorizerContext
    >
  ): Observable<object>;

  /**
   * Automatic void for transactions
   */
  automaticVoidStream(
    event: IDynamoDbEvent<TransactionDynamo>
  ): Observable<boolean>;

  /**
   * Update reAuthorization void status
   */
  updateReAuthVoidStatus(
    event: IEventBusDetail<IDynamoRecord<ChargebackTransaction>>
  ): Observable<boolean>;

  /**
   * Update 3ds token info
   */
  update3dsTokenInfo(event: ThreeDSTokenInfoRequest): Observable<boolean>;

  /**
   *  Request a charge request to Aurus
   * @param event - an IApiGatewayEvent with charge body
   * @param context - lambda context
   */
  tokenlessCharge(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >,
    context: Context
  ): Observable<object>;

  /**
   *  Request a preAuthorization request to Aurus
   * @param event - an IApiGatewayEvent with pre authorization body
   * @param context - lambda context
   */
  tokenlessPreAuthorization(
    event: IAPIGatewayEvent<
      TokenlessChargeCardBody,
      null,
      null,
      AuthorizerContext
    >,
    context: Context
  ): Observable<object>;
}
