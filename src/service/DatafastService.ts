import { IDENTIFIERS as CORE, ILambdaGateway, KushkiError } from "@kushki/core";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, isEqual } from "lodash";
import { IDatafastService } from "repository/IProviderService";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mergeMap, switchMap, timeoutWith } from "rxjs/operators";
import { ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { AuthorizerContext } from "types/authorizer_context";
import { DatafastChargeRequest } from "types/datafast_charge_request";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";

@injectable()
export class DatafastService implements IDatafastService {
  public variant: CardProviderEnum.DATAFAST = CardProviderEnum.DATAFAST;
  private static readonly sDeferredMonthsPath: string = "event.deferred.months";
  private static readonly sTerminalIdPath: string = "processor.terminal_id";
  private static readonly sProcessorMerchantIDPath: string =
    "processor.processor_merchant_id";
  private static readonly sSubscriptionTriggerPath: string =
    "event.subscriptionTrigger";

  private readonly _lambda: ILambdaGateway;

  constructor(@inject(CORE.LambdaGateway) lambda: ILambdaGateway) {
    this._lambda = lambda;
  }

  public tokens(_: AurusTokenLambdaRequest): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() => UtilsService.tokenGenerator("DatafastService")),
      tag("DatafastService | tokens")
    );
  }

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => of(this._buildChargeDatafastRequest(request))),
      mergeMap((datafastRequest: DatafastChargeRequest) =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-datafast-${process.env.USRV_STAGE}-charge`,
          datafastRequest
        )
      ),
      timeoutWith(
        Number(`${process.env.DATAFAST_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      catchError((error: KushkiError | Error) => this._handleError(error)),
      tag("DatafastService | charge")
    );
  }

  public capture(_request: undefined): Observable<AurusResponse> {
    return UtilsService.triggerNotSupportMethodError("DatafastService");
  }

  public validateAccount(
    _: AuthorizerContext,
    request: SandboxAccountValidationRequest
  ): Observable<AurusResponse> {
    return UtilsService.triggerNotSupportMethodError("DatafastService");
  }

  public reAuthorization(_request: undefined): Observable<AurusResponse> {
    return UtilsService.triggerNotSupportMethodError("DatafastService");
  }

  public preAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("DatafastService");
  }

  private _buildChargeDatafastRequest(
    request: ChargeInput
  ): DatafastChargeRequest {
    const is_subscription: boolean =
      Boolean(request.event.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !isEmpty(request.currentToken.vaultToken);

    const response: DatafastChargeRequest = {
      acquirerId: get(request, "processor.unique_code", ""),
      binInfo: {
        bank: get(request.currentToken, "binInfo.bank", ""),
        brand: get(request, "currentToken.binInfo.brand", ""),
        cardType: defaultTo(
          get(request, "currentToken.binInfo.info.type"),
          "credit"
        ).toUpperCase(),
        country: get(request.event.binInfo, "event.binInfo.info.country.name"),
        ird: get(request.currentToken, "binInfo.ird", ""),
      },
      card: {
        amount: request.event.amount,
        bin: get(request.currentToken, "binInfo.bin", ""),
        brand: UtilsService.checkBrand(
          get(request.currentToken, "binInfo.brand", ""),
          CardBrandEnum.VISA
        ),
        cardHolderName: get(request, "currentToken.cardHolderName"),
        cvv: get(request, "cvv"),
        lastFourDigits: request.currentToken.lastFourDigits,
        type: defaultTo(
          get(request, "currentToken.binInfo.info.type"),
          "credit"
        ).toUpperCase(),
      },
      deferred: this._getIsDeferred(request)
        ? {
            creditType: get(request, "event.deferred.creditType", ""),
            graceMonths: get(request, "event.deferred.graceMonths"),
            months: defaultTo(
              get(request, DatafastService.sDeferredMonthsPath),
              get(request, "event.months")
            ),
          }
        : undefined,
      externalSubscriptionID: get(request, "event.externalSubscriptionID"),
      isDeferred: this._getIsDeferred(request),
      isSubscription: is_subscription,
      merchantAddress: get(request, "currentMerchant.address", ""),
      merchantCity: get(request, "currentMerchant.city", ""),
      merchantId: get(request, "currentMerchant.public_id", ""),
      merchantName: get(request, "currentMerchant.merchant_name", ""),
      merchantProvince: get(request, "currentMerchant.province", ""),
      merchantZipCode: get(request, "currentMerchant.zipCode", ""),
      processorBankName: get(request, "processor.acquirer_bank", ""),
      processorId: get(request, "processor.public_id", ""),
      processorMerchantId: get(
        request,
        DatafastService.sProcessorMerchantIDPath,
        ""
      ),
      processorType: get(request, "processor.processor_type", ""),
      subMccCode: get(request, "processor.sub_mcc_code"),
      subscriptionID: request.event.subscriptionId,
      subscriptionMinChargeTrxRef: request.subscriptionMinChargeTrxRef,
      subscriptionTrigger: get(
        request,
        DatafastService.sSubscriptionTriggerPath
      ),
      terminalId: get(request, DatafastService.sTerminalIdPath, ""),
      tokenType: request.tokenType,
      transactionReference: get(
        request,
        "currentToken.transactionReference",
        ""
      ),
      vaultToken: get(request, "currentToken.vaultToken", ""),
    };

    UtilsService.add3DSFields(
      request,
      response,
      get(request, "currentToken.3ds.detail.specificationVersion")
    );

    return response;
  }

  private _getIsDeferred(input: ChargeInput): boolean {
    const deferred_months: number = get(input.event, "deferred.months");
    const has_months: boolean = get(input.event, "months", deferred_months) > 1;

    return get(input, "currentToken.isDeferred", false) || has_months;
  }

  private _handleError(error: KushkiError | Error): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => error instanceof KushkiError,
          this._validateError(<KushkiError>error),
          throwError(new KushkiError(ERRORS.E002))
        )
      ),
      tag("DatafastService | _handleError")
    );
  }

  private _validateError(error: KushkiError): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const error_code: string = get(error, "code", "");

        if (isEqual(error_code, "K006"))
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.DATAFAST)
          );

        return throwError(error);
      }),
      tag("DatafastService | _validateError")
    );
  }
}
