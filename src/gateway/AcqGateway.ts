import { Tracer } from "@aws-lambda-powertools/tracer";
import { IDENTIFIERS as CORE, ILambdaGateway, KushkiError } from "@kushki/core";
import { BusinessProductID } from "constant/BusinessProductID";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import {
  AcqCodeResponseEnum,
  AcqStatusResponseEnum,
} from "infrastructure/AcqEnum";
import { BinInfoDefaultValues } from "infrastructure/BinInfoDefaultEnum";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CountryEnum, CountryIsoEnum } from "infrastructure/CountryEnum";
import { ERRORS_ACQ } from "infrastructure/ErrorAcqEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { SchemaEnum } from "infrastructure/SchemaEnum";
import { SubscriptionTriggerEnum } from "infrastructure/SubscriptionEnum";
import { TransactionTypeAcqEnum } from "infrastructure/TransactionTypeAcqEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, isEqual, set, unset } from "lodash";
import { IAcqGateway } from "repository/IAcqGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, map, mergeMap } from "rxjs/operators";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { AcqCaptureRequest } from "types/acq_capture_request";
import { AcqChargeOptions } from "types/acq_charge_options";
import { AcqChargeRequest } from "types/acq_charge_request";
import { AcqInvokeFullResponse } from "types/acq_invoke_full_response";
import { AcqInvokeRequest } from "types/acq_invoke_request";
import { AcqInvokeResponse } from "types/acq_invoke_response";
import { AcqRequest } from "types/acq_request";
import { AcqResponse } from "types/acq_response";
import { AcqSubscriptionChargeRequest } from "types/acq_subscription_charge_request";
import { AcqValidateAccountRequest } from "types/acq_validate_account_request";
import { FranchiseResponseTime } from "types/franchise_response_time";
import { PreAuthRequest } from "types/preauth_request";
import { Transaction } from "types/transaction";

@injectable()
export class AcqGateway implements IAcqGateway {
  private readonly _lambda: ILambdaGateway;
  private readonly _storage: IDynamoGateway;
  private readonly _tracer: Tracer;
  private readonly _acctAuthValue: string = "3DS.ucafAuthenticationData";
  private readonly _specificationVersion: string = "3DS.specificationVersion";
  private readonly _directoryServerTrxID: string =
    "3DS.directoryServerTransactionID";
  private readonly _cardId: string = "cardId";
  private readonly _binInfoBank: string = "binInfo.bank";
  private readonly _binInfoBin: string = "binInfo.bin";
  private readonly _binInfoBrand: string = "binInfo.brand";
  private readonly _binInfoCountry: string = "binInfo.country";
  private readonly _merchantCountry: string =
    "authorizerContext.merchantCountry";
  private readonly _binBrandProductCode: string = "binInfo.brandProductCode";
  private readonly _binInfoType: string = "binInfo.type";
  private readonly _binInfoPrepaid: string = "binInfo.prepaid";
  private readonly _isBlockedCard: string = "isBlockedCard";
  private readonly _authorizationMode: string = "Authorization";
  private readonly _isOCTPath: string = "isOCT";
  private readonly _isAftPath: string = "isAft";
  private readonly _businessApplicationIDPath: string =
    "business_application_id";
  private readonly _subMerchant: string = "subMerchant";
  private readonly _companyId: string = "subMerchant.idCompany";
  private readonly _facilitatorId: string = "subMerchant.idFacilitator";
  private readonly _socialReason: string = "subMerchant.socialReason";
  private readonly _facilitatorName: string = "subMerchant._facilitatorName";

  constructor(
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(CORE.Tracer) tracer: Tracer
  ) {
    this._lambda = lambda;
    this._storage = storage;
    this._tracer = tracer;
  }

  public charge(request: AcqChargeRequest): Observable<AcqInvokeResponse> {
    return of(1).pipe(
      mergeMap(() => {
        const is_mexico: boolean =
          get(request, SchemaEnum.merchant_country) === CountryEnum.MEXICO;

        const trx_type: string =
          process.env.ENABLE_VALIDATE_CARD_SUBS === "true" &&
          !is_mexico &&
          UtilsService.calculateFullAmount(request.card.amount) === 0
            ? TransactionTypeAcqEnum.CARD_VALIDATION
            : TransactionTypeAcqEnum.COF_INITIAL;
        const is_subscription_on_demand_cvv: boolean =
          this._isSubscriptionOnDemandCvv(request);

        if (is_subscription_on_demand_cvv)
          return this._startCommonCharge(request, {
            isSubscriptionOnDemandCvv: is_subscription_on_demand_cvv,
            transactionType: TransactionTypeAcqEnum.CHARGE,
          });

        if (request.isCardValidation)
          return this._startCommonCharge(request, {
            transactionType: trx_type,
          });

        if (this._isCofSubsequent(request))
          return this._startCofSubsequent(request);

        return this._startCommonCharge(request, {
          transactionType: TransactionTypeAcqEnum.CHARGE,
        });
      }),
      tag("AcqGateway | charge")
    );
  }

  public validateAccount(
    request: AcqValidateAccountRequest
  ): Observable<AcqInvokeResponse> {
    return of(1).pipe(
      mergeMap(() => this._buildAccountValidationRequest(request)),
      mergeMap((data: AcqInvokeRequest) =>
        this._invokeProcessTransactionLambda(data)
      ),
      catchError((err: KushkiError | Error) => this._throwError(err)),
      map((response: AcqInvokeFullResponse) => response.body),
      mergeMap((response: AcqInvokeResponse) =>
        this._acqInvokeResponse(response)
      ),
      tag("AcqGateway | validateAccount")
    );
  }

  public capture(request: AcqCaptureRequest): Observable<AcqResponse> {
    return of(1).pipe(
      mergeMap(() => this._invokeDependentTransactions(request)),
      tag("AcqGateway - capture")
    );
  }

  public subscriptionCharge(
    request: AcqSubscriptionChargeRequest
  ): Observable<AcqInvokeResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._buildRequest(request, {
          transactionType: TransactionTypeAcqEnum.CHARGE,
        })
      ),
      mergeMap((data: AcqRequest) => this._invokeLambdaDirectIntegration(data)),
      mergeMap((response: AcqInvokeResponse) =>
        this._acqInvokeResponse(response)
      ),
      tag("AcwGateway | subscriptionCharge")
    );
  }

  public preAuthorization(data: PreAuthRequest): Observable<AcqResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._buildRequest(data, {
          transactionType: TransactionTypeAcqEnum.PREAUTHORIZATION,
        })
      ),
      mergeMap((req: AcqRequest) => this._invokeLambdaDirectIntegration(req)),
      mergeMap((response: AcqInvokeResponse) =>
        this._acqInvokeResponse(response)
      ),
      tag("AcqGateway | preAuthorization")
    );
  }

  public reAuthorization(
    data: PreAuthRequest,
    referenceNumber: string
  ): Observable<AcqResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._buildRequest(data, {
          referenceNumber,
          transactionType: TransactionTypeAcqEnum.REAUTHORIZATION.toLowerCase(),
        })
      ),
      mergeMap((req: AcqRequest) => this._handleReauthorization(req)),
      mergeMap((response: AcqInvokeResponse) =>
        this._acqInvokeResponse(response)
      ),
      tag("AcqGateway | reAuthorization")
    );
  }

  private _startCofSubsequent(
    request: AcqChargeRequest
  ): Observable<AcqInvokeResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.query<Transaction>(
          TABLES.transaction,
          IndexEnum.transactions_transaction_reference,
          "transaction_reference",
          get(
            request,
            "processorToken",
            get(request, "initialRecurrenceReference", "")
          )
        )
      ),
      mergeMap((trx: Transaction[]) =>
        iif(
          () =>
            !isEmpty(trx) && defaultTo(get(trx[0], "is_initial_cof"), false),
          this._invokeDependentTransactions(
            this._buildSubsequentCofRequest(request, trx[0])
          ),
          this._startCommonCharge(request, {
            transactionType: TransactionTypeAcqEnum.CHARGE.toLowerCase(),
          })
        )
      ),
      tag("AcqGateway | _startCofSubsequent")
    );
  }

  private _buildSubsequentCofRequest(
    request: AcqChargeRequest,
    originalTrx: Transaction
  ): AcqCaptureRequest {
    const amount =
      get(request, "card.amount") === undefined
        ? UtilsService.calculateFullAmount(originalTrx.amount).toString()
        : UtilsService.calculateFullAmount(request.card.amount).toString();
    const payload: AcqCaptureRequest = {
      amount,
      authorizerContext: request.authorizerContext,
      bin_info: { ...get(request, "binInfo", {}) },
      client_transaction_id: request.transactionReference,
      ...(request.citMit ? { cit_mit: request.citMit } : {}),
      // TODO: temp comment
      // ...(!isEmpty(request.cvv2) && { cvv2: request.cvv2 }),
      merchant_id: request.processorId,
      transaction_reference: get(originalTrx, "processor_transaction_id", ""),
      transaction_type: TransactionTypeAcqEnum.COF_SUBSEQUENT,
    };

    let subs_type: string | undefined = request.subscriptionTrigger;

    if (isEmpty(subs_type) && !isEmpty(request.initialRecurrenceReference))
      subs_type = SubscriptionTriggerEnum.ON_DEMAND;

    set(payload, "subscription_type", subs_type);

    if (
      !isEqual(
        request.subscriptionTrigger,
        SubscriptionTriggerEnum.SCHEDULED
      ) &&
      request.isDeferred
    ) {
      const deferred: object = {
        credit_type: get(request, "deferred.creditType"),
        grace_months: (get(request, "deferred.graceMonths") || "0").padStart(
          2,
          "0"
        ),
        months: (get(request, "deferred.months") || 0)
          .toString()
          .padStart(2, "0"),
      };

      set(payload, "deferred", deferred);
    }

    return payload;
  }

  private _startCommonCharge(
    request: AcqChargeRequest,
    options: AcqChargeOptions
  ): Observable<AcqInvokeResponse> {
    if (UtilsService.invalidBinInfo(request.binInfo))
      return throwError(new KushkiError(ERRORS_ACQ.E011));

    set(
      request,
      this._binInfoType,
      get(request, this._binInfoType) || "credit"
    );

    return of(1).pipe(
      mergeMap(() => this._buildRequest(request, options)),
      mergeMap((data: AcqRequest) =>
        this._invokeLambdaDirectIntegration(
          data,
          get(request, this._isAftPath),
          get(request, this._isOCTPath)
        )
      ),
      mergeMap((response: AcqInvokeResponse) =>
        this._acqInvokeResponse(response)
      ),
      tag("AcqGateway | _startCommonCharge")
    );
  }

  private _isSubscriptionOnDemandCvv(request: AcqChargeRequest): boolean {
    const has3ds: boolean = !isEmpty(request["3DS"]);
    const isOnDemandAndHasCvv: boolean = this._isOnDemandAndHasCvv(request);
    const isAcqCreated: boolean = this._isCofSubsequent(request);
    const isFromProsa: boolean = this._isTransactionFromProsa(request);

    // TODO: temp comment, if sub is On Demand with cvv and created in acq, it will return false

    return (
      (isOnDemandAndHasCvv && isFromProsa) ||
      (isOnDemandAndHasCvv && isAcqCreated && has3ds) ||
      isOnDemandAndHasCvv // && !isAcqCreated
    );
  }

  private _isCofSubsequent(request: AcqChargeRequest): boolean {
    return (
      (request.isSubscription && !isEmpty(request.processorToken)) ||
      !isEmpty(request.initialRecurrenceReference)
    );
  }

  private _isOnDemandAndHasCvv(request: AcqChargeRequest): boolean {
    return (
      request.subscriptionTrigger === SubscriptionTriggerEnum.ON_DEMAND &&
      !isEmpty(request.cvv2)
    );
  }

  private _invokeDependentTransactions(
    request: AcqCaptureRequest
  ): Observable<AcqInvokeResponse> {
    if (
      this._shouldDeclineZeroAmountTrx() &&
      parseFloat(defaultTo(request.amount, "0")) === 0
    ) {
      return throwError(() => new KushkiError(ERRORS_ACQ.E600));
    }
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AcqInvokeFullResponse>(
          `usrv-acq-ecommerce-${process.env.USRV_STAGE}-dependentTransactions`,
          {
            body: request,
          }
        )
      ),
      mergeMap((response) => this._putFranchiseAnnotations(response)),
      map((response: AcqInvokeFullResponse) => response.body),
      catchError((err: KushkiError | Error) => this._throwError(err)),
      mergeMap((response: AcqInvokeResponse) =>
        this._acqInvokeResponse(response)
      ),
      tag("AcqGateway | _invokeDependentTransactions")
    );
  }

  private _acqInvokeResponse(
    response: AcqInvokeResponse
  ): Observable<AcqInvokeResponse> {
    if (
      (response.transaction_status === AcqStatusResponseEnum.DECLINED &&
        response.kushki_response.code !== AcqCodeResponseEnum.SUCCESS) ||
      (response.transaction_status === AcqStatusResponseEnum.DECLINED &&
        response.kushki_response.code === AcqCodeResponseEnum.SUCCESS)
    )
      return throwError(
        new KushkiError(ERRORS_ACQ.E006, "Transacción Declinada", response)
      );

    if (
      response.transaction_status === AcqStatusResponseEnum.APPROVED &&
      response.kushki_response.code === AcqCodeResponseEnum.SUCCESS
    )
      return of(response);

    return throwError(new KushkiError(ERRORS_ACQ.E002));
  }

  private _getInvokeFunctionName(isAft: boolean, isOCT: boolean): string {
    if (isOCT) return `usrv-acq-visa-direct-${process.env.USRV_STAGE}-pushOCT`;

    if (isAft) return `usrv-acq-visa-direct-${process.env.USRV_STAGE}-charge`;

    return `usrv-acq-ecommerce-${process.env.USRV_STAGE}-directIntegrationAuthorization`;
  }

  private _invokeLambdaDirectIntegration(
    request: AcqRequest,
    isAft: boolean = false,
    isOCT: boolean = false
  ): Observable<AcqInvokeResponse> {
    return of(1).pipe(
      mergeMap(() => {
        const function_name: string = this._getInvokeFunctionName(isAft, isOCT);

        return this._lambda.invokeFunction<AcqInvokeFullResponse>(
          function_name,
          { body: request }
        );
      }),
      mergeMap((response) => this._putFranchiseAnnotations(response)),
      map((response: AcqInvokeFullResponse) => response.body),
      catchError((err: KushkiError | Error) => this._throwError(err)),
      tag("AcqGateway | _invokeLambdaDirectIntegration")
    );
  }

  private _invokeProcessTransactionLambda(
    request: AcqInvokeRequest
  ): Observable<AcqInvokeFullResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AcqInvokeFullResponse>(
          `usrv-acq-ecommerce-${process.env.USRV_STAGE}-directIntegrationAuthorization`,
          { body: request }
        )
      ),
      mergeMap((response) => this._putFranchiseAnnotations(response))
    );
  }

  private _buildAccountValidationRequest(
    request: AcqValidateAccountRequest
  ): Observable<AcqInvokeRequest> {
    return of(1).pipe(
      mergeMap(() => {
        const bin_info_bank: string = get(request, this._binInfoBank, "");
        const invoke_request: AcqInvokeRequest = {
          amount: {
            currency: request.currency,
            ice: 0,
            iva: 0,
            subtotal_iva: 0,
            subtotal_iva0: 0,
          },
          authorizerContext: request.authorizerContext,
          bin_info: {
            bank: isEmpty(bin_info_bank)
              ? BinInfoDefaultValues.BANK
              : bin_info_bank,
            bin: get(request, this._binInfoBin, ""),
            brand: get(request, this._binInfoBrand, ""),
            brandProductCode: get(request, this._binBrandProductCode),
            country: get(request, this._binInfoCountry, ""),
            prepaid: get(request, this._binInfoPrepaid, false),
            type: get(request, this._binInfoType, ""),
          },
          client_transaction_id: request.transactionReference,
          full_response: "",
          is_blocked_card: get(request, this._isBlockedCard, false),
          merchant_id: get(request, "processorId", ""),
          merchant_information_id: request.merchantInformationID,
          token_type: request.tokenType,
          transaction_card_id: get(request, "transactionCardId", ""),
          transaction_mode: this._authorizationMode,
          transaction_type: TransactionTypeAcqEnum.CARD_VALIDATION,
          vault_token: request.vaultToken,
        };

        this._setSubMerchantInAcqRequest(request, invoke_request);

        if (!isEmpty(request["3DS"]))
          invoke_request.three_ds = {
            authentication_data: get(request, this._acctAuthValue, ""),
            CAVV: get(request, "3DS.cavv", ""),
            directory_server_transactionID: get(
              request,
              this._directoryServerTrxID,
              ""
            ),
            ECI: get(request, "3DS.eci", ""),
            XID: get(request, "3DS.xid", ""),
          };
        else invoke_request.three_ds = {};

        return of(invoke_request);
      })
    );
  }

  private _setSubMerchantInAcqRequest(
    request: PreAuthRequest | AcqValidateAccountRequest,
    acqRequest: AcqInvokeRequest | AcqRequest
  ): void {
    if (
      isEmpty(get(request, this._companyId)) &&
      isEmpty(get(request, this._facilitatorId))
    )
      return;

    if (
      this._isEmptySubMerchantFields(request) &&
      get(request, "subMerchant.isInRequest", false)
    )
      throw new KushkiError(ERRORS_ACQ.E601);

    set(acqRequest, "sub_merchant", {
      address: get(request, "subMerchant.address", ""),
      city: get(request, "subMerchant.city", ""),
      city_code: get(request, "subMerchant.cityCode"),
      code: get(request, "subMerchant.code", ""),
      country_ans: get(request, "subMerchant.countryAns", ""),
      facilitator_name: get(request, "subMerchant.facilitatorName", ""),
      id_affiliation: get(request, "subMerchant.idAffiliation", ""),
      id_company: get(request, this._companyId, ""),
      id_facilitator: get(request, this._facilitatorId, ""),
      mcc: get(request, "subMerchant.mcc", ""),
      social_reason: get(request, this._socialReason, ""),
      soft_descriptor: get(request, "subMerchant.softDescriptor", ""),
      zip_code: get(request, "subMerchant.zipCode", ""),
      omit_crypto_currency: get(
        request,
        "subMerchant.omitCryptoCurrency",
        false
      ),
    });
  }

  private _isVisaWithoutSocialReason(
    request: PreAuthRequest | AcqValidateAccountRequest
  ): boolean {
    const brand: string = get(request, this._binInfoBrand, "")
      .trim()
      .toUpperCase();
    const social_reason: string = get(request, this._socialReason, "");

    return brand === CardBrandEnum.VISA.toUpperCase() && social_reason === "";
  }

  private _isEmptySubMerchantFields(
    request: PreAuthRequest | AcqValidateAccountRequest
  ): boolean {
    const fields_to_validate: string[] = [
      "address",
      "city",
      "countryAns",
      "code",
      "mcc",
      "idAffiliation",
      "softDescriptor",
      "zipCode",
    ];

    if (this._isProsa(request)) fields_to_validate.push("cityCode");

    return (
      fields_to_validate.some((value) =>
        isEmpty(get(request, `subMerchant.${value}`, ""))
      ) || this._isVisaWithoutSocialReason(request)
    );
  }

  private _isProsa(
    request: PreAuthRequest | AcqValidateAccountRequest
  ): boolean {
    return (
      isEqual(get(request, SchemaEnum.merchant_country), CountryEnum.MEXICO) &&
      isEqual(get(request, this._binInfoCountry), CountryIsoEnum.MEX)
    );
  }

  private _buildRequest(
    request: PreAuthRequest,
    options: AcqChargeOptions
  ): Observable<AcqRequest> {
    if (
      this._shouldDeclineZeroAmountTrx() &&
      !request.isCardValidation &&
      UtilsService.calculateFullAmount(request.card.amount) === 0
    )
      throw new KushkiError(ERRORS_ACQ.E600);

    const bin_info_bank: string = get(request, this._binInfoBank, "");

    return of(1).pipe(
      map(() => {
        const acqRequest: AcqRequest = {
          amount: this._buildAmount(request),
          authorizerContext: request.authorizerContext,
          bin_info: this._buildBinInfo(request, bin_info_bank),
          card_id: get(request, this._cardId, ""),
          ...(request.citMit ? { cit_mit: request.citMit } : {}),
          client_transaction_id: request.transactionReference,
          contact_details: MapperService.buildAcqContactDetails(request),
          full_response: "",
          is_blocked_card: get(request, this._isBlockedCard, false),
          is_external_subscription: false,
          is_frictionless: get(request, "isFrictionless") || false,
          is_recurrent:
            request.isSubscription ||
            !isEmpty(get(request, "initialRecurrenceReference", "")),
          merchant_id: get(request, "processorId", ""),
          subscription_id: get(request, "subscriptionId"),
          token_type: request.tokenType,
          transaction_mode: this._authorizationMode,
          transaction_reference:
            options.transactionType ===
            TransactionTypeAcqEnum.REAUTHORIZATION.toLowerCase()
              ? get(options, "referenceNumber", "")
              : undefined,
          transaction_type: options.transactionType,
          vault_token: request.vaultToken,
        };

        this._setSubscriptionType(request, acqRequest);
        this._setThreeDSIfNeeded(request, acqRequest);
        this._setDeferredAcqRequest(request, acqRequest);
        this._setExternalSubscriptionIfNeeded(request, acqRequest);
        this._setSubMerchantInAcqRequest(request, acqRequest);
        this._unsetSubscriptionOnDemandCvvIfNeeded(
          request,
          options,
          acqRequest
        );
        this._setCvv2IfNeeded(request, acqRequest);
        this._setOCTIfNeeded(request, acqRequest);

        return acqRequest;
      }),
      tag("AcqGateway | _buildRequest")
    );
  }

  private _buildAmount(request: PreAuthRequest) {
    return {
      currency: request.card.amount.currency,
      extra_taxes: {
        airport_tax: get(
          request,
          "card.amount.extraTaxes.tasaAeroportuaria",
          0
        ),
        iac: get(request, "card.amount.extraTaxes.iac", 0),
        ice: get(request, "card.amount.extraTaxes.ice", 0),
        travel_agency: get(request, "card.amount.extraTaxes.agenciaDeViaje", 0),
      },
      iva: request.card.amount.iva,
      subtotal_iva: request.card.amount.subtotalIva,
      subtotal_iva0: request.card.amount.subtotalIva0,
      tip: get(request, "card.amount.extraTaxes.tip", 0),
    };
  }

  private _buildBinInfo(request: PreAuthRequest, bin_info_bank: string) {
    return {
      bank: isEmpty(bin_info_bank) ? BinInfoDefaultValues.BANK : bin_info_bank,
      bin: get(request, this._binInfoBin, ""),
      brand: get(request, this._binInfoBrand, ""),
      brand_product_code: get(request, this._binBrandProductCode),
      country: get(request, this._binInfoCountry, ""),
      prepaid: get(request, this._binInfoPrepaid, false),
      type: get(request, this._binInfoType, ""),
    };
  }

  private _setThreeDSIfNeeded(request: PreAuthRequest, acqRequest: AcqRequest) {
    if (!isEmpty(get(request, "3DS.eci"))) {
      set(acqRequest, "three_ds", {
        "3ds_indicator": get(request, this._specificationVersion),
        authentication_data: get(request, this._acctAuthValue),
        CAVV: get(request, "3DS.cavv"),
        directory_server_transactionID: get(
          request,
          this._directoryServerTrxID,
          ""
        ),
        ECI: get(request, "3DS.eci"),
        UCAF: get(request, this._acctAuthValue),
        XID: get(request, "3DS.xid"),
      });
    }
  }

  private _setExternalSubscriptionIfNeeded(
    request: PreAuthRequest,
    acqRequest: AcqRequest
  ) {
    const external_subscription_id = get(request, "externalSubscriptionID", "");
    if (!isEmpty(external_subscription_id)) {
      acqRequest.is_external_subscription = true;
      acqRequest.is_recurrent = true;
      acqRequest.subscription_id = external_subscription_id;
      acqRequest.subscription_type = SubscriptionTriggerEnum.ON_DEMAND;
    }
  }

  private _unsetSubscriptionOnDemandCvvIfNeeded(
    request: PreAuthRequest,
    options: AcqChargeOptions,
    acqRequest: AcqRequest
  ) {
    if (get(options, "isSubscriptionOnDemandCvv", false)) {
      acqRequest.is_recurrent = false;
      unset(acqRequest, "subscription_type");
      unset(acqRequest, "subscription_id");
    }
  }

  private _setCvv2IfNeeded(request: PreAuthRequest, acqRequest: AcqRequest) {
    if (!isEmpty(request.cvv2)) set(acqRequest, "cvv2", request.cvv2);
  }

  private _setOCTIfNeeded(request: PreAuthRequest, acqRequest: AcqRequest) {
    const is_oct: boolean = get(request, this._isOCTPath);
    if (is_oct) {
      const transaction_type_oct: string = "pushOCT";
      set(acqRequest, this._businessApplicationIDPath, BusinessProductID.FD);
      acqRequest.transaction_type = transaction_type_oct;
    }
  }

  private _setSubscriptionType(
    request: PreAuthRequest,
    acqRequest: AcqRequest
  ) {
    const subscription_type = get(request, "subscriptionTrigger");

    if (!isEmpty(subscription_type))
      set(acqRequest, "subscription_type", subscription_type);
  }

  private _setDeferredAcqRequest(
    request: PreAuthRequest,
    acqRequest: AcqRequest
  ) {
    if (!request.isDeferred) return;

    const deferred: object = {
      credit_type: get(request, "deferred.creditType"),
      grace_months: defaultTo(
        get(request, "deferred.graceMonths"),
        "00"
      ).padStart(2, "0"),
      months: `${get(request, "deferred.months")}`.padStart(2, "0"),
    };

    set(acqRequest, "deferred", deferred);
  }

  private _handleReauthorization(request: AcqRequest): Observable<AcqResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AcqInvokeFullResponse>(
          `usrv-acq-ecommerce-${process.env.USRV_STAGE}-reauthorization`,
          {
            body: {
              ...request,
            },
          }
        )
      ),
      mergeMap((response) => this._putFranchiseAnnotations(response)),
      map((response: AcqInvokeFullResponse) => response.body),
      catchError((err: KushkiError | Error) => this._throwError(err)),
      tag("AcqGateway | _handleReauthorization")
    );
  }

  private _shouldDeclineZeroAmountTrx(): boolean {
    return get(
      JSON.parse(`${process.env.ENV_VARS}`),
      "declineZeroAmountTrx",
      false
    );
  }

  private _throwError(err: KushkiError | Error): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        if (err instanceof KushkiError)
          return MapperService.handleRequestError(err);

        return throwError(err);
      })
    );
  }

  private _putFranchiseAnnotations(
    response: AcqInvokeFullResponse
  ): Observable<AcqInvokeFullResponse> {
    return of(1).pipe(
      mergeMap(() => {
        const franchise_response_time: FranchiseResponseTime = {
          ...response.body.franchise_response_time,
        };

        if (!isEmpty(franchise_response_time)) {
          delete response.body.franchise_response_time;
          this._putAnnotation(
            "frMessageCode",
            get(franchise_response_time, "fr_message_code", "")
          );
          this._putAnnotation(
            "frMessageTime",
            get(franchise_response_time, "fr_message_time", "")
          );
          this._putAnnotation(
            "frResponseTime",
            get(franchise_response_time, "fr_response_time", "")
          );
          this._putAnnotation(
            "franchise",
            get(response.body, "authorizer", "")
          );
        }

        return of(response);
      }),
      catchError(() => of(response)),
      tag("AcqGateway | _putFranchiseAnnotations")
    );
  }

  private _putAnnotation(fieldName: string, fieldValue: string | number) {
    if (!isEmpty(fieldValue)) this._tracer.putAnnotation(fieldName, fieldValue);
  }

  private _isTransactionFromProsa(request: AcqChargeRequest): boolean {
    return (
      isEqual(get(request, this._merchantCountry), CountryEnum.MEXICO) &&
      isEqual(get(request, this._binInfoCountry), CountryIsoEnum.MEX)
    );
  }
}
