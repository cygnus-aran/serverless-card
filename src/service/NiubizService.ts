import { IDENTIFIERS as CORE, ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { get } from "lodash";
import { ICardGateway } from "repository/ICardGateway";
import { INiubizService } from "repository/IProviderService";
import { Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mergeMap } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { ChargeNiubizRequest } from "types/charge_niubiz_request";
import { PreAuthNiubizRequest } from "types/pre_auth_niubiz_request";
import { TokensCardResponse } from "types/tokens_card_response";

const PROCESSOR_MERCHANT_ID_PATH: string = "processor.processor_merchant_id";

// jscpd:ignore-start
@injectable()
export class NiubizService implements INiubizService {
  public variant: CardProviderEnum.NIUBIZ = CardProviderEnum.NIUBIZ;
  private readonly _lambda: ILambdaGateway;
  private readonly _aurus: ICardGateway;

  constructor(
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.CardGateway) aurus: ICardGateway
  ) {
    this._lambda = lambda;
    this._aurus = aurus;
  }
  // jscpd:ignore-end

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-niubiz-${process.env.USRV_STAGE}-charge`,
          {
            ...(<ChargeNiubizRequest>this._buildRequestNiubiz(request)),
          }
        )
      ),
      catchError((error: KushkiError | Error) =>
        this._handleErrorRequest(error)
      )
    );
  }

  public tokens(
    request: AurusTokenLambdaRequest
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      // TODO: invoke aurus token for business (action:route) rules
      mergeMap(() => this._aurus.getAurusToken(request)),
      tag("AurusService | tokens")
    );
  }

  public preAuthorization(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-niubiz-${process.env.USRV_STAGE}-preAuthorization`,
          {
            ...(<PreAuthNiubizRequest>this._buildRequestNiubiz(request)),
          }
        )
      ),
      catchError((err: KushkiError | Error) => this._handleErrorRequest(err))
    );
  }

  public reAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("AurusService");
  }

  public capture(req: CaptureInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() => of(req)),
      mergeMap((request: CaptureInput) =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-niubiz-${process.env.USRV_STAGE}-capture`,
          {
            amount: get(request, "body.amount")
              ? get(request, "body.amount")
              : {
                  currency: request.transaction.currency_code,
                  extraTaxes: get(request, "body.amount.extraTaxes"),
                  ice:
                    request.transaction.ice_value !== undefined
                      ? request.transaction.ice_value.toFixed(2).toString()
                      : "0.00",
                  iva: request.transaction.iva_value.toString(),
                  subtotalIva: request.transaction.subtotal_iva.toString(),
                  subtotalIva0: request.transaction.subtotal_iva0
                    .toFixed(2)
                    .toString(),
                },
            preauthTransactionReference: get(
              request,
              "transaction.transaction_reference",
              ""
            ),
            transactionReference: request.trxReference,
          }
        )
      ),
      catchError((error: KushkiError) => this._handleErrorRequest(error)),
      tag("NiubizService | capture")
    );
  }

  public validateAccount(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("NiubizService");
  }

  private _buildRequestNiubiz(
    input: ChargeInput
  ): ChargeNiubizRequest | PreAuthNiubizRequest {
    const is_card_trx: boolean = input.event.usrvOrigin.includes(
      UsrvOriginEnum.CARD
    );
    const is_subscription_validation: boolean = get(
      input,
      "event.metadata.ksh_subscriptionValidation",
      false
    );
    // istanbul ignore next
    const is_subscription: boolean =
      Boolean(input.event.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !is_subscription_validation;
    const request: ChargeNiubizRequest = {
      acquirerBank: get(input, "processor.acquirer_bank", ""),
      amount: input.amount,
      card: {
        bin: input.currentToken.bin,
        brand: get(input, "currentToken.binInfo.brand", ""),
        holderName: get(input, "currentToken.cardHolderName", ""),
        lastFourDigits: input.currentToken.lastFourDigits,
        maskedCardNumber: input.currentToken.maskedCardNumber,
        months: is_card_trx ? get(input.event, "deferred.months") : 0,
      },
      isCardValidation: is_subscription_validation,
      isDeferred: is_card_trx
        ? get(input, "currentToken.isDeferred", false)
        : false,
      mcci: get(input, "processor.merchant_category_code", ""),
      merchantId: input.currentMerchant.public_id,
      merchantName: input.currentMerchant.merchant_name,
      password: get(input, "processor.password", ""),
      processorCode: get(input, "processor.processor_code", ""),
      processorId: input.processor.public_id,
      processorMerchantId: get(input, PROCESSOR_MERCHANT_ID_PATH, ""),
      processorType: get(input, "processor.processor_type", ""),
      subscription: is_subscription,
      subscriptionTrigger: input.event.subscriptionTrigger,
      tokenType: input.tokenType,
      transactionReference: input.currentToken.transactionReference,
      username: get(input, "processor.username", ""),
      vaultToken: get(input, "currentToken.vaultToken", ""),
    };

    if (input.cvv) request.cvv = input.cvv;

    UtilsService.add3DSFields(
      input,
      request,
      get(input, "currentToken.3ds.detail.specificationVersion")
    );

    return request;
  }

  private _handleErrorRequest(error: KushkiError | Error): Observable<never> {
    if (error instanceof KushkiError)
      return of(1).pipe(
        mergeMap(() => {
          const code: string = get(error, "code", "");

          if (code.includes("500") || code.includes("600"))
            return throwError(
              MapperService.buildAurusError(error, ProcessorEnum.NIUBIZ)
            );

          if (code.includes("012"))
            return throwError(
              MapperService.buildUnreachableAurusError(ProcessorEnum.NIUBIZ)
            );

          return throwError(() => error);
        }),
        tag("NiubizService | _handleErrorRequest")
      );

    return throwError(() => error);
  }
}
