import { ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ERROR_AURUS_CREDIBANK } from "infrastructure/ErrorMapEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, set } from "lodash";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ICredibankService } from "repository/IProviderService";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  map,
  mergeMap,
  switchMap,
  timeoutWith,
} from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { ChargeCredibankRequest } from "types/charge_credibank_request";
import { CommissionFetch } from "types/commision_fetch";
import { CredibankVars } from "types/credibank_vars";
import { TokensCardResponse } from "types/tokens_card_response";
import { CardTypes } from "constant/CardTypes";

/**
 * Implementation
 */
@injectable()
export class CredibankService implements ICredibankService {
  public variant: CardProviderEnum.CREDIBANK = CardProviderEnum.CREDIBANK;
  private readonly _aurus: ICardGateway;
  private readonly _storage: IDynamoGateway;
  private readonly _lambda: ILambdaGateway;

  constructor(
    @inject(IDENTIFIERS.CardGateway) aurus: ICardGateway,
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway
  ) {
    this._aurus = aurus;
    this._storage = storage;
    this._lambda = lambda;
  }

  // jscpd:ignore-start
  public tokens(_: AurusTokenLambdaRequest): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() => UtilsService.tokenGenerator("CredibankService")),
      tag("CredibankService | tokens")
    );
  }
  // jscpd:ignore-end

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      map(() => CredibankService.getCredibankVars()),
      mergeMap((setup: CredibankVars) => this._processCharge(request, setup)),
      tag("CredibankService | charge")
    );
  }

  public preAuthorization(
    _request: ChargeInput | undefined
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() => this._handleError(new KushkiError(ERRORS.E016))),
      tag("CredibankService | preAuthorization")
    );
  }

  public reAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("CredibankService");
  }

  public capture(
    _request: CaptureInput | undefined
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => this._handleError(new KushkiError(ERRORS.E016))),
      tag("CredibankService | capture")
    );
  }

  public validateAccount(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("CredibankService");
  }

  public static getCredibankVars(): CredibankVars {
    return <CredibankVars>JSON.parse(`${process.env.CREDIBANK_VARS}`);
  }

  private _processCharge(
    request: ChargeInput,
    setup: CredibankVars
  ): Observable<AurusResponse> {
    return of(1).pipe(
      map(() => this._buildRequestCredibankCharge(request)),
      mergeMap((crediBankRequest: ChargeCredibankRequest) =>
        this._lambda.invokeFunction<AurusResponse>(setup.LAMBDA_CHARGE, {
          ...crediBankRequest,
        })
      ),
      timeoutWith(
        Number(`${setup.TIMEOUT}`),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalServerErrorResponse(
              this._buildRequestCredibankCharge(request),
              ProcessorEnum.CREDIBANCO
            )
          )
        )
      ),
      catchError((error: KushkiError | Error) =>
        this._handleError(error, this._buildRequestCredibankCharge(request))
      ),
      tag("CredibankService | _processCharge")
    );
  }

  private _buildRequestCredibankCharge(
    request: ChargeInput
  ): ChargeCredibankRequest {
    const is_card_transaction: boolean = request.event.usrvOrigin.includes(
      UsrvOriginEnum.CARD
    );
    const is_commission_transaction: boolean =
      request.event.usrvOrigin.includes(UsrvOriginEnum.COMMISSION);
    const commission: CommissionFetch = get(
      request,
      "event.merchant.commission"
    ) as CommissionFetch;
    const is_subscription_validation: boolean = get(
      request,
      "event.metadata.ksh_subscriptionValidation",
      false
    );
    const is_subscription: boolean =
      Boolean(request.event.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !is_subscription_validation;
    const charge_credibank_request: ChargeCredibankRequest = {
      accountType: get(request, "currentToken.accountType", ""),
      airlineCode: get(request, "event.airlineCode", ""),
      card: {
        amount: get(request, "event.amount"),
        bin: request.currentToken.bin,
        brand: get(request, "currentToken.binInfo.brand", ""),
        cvv:
          is_subscription && !isEmpty(get(request, "cvv", ""))
            ? get(request, "cvv", "")
            : undefined,
        holderName: get(request, "currentToken.cardHolderName", ""),
        lastFourDigits: request.currentToken.lastFourDigits,
        months: get(
          request.event,
          "months",
          get(request.event, "deferred.months")
        ),
        type: defaultTo(
          get(request, "currentToken.binInfo.info.type", CardTypeEnum.CREDIT),
          CardTypeEnum.CREDIT
        ).toUpperCase() as CardTypes,
      },
      isCardValidation: is_subscription_validation,
      isDeferred: is_card_transaction
        ? get(request, "currentToken.isDeferred", false)
        : false,
      isSubscription: is_subscription,
      merchantId: request.currentMerchant.public_id,
      merchantName: request.currentMerchant.merchant_name,
      processorBankName: get(request, "processor.acquirer_bank", ""),
      processorId: get(request, "processor.public_id"),
      subMccCode: get(request, "trxRuleResponse.body.subMccCode", ""),
      tokenType: request.tokenType,
      transactionReference: request.currentToken.transactionReference,
      vaultToken: get(request, "currentToken.vaultToken", ""),
    };

    if (is_subscription) {
      set(charge_credibank_request, "subscription", request.event.periodicity);
      set(
        charge_credibank_request,
        "subscriptionChargeType",
        request.event.subscriptionChargeType
      );
      set(
        charge_credibank_request,
        "card.months",
        get(request.event, get(request.event, "deferred.months"), 1)
      );
      set(charge_credibank_request, "accountType", request.event.accountType);
    }

    if (is_commission_transaction)
      set(
        charge_credibank_request,
        "isDeferred",
        commission.commission.deferred
      );
    const username: string = get(request, "trxRuleResponse.body.username", "");
    const password: string = get(request, "trxRuleResponse.body.password", "");

    if (username && password) {
      set(charge_credibank_request, "username", username);
      set(charge_credibank_request, "password", password);
    }

    UtilsService.add3DSFields(
      request,
      charge_credibank_request,
      get(request, "currentToken.3ds.detail.specificationVersion")
    );

    return charge_credibank_request;
  }

  // jscpd:ignore-start
  private _handleError(
    error: KushkiError | Error,
    req?: ChargeCredibankRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => error instanceof KushkiError,
          this._validateError(<KushkiError>error, req!),
          throwError(() => error)
        )
      ),
      tag("CredibankService | _handleError")
    );
  }
  // jscpd:ignore-end

  private _validateError(
    error: KushkiError,
    req: ChargeCredibankRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const error_code: string = get(error, "code", "");

        if (ERROR_AURUS_CREDIBANK.includes(error_code))
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.CREDIBANCO)
          );

        if (error_code.includes("012"))
          return throwError(
            MapperService.buildUnreachableAurusError(ProcessorEnum.CREDIBANCO)
          );

        if (error_code.includes("027"))
          return this._manageTimeOutError(error, req);

        if (error_code.includes("016"))
          return UtilsService.triggerNotSupportMethodError(
            "CredibankService",
            error
          );

        return throwError(() => error);
      }),
      tag("CredibankService | _validateError")
    );
  }

  private _manageTimeOutError(
    error: KushkiError,
    req: ChargeCredibankRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.put(
          req,
          `${CredibankService.getCredibankVars().TABLE_TIMEOUTS}`
        )
      ),
      mergeMap(() =>
        throwError(
          MapperService.buildAurusError(error, ProcessorEnum.CREDIBANCO)
        )
      ),
      tag("CredibankService | _manageTimeOutError")
    );
  }
}
