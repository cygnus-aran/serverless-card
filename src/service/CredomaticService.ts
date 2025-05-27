// jscpd:ignore-start
import { IDENTIFIERS as CORE, ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { get, set } from "lodash";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ICredomaticService } from "repository/IProviderService";
import { Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mergeMap, timeoutWith } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { MapperService } from "service/MapperService";
import { UtilsService } from "service/UtilsService";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { CredomaticCaptureRequest } from "types/credomatic_capture_request";
import { CredomaticChargeRequest } from "types/credomatic_charge_request";
import { CredomaticPreAuthRequest } from "types/credomatic_pre_auth_request";
import { TokensCardResponse } from "types/tokens_card_response";
// jscpd:ignore-end

// jscpd:ignore-start
@injectable()
export class CredomaticService implements ICredomaticService {
  public variant: CardProviderEnum.CREDOMATIC = CardProviderEnum.CREDOMATIC;
  private readonly _lambda: ILambdaGateway;
  private readonly _dynamo: IDynamoGateway;
  private readonly _aurus: ICardGateway;

  constructor(
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(IDENTIFIERS.CardGateway) aurus: ICardGateway
  ) {
    this._dynamo = storage;
    this._lambda = lambda;
    this._aurus = aurus;
  }
  // jscpd:ignore-end

  // jscpd:ignore-start
  public tokens(
    request: AurusTokenLambdaRequest
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      // TODO: invoke aurus token for business (action:route) rules
      mergeMap(() => this._aurus.getAurusToken(request)),
      catchError(() => UtilsService.tokenGenerator("CredomaticService")),
      tag("CredomaticService | tokens")
    );
  }
  // jscpd:ignore-end

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          `${process.env.CREDOMATIC_CHARGE_LAMBDA}`,
          {
            ...(<CredomaticChargeRequest>this._buildRequestCredomatic(request)),
          }
        )
      ),
      timeoutWith(
        Number(`${process.env.CREDOMATIC_TIME_OUT}`),
        this._timeoutError(request)
      ),
      catchError((error: KushkiError | Error) => {
        if (error instanceof KushkiError)
          return this._handleErrorRequest(
            error,
            <CredomaticChargeRequest>this._buildRequestCredomatic(request)
          );

        return throwError(() => error);
      }),
      tag("CredomaticService | charge")
    );
  }

  public capture(captureRequest: CaptureInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-credomatic-${process.env.USRV_STAGE}-capture`,
          this._buildCaptureRequest(captureRequest)
        )
      ),
      timeoutWith(
        Number(`${process.env.CREDOMATIC_TIME_OUT}`),
        throwError(
          new KushkiError(
            ERRORS.E027,
            ERRORS.E027.message,
            MapperService.mapperInternalServerErrorResponse(
              this._buildCaptureRequest(captureRequest),
              ProcessorEnum.CREDOMATIC
            )
          )
        )
      ),
      catchError((error: KushkiError | Error) => {
        if (error instanceof KushkiError)
          return this._handleErrorRequest(
            error,
            this._buildCaptureRequest(captureRequest)
          );

        return throwError(() => error);
      }),
      tag("CredomaticService | capture")
    );
  }

  public preAuthorization(
    preAuthRequest: ChargeInput
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<AurusResponse>(
          `usrv-card-credomatic-${process.env.USRV_STAGE}-preAuthorization`,
          {
            ...this._buildRequestCredomatic(preAuthRequest),
          }
        )
      ),
      timeoutWith(
        Number(`${process.env.CREDOMATIC_TIME_OUT}`),
        this._timeoutError(preAuthRequest)
      ),
      catchError((error: KushkiError | Error) => {
        if (error instanceof KushkiError)
          return this._handleErrorRequest(
            error,
            this._buildRequestCredomatic(preAuthRequest)
          );

        return throwError(() => error);
      }),
      tag("CredomaticService | preAuthorization")
    );
  }

  public reAuthorization(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("CredomaticService");
  }

  public validateAccount(_request: undefined): Observable<never> {
    return UtilsService.triggerNotSupportMethodError("CredomaticService");
  }

  private _handleErrorRequest(
    error: KushkiError,
    req:
      | CredomaticChargeRequest
      | CredomaticPreAuthRequest
      | CredomaticCaptureRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        if (
          get(error, "code", "").includes("500") ||
          get(error, "code", "").includes("600")
        )
          return throwError(
            MapperService.buildAurusError(error, ProcessorEnum.CREDOMATIC)
          );
        if (get(error, "code", "").includes("027"))
          return this._manageTimeOutError(error, req);

        return throwError(() => error);
      }),
      tag("CredomaticService | _handleErrorRequest")
    );
  }

  private _manageTimeOutError(
    error: KushkiError,
    req:
      | CredomaticPreAuthRequest
      | CredomaticChargeRequest
      | CredomaticCaptureRequest
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        set(req, "config.region", `${process.env.AWS_REGION}`);
        set(req, "transactionStatus", TransactionStatusEnum.DECLINED);
        return this._dynamo.put(req, TABLES.credomatic_timed_out_trx);
      }),
      mergeMap(() =>
        throwError(
          MapperService.buildAurusError(error, ProcessorEnum.CREDOMATIC)
        )
      ),
      tag("CredomaticService | _manageTimeOutError")
    );
  }

  private _timeoutError(request: ChargeInput): Observable<never> {
    return throwError(
      new KushkiError(
        ERRORS.E027,
        ERRORS.E027.message,
        MapperService.mapperInternalServerErrorResponse(
          this._buildRequestCredomatic(request),
          ProcessorEnum.CREDOMATIC
        )
      )
    );
  }

  private _buildRequestCredomatic(
    input: ChargeInput
  ): CredomaticPreAuthRequest | CredomaticChargeRequest {
    const is_subscription_validation: boolean = get(
      input,
      "event.metadata.ksh_subscriptionValidation",
      false
    );
    const is_subscription: boolean =
      Boolean(input.event.usrvOrigin === UsrvOriginEnum.SUBSCRIPTIONS) &&
      !is_subscription_validation;
    const request: CredomaticChargeRequest = {
      acquirerBank: get(input, "processor.acquirer_bank", ""),
      address: input.address,
      amount: input.amount,
      card: {
        bin: get(input, "currentToken.bin", ""),
        brand: get(input, "currentToken.binInfo.brand", ""),
        holderName: get(input, "currentToken.cardHolderName", ""),
        lastFourDigits: get(input, "currentToken.lastFourDigits", ""),
        maskedCardNumber: get(input, "currentToken.maskedCardNumber", ""),
        months: get(input.event, "months", get(input.event, "deferred.months")),
      },
      country: get(input, "currentMerchant.country", "NA"),
      isDeferred: get(input, "currentToken.isDeferred", false),
      merchantId: get(input, "currentMerchant.public_id", ""),
      merchantName: get(input, "currentMerchant.merchant_name", ""),
      postalCode: input.postalCode,
      processorId: input.processor.public_id,
      processorType: get(input, "processor.processor_type", ""),
      subscription: is_subscription,
      terminalId: get(input, "processor.terminal_id", ""),
      tokenType: input.tokenType,
      transactionReference: input.currentToken.transactionReference,
      vaultToken: get(input, "currentToken.vaultToken", ""),
    };

    UtilsService.add3DSFields(
      input,
      request,
      get(input, "currentToken.3ds.detail.specificationVersion")
    );

    if (input.event.usrvOrigin.includes(UsrvOriginEnum.SUBSCRIPTIONS)) {
      set(request, "card.months", 0);
      set(request, "isDeferred", false);
      set(request, "subscription", true);
    }

    if (input.event.usrvOrigin.includes(UsrvOriginEnum.COMMISSION))
      delete request.postalCode;

    return request;
  }

  private _buildCaptureRequest(
    captureInput: CaptureInput
  ): CredomaticCaptureRequest {
    return {
      amount: get(captureInput, "body.amount", {
        subtotalIva: 0,
        subtotalIva0: 0,
        iva: 0,
      }),
      country: get(captureInput, "merchantCountry", "NA"),
      preauthTransactionReference: get(
        captureInput,
        "transaction.transaction_reference",
        ""
      ),
      transactionReference: get(captureInput, "trxReference", ""),
    };
  }
}
