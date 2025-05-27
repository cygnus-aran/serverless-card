import {
  IDENTIFIERS as CORE_ID,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { ProcessorSsmKeyEnum } from "infrastructure/ProcessorSsmKeyEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, set } from "lodash";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IRedebanService } from "repository/IProviderService";
import { Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mergeMap, timeoutWith } from "rxjs/operators";
import { ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { RedebanChargeRequest } from "types/redeban_charge_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { CardTypes } from "constant/CardTypes";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";

// jscpd:ignore-start
@injectable()
export class RedebanService implements IRedebanService {
  public variant: CardProviderEnum.REDEBAN = CardProviderEnum.REDEBAN;
  private static readonly sDeferredMonthsPath: string = "event.deferred.months";

  private readonly _lambda: ILambdaGateway;
  private readonly _storage: IDynamoGateway;
  private readonly _aurus: ICardGateway;

  constructor(
    @inject(CORE_ID.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(IDENTIFIERS.CardGateway) aurus: ICardGateway
  ) {
    this._storage = storage;
    this._lambda = lambda;
    this._aurus = aurus;
  }

  public tokens(_: AurusTokenLambdaRequest): Observable<TokensCardResponse> {
    return of(1).pipe(
      // TODO: invoke aurus token for business (action:route) rules
      mergeMap(() => UtilsService.tokenGenerator("RedebanService")),
      tag("RedebanService | tokens")
    );
  }
  // jscpd:ignore-end

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          `${process.env.REDEBAN_CHARGE_LAMBDA}`,
          {
            ...this._buildRequestRedeban(request),
          }
        )
      ),
      timeoutWith(
        UtilsService.getStaticProcesorTimeoutValue(ProcessorSsmKeyEnum.REDEBAN),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalServerErrorResponse(
              this._buildRequestRedeban(request),
              ProcessorEnum.REDEBAN
            )
          )
        )
      ),
      catchError((error: KushkiError | Error) => {
        if (error instanceof KushkiError)
          return this._handleErrorRequest(
            error,
            this._buildRequestRedeban(request)
          );

        return throwError(() => error);
      }),
      tag("RedebanService | charge")
    );
  }

  public preAuthorization(_payload: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("RedebanService");
  }

  public reAuthorization(_payload: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("RedebanService");
  }

  public capture(_payload: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("RedebanService");
  }

  public validateAccount(_payload: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("RedebanService");
  }

  private _handleErrorRequest(
    error: KushkiError,
    req: RedebanChargeRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        if (
          get(error, "code", "").includes("600") ||
          get(error, "code", "").includes("500")
        )
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.REDEBAN)
          );
        if (get(error, "code", "").includes("027"))
          return this._manageTimeOutError(error, req);

        return throwError(() => error);
      }),
      tag("RedebanService | _handleErrorRequest")
    );
  }

  private _manageTimeOutError(
    error: KushkiError,
    req: RedebanChargeRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.put(
          req,
          UtilsService.getTimeoutProcessorTransactionsTable(
            ProcessorSsmKeyEnum.REDEBAN
          )
        )
      ),
      mergeMap(() =>
        throwError(MapperService.buildAurusError(error, ProcessorEnum.REDEBAN))
      ),
      tag("RedebanService | _manageTimeOutError")
    );
  }

  private _buildRequestRedeban(input: ChargeInput): RedebanChargeRequest {
    const is_subscription_validation: boolean = get(
      input,
      "event.metadata.ksh_subscriptionValidation",
      false
    );
    const is_subscription: boolean =
      Boolean(input.event.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !is_subscription_validation;
    const request: RedebanChargeRequest = {
      acquirerId: get(input, "processor.unique_code", ""),
      card: {
        amount: input.amount,
        bin: input.currentToken.bin,
        brand: get(input, "currentToken.binInfo.brand", ""),
        cvv:
          is_subscription && !isEmpty(get(input, "cvv"))
            ? get(input, "cvv")
            : undefined,
        holderName: get(input, "currentToken.cardHolderName", ""),
        lastFourDigits: input.currentToken.lastFourDigits,
        months: get(
          input.event,
          "months",
          get(input, RedebanService.sDeferredMonthsPath)
        ),
        type: defaultTo(
          get(input, "currentToken.binInfo.info.type", ""),
          CardTypeEnum.CREDIT
        ).toUpperCase() as CardTypes,
      },
      isDeferred:
        get(input, "currentToken.isDeferred", false) ||
        get(
          input.event,
          "months",
          get(input, RedebanService.sDeferredMonthsPath)
        ) > 1,
      merchantId: input.currentMerchant.public_id,
      merchantName: input.currentMerchant.merchant_name,
      processorBankName: get(input, "processor.acquirer_bank", ""),
      processorId: input.processor.public_id,
      terminalId: get(input, "processor.terminal_id", ""),
      tokenType: input.tokenType,
      transactionReference: input.currentToken.transactionReference,
      vaultToken: get(input, "currentToken.vaultToken", ""),
    };

    if (is_subscription) {
      set(
        request,
        "card.months",
        get(input, RedebanService.sDeferredMonthsPath, 1)
      );
      set(request, "isDeferred", false);
      set(request, "subscription", input.event.periodicity);
    }

    UtilsService.add3DSFields(
      input,
      request,
      get(input, "currentToken.3ds.detail.specificationVersion")
    );

    return request;
  }
}
