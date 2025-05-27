/**
 * Transbank Service Implementation
 */
import { ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { IDENTIFIERS as ID } from "constant/Identifiers";
import { CaptureMethodEnum } from "infrastructure/CaptureMethodEnum";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ChargePreauthMethod } from "infrastructure/ChargePreauthMethod";
import { CompleteTransactionTypeEnum } from "infrastructure/CompleteTransactionTypeEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { ProcessorSsmKeyEnum } from "infrastructure/ProcessorSsmKeyEnum";
import { TokenTypeEnum } from "infrastructure/TokenTypeEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { WebpayIntegrationTypeEnum } from "infrastructure/WebpayIntegrationTypeEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, has, set } from "lodash";
import { Microtime } from "microtime-node";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ITransbankService } from "repository/IProviderService";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  map,
  mergeMap,
  switchMap,
  timeoutWith,
} from "rxjs/operators";
import { CaptureInput, CardService, ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { Amount } from "types/amount";
import { AurusResponse, TransactionDetails } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { TokenType } from "types/token_type";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { TransbankCaptureRequest } from "types/transbank_capture_request";
import { TransbankCaptureResponse } from "types/transbank_capture_response";
import { TransbankChargeRequest } from "types/transbank_charge_request";
import { TransbankChargeResponse } from "types/transbank_charge_response";
import { TransbankFullChargeRequest } from "types/transbank_full_charge_request";
import { TransbankTokenRequest } from "types/transbank_token_request";
import { TransbankTokenResponse } from "types/transbank_token_response";

@injectable()
export class TransbankService implements ITransbankService {
  public variant: CardProviderEnum.TRANSBANK = CardProviderEnum.TRANSBANK;
  private readonly _lambda: ILambdaGateway;
  private readonly _storage: IDynamoGateway;
  private readonly _completeTransactionTypePath: string =
    "trxRuleResponse.body.completeTransactionType";

  constructor(
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway,
    @inject(ID.DynamoGateway) storage: IDynamoGateway
  ) {
    this._lambda = lambda;
    this._storage = storage;
  }

  public tokens(
    request: AurusTokenLambdaRequest
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () => request.tokenType === TokenTypeEnum.SUBSCRIPTION,
          UtilsService.tokenGenerator("TransbankService"),
          this._invokeToken(request)
        )
      ),
      map((response: TransbankTokenResponse | TokensCardResponse) => ({
        settlement: get(response, "shareAmount", ""),
        token: response.token,
      })),
      tag("TransbankService | tokens")
    );
  }

  public charge(input: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => !input.event.usrvOrigin.includes(UsrvOriginEnum.COMMISSION),
          this._callChargeOrPreauht(input, ChargePreauthMethod.KUSHKI),
          this._invokeBuildRequestCommissionCharge(input)
        )
      ),
      tag("TransbankService | chargesTransaction")
    );
  }

  public preAuthorization(
    preauthInput: ChargeInput
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._callChargeOrPreauht(preauthInput, "kshPreAuthorization")
      ),
      tag("TransbankService | preAuthorization")
    );
  }

  public reAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("TransbankService");
  }

  public capture(input: CaptureInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._callWSSecurityLambdaCapture(input, CaptureMethodEnum.KSH_CAPTURE)
      ),
      tag("TransbankService | capture")
    );
  }

  public validateAccount(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("TransbankService");
  }

  private _invokeToken(
    request: AurusTokenLambdaRequest
  ): Observable<TransbankTokenResponse> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () =>
            request.completeTransactionType ===
              WebpayIntegrationTypeEnum.REST ||
            request.completeTransactionType === WebpayIntegrationTypeEnum.MALL,
          this._lambda.invokeFunction<TransbankTokenResponse>(
            `usrv-card-transbank-${process.env.USRV_STAGE}-token`,
            this._buildTransbankTokenRequest(request)
          ),
          this._lambda.invokeFunction<TransbankTokenResponse>(
            `usrv-wssecurity-processor-${process.env.USRV_STAGE}-token`,
            this._buildTransbankTokenRequest(request)
          )
        )
      ),
      tag("TransbankService | _invokeToken")
    );
  }

  private _callWSSecurityLambdaCapture(
    input: CaptureInput,
    method: CaptureMethodEnum
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () =>
            get(
              input,
              this._completeTransactionTypePath,
              CompleteTransactionTypeEnum.SOAP
            ) === WebpayIntegrationTypeEnum.REST.toString() ||
            get(
              input,
              this._completeTransactionTypePath,
              CompleteTransactionTypeEnum.SOAP
            ) === WebpayIntegrationTypeEnum.MALL.toString(),
          this._invokeTransbankCapture(input),
          this._invokeWsSecurityCapture(input, method)
        )
      ),
      catchError((error: KushkiError | Error) => {
        if (error instanceof KushkiError)
          return this._buildCustomCaptureError(error, input);

        return throwError(() => new KushkiError(ERRORS.E047));
      }),
      map((response: { body: TransbankCaptureResponse }) =>
        this._parseTransbankCaptureResponse(response.body, input.transaction)
      ),
      tag("TransbankService | _callWSSecurityLambdaCapture")
    );
  }

  private _invokeTransbankCapture(
    input: CaptureInput
  ): Observable<{ body: TransbankCaptureResponse }> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: TransbankCaptureResponse }>(
          `usrv-card-transbank-${process.env.USRV_STAGE}-capture`,
          this._buildTransbankCaptureRequest(
            input,
            CardService.sFullAmount(<Amount>input.body.amount).toString()
          )
        )
      ),
      timeoutWith(
        UtilsService.getStaticProcesorTimeoutValue(
          ProcessorSsmKeyEnum.TRANSBANK
        ),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            this._mapTbkTimeoutError(this._buildCaptureRequest(input))
          )
        )
      ),
      tag("TransbankService | _invokeTransbankCapture")
    );
  }
  private _restMallMethod(
    input: ChargeInput,
    method: "kshPreAuthorization" | "kshCharge"
  ): Observable<{ body: TransbankChargeResponse }> {
    const method_transbank: string =
      method === "kshPreAuthorization" ? "preAuthorization" : "charge";

    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: TransbankChargeResponse }>(
          `usrv-card-transbank-${process.env.USRV_STAGE}-${method_transbank}`,
          this._buildEventChargeRequest(input)
        )
      ),
      catchError((error: KushkiError | Error) => {
        if (get(error, "code", "").includes("027"))
          return throwError(
            new KushkiError(
              ERRORS.E027,
              ERRORS.E027.message,
              this._mapTbkTimeoutError(this._buildEventChargeRequest(input))
            )
          );

        return throwError(error);
      }),
      timeoutWith(
        UtilsService.getStaticProcesorTimeoutValue(
          ProcessorSsmKeyEnum.TRANSBANK
        ),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            this._mapTbkTimeoutError(this._buildEventChargeRequest(input))
          )
        )
      ),
      tag("TransbankService | _restMallMethod")
    );
  }

  private _invokeWsSecurityCapture(
    input: CaptureInput,
    method: CaptureMethodEnum
  ): Observable<{ body: TransbankCaptureResponse }> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: TransbankCaptureResponse }>(
          `usrv-wssecurity-processor-${process.env.USRV_STAGE}-${method}`,
          {
            body: this._buildTransbankCaptureRequest(
              input,
              CardService.sFullAmount(<Amount>input.body.amount).toString()
            ),
          }
        )
      ),
      tag("TransbankService | _invokeWsSecurityCapture")
    );
  }

  private _buildCustomCaptureError(
    error: KushkiError,
    input: CaptureInput
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        if (get(error, "code", "").includes("600"))
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.TRANSBANK)
          );
        if (get(error, "code", "").includes("027"))
          return this._handleTbkTimeoutError(
            error,
            this._buildCaptureRequest(input)
          );

        return throwError(() => error);
      }),
      tag("TransbankService | _buildCustomCaptureError")
    );
  }

  private _callChargeOrPreauht(
    input: ChargeInput,
    method: "kshPreAuthorization" | "kshCharge"
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => {
        if (
          get(input, this._completeTransactionTypePath, "") ===
            WebpayIntegrationTypeEnum.REST.toString() ||
          get(input, this._completeTransactionTypePath, "") ===
            WebpayIntegrationTypeEnum.MALL.toString()
        )
          return this._restMallMethod(input, method);
        return this._soapMethod(input, method);
      }),
      catchError((error: KushkiError | Error) => {
        if (error instanceof KushkiError)
          return this._handleTbkErrorRequest(
            error,
            this._buildEventChargeRequest(input)
          );

        return throwError(() => new KushkiError(ERRORS.E047));
      }),
      map((response: { body: TransbankChargeResponse }) =>
        this._parseTransbankResponse(response.body, input)
      ),
      tag("TransbankService | _callChargeOrPreauht")
    );
  }

  private _processChargeOrPreauth(
    input: ChargeInput,
    method: "kshPreAuthorization" | "kshCharge"
  ): Observable<{ body: TransbankChargeResponse }> {
    return of(1).pipe(
      switchMap(() =>
        this._lambda.invokeFunction<{ body: TransbankChargeResponse }>(
          `usrv-wssecurity-processor-${process.env.USRV_STAGE}-${method}`,
          {
            body: this._buildEventChargeRequest(input),
          }
        )
      ),
      tag("TransbankService | _processChargeOrPreauth")
    );
  }

  private _soapMethod(
    input: ChargeInput,
    method: "kshPreAuthorization" | "kshCharge"
  ): Observable<{ body: TransbankChargeResponse }> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () => method === "kshCharge",
          this._processChargeOrPreauthWithTimeout(input, method),
          this._processChargeOrPreauth(input, method)
        )
      ),
      tag("TransbankService | _soapMethod")
    );
  }

  private _processChargeOrPreauthWithTimeout(
    input: ChargeInput,
    method: "kshPreAuthorization" | "kshCharge"
  ): Observable<{ body: TransbankChargeResponse }> {
    return of(1).pipe(
      switchMap(() => this._processChargeOrPreauth(input, method)),
      timeoutWith(
        UtilsService.getStaticProcesorTimeoutValue(
          ProcessorSsmKeyEnum.TRANSBANK
        ),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            this._mapTbkTimeoutError(this._buildEventChargeRequest(input))
          )
        )
      ),
      tag("TransbankService | _processChargeOrPreauthWithTimeout")
    );
  }

  private _buildTransbankTokenRequest(
    request: AurusTokenLambdaRequest
  ): TransbankTokenRequest {
    return {
      completeTransactionType: request.completeTransactionType,
      credentials: request.credentials,
      currency: get(request, "currency", ""),
      cvv: request.cvv,
      isCardValidation: request.isCardValidation,
      omitCVV: get(request, "omitCVV"),
      processorId: request.merchantId,
      referenceNumber: request.transactionReference,
      shareNumber: request.months,
      tokenType: get(request, "tokenType", TokenTypeEnum.TRANSACTION),
      totalAmount: request.totalAmount,
      vaultToken: request.vaultToken,
    };
  }

  private _buildTransbankCaptureRequest(
    input: CaptureInput,
    totalAmount: string
  ): TransbankCaptureRequest {
    const transbank_request: TransbankCaptureRequest = {
      totalAmount,
      completeTransactionType: get(
        input,
        this._completeTransactionTypePath,
        CompleteTransactionTypeEnum.SOAP
      ),
      credentials: get(input, "trxRuleResponse.body.credentials", {}),
      preAuthorizationId: input.transaction.transaction_id,
      privateMerchantId: input.processor.private_id,
      referenceNumber: get(input.transaction, "transaction_reference", ""),
    };

    if (input.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS)
      set(transbank_request, "transaction", input.transaction);

    return transbank_request;
  }

  private _parseTransbankCaptureResponse(
    response: TransbankCaptureResponse,
    transaction: Transaction
  ): AurusResponse {
    return {
      approved_amount: get(
        response,
        "approvedTransactionAmount",
        ""
      ).toString(),
      creditType: get(response, "creditType"),
      processor_transaction_id: "",
      purchase_number: "",
      recap: transaction.recap,
      response_code: response.responseCode,
      response_text: response.responseText,
      ticket_number: get(response, "ticketNumber", ""),
      transaction_details: {
        approvalCode: response.approvalCode,
        binCard: transaction.bin_card,
        cardHolderName: transaction.card_holder_name,
        cardType: get(transaction, "card_type", ""),
        conciliationId: "",
        isDeferred: "",
        lastFourDigitsOfCard: transaction.last_four_digits,
        merchantName: transaction.merchant_name,
        processorBankName: transaction.processor_bank_name,
        processorName: transaction.processor_name,
      },
      transaction_id: get(response, "transactionId", ""),
      transaction_reference: get(transaction, "transaction_reference", ""),
    };
  }

  private _parseTransbankResponse(
    chargeResponse: TransbankChargeResponse,
    input: ChargeInput
  ): AurusResponse {
    return {
      approved_amount: get(
        chargeResponse,
        "approvedTransactionAmount",
        ""
      ).toString(),
      creditType: get(chargeResponse, "creditType"),
      processor_transaction_id: get(chargeResponse, "processorTransactionId"),
      purchase_number: get(chargeResponse, "purchase_number"),
      recap: get(chargeResponse, "recap", ""),
      response_code: chargeResponse.responseCode,
      response_text: chargeResponse.responseText,
      ticket_number: chargeResponse.ticketNumber,
      transaction_details: {
        approvalCode: chargeResponse.approvalCode,
        binCard: get(chargeResponse, "binCard", ""),
        cardHolderName: get(input, "currentToken.cardHolderName", ""),
        cardType: get(chargeResponse, "cardType", ""),
        conciliationId: chargeResponse.conciliationId,
        isDeferred: chargeResponse.isDeferred,
        lastFourDigitsOfCard: input.currentToken.lastFourDigits,
        merchantName: input.currentMerchant.merchant_name,
        processorBankName: get(
          chargeResponse,
          "processorBankName",
          get(input, "processor.acquirer_bank", "")
        ),
        processorName: input.processor.processor_name,
      },
      transaction_id: chargeResponse.transactionId,
      transaction_reference: input.currentToken.transactionReference,
    };
  }

  private _buildEventChargeRequest(
    input: ChargeInput
  ): TransbankFullChargeRequest {
    const is_subscription_validation: boolean = get(
      input,
      "event.metadata.ksh_subscriptionValidation",
      false
    );
    let months = get(input, "event.months");

    if (!months) months = get(input, "event.deferred.months", undefined);
    return {
      card: {
        currency: <string>input.amount.currency,
        cvv: get(input, "cvv"),
        processorId: input.processor.public_id,
        referenceNumber: input.currentToken.transactionReference,
        shareNumber: months,
        totalAmount: CardService.sFullAmount(input.amount),
      },
      completeTransactionType: get(
        input,
        this._completeTransactionTypePath,
        ""
      ),
      credentials: get(input, "trxRuleResponse.body.credentials", {}),
      extraInfo: {
        binCard: input.currentToken.bin,
        brand: get(input, "currentToken.binInfo.brand", ""),
        cardHolderName: get(input, "currentToken.cardHolderName", ""),
        cardType: defaultTo(
          get(input, "currentToken.binInfo.info.type", ""),
          "credit"
        ).toUpperCase(),
        lastFourDigitsOfCard: get(input, "currentToken.lastFourDigits", ""),
        merchantName: input.currentMerchant.merchant_name,
        processorBankName: get(input, "processor.acquirer_bank", ""),
      },
      gracePeriod: has(input, "event.deferred.graceMonths"),
      isCardValidation: is_subscription_validation,
      omitCVV: get(input, "trxRuleResponse.body.omitCVV"),
      privateMerchantId: input.processor.private_id,
      tokenType: Boolean(get(input, "currentToken.tokenType"))
        ? <TokenType>input.currentToken.tokenType
        : TokenTypeEnum.TRANSACTION,
      vaultToken: `${input.currentToken.vaultToken}`,
    };
  }

  private _buildCaptureRequest(
    input: CaptureInput
  ): TransbankFullChargeRequest {
    return {
      card: {
        currency: get(input, "body.amount.currency", ""),
        processorId: get(input, "processor.public_id", ""),
        referenceNumber: get(input, "transaction.transaction_reference", ""),
        totalAmount: CardService.sFullAmount(<Amount>input.body.amount),
      },
      extraInfo: {
        binCard: get(input, "transaction.bin_card", ""),
        brand: get(input, "transaction.payment_brand", ""),
        cardHolderName: get(input, "transaction.card_holder_name", ""),
        cardType: defaultTo(
          input.transaction.card_type,
          "credit"
        ).toUpperCase(),
        lastFourDigitsOfCard: get(input, "transaction.last_four_digits", ""),
        merchantName: get(input, "transaction.merchant_name", ""),
        processorBankName: get(input, "transaction.processor_bank_name", ""),
      },
      privateMerchantId: get(input, "processor.private_id", ""),
      tokenType: TokenTypeEnum.TRANSACTION,
      transactionReference: get(input, "transaction.transaction_reference", ""),
      transactionStatus: TransactionStatusEnum.PENDING,
      vaultToken: "",
    };
  }

  // istanbul ignore next
  private _handleTbkErrorRequest(
    error: KushkiError,
    req: TransbankFullChargeRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        if (get(error, "message", "").includes("600"))
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.TRANSBANK)
          );
        if (get(error, "message", "").includes("027")) {
          set(
            req,
            "transactionReference",
            get(req, "card.referenceNumber", "")
          );
          set(req, "transactionStatus", TransactionStatusEnum.PENDING);
          return this._handleTbkTimeoutError(error, req);
        }

        return throwError(() => error);
      }),
      tag("TransbankService | _handleErrorRequest")
    );
  }

  private _handleTbkTimeoutError(
    error: KushkiError,
    req: TransbankFullChargeRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.put(
          req,
          UtilsService.getTimeoutProcessorTransactionsTable(
            ProcessorSsmKeyEnum.TRANSBANK
          )
        )
      ),
      mergeMap(() =>
        throwError(
          MapperService.buildAurusError(error, ProcessorEnum.TRANSBANK)
        )
      ),
      tag("TransbankService | _handleTbkTimeoutError")
    );
  }

  private _mapTbkTimeoutError(
    tbkRequest: TransbankFullChargeRequest
  ): AurusResponse {
    return {
      approved_amount: "",
      processor_code: "228",
      recap: "",
      response_code: "228",
      response_text: "Procesador inalcanzable",
      response_time: "",
      ticket_number: "",
      transaction_details: this._buildTransactionDetails(tbkRequest),
      transaction_id: `88${Microtime.now()}`,
      transaction_reference: "",
    };
  }

  private _buildTransactionDetails(
    tbkRequest: TransbankFullChargeRequest
  ): TransactionDetails {
    return {
      approvalCode: "000000",
      binCard: get(tbkRequest, "extraInfo.binCard"),
      cardHolderName: get(tbkRequest, "extraInfo.cardHolderName"),
      cardType: get(tbkRequest, "extraInfo.brand"),
      conciliationId: "",
      isDeferred: get(tbkRequest, "card.shareNumber", 0) > 0 ? "Y" : "N",
      lastFourDigitsOfCard: get(tbkRequest, "extraInfo.lastFourDigitsOfCard"),
      merchantName: get(tbkRequest, "extraInfo.merchantName"),
      processorBankName: get(tbkRequest, "extraInfo.processorBankName", ""),
      processorName: ProcessorEnum.TRANSBANK,
    };
  }

  private _invokeBuildRequestCommissionCharge(
    request: ChargeInput
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-transbank-${process.env.USRV_STAGE}-charge`,
          this._buildRequestTransbank(request)
        )
      ),
      catchError((error: KushkiError | Error) => this._handleError(error)),
      tag("TransbankService | charge")
    );
  }

  private _handleError(error: KushkiError | Error): Observable<never> {
    if (error instanceof KushkiError)
      return of(1).pipe(
        mergeMap(() => {
          const code: string = get(error, "code", "");

          if (code.includes("500") || code.includes("600"))
            return throwError(
              MapperService.buildAurusError(error, ProcessorEnum.TRANSBANK)
            );

          return throwError(() => error);
        }),
        tag("TransbankService | _handleError")
      );

    return throwError(() => error);
  }

  private _buildRequestTransbank(input: ChargeInput): TransbankChargeRequest {
    return {
      chargeRequest: {
        currency: get(input.amount, "amount.currency", CurrencyEnum.CLP),
        gracePeriod: false,
        referenceNumber: get(input, "currentToken.transactionReference"),
        shareNumber: get(input, "amount.totalAmount"),
        totalAmount: get(input, "amount.totalAmount", 0),
      },
      merchantId: get(input, "currentMerchant.public_id"),
      merchantName: get(input, "currentMerchant.merchant_name"),
      processorId: get(input, "trxRuleResponse.body.processor"),
      tokenVault: get(input, "currentToken.vaultToken", ""),
    };
  }
}
