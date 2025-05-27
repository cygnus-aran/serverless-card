/**
 * Prosa Service Implementation.
 */
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { inject, injectable } from "inversify";
import { ICardGateway } from "repository/ICardGateway";
import { IProsaService } from "repository/IProviderService";
import { Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mergeMap } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";

// jscpd:ignore-start
@injectable()
export class ProsaService implements IProsaService {
  public variant: CardProviderEnum.PROSA = CardProviderEnum.PROSA;
  private readonly _aurus: ICardGateway;

  constructor(@inject(IDENTIFIERS.CardGateway) aurus: ICardGateway) {
    this._aurus = aurus;
  }

  public tokens(
    request: AurusTokenLambdaRequest
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      // TODO: invoke aurus token for business (action:route) rules
      mergeMap(() => this._aurus.getAurusToken(request)),
      catchError(() => UtilsService.tokenGenerator("ProsaService")),
      tag("ProsaService | tokens")
    );
  }
  // jscpd:ignore-end

  public charge(_: ChargeInput): Observable<AurusResponse> {
    return UtilsService.triggerNotSupportMethodError("ProsaService");
  }

  public preAuthorization(_: ChargeInput): Observable<AurusResponse> {
    return UtilsService.triggerNotSupportMethodError("ProsaService");
  }

  public capture(_: CaptureInput): Observable<AurusResponse> {
    return UtilsService.triggerNotSupportMethodError("ProsaService");
  }

  public reAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("ProsaService");
  }

  public validateAccount(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("ProsaService");
  }
}
