// jscpd:ignore-start
import { ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE_ID } from "@kushki/core/lib/constant/Identifiers";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ERRORS_ACQ } from "infrastructure/ErrorAcqEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ErrorMapAcqEnum } from "infrastructure/ErrorMapAcqEnum";
import { ERROR_AURUS_KUSHKI_ADQUIRER } from "infrastructure/ErrorMapEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { SchemaEnum } from "infrastructure/SchemaEnum";
import { TransactionModeEnum } from "infrastructure/TransactionModeEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { TransactionTypeAcqEnum } from "infrastructure/TransactionTypeAcqEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, padStart, set } from "lodash";
import { Microtime } from "microtime-node";
import nanoSeconds = require("nano-seconds");
import { IAcqGateway } from "repository/IAcqGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IKushkiAcqService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, map, mergeMap, timeoutWith } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import snakecaseKeys = require("snakecase-keys");
import { AcqCaptureError } from "types/acq_capture_error";
import { AcqCaptureRequest } from "types/acq_capture_request";
import { AcqChargeRequest } from "types/acq_charge_request";
import { AcqInvokeResponse } from "types/acq_invoke_response";
import { AcqResponse } from "types/acq_response";
import { AcqValidateAccountRequest } from "types/acq_validate_account_request";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { AuthorizerContext } from "types/authorizer_context";
import { ChargeKushkiAcqRequest } from "types/charge_kushki_request";
import { CaptureKushkiAcqRequest } from "types/kushki_acq_capture_request";
import { KushkiAcqVars } from "types/kushki_acq_vars";
import { PreAuthKushkiAcqRequest } from "types/preauth_kushki_request";
import { PreAuthRequest } from "types/preauth_request";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { ValidateAccountLambdaRequest } from "types/validate_account_lambda_request";
import { CardTypes } from "constant/CardTypes";

// jscpd:ignore-end
const PROCESSOR_MERCHANT_ID_PATH: string = "processor.processor_merchant_id";

type Req =
  | CaptureKushkiAcqRequest
  | ChargeKushkiAcqRequest
  | PreAuthKushkiAcqRequest;

// jscpd:ignore-start
@injectable()
export class KushkiAcqService implements IKushkiAcqService {
  public variant: CardProviderEnum.KUSHKI = CardProviderEnum.KUSHKI;
  private readonly _lambdaGateway: ILambdaGateway;
  private readonly _dynamo: IDynamoGateway;
  private readonly _rollbar: rollbar;
  private readonly _acqGateway: IAcqGateway;
  private readonly _binTypePath: string = "binInfo.type";
  private readonly _creditType: string = "credit";
  private readonly _kushkiResponseCodePath: string = "kushki_response.code";
  private readonly _indicator3DSPath: string = "relevant_fields.indicator_3ds";

  constructor(
    @inject(CORE_ID.LambdaGateway) lambdaGateway: ILambdaGateway,
    @inject(IDENTIFIERS.DynamoGateway) dynamo: IDynamoGateway,
    @inject(IDENTIFIERS.AcqGateway) _acqGateway: IAcqGateway,
    @inject(CORE_ID.RollbarInstance) rollbarInstance: rollbar
  ) {
    this._dynamo = dynamo;
    this._lambdaGateway = lambdaGateway;
    this._acqGateway = _acqGateway;
    this._rollbar = rollbarInstance;
  }

  public tokens(_: AurusTokenLambdaRequest): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() => UtilsService.tokenGenerator("KushkiAcqService")),
      tag("KushkiAcqService | tokens")
    );
  }

  // jscpd:ignore-end

  public preAuthorization(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._processChargePreauth(
          request,
          TransactionTypeAcqEnum.PREAUTHORIZATION
        )
      ),
      tag("KushkiAcqService | preAuthorization")
    );
  }

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._processChargePreauth(request, TransactionTypeAcqEnum.CHARGE)
      ),
      tag("KushkiAcqService | charge")
    );
  }

  public capture(request: CaptureInput): Observable<AurusResponse> {
    return of(1).pipe(
      map(() => KushkiAcqService.getKushkiAcqVars()),
      mergeMap((setup: KushkiAcqVars) => this._processCapture(request, setup)),
      tag("KushkiAcqService | capture")
    );
  }

  // tslint:disable-next-line:no-identical-functions
  public reAuthorization(
    amount: Amount,
    authorizerContext: AuthorizerContext,
    transaction: Transaction
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._executeReauthGtw(
          <PreAuthRequest>(
            UtilsService.buildReauthorizationValues(
              transaction,
              amount,
              authorizerContext
            )
          )
        )
      ),
      catchError((error: KushkiError | Error) => this._handleError(error)),
      tag("KushkiAcqService | reAuthorization")
    );
  }

  public validateAccount(
    authorizerContext: AuthorizerContext,
    request: SandboxAccountValidationRequest
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() => this._processValidateAccount(request, authorizerContext)),
      tag("KushkiAcqService | validateAccount")
    );
  }

  private _processValidateAccount(
    request: SandboxAccountValidationRequest | ValidateAccountLambdaRequest,
    authorizerContext: AuthorizerContext
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._executeValidateAccountGtw(
          <AcqValidateAccountRequest>request,
          authorizerContext
        )
      ),
      catchError((error: KushkiError | Error) => this._handleError(error)),
      tag("KushkiAcqService | _processValidateAccount")
    );
  }

  private _processCapture(
    request: CaptureInput,
    setup: KushkiAcqVars
  ): Observable<AurusResponse> {
    const capture_request: AcqCaptureRequest =
      KushkiAcqService.buildCaptureRequestKushki(request);

    return of(1).pipe(
      mergeMap(() => this._handleCapture(capture_request, request, setup)),
      timeoutWith(
        Number(`${setup.TIMEOUT}`),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalServerErrorResponse(
              UtilsService.buildCaptureRequest(request),
              ProcessorEnum.KUSHKI
            )
          )
        )
      ),
      catchError((error: KushkiError | Error) =>
        this._handleError(error, UtilsService.buildCaptureRequest(request))
      ),
      map((acqResponse: AcqResponse) =>
        this._mapAcqCaptureResponse(
          capture_request,
          acqResponse,
          request.transaction
        )
      ),
      tag("KushkiAcqService | _processCapture")
    );
  }

  private _handleCapture(
    request: AcqCaptureRequest,
    captureInput: CaptureInput,
    acqVars: KushkiAcqVars
  ): Observable<AcqResponse> {
    return of(request).pipe(
      mergeMap(() => this._acqGateway.capture(request)),
      catchError((err: KushkiError) =>
        this._handleCaptureError(
          captureInput,
          err,
          TransactionTypeAcqEnum.CAPTURE
        )
      )
    );
  }

  private _mapAcqCaptureResponse(
    request: AcqCaptureRequest,
    acqResponse: AcqResponse,
    originalTransaction: Transaction
  ): AurusResponse {
    return {
      approved_amount: get(request, "amount", "0"),
      indicator_3ds: get(acqResponse, this._indicator3DSPath),
      processor_transaction_id: get(acqResponse, "transaction_reference"),
      recap: get(acqResponse, "reference_number", ""),
      response_code: padStart(
        get(acqResponse, "kushki_response.code", ""),
        3,
        "0"
      ),
      response_text: get(acqResponse, "kushki_response.message", ""),
      ticket_number: `82${Microtime.now()}`,
      transaction_details: {
        approvalCode: get(acqResponse, "approval_code", ""),
        binCard: get(originalTransaction, "bin_card", ""),
        cardHolderName: get(originalTransaction, "card_holder_name", ""),
        cardType: get(originalTransaction, "card_type", ""),
        isDeferred: get(
          originalTransaction,
          "transaction_details.isDeferred",
          ""
        ),
        lastFourDigitsOfCard: get(originalTransaction, "last_four_digits", ""),
        merchantName: get(originalTransaction, "merchant_name", ""),
        processorBankName: get(originalTransaction, "processor_bank_name", ""),
        processorName: ProcessorEnum.KUSHKI,
      },
      transaction_id: `82${nanoSeconds.now().toString().replace(",", "")}`,
      transaction_reference: request.transaction_reference,
    };
  }

  private _processChargePreauth(
    chargeInput: ChargeInput,
    transactionType: TransactionTypeAcqEnum
  ): Observable<AurusResponse> {
    const request: ChargeKushkiAcqRequest | PreAuthKushkiAcqRequest =
      this._buildRequestKushkiAcq(chargeInput);
    const setup: KushkiAcqVars = KushkiAcqService.getKushkiAcqVars();

    return of(1).pipe(
      mergeMap(() =>
        this._executeChargePreauthGtw(request, transactionType, setup)
      ),
      timeoutWith(
        Number(setup.TIMEOUT),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalKushkiAcqServerErrorResponse(request)
          )
        )
      ),
      catchError((error: KushkiError | Error) =>
        this._handleError(error, request)
      ),
      tag("KushkiAcqService | _processChargePreauth")
    );
  }

  private _executeChargePreauthGtw(
    request: ChargeKushkiAcqRequest | PreAuthKushkiAcqRequest,
    transactionType: TransactionTypeAcqEnum,
    setup: KushkiAcqVars
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => transactionType === TransactionTypeAcqEnum.CHARGE,
          this._executeChargeGtw(<AcqChargeRequest>request, setup),
          this._executePreauthGtw(<PreAuthRequest>request, setup)
        )
      ),
      map((acqResponse: AcqResponse) =>
        this._buildResponse(request, acqResponse)
      ),
      tag("KushkiAcqService | _executeChargePreauthGtw")
    );
  }

  private _executeChargeGtw(
    request: AcqChargeRequest,
    setup: KushkiAcqVars
  ): Observable<AcqInvokeResponse> {
    return of(1).pipe(
      mergeMap(() => this._acqGateway.charge(request)),
      catchError((err: KushkiError) =>
        this._handleTrxError(
          request,
          err,
          !request.isDeferred
            ? TransactionTypeAcqEnum.SALE
            : TransactionTypeAcqEnum.DEFERRED
        )
      )
    );
  }

  private _executeValidateAccountGtw(
    request: AcqValidateAccountRequest,
    authorizerContext: AuthorizerContext
  ): Observable<AurusResponse> {
    if (UtilsService.invalidBinInfo(request.binInfo))
      return throwError(new KushkiError(ERRORS.E011));

    set(
      request,
      this._binTypePath,
      get(request, this._binTypePath) || this._creditType
    );
    set(
      request,
      "authorizerContext",
      UtilsService.mapAuthorizerContextAcq(authorizerContext)
    );

    const new_request: AcqChargeRequest = {
      ...request,
      card: {
        ...request.card,
        amount: {
          currency: "USD",
          extraTaxes: {
            agenciaDeViaje: 0,
            iac: 0,
            propina: 0,
            tasaAeroportuaria: 0,
          },
          ice: 0,
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 0,
        },
      },
      isBlockedCard: get(request, "isBlockedCard", false),
      isCardValidation: false,
      isDeferred: false,
      isSubscription: false,
      terminalId: "e",
      transactionCardId: get(request, "transactionCardId", ""),
      transactionReference: request.transactionReference,
    };

    const setup: KushkiAcqVars = KushkiAcqService.getKushkiAcqVars();

    return of(1).pipe(
      mergeMap(() => this._acqGateway.validateAccount(request)),
      timeoutWith(
        Number(setup.TIMEOUT),
        throwError(new KushkiError(ERRORS_ACQ.E012))
      ),
      catchError((error: KushkiError) =>
        this._handleTrxError(new_request, error, TransactionTypeAcqEnum.SALE)
      ),
      map((acqResponse: AcqResponse) =>
        this._buildResponse(new_request, acqResponse)
      ),
      tag("KushkiAcqService | _executeValidateAccountGtw")
    );
  }

  private _executePreauthGtw(
    request: PreAuthRequest,
    setup: KushkiAcqVars
  ): Observable<AcqResponse> {
    if (UtilsService.invalidBinInfo(request.binInfo))
      return throwError(new KushkiError(ERRORS.E011));

    set(
      request,
      this._binTypePath,
      get(request, this._binTypePath, this._creditType)
    );

    return of(1).pipe(
      mergeMap(() => this._acqGateway.preAuthorization(request)),
      catchError((err: KushkiError) =>
        this._handleTrxError(
          request,
          err,
          TransactionTypeAcqEnum.PREAUTHORIZATION
        )
      )
    );
  }

  private _executeReauthGtw(
    request: PreAuthRequest
  ): Observable<AurusResponse> {
    if (UtilsService.invalidBinInfo(request.binInfo))
      return throwError(new KushkiError(ERRORS.E011));

    const setup: KushkiAcqVars = KushkiAcqService.getKushkiAcqVars();

    set(
      request,
      this._binTypePath,
      get(request, this._binTypePath) || this._creditType
    );

    return of(1).pipe(
      mergeMap(() =>
        this._dynamo.query<Transaction>(
          TABLES.transaction,
          IndexEnum.transactions_transaction_reference,
          "transaction_reference",
          get(request, "originalTrxReference", "")
        )
      ),
      mergeMap((trx: Transaction[]) =>
        iif(
          () => isEmpty(trx),
          throwError(new KushkiError(ERRORS_ACQ.E001)),
          this._acqGateway.reAuthorization(
            request,
            get(trx[0], "processor_transaction_id", "")
          )
        )
      ),
      timeoutWith(
        Number(`${setup.TIMEOUT}`),
        throwError(new KushkiError(ERRORS_ACQ.E012))
      ),
      catchError((err: KushkiError) =>
        this._handleTrxError(
          request,
          err,
          TransactionTypeAcqEnum.REAUTHORIZATION
        )
      ),
      map((resp: AcqResponse) => this._responseReAuth(request, resp)),
      tag("AcqService | reAuthorization")
    );
  }

  // jscpd:ignore-start
  private _handleError(
    error: KushkiError | Error,
    req?: Req
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => error instanceof KushkiError,
          this._validateError(<KushkiError>error, req),
          throwError(error)
        )
      ),
      tag("KushkiAcqService | _handleError")
    );
  }

  private _handleCaptureError(
    request: CaptureInput,
    err: KushkiError,
    captureTransactionReference: string
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        of({
          amount: get(request, "amount"),
          card: {
            bin: get(request, "transaction.bin_card", ""),
            brand: get(request, "transaction.payment_brand", ""),
            holderName: request.transaction.card_holder_name,
            lastFourDigits: request.transaction.last_four_digits,
          },
          clientTransactionId: request.tokenTrxReference,
          isDeferred:
            get(request, "transaction.number_of_months") !== undefined,
          merchantName: request.transaction.merchant_name,
          processorBankName: request.transaction.processor_bank_name,
          transactionReference: captureTransactionReference,
          transactionType: TransactionTypeAcqEnum.CAPTURE,
        })
      ),
      mergeMap((req: AcqCaptureError) =>
        this._handleTrxError(req, err, TransactionTypeAcqEnum.CAPTURE)
      ),
      tag("AcqService | _handleCaptureError")
    );
  }

  // jscpd:ignore-end

  private _validateError(error: KushkiError, req?: Req): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const error_code: string = get(error, "code", "");

        if (ERROR_AURUS_KUSHKI_ADQUIRER.includes(error_code))
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.KUSHKI)
          );

        if (error_code.includes("012"))
          return throwError(
            MapperService.buildUnreachableAurusError(ProcessorEnum.KUSHKI)
          );

        if (error_code.includes("027"))
          return this._manageTimeOutError(error, req);

        return throwError(() => error);
      }),
      tag("KushkiAcqService | _validateError")
    );
  }

  private _buildRequestKushkiAcq(
    input: ChargeInput
  ): ChargeKushkiAcqRequest | PreAuthKushkiAcqRequest {
    const is_card_transaction: boolean = input.event.usrvOrigin.includes(
      UsrvOriginEnum.CARD
    );
    const is_subscription_validation: boolean = get(
      input,
      "event.metadata.ksh_subscriptionValidation",
      get(input, "currentToken.transactionMode") ===
        TransactionModeEnum.INITIAL_RECURRENCE
    );
    const is_subscription: boolean =
      Boolean(input.event.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !isEmpty(input.currentToken.vaultToken) &&
      !is_subscription_validation;
    const country_bin: string = UtilsService.getCountryISO(
      get(input, "event.binInfo.info.country.name", "")
    );
    const charge_request: ChargeKushkiAcqRequest | PreAuthKushkiAcqRequest = {
      acquirerBank: get(input, "processor.acquirer_bank", ""),
      authorizerContext: UtilsService.mapAuthorizerContextAcq(
        input.authorizerContext
      ),
      binInfo: {
        bank: get(input, "event.binInfo.bank", ""),
        bin: get(input, "event.binInfo.bin", ""),
        brand: get(input, "event.binInfo.brand", "").toUpperCase(),
        brandProductCode: get(
          input,
          "event.binInfo.brandProductCode",
          get(input, "event.binInfo.info.brandProductCode")
        ),
        country: country_bin,
        prepaid: get(input, "event.binInfo.info.prepaid", false),
        type: this._validIsEmpty(get(input, "event.binInfo.info.type", "")),
      },
      card: {
        amount: input.amount,
        bin: input.currentToken.bin,
        brand: get(input, "currentToken.binInfo.brand", ""),
        holderName: get(input, "currentToken.cardHolderName", ""),
        lastFourDigits: get(input, "currentToken.lastFourDigits"),
        type: get(
          input,
          "currentToken.binInfo.info.type",
          "CREDIT"
        ).toUpperCase() as CardTypes,
      },
      cardId: get(input, "currentToken.transactionCardId", ""),
      citMit: get(input, "event.citMit"),
      ...(input.event.citMit ? { citMit: get(input, "event.citMit") } : {}),
      contactDetails: {
        documentNumber: get(input, "event.contactDetails.documentNumber", ""),
        documentType: get(input, "event.contactDetails.documentType", ""),
        email: get(input, "event.contactDetails.email", ""),
        firstName: get(input, "event.contactDetails.firstName", ""),
        lastName: get(input, "event.contactDetails.lastName", ""),
        phoneNumber: get(input, "event.contactDetails.phoneNumber", ""),
        secondLastName: get(input, "event.contactDetails.secondLastName", ""),
      },
      deferred: this._getIsDeferred(input)
        ? {
            creditType: get(input, "event.deferred.creditType", ""),
            graceMonths: get(input, "event.deferred.graceMonths", ""),
            months: get(
              input,
              "event.deferred.months",
              get(input, "event.months", "").toString()
            ).toString(),
          }
        : undefined,
      externalSubscriptionID: get(input, "event.externalSubscriptionID"),
      initialRecurrenceReference: get(input, "initialRecurrenceReference", ""),
      isBlockedCard: get(input, "currentToken.isBlockedCard", false),
      isDeferred: this._getIsDeferred(input),
      isSubscription: is_subscription,
      maskedCardNumber: get(input, "currentToken.maskedCardNumber", ""),
      merchantCountry: get(input, "currentMerchant.country"),
      merchantId: get(input, "currentMerchant.public_id"),
      merchantName: get(input, "currentMerchant.merchant_name"),
      processorBankName: get(input, "processor.acquirer_bank", ""),
      processorId: get(input, "processor.public_id"),
      processorMerchantId: get(input, PROCESSOR_MERCHANT_ID_PATH, ""),
      subMerchant: get(input, "event.subMerchant"),
      terminalId: get(input, "processor.terminal_id", ""),
      tokenType: input.tokenType,
      transactionReference: input.currentToken.transactionReference,
      vaultToken: get(input, "currentToken.vaultToken", ""),
    };

    const version: string = `${get(
      input,
      "currentToken.3ds.detail.specificationVersion",
      ""
    )}`;

    const is_aft: boolean = get(input, "isAft", false);

    set(charge_request, "subscriptionId", get(input, "event.subscriptionId"));
    set(charge_request, "processorToken", get(input, "event.processorToken"));
    set(charge_request, "isCardValidation", is_subscription_validation);
    if (is_aft) set(charge_request, "isAft", is_aft);
    set(charge_request, "isOCT", input.isOCT);

    UtilsService.add3DSFields(
      input,
      charge_request,
      `${version.split(".")[0]}.0`
    );

    if (!isEmpty(get(input, "event.cvv")) || !isEmpty(get(input, "cvv")))
      set(
        charge_request,
        "cvv2",
        defaultTo(get(input, "event.cvv"), get(input, "cvv"))
      );

    if (is_card_transaction) {
      set(
        charge_request,
        "card.months",
        get(input, "event.deferred.months", "")
      );
      set(charge_request, "card.deferred", get(input, "event.deferred"));
    }

    set(
      charge_request,
      SchemaEnum.merchant_country,
      get(input, "currentMerchant.country")
    );

    if (is_subscription)
      set(
        charge_request,
        "subscriptionTrigger",
        get(input, "event.subscriptionTrigger", "")
      );

    return charge_request;
  }

  private _manageTimeOutError(
    error: KushkiError,
    req?: Req
  ): Observable<never> {
    return of(1).pipe(
      map(() =>
        snakecaseKeys<Req>({
          ...req,
          transactionStatus: TransactionStatusEnum.DECLINED,
        })
      ),
      mergeMap((request: Req) =>
        this._dynamo.put(
          request,
          `${KushkiAcqService.getKushkiAcqVars().TABLE_TIMEOUTS}`
        )
      ),
      mergeMap(() =>
        throwError(MapperService.buildAurusError(error, ProcessorEnum.KUSHKI))
      ),
      tag("KushkiAcqService | _manageTimeOutError")
    );
  }

  /*
  TODO: If this env variable is immutable over time, it should be parsed only once: at bootstrap time.
  It's expensive to do so on every request.
  */
  public static getKushkiAcqVars(): KushkiAcqVars {
    return <KushkiAcqVars>JSON.parse(`${process.env.KUSHKI_ADQUIRER_VARS}`);
  }

  private _getIsDeferred(input: ChargeInput): boolean {
    const deferred_months: number = get(input.event, "deferred.months");
    const has_months: boolean = get(input.event, "months", deferred_months) > 1;

    return get(input, "currentToken.isDeferred", false) || has_months;
  }

  private _validIsEmpty(input: string): string {
    return !isEmpty(input) ? input.toLowerCase() : "";
  }
  public static buildCaptureRequestKushki(
    request: CaptureInput
  ): AcqCaptureRequest {
    const amount_str = (
      request.body.amount
        ? UtilsService.calculateFullAmount(request.body.amount)
        : 0
    ).toString();

    return {
      amount: amount_str,
      authorizerContext: UtilsService.mapAuthorizerContextAcq(
        request.authorizerContext
      ),
      bin_info: {
        bank: get(request, "transaction.issuing_bank", ""),
        bin: get(request, "transaction.bin_card", ""),
        brand: get(request, "transaction.payment_brand", "").toUpperCase(),
        country: UtilsService.getCountryISO(
          get(request, "transaction.card_country", "")
        ),
        prepaid: get(request, "currentToken.binInfo.info.prepaid", false),
        type: get(request, "transaction.card_type", "").toLowerCase(),
      },
      client_transaction_id: request.tokenTrxReference,
      merchant_id: get(request, "processor.public_id"),
      transaction_reference: get(
        request.lastTransaction ? request.lastTransaction : request.transaction,
        "processor_transaction_id",
        ""
      ),
      transaction_type: TransactionTypeAcqEnum.CAPTURE,
    };
  }

  private _buildResponse(
    request: ChargeKushkiAcqRequest | PreAuthKushkiAcqRequest,
    acqResponse: AcqResponse
  ): AurusResponse {
    return {
      approved_amount: Number(
        get(
          acqResponse,
          "authorized_amount",
          UtilsService.calculateFullAmount(request.card.amount)
        ).toFixed(2)
      ).toString(),
      indicator_3ds: get(acqResponse, this._indicator3DSPath),
      is_initial_cof: get(acqResponse, "is_initial_cof", false),
      processor_transaction_id: acqResponse.transaction_reference,
      recap: String(get(acqResponse, "reference_number")),
      response_code: padStart(
        get(acqResponse, this._kushkiResponseCodePath, ""),
        3,
        "0"
      ),
      response_text: get(acqResponse, "kushki_response.message", ""),
      ticket_number: `82${Microtime.now()}`,
      transaction_details: {
        approvalCode: get(acqResponse, "approval_code", ""),
        binCard: request.card.bin,
        cardHolderName: request.card.holderName,
        cardType: request.card.brand,
        isDeferred: `${request.isDeferred ? "Y" : "N"}`,
        lastFourDigitsOfCard: request.card.lastFourDigits,
        merchantName: request.merchantName,
        messageFields: acqResponse.message_fields,
        processorBankName: get(request, "processorBankName", ""),
        processorName: ProcessorEnum.KUSHKI,
      },
      transaction_id: `82${nanoSeconds.now().toString().replace(",", "")}`,
      transaction_reference: request.transactionReference,
    };
  }

  private _responseReAuth(
    request: PreAuthRequest,
    acqResponse: AcqResponse
  ): AurusResponse {
    return {
      approved_amount: UtilsService.calculateFullAmount(
        request.card.amount
      ).toString(),
      processor_transaction_id: acqResponse.transaction_reference,
      recap: "",
      response_code: get(acqResponse, this._kushkiResponseCodePath, ""),
      response_text: acqResponse.kushki_response.message,
      ticket_number: `82${Microtime.now()}`,
      transaction_details: {
        approvalCode: acqResponse.approval_code,
        binCard: request.card.bin,
        cardHolderName: request.card.holderName,
        cardType: request.card.brand,
        interestAmount: "0.0",
        isDeferred: "N",
        lastFourDigitsOfCard: request.card.lastFourDigits,
        merchantName: request.merchantName,
        processorBankName: get(request, "processorBankName", ""),
        processorName: ProcessorEnum.KUSHKI,
      },
      transaction_id: `72${nanoSeconds.now().toString().replace(",", "")}`,
      transaction_reference: request.transactionReference,
    };
  }

  private _handleTrxError(
    request:
      | AcqChargeRequest
      | PreAuthRequest
      | AcqValidateAccountRequest
      | AcqCaptureError,
    err: KushkiError,
    transactionType: TransactionTypeAcqEnum
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        const error_code: string = get(err, "code");
        const errors_list: string[] = [
          ErrorMapAcqEnum.E500,
          ErrorMapAcqEnum.E600,
          ErrorMapAcqEnum.E228,
          ErrorMapAcqEnum.E003,
          ErrorMapAcqEnum.E004,
          ErrorMapAcqEnum.E005,
          ErrorMapAcqEnum.E505,
          ErrorMapAcqEnum.E506,
          ErrorMapAcqEnum.E011,
          ErrorMapAcqEnum.E028,
          ErrorMapAcqEnum.K601,
        ];
        const errors_list_mapped: string[] = [
          ErrorMapAcqEnum.E211,
          ErrorMapAcqEnum.E006,
        ];

        if (error_code === ErrorMapAcqEnum.E012)
          return throwError(new KushkiError(ERRORS_ACQ.E012));
        if (errors_list.includes(error_code)) {
          const ksh_error = ((code) => {
            switch (code) {
              case ErrorMapAcqEnum.E003:
                return ERRORS_ACQ.E003;
              case ErrorMapAcqEnum.E004:
                return ERRORS_ACQ.E004;
              case ErrorMapAcqEnum.E005:
                return ERRORS_ACQ.E005;
              case ErrorMapAcqEnum.E505:
                return ERRORS_ACQ.E505;
              case ErrorMapAcqEnum.E506:
                return ERRORS_ACQ.E506;
              case ErrorMapAcqEnum.E011:
                return ERRORS_ACQ.E011;
              case ErrorMapAcqEnum.E028:
                return ERRORS_ACQ.E028;
              case ErrorMapAcqEnum.K601:
                return ERRORS_ACQ.E601;
              default:
                return ERRORS_ACQ.E500;
            }
          })(error_code);

          const kushki_error: KushkiError = new KushkiError(
            ksh_error,
            ksh_error.message,
            MapperService.mapperInternalAcqServerErrorResponse(
              request,
              ksh_error.message,
              err.getMetadata && get(err.getMetadata(), "authorizer", ""),
              err.getMetadata && get(err.getMetadata(), this._indicator3DSPath)
            )
          );

          if (ErrorMapAcqEnum.E505.includes(kushki_error.code)) {
            const metada: object = kushki_error.getMetadata();

            kushki_error.setMetadata({
              ...metada,
              restricted: true,
            });
          }

          return throwError(() => kushki_error);
        }

        if (errors_list_mapped.includes(error_code)) {
          const ksk_error_metadata: KushkiError = new KushkiError(
            ERRORS_ACQ.E600,
            ERRORS_ACQ.E600.message,
            MapperService.mapperErrorResponse(request, err)
          );

          return throwError(() => ksk_error_metadata);
        }
        this._rollbar.critical(
          `${transactionType} failed with transaction: ${request.transactionReference} - and error: ${err}`
        );

        return throwError(new KushkiError(ERRORS_ACQ.E002));
      }),
      tag("AcqService | _throwMappedError")
    );
  }
}
