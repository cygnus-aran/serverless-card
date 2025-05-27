/**
 * ProviderService Interface
 */
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { Observable } from "rxjs";
import { CaptureInput, ChargeInput } from "service/CardService";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { AuthorizerContext } from "types/authorizer_context";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { SandboxTokenLambdaRequest } from "types/sandbox_token_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";

export interface IProviderService<
  T extends CardProviderEnum = CardProviderEnum
> {
  variant: T;

  /**
   * Tokens transaction
   * @param request
   * @param isTokenCharge
   */
  tokens(
    request: AurusTokenLambdaRequest | SandboxTokenLambdaRequest | undefined,
    isTokenCharge?: boolean
  ): Observable<TokensCardResponse>;

  /**
   * Charge transaction
   * @param request
   */
  charge(request: ChargeInput): Observable<AurusResponse>;

  /**
   * Capture transaction
   * @param request
   */
  capture(request: CaptureInput | undefined): Observable<AurusResponse>;

  /**
   * Pre-authorization transaction
   * @param request
   */
  preAuthorization(
    request: ChargeInput | undefined
  ): Observable<AurusResponse | never>;

  /**
   * Re-authorization transaction
   * @param transaction
   * @param amount
   */
  reAuthorization(
    amount: Amount | undefined,
    authorizerContext: AuthorizerContext | undefined,
    transaction: Transaction | undefined
  ): Observable<AurusResponse | never>;

  /**
   * validateAccount transaction
   * @param request
   */
  validateAccount(
    authorizerContext: AuthorizerContext | undefined,
    request: SandboxAccountValidationRequest | undefined
  ): Observable<AurusResponse | never>;
}

export interface ISandboxService
  extends IProviderService<CardProviderEnum.SANDBOX> {}

export interface IAurusService
  extends IProviderService<CardProviderEnum.AURUS> {}

export interface IRedebanService
  extends IProviderService<CardProviderEnum.REDEBAN> {}

export interface INiubizService
  extends IProviderService<CardProviderEnum.NIUBIZ> {}

export interface IProsaService
  extends IProviderService<CardProviderEnum.PROSA> {}

export interface ICredomaticService
  extends IProviderService<CardProviderEnum.CREDOMATIC> {}

export interface IBillpocketService
  extends IProviderService<CardProviderEnum.BILLPOCKET> {}

export interface ITransbankService
  extends IProviderService<CardProviderEnum.TRANSBANK> {}

export interface ICredibankService
  extends IProviderService<CardProviderEnum.CREDIBANK> {}

export interface IKushkiAcqService
  extends IProviderService<CardProviderEnum.KUSHKI> {}

export interface ICredimaticService
  extends IProviderService<CardProviderEnum.CREDIMATIC> {}

export interface IDatafastService
  extends IProviderService<CardProviderEnum.DATAFAST> {}

export interface IFisService extends IProviderService<CardProviderEnum.FIS> {}
