import { IDENTIFIERS as CORE, ILambdaGateway, KushkiError } from "@kushki/core";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEqual, isUndefined } from "lodash";
import { ICredimaticService } from "repository/IProviderService";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mergeMap, switchMap, timeoutWith } from "rxjs/operators";
import { ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { AuthorizerContext } from "types/authorizer_context";
import { CredimaticChargeRequest } from "types/credimatic_charge_request";
import { Cybersource } from "types/dynamo_token_fetch";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";

@injectable()
export class CredimaticService implements ICredimaticService {
  public variant: CardProviderEnum.CREDIMATIC = CardProviderEnum.CREDIMATIC;
  private static readonly sDeferredMonthsPath: string = "event.deferred.months";
  private static readonly sTerminalIdPath: string = "processor.terminal_id";
  private static readonly sProcessorMerchantIDPath: string =
    "processor.processor_merchant_id";
  private readonly _subscriptionTriggerPath: string =
    "event.subscriptionTrigger";
  private readonly _lambda: ILambdaGateway;

  constructor(@inject(CORE.LambdaGateway) lambda: ILambdaGateway) {
    this._lambda = lambda;
  }

  public tokens(_: AurusTokenLambdaRequest): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() => UtilsService.tokenGenerator("CredimaticService")),
      tag("CredimaticService | tokens")
    );
  }

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => {
        const three_ds: Cybersource | undefined = get(
          request,
          "currentToken.3ds"
        );
        const version: string = `${get(
          request,
          "currentToken.3ds.detail.specificationVersion",
          0
        )}`;

        return iif(
          () => !isUndefined(three_ds) && version.startsWith("1"),
          throwError(new KushkiError(ERRORS.E322)),
          of(this._buildChargeRequest(request))
        );
      }),
      mergeMap((credimaticRequest: CredimaticChargeRequest) =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-credimatic-${process.env.USRV_STAGE}-charge`,
          credimaticRequest
        )
      ),
      timeoutWith(
        Number(`${process.env.CREDIMATIC_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      catchError((error: KushkiError | Error) => this._handleError(error)),
      tag("CredimaticService | charge")
    );
  }

  public capture(_request: undefined): Observable<AurusResponse> {
    return UtilsService.triggerNotSupportMethodError("CredimaticService");
  }
  public validateAccount(
    _: AuthorizerContext,
    request: SandboxAccountValidationRequest
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-credimatic-${process.env.USRV_STAGE}-cardValidation`,
          request
        )
      ),
      catchError((error: KushkiError | Error) => this._handleError(error)),
      tag("CredimaticService | validateAccount")
    );
  }
  public reAuthorization(_request: undefined): Observable<AurusResponse> {
    // TODO eliminar cuando se haga la implementacion
    return UtilsService.triggerNotSupportMethodError("CredimaticService");
  }

  public preAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("CredimaticService");
  }

  private _buildChargeRequest(request: ChargeInput): CredimaticChargeRequest {
    const response: CredimaticChargeRequest = {
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
              get(request, CredimaticService.sDeferredMonthsPath),
              get(request, "event.months")
            ),
          }
        : undefined,
      externalSubscriptionID: get(request, "event.externalSubscriptionID"),
      isDeferred: this._getIsDeferred(request),
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
        CredimaticService.sProcessorMerchantIDPath,
        ""
      ),
      processorType: get(request, "processor.processor_type", ""),
      subMccCode: get(request, "processor.sub_mcc_code"),
      subscriptionMinChargeTrxRef: request.subscriptionMinChargeTrxRef,
      subscriptionTrigger: get(request, this._subscriptionTriggerPath),
      terminalId: get(request, CredimaticService.sTerminalIdPath, ""),
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
      tag("CredimaticService | _handleError")
    );
  }

  private _validateError(error: KushkiError): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const error_code: string = get(error, "code", "");

        if (isEqual(error_code, "K006"))
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.CREDIMATIC)
          );

        return throwError(error);
      }),
      tag("CredimaticService | _validateError")
    );
  }
}
