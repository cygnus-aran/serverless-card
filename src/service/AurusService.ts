/**
 * AurusService Implementation
 */
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty } from "lodash";
import { ICardGateway } from "repository/ICardGateway";
import { IAurusService } from "repository/IProviderService";
import { iif, Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { map, mergeMap } from "rxjs/operators";
import { CaptureInput, CardService, ChargeInput } from "service/CardService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";

@injectable()
export class AurusService implements IAurusService {
  public variant: CardProviderEnum.AURUS = CardProviderEnum.AURUS;
  private readonly _aurus: ICardGateway;

  constructor(@inject(IDENTIFIERS.CardGateway) aurus: ICardGateway) {
    this._aurus = aurus;
  }

  public tokens(
    request: AurusTokenLambdaRequest,
    isTokenCharge?: boolean
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => defaultTo(isTokenCharge, false),
          UtilsService.tokenGenerator("AurusService"),
          this._aurus.getAurusToken(request)
        )
      ),
      tag("AurusService | tokens")
    );
  }

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() => this._checkAurusToken(request)),
      mergeMap((token: string) =>
        this._aurus.chargesTransaction({
          ...request,
          event: {
            ...request.event,
            tokenId: token,
          },
        })
      ),
      tag("AurusService | charge")
    );
  }

  public capture(request: CaptureInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._aurus.captureTransaction(
          request.body,
          request.transaction,
          request.processor,
          request.context,
          request.taxId
        )
      ),
      tag("AurusService | capture")
    );
  }

  public preAuthorization(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() => this._checkAurusToken(request)),
      mergeMap((token: string) =>
        this._aurus.preAuthorization(
          {
            ...request.event,
            tokenId: token,
          },
          request.processor,
          request.currentToken,
          request.currentToken.transactionReference,
          request.lambdaContext,
          request.taxId,
          request.currentMerchant.country
        )
      ),
      tag("AurusService | preAuthorization")
    );
  }

  public reAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("AurusService");
  }

  public validateAccount(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("AurusService");
  }

  private _checkAurusToken(request: ChargeInput): Observable<string> {
    return of(1).pipe(
      mergeMap(() => {
        const is_subscription_validation: boolean = get(
          request,
          "event.metadata.ksh_subscriptionValidation",
          false
        );
        const is_subscription_trx: boolean =
          request.event.usrvOrigin.includes(UsrvOriginEnum.SUBSCRIPTIONS) &&
          !is_subscription_validation;
        const is_commission: boolean = Boolean(
          request.event.usrvOrigin === UsrvOriginEnum.COMMISSION
        );

        return iif(
          () =>
            !isEmpty(get(request, "event.vaultToken", "")) &&
            (is_subscription_trx || is_commission),
          this._aurus.getAurusToken(this._buildAurusTokenRequest(request)),
          of({ token: request.event.tokenId })
        );
      }),
      map((response: TokensCardResponse) => response.token),
      tag("AurusService | _checkAurusToken")
    );
  }

  private _buildAurusTokenRequest(
    request: ChargeInput
  ): AurusTokenLambdaRequest {
    return {
      cardHolderName: get(request, "event.cardHolderName", ""),
      currency: <CurrencyEnum>get(request.amount, "currency"),
      isCardValidation: false,
      isDeferred: false,
      merchantId: get(request, "processor.public_id", ""),
      processorName: get(request, "processor.processor_name", ""),
      processorPrivateId: get(request, "processor.private_id", ""),
      tokenType: get(request, "event.tokenType"),
      totalAmount: CardService.sFullAmount(request.amount),
      transactionReference: get(
        request,
        "currentToken.transactionReference",
        ""
      ),
      vaultToken: get(request, "event.vaultToken", ""),
    };
  }
}
