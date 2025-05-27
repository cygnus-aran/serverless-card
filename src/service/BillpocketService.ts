// jscpd:ignore-start
import { ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE_ID } from "@kushki/core/lib/constant/Identifiers";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TokenTypeEnum } from "infrastructure/TokenTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, set } from "lodash";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IBillpocketService } from "repository/IProviderService";
import { Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mergeMap, timeoutWith } from "rxjs/operators";
import { ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import {
  AmexInfo,
  BillpocketChargeRequest,
} from "types/billpocket_charge_request";
import { BillpocketVars } from "types/billpocket_vars";
import { TokensCardResponse } from "types/tokens_card_response";
import { CardTypes } from "constant/CardTypes";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";
// jscpd:ignore-end

@injectable()
export class BillpocketService implements IBillpocketService {
  public variant: CardProviderEnum.BILLPOCKET = CardProviderEnum.BILLPOCKET;
  private readonly _storage: IDynamoGateway;
  private readonly _lambda: ILambdaGateway;
  private readonly _aurus: ICardGateway;

  constructor(
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(CORE_ID.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.CardGateway) aurus: ICardGateway
  ) {
    this._lambda = lambda;
    this._storage = storage;
    this._aurus = aurus;
  }

  public capture(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("BillpocketService");
  }

  public charge(request: ChargeInput): Observable<AurusResponse> {
    const billpocket_vars: BillpocketVars = JSON.parse(
      `${process.env.BILLPOCKET_VARS}`
    );
    const is_subscription_validation: boolean = get(
      request,
      "event.metadata.ksh_subscriptionValidation",
      false
    );
    const is_subscription: boolean =
      Boolean(request.event.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !isEmpty(request.currentToken.vaultToken) &&
      !is_subscription_validation;

    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          is_subscription
            ? billpocket_vars.LAMBDA_SUBS_CHARGE
            : billpocket_vars.LAMBDA_CHARGE,
          {
            ...BillpocketService._builRequestBillpocket(
              request,
              billpocket_vars,
              is_subscription
            ),
          }
        )
      ),
      timeoutWith(
        billpocket_vars.TIMEOUT,
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalServerErrorResponse(
              BillpocketService._builRequestBillpocket(
                request,
                billpocket_vars,
                is_subscription
              ),
              ProcessorEnum.BILLPOCKET
            )
          )
        )
      ),
      catchError((error: KushkiError | Error) => {
        if (error instanceof KushkiError)
          return this._handleErrorRequest(
            error,
            BillpocketService._builRequestBillpocket(
              request,
              billpocket_vars,
              is_subscription
            ),
            billpocket_vars.TABLE_TIMEOUTS
          );

        return throwError(() => error);
      }),
      tag("BillpocketService | charge")
    );
  }

  public preAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("BillpocketService");
  }

  public reAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("BillpocketService");
  }

  public tokens(
    request: AurusTokenLambdaRequest
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      // TODO: invoke aurus token for business (action:route) rules
      mergeMap(() => this._aurus.getAurusToken(request)),
      catchError(() => UtilsService.tokenGenerator("BillpocketService")),
      tag("BillpocketService | tokens")
    );
  }

  public validateAccount(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("BillpocketService");
  }

  private static _builRequestBillpocket(
    chargeInput: ChargeInput,
    billpocketVars: BillpocketVars,
    isSubscription: boolean
  ): BillpocketChargeRequest {
    const brand: string = UtilsService.checkBrand(
      get(chargeInput, "currentToken.binInfo.brand", "")
        .replace(/ /g, "")
        .toLowerCase(),
      CardBrandEnum.AMEX
    );
    const request: BillpocketChargeRequest = {
      apiKey: get(chargeInput, "trxRuleResponse.body.key", ""),
      card: {
        brand,
        amount: chargeInput.amount,
        bin: chargeInput.currentToken.bin,
        holderName: get(chargeInput, "currentToken.cardHolderName", ""),
        lastFourDigits: chargeInput.currentToken.lastFourDigits,
        months: get(
          chargeInput.event,
          "months",
          get(chargeInput.event, "deferred.months")
        ),
        type: get(
          chargeInput,
          "currentToken.binInfo.info.type",
          CardTypeEnum.CREDIT
        ).toUpperCase() as CardTypes,
      },
      isAmex: brand === CardBrandEnum.AMEX,
      isDeferred:
        get(chargeInput, "currentToken.isDeferred", false) ||
        get(
          chargeInput.event,
          "months",
          get(chargeInput.event, "deferred.months")
        ) > 1,
      maskedCardNumber: get(chargeInput, "currentToken.maskedCardNumber", ""),
      merchantId: chargeInput.currentMerchant.public_id,
      merchantName: chargeInput.currentMerchant.merchant_name,
      processorBankName: get(chargeInput, "processor.acquirer_bank", ""),
      processorId: chargeInput.processor.public_id,
      tokenType: <TokenTypeEnum>chargeInput.tokenType,
      transactionReference: chargeInput.currentToken.transactionReference,
      vaultToken: get(chargeInput, "currentToken.vaultToken", ""),
    };

    if (isSubscription)
      set(request, "processorToken", get(chargeInput, "event.processorToken"));

    if (brand === CardBrandEnum.AMEX) {
      const amex_info: AmexInfo = {
        amexCallTypId: billpocketVars.AMEX_DEFAULT_INFO.amexCallTypId,
        amexCustAddress: BillpocketService._validateEmptyFields(
          get(chargeInput.event, "orderDetails.billingDetails.address", ""),
          billpocketVars.AMEX_DEFAULT_INFO.amexCustAddress
        ).slice(0, 20),
        amexCustBrowserTypDescTxt:
          billpocketVars.AMEX_DEFAULT_INFO.amexCustBrowserTypDescTxt,
        amexCustEmailAddr: BillpocketService._validateEmptyFields(
          get(chargeInput.event, "contactDetails.email", ""),
          billpocketVars.AMEX_DEFAULT_INFO.amexCustEmailAddr
        ),
        amexCustFirstName: BillpocketService._validateEmptyFields(
          get(chargeInput.event, "contactDetails.firstName", ""),
          billpocketVars.AMEX_DEFAULT_INFO.amexCustFirstName
        ),
        amexCustHostServerNm:
          billpocketVars.AMEX_DEFAULT_INFO.amexCustHostServerNm,
        amexCustIdPhoneNbr: BillpocketService._validateEmptyFields(
          get(chargeInput.event, "contactDetails.phoneNumber", ""),
          billpocketVars.AMEX_DEFAULT_INFO.amexCustIdPhoneNbr
        ),
        amexCustIPAddr: billpocketVars.AMEX_DEFAULT_INFO.amexCustIPAddr,
        amexCustLastName: BillpocketService._validateEmptyFields(
          get(chargeInput.event, "contactDetails.lastName", ""),
          billpocketVars.AMEX_DEFAULT_INFO.amexCustLastName
        ),
        amexCustPostalCode: BillpocketService._validateEmptyFields(
          get(chargeInput.event, "orderDetails.billingDetails.zipCode", ""),
          billpocketVars.AMEX_DEFAULT_INFO.amexCustPostalCode
        ),
        amexMerSKUNbr: billpocketVars.AMEX_DEFAULT_INFO.amexMerSKUNbr,
        amexShipMthdCd: billpocketVars.AMEX_DEFAULT_INFO.amexShipMthdCd,
        amexShipToCtryCd: billpocketVars.AMEX_DEFAULT_INFO.amexShipToCtryCd,
      };

      set(request, "amexInfo", amex_info);

      if (isSubscription) set(request, "metadataId", chargeInput.metadataId);
    }

    UtilsService.add3DSFields(
      chargeInput,
      request,
      `${get(chargeInput, "currentToken.3ds.detail.specificationVersion", "")}`
    );

    return request;
  }

  private static _validateEmptyFields(
    field: string,
    fieldDefault: string
  ): string {
    return !isEmpty(field) ? field : fieldDefault;
  }

  private _handleErrorRequest(
    error: KushkiError,
    req: BillpocketChargeRequest,
    tableTimeoutName: string
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const error_code: string = get(error, "code", "");

        if (error_code.includes("500") || error_code.includes("600"))
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.BILLPOCKET)
          );
        if (get(error, "code", "").includes("027"))
          return this._manageTimeOutError(error, req, tableTimeoutName);

        return throwError(() => error);
      }),
      tag("BillpocketService | _handleErrorRequest")
    );
  }

  private _manageTimeOutError(
    error: KushkiError,
    req: BillpocketChargeRequest,
    tableTimeoutName: string
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => this._storage.put(req, tableTimeoutName)),
      mergeMap(() =>
        throwError(
          MapperService.buildAurusError(error, ProcessorEnum.BILLPOCKET)
        )
      ),
      tag("RedebanService | _manageTimeOutError")
    );
  }
}
