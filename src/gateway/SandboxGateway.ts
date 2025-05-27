import {
  AurusError,
  IDENTIFIERS as CORE_ID,
  ILambdaGateway,
} from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import { get, set } from "lodash";
import { parseFullName } from "parse-full-name";
import { ICardGateway } from "repository/ICardGateway";
import { ISandboxGateway } from "repository/ISandboxGateway";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { map, mergeMap, switchMap } from "rxjs/operators";
import { UtilsService } from "service/UtilsService";
import { AurusAmount } from "types/aurus_amount";
import { AurusCaptureRequest } from "types/aurus_capture_request";
import { AurusChargesRequest } from "types/aurus_charges_request";
import { AurusResponse } from "types/aurus_response";
import { AurusTokensRequest } from "types/aurus_tokens_request";
import { CaptureCardRequest } from "types/capture_card_request";
import { Currency } from "types/charges_card_request";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { SandboxChargeResponse } from "types/sandbox_charge_response";
import { SandboxTokensResponse } from "types/sandbox_tokens_response";
import { SandboxValues } from "types/sandbox_values";
import { CardToken, TokensCardRequest } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";

/**
 * Aurus SandBox Gateway Implementation
 */

type SandboxChargesRequest = AurusChargesRequest & { country: string };

@injectable()
export class SandboxGateway implements ISandboxGateway {
  private readonly _processEmail: string = "dev@kushkipagos.com";
  private readonly _lambda: ILambdaGateway;
  private readonly _aurusGtw: ICardGateway;

  constructor(
    @inject(CORE_ID.LambdaGateway) sandbox: ILambdaGateway,
    @inject(IDENTIFIERS.CardGateway) aurus: ICardGateway
  ) {
    this._lambda = sandbox;
    this._aurusGtw = aurus;
  }

  public chargesTransaction(
    body: UnifiedChargesPreauthRequest,
    mid: string,
    trxReference: string,
    plcc: string,
    tokenInfo: DynamoTokenFetch,
    merchantCountry: string,
    processorName: string
  ): Observable<AurusResponse> {
    return this._buildChargeParams(
      body,
      mid,
      trxReference,
      plcc,
      tokenInfo,
      processorName
    ).pipe(
      map((request: AurusChargesRequest) => ({
        ...request,
        country: merchantCountry,
      })),
      switchMap((request: SandboxChargesRequest) =>
        this._lambda.invokeFunction<SandboxChargeResponse>(
          `${process.env.CHARGE_SANDBOX}`,
          {
            body: { ...request },
          }
        )
      ),
      switchMap((chargeResponse: SandboxChargeResponse) =>
        this._getResponse(chargeResponse, body.metadata)
      ),
      tag("SandBox Gateway | chargesTransaction")
    );
  }

  public captureTransaction(
    body: CaptureCardRequest,
    transaction: Transaction,
    merchantId: string
  ): Observable<AurusResponse> {
    return this._buildCaptureParams(body, transaction, merchantId).pipe(
      switchMap((request: AurusCaptureRequest) =>
        this._lambda.invokeFunction<SandboxChargeResponse>(
          `${process.env.CAPTURE_SANDBOX}`,
          {
            body: { ...request },
          }
        )
      ),
      switchMap((chargeResponse: SandboxChargeResponse) =>
        this._getResponse(chargeResponse, body.metadata)
      ),
      tag("SandBox Gateway | captureTransaction")
    );
  }

  public tokensTransaction(
    body: CardToken,
    mid: string,
    tokenType: string,
    processorName: string
  ): Observable<TokensCardResponse> {
    return SandboxGateway._buildTokensRequest(
      body,
      mid,
      tokenType,
      processorName
    ).pipe(
      switchMap((request: AurusTokensRequest) =>
        this._lambda.invokeFunction<SandboxTokensResponse>(
          `${process.env.TOKEN_SANDBOX}`,
          {
            body: { ...request },
          }
        )
      ),
      switchMap((response: SandboxTokensResponse) =>
        iif(
          () => response.body.transaction_token.length === 0,
          throwError(
            new AurusError(
              response.body.response_code,
              response.body.response_text
            )
          ),
          of({ token: response.body.transaction_token })
        )
      ),
      tag("SandBox Gateway | tokensTransaction")
    );
  }

  public reauthTransaction(
    request: AurusCaptureRequest
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => {
        const sandbox_values: SandboxValues = UtilsService.getSandboxValues();

        return this._lambda.invokeFunction<SandboxChargeResponse>(
          `${sandbox_values.REAUTHORIZATION}`,
          {
            body: { ...request },
          }
        );
      }),
      switchMap((chargeResponse: SandboxChargeResponse) =>
        this._getResponse(chargeResponse, undefined)
      ),
      tag("SandBox Gateway | reauthTransaction")
    );
  }

  public validateAccountTransaction(
    request: SandboxAccountValidationRequest
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => {
        const sandbox_values: SandboxValues = UtilsService.getSandboxValues();

        return this._lambda.invokeFunction<SandboxChargeResponse>(
          `${sandbox_values.VALIDATE_ACCOUNT}`,
          {
            body: { ...request.body },
          }
        );
      }),
      switchMap((chargeResponse: SandboxChargeResponse) =>
        this._getResponse(chargeResponse, undefined)
      ),
      tag("SandBox Gateway | validateAccountTransaction")
    );
  }

  private _getResponse(
    chargeResponse: SandboxChargeResponse,
    trxMetadata: object | undefined
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        iif(
          () => chargeResponse.body.ticket_number.length === 0,
          of(1).pipe(
            mergeMap(() => {
              const metadata: object = {
                approved_amount: chargeResponse.body.approved_amount,
                processorCode: get(chargeResponse.body, "processor_code", ""),
                processorName: get(chargeResponse.body, "processor_name", ""),
                response_code: chargeResponse.body.response_code,
                response_text: chargeResponse.body.response_text,
                ticket_number: chargeResponse.body.ticket_number,
                transaction_details: chargeResponse.body.transaction_details,
                transaction_id: chargeResponse.body.transaction_id,
              };

              if (Boolean(trxMetadata)) set(metadata, "metadata", trxMetadata);

              const aurus_error: AurusError = new AurusError(
                chargeResponse.body.response_code,
                chargeResponse.body.response_text,
                metadata
              );

              return throwError(aurus_error);
            })
          ),
          of(1).pipe(map(() => chargeResponse.body))
        )
      ),
      tag("SandBox Gateway | _getResponse")
    );
  }

  private _buildCaptureParams(
    body: CaptureCardRequest,
    transaction: Transaction,
    merchantId: string
  ): Observable<AurusCaptureRequest> {
    let currency: Currency = <Currency>transaction.currency_code;

    if (body.amount !== undefined && body.amount.currency !== undefined)
      currency = body.amount.currency;

    return iif(
      () => body.amount !== undefined,
      this._aurusGtw.buildAurusAmount(
        <Required<CaptureCardRequest>>body,
        transaction.processor_id
      ),
      of(undefined)
    ).pipe(
      map((amount: AurusAmount | undefined) => ({
        currency_code: currency,
        language_indicator: "es",
        merchant_identifier: merchantId,
        metadata: body.metadata,
        ticket_number: body.ticketNumber,
        transaction_amount:
          // istanbul ignore next
          amount === undefined
            ? {
                ICE:
                  transaction.ice_value !== undefined
                    ? transaction.ice_value.toFixed(2).toString()
                    : "0.00",
                IVA: transaction.iva_value.toString(),
                Subtotal_IVA: transaction.subtotal_iva.toString(),
                Subtotal_IVA0: transaction.subtotal_iva0.toFixed(2).toString(),
                Total_amount: transaction.approved_transaction_amount
                  .toFixed(2)
                  .toString(),
              }
            : amount,
        transaction_reference: transaction.transaction_reference,
      }))
    );
  }

  private static _buildTokensRequest(
    body: TokensCardRequest,
    mid: string,
    tokenType: string,
    processorName: string
  ): Observable<AurusTokensRequest> {
    let currency: string = "USD";

    const deferred: string = get(body, "isDeferred", false) ? "1" : "0";

    if (body.currency !== undefined) currency = body.currency;

    if (SandboxGateway._validateCard(body))
      body.card.expiryMonth = `0${body.card.expiryMonth}`;
    const params: AurusTokensRequest = {
      card: {
        card_present: "1",
        expiry_month: body.card.expiryMonth,
        expiry_year: body.card.expiryYear,
        name: body.card.name,
        number: body.card.number,
      },
      currency_code: currency,
      deferred_payment: deferred,
      language_indicator: "es",
      merchant_identifier: mid,
      remember_me: "0",
      token_type: `${tokenType}-token`,
    };

    if (tokenType === "transaction")
      params.amount = body.totalAmount.toFixed(2);
    if (body.card.cvv !== undefined && body.card.cvv !== null)
      params.card.cvv = body.card.cvv;
    set(params, "processorName", processorName);

    return of(params);
  }

  private _buildChargeParams(
    body: UnifiedChargesPreauthRequest,
    mid: string,
    trxId: string,
    plcc: string,
    tokenInfo: DynamoTokenFetch,
    processorName: string
  ): Observable<AurusChargesRequest> {
    let currency: Currency = CurrencyEnum.USD;

    if (body.amount.currency !== undefined) currency = body.amount.currency;

    return this._aurusGtw.buildAurusAmount(body, mid, tokenInfo.amount).pipe(
      map((amount: AurusAmount) => {
        const aurus_charge_request: AurusChargesRequest = {
          plcc,
          currency_code: currency,
          language_indicator: "es",
          merchant_identifier: mid,
          transaction_amount: amount,
          transaction_reference: trxId,
          transaction_token: body.tokenId,
        };

        if (currency === CurrencyEnum.PEN) {
          const charges_names: object = this._getdetailNames(
            tokenInfo.cardHolderName
          );

          aurus_charge_request.email = this._processEmail;
          aurus_charge_request.name = get(charges_names, "name", "NA");
          aurus_charge_request.lastname = get(charges_names, "lastname", "NA");
        }

        if (get(body, "usrvOrigin", "").includes(UsrvOriginEnum.COMMISSION))
          SandboxGateway._checkProcessor(
            aurus_charge_request,
            body,
            processorName
          );

        if (body.metadata !== undefined)
          aurus_charge_request.metadata = body.metadata;

        return aurus_charge_request;
      })
    );
  }

  private static _checkProcessor(
    aurusChargeRequest: AurusChargesRequest,
    body: UnifiedChargesPreauthRequest,
    processorName: string
  ): void {
    if (processorName !== ProcessorEnum.MCPROCESSOR) return;

    aurusChargeRequest.name = get(body, "contactDetails.firstName");
    aurusChargeRequest.lastname = get(body, "contactDetails.lastName");
    aurusChargeRequest.email = get(body, "contactDetails.email");
  }

  private static _validateCard(body: TokensCardRequest): boolean {
    return (
      body.card.expiryMonth.length === 1 &&
      parseInt(body.card.expiryMonth, 36) < 10 &&
      parseInt(body.card.expiryMonth, 36) > 0
    );
  }

  private _getdetailNames(fullName: string | undefined): object {
    if (fullName === undefined) return {};

    const detail_names: object = parseFullName(String(fullName));

    const middlename: string[] = get(detail_names, "middle", "").split(" ");

    if (middlename.length > 1) set(detail_names, "last", middlename[1]);

    return {
      lastname: get(detail_names, "last"),
      name: get(detail_names, "first"),
    };
  }
}
