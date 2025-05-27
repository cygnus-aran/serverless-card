// jscpd:ignore-start
import {
  IDENTIFIERS as CORE_ID,
  ILambdaGateway,
  ILogger,
  KushkiError,
} from "@kushki/core";
import { FS_ERRORS } from "@kushki/core/lib/infrastructure/FisErrorEnum";
import { GENERIC_AURUS_ERRORS } from "@kushki/core/lib/infrastructure/GenericAurusErrorEnum";
import { MAX_LENGTH_SUB_ID, SUB_COUNTRY_CODE_BRAZIL } from "constant/Fis";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";
import { ErrorCode, ERRORS } from "infrastructure/ErrorEnum";
import { HierarchyEnum } from "infrastructure/HierarchyEnum";
import { JurisdictionEnum } from "infrastructure/JurisdictionEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { ProcessorSsmKeyEnum } from "infrastructure/ProcessorSsmKeyEnum";
import { SchemaEnum } from "infrastructure/SchemaEnum";
import { TokenTypeEnum } from "infrastructure/TokenTypeEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, set } from "lodash";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IFisService } from "repository/IProviderService";
import { iif, Observable, of, throwError, timeout } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mergeMap, timeoutWith } from "rxjs/operators";
import { CaptureInput, CardService, ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { Deferred } from "types/deferred";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { FisCaptureRequest } from "types/fis_capture_request";
import { FisChargeRequest, SubMerchantData } from "types/fis_charge_request";
import { FisFullCaptureRequest } from "types/fis_full_capture_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { CardTypes } from "constant/CardTypes";

@injectable()
export class FisService implements IFisService {
  public variant: CardProviderEnum.FIS = CardProviderEnum.FIS;
  private static readonly sDeferredMonthsPath: string = "event.deferred.months";
  private readonly _lambda: ILambdaGateway;
  private readonly _storage: IDynamoGateway;
  private readonly _logger: ILogger;

  constructor(
    @inject(CORE_ID.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(CORE_ID.Logger) logger: ILogger
  ) {
    this._storage = storage;
    this._lambda = lambda;
    this._logger = logger;
  }

  public tokens(_: AurusTokenLambdaRequest): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() => UtilsService.tokenGenerator("FisService")),
      tag("FisService | tokens")
    );
  }

  // jscpd:ignore-end

  // jscpd:ignore-start
  public charge(request: ChargeInput): Observable<AurusResponse> {
    const fis_variables = UtilsService.getFisVariables();
    const lambda_charge: string = get(fis_variables, "lambdas.charges");
    const lambda_charge_subscription: string = get(
      fis_variables,
      "lambdas.chargeSubscription"
    );
    const lambda_preauth: string = get(fis_variables, "lambdas.preauth");

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
        iif(
          () => is_subscription_validation,
          this._chargeCommissionSubscription(request, lambda_preauth),
          iif(
            () => is_subscription,
            this._chargeCommissionSubscription(
              request,
              lambda_charge_subscription
            ),
            this._chargeCommissionSubscription(request, lambda_charge)
          )
        )
      ),
      mergeMap((chargeResponse: AurusResponse) =>
        this._validateFisError(chargeResponse)
      ),
      timeoutWith(
        UtilsService.getStaticProcesorTimeoutValue(ProcessorSsmKeyEnum.FIS),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalServerErrorResponse(
              this._buildRequestFis(request, undefined),
              ProcessorEnum.FIS
            )
          )
        )
      ),
      catchError((chargeError: KushkiError | Error) => {
        if (chargeError instanceof KushkiError)
          return this._handleFisErrorRequest(
            chargeError,
            this._buildRequestFis(request, undefined),
            TransactionTypeEnum.CHARGE
          );

        return throwError(() => new KushkiError(ERRORS[ErrorCode.K006]));
      }),
      tag("FisService | charge")
    );
  }

  public preAuthorization(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        UtilsService.validateRequestHierarchyMerchant(
          this._storage,
          this._logger,
          request.currentMerchant.public_id,
          HierarchyEnum.CN016
        )
      ),
      mergeMap((merchantId: string) =>
        UtilsService.getCustomerInfo(this._storage, this._logger, merchantId)
      ),
      mergeMap((merchant: DynamoMerchantFetch | undefined) => {
        const lambda: string = get(
          UtilsService.getFisVariables(),
          "lambdas.preauth"
        );

        return this._lambda.invokeFunction<AurusResponse>(lambda, {
          ...this._buildRequestFis(request, merchant),
        });
      }),
      mergeMap((preAuthResponse: AurusResponse) =>
        this._validateFisError(preAuthResponse)
      ),
      timeoutWith(
        UtilsService.getStaticProcesorTimeoutValue(ProcessorSsmKeyEnum.FIS),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalServerErrorResponse(
              this._buildRequestFis(request, undefined),
              ProcessorEnum.FIS
            )
          )
        )
      ),
      catchError((preAuthError: KushkiError | Error) => {
        if (preAuthError instanceof KushkiError)
          return this._handleFisErrorRequest(
            preAuthError,
            this._buildRequestFis(request, undefined),
            TransactionTypeEnum.PREAUTH
          );

        return throwError(() => new KushkiError(ERRORS[ErrorCode.K006]));
      }),
      tag("FisService | preAuthorization")
    );
  }

  public capture(captureRequest: CaptureInput): Observable<AurusResponse> {
    const lambda: string = get(
      UtilsService.getFisVariables(),
      "lambdas.capture"
    );

    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(lambda, {
          ...FisService._buildCaptureRequest(captureRequest),
        })
      ),
      mergeMap((captureResponse: AurusResponse) =>
        this._validateFisError(captureResponse)
      ),
      timeoutWith(
        UtilsService.getStaticProcesorTimeoutValue(ProcessorSsmKeyEnum.FIS),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalServerErrorResponse(
              FisService._buildFisCaptureFullRequest(captureRequest),
              ProcessorEnum.FIS
            )
          )
        )
      ),
      catchError((captureError: KushkiError | Error) => {
        if (captureError instanceof KushkiError)
          return this._handleFisErrorRequest(
            captureError,
            FisService._buildFisCaptureFullRequest(captureRequest),
            TransactionTypeEnum.CAPTURE
          );

        return throwError(() => new KushkiError(ERRORS[ErrorCode.K006]));
      }),
      tag("FisService | capture")
    );
  }

  public reAuthorization(_payload: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("FisService");
  }

  public validateAccount(_payload: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("FisService");
  }

  private _chargeCommissionSubscription(
    request: ChargeInput,
    lambda: string
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        UtilsService.validateRequestHierarchyMerchant(
          this._storage,
          this._logger,
          request.currentMerchant.public_id,
          HierarchyEnum.CN016
        )
      ),
      mergeMap((merchantId: string) =>
        UtilsService.getCustomerInfo(this._storage, this._logger, merchantId)
      ),
      mergeMap((merchant: DynamoMerchantFetch | undefined) =>
        this._lambda.invokeFunction<AurusResponse>(lambda, {
          ...this._buildRequestFis(request, merchant),
        })
      )
    );
  }

  private _validateFisError(
    aurusResponse: AurusResponse
  ): Observable<AurusResponse> {
    const success_fis_response = "000";

    return of(1).pipe(
      mergeMap(() => {
        if (aurusResponse.response_code !== success_fis_response)
          return throwError(
            new KushkiError(ERRORS["006"], ERRORS["006"].message, {
              ...aurusResponse,
              message: FisService.mapFisError(
                `FS${aurusResponse.response_code}`
              ),
              processorCode: aurusResponse.response_code,
              processorName: ProcessorEnum.FIS,
            })
          );
        return of(aurusResponse);
      }),
      tag("FisService | _validateFisError")
    );
  }

  private _buildRequestFis(
    input: ChargeInput,
    customerData: DynamoMerchantFetch | undefined
  ): FisChargeRequest {
    const brand: string = get(input, "currentToken.binInfo.brand")!;
    const is_subscription_validation: boolean = get(
      input,
      "event.metadata.ksh_subscriptionValidation",
      false
    );
    const is_subscription: boolean =
      Boolean(input.event.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !is_subscription_validation;
    const charge = get(UtilsService.getFisVariables(), "chargerequest");
    const fallback_deferred: Deferred = {
      creditType: "",
      graceMonths: "",
      months: 0,
    };
    const deferred: Deferred | undefined = get(
      input,
      "event.deferred",
      fallback_deferred
    );

    const is_business_partner = get(
      input,
      "processor.is_business_partner",
      false
    );
    const jurisdiction = get(input, "processor.jurisdiction", "");
    const request: FisChargeRequest = {
      acquirerId: get(input, "processor.unique_code", ""),
      card: {
        brand,
        deferred,
        amount: input.amount,
        bin: input.currentToken.bin,
        holderName: get(input, "currentToken.cardHolderName", ""),
        lastFourDigits: input.currentToken.lastFourDigits,
        maskedCardNumber: input.currentToken.maskedCardNumber,
        type: defaultTo(
          get(input, "currentToken.binInfo.info.type", CardTypeEnum.CREDIT),
          CardTypeEnum.CREDIT
        ).toUpperCase() as CardTypes,
      },
      contactDetails: get(input, "event.contactDetails", {}),
      is3DS: !isEmpty(
        defaultTo(
          get(input, "currentToken.3ds.detail.eci"),
          get(input, "currentToken.3ds.detail.eciRaw")
        )
      ),
      isCardValidation: is_subscription_validation,
      isDeferred:
        get(input, "currentToken.isDeferred", false) ||
        get(input.event, "months", get(input, FisService.sDeferredMonthsPath)) >
          1,
      merchantId: input.currentMerchant.public_id,
      merchantName: input.currentMerchant.merchant_name,
      processorBankName: get(input, "processor.acquirer_bank", ""),
      processorId: input.processor.public_id,
      processorInfo: {
        jurisdiction,
        categoryModel: get(input, "processor.category_model", ""),
        dynamicMcc: get(input, "processor.sub_mcc_code", ""),
        isBusinessPartner: is_business_partner,
        merchantCode: get(input, "processor.processor_merchant_id", ""),
        password: get(input, "processor.password", ""),
        username: get(input, "processor.username", ""),
      },
      session: {
        shopperIPAddress: get(input, "ruleInfo.ip", ""),
      },
      shopper: {
        browser: {
          acceptHeader: get(charge, "shoper.chargeBrowser.acceptHeader", ""),
          userAgentHeader: get(input, "ruleInfo.user_agent", ""),
        },
        shopperEmailAddress: get(charge, "shoper.shopperEmailAddress", ""),
      },
      subMerchantData: this._buildSubMerchantData(input, customerData, charge),
      terminalId: get(input, "processor.terminal_id", ""),
      tokenType: input.tokenType,
      transactionReference: input.currentToken.transactionReference,
      vaultToken: get(input, "currentToken.vaultToken", ""),
    };

    if (jurisdiction === JurisdictionEnum.PAYFAC && request.subMerchantData)
      request.subMerchantData = UtilsService.getSubMerchantData(
        brand,
        get(input, "trxRuleResponse.body.softDescriptor")!,
        is_business_partner,
        request.subMerchantData
      );

    if (is_subscription) {
      set(
        request,
        "card.months",
        get(input, FisService.sDeferredMonthsPath, 1)
      );
      set(request, "isDeferred", false);
      set(request, "subscription", input.event.periodicity);
      set(request, "isSubscription", is_subscription);
      set(request, "subscriptionId", input.event.subscriptionId);
      set(request, "processorToken", input.event.processorToken);
    }

    UtilsService.add3DSFields(
      input,
      request,
      get(input, "currentToken.3ds.detail.specificationVersion")
    );

    return request;
  }

  private _buildSubMerchantData(
    input: ChargeInput,
    customerData: DynamoMerchantFetch | undefined,
    charge: object
  ) {
    const sub_id = this._getSubId(get(input, "currentMerchant.public_id", ""));

    const sub_merchant_data: SubMerchantData = {
      pfId: get(charge, "subMerchantData.pfId", ""),
      subCity: get(input, "currentMerchant.city", ""),
      subCountryCode: SUB_COUNTRY_CODE_BRAZIL,
      subId: sub_id,
      subName: get(input, "processor.soft_descriptor", ""),
      subPostalCode: get(input, "currentMerchant.zipCode", ""),
      subState: get(input, "currentMerchant.province", ""),
      subStreet: get(input, "currentMerchant.address", ""),
      subTaxId: get(input, "currentMerchant.taxId", ""),
    };

    if (customerData) {
      set(sub_merchant_data, "subCity", get(customerData, "city"));
      set(sub_merchant_data, "subStreet", get(customerData, "address"));
      set(sub_merchant_data, "subState", get(customerData, "province"));
      set(sub_merchant_data, "subPostalCode", get(customerData, "zipCode"));
      set(sub_merchant_data, "subTaxId", get(customerData, "taxId"));
    }

    return sub_merchant_data;
  }

  private static _buildCaptureRequest(
    captureInput: CaptureInput
  ): FisCaptureRequest {
    return {
      amount: get(captureInput, SchemaEnum.amount_field, {
        subtotalIva: 0,
        subtotalIva0: 0,
        iva: 0,
      }),
      ticketNumber: get(captureInput, SchemaEnum.ticket_number_field, ""),
      transactionReference: get(
        captureInput,
        SchemaEnum.transaction_reference_field,
        ""
      ),
    };
  }

  private _handleFisErrorRequest(
    kushkiError: KushkiError,
    input: FisChargeRequest | FisFullCaptureRequest,
    transactionType: TransactionTypeEnum
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const code = get(kushkiError, "code", "");

        set(input, "transactionType", transactionType);

        if (code.includes("027"))
          return this._manageTimeOutError(kushkiError, input);

        return throwError(
          MapperService.buildFisError(kushkiError, ProcessorEnum.FIS)
        );
      }),
      tag("FisService | _handleFisErrorRequest")
    );
  }

  private _manageTimeOutError(
    error: KushkiError,
    req: FisChargeRequest | FisFullCaptureRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.put(
          req,
          UtilsService.getTimeoutProcessorTransactionsTable(
            ProcessorSsmKeyEnum.FIS
          )
        )
      ),
      mergeMap(() =>
        throwError(MapperService.buildAurusError(error, ProcessorEnum.FIS))
      ),
      tag("FisService | _manageTimeOutError")
    );
  }

  private static _buildFisCaptureFullRequest(
    captureInput: CaptureInput
  ): FisFullCaptureRequest {
    return {
      card: {
        currency: get(captureInput, "body.amount.currency", ""),
        processorId: get(captureInput, "processor.public_id", ""),
        referenceNumber: get(
          captureInput,
          SchemaEnum.transaction_reference_field,
          ""
        ),
        totalAmount: CardService.sFullAmount(<Amount>captureInput.body.amount),
      },
      extraInfo: {
        binCard: get(captureInput, "transaction.bin_card", ""),
        brand: get(captureInput, "transaction.payment_brand", ""),
        cardHolderName: get(captureInput, "transaction.card_holder_name", ""),
        cardType: defaultTo(
          captureInput.transaction.card_type,
          "credit"
        ).toUpperCase(),
        lastFourDigitsOfCard: get(
          captureInput,
          "transaction.last_four_digits",
          ""
        ),
        merchantName: get(captureInput, "transaction.merchant_name", ""),
        processorBankName: get(
          captureInput,
          "transaction.processor_bank_name",
          ""
        ),
      },
      privateMerchantId: get(captureInput, "processor.private_id", ""),
      tokenType: TokenTypeEnum.TRANSACTION,
      transactionReference: get(
        captureInput,
        SchemaEnum.transaction_reference_field,
        ""
      ),
      transactionStatus: TransactionStatusEnum.PENDING,
      vaultToken: "",
    };
  }

  // jscpd:ignore-end
  public static mapFisError(responseCode: string): string {
    return get(
      GENERIC_AURUS_ERRORS[get(FS_ERRORS[responseCode], "genericErrorCode")],
      "message",
      ""
    );
  }

  private _getSubId(subId: string): string {
    return subId.substring(
      subId.length > MAX_LENGTH_SUB_ID ? subId.length - MAX_LENGTH_SUB_ID : 0,
      subId.length
    );
  }
}
