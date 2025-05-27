/**
 * Sandbox Service Implementation.
 */
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { inject, injectable } from "inversify";
import { get } from "lodash";
import { ISandboxService } from "repository/IProviderService";
import { ISandboxGateway } from "repository/ISandboxGateway";
import { Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { mergeMap } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { UtilsService } from "service/UtilsService";
import { Amount } from "types/amount";
import { AuthorizerContext } from "types/authorizer_context";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { AurusResponse } from "types/sandbox_charge_response";
import { SandboxTokenLambdaRequest } from "types/sandbox_token_lambda_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { v4 } from "uuid";

@injectable()
export class SandboxService implements ISandboxService {
  public variant: CardProviderEnum.SANDBOX = CardProviderEnum.SANDBOX;
  private readonly _sandbox: ISandboxGateway;

  constructor(
    @inject(IDENTIFIERS.SandboxGateway) sandboxGateway: ISandboxGateway
  ) {
    this._sandbox = sandboxGateway;
  }

  public tokens(
    request: SandboxTokenLambdaRequest
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._sandbox.tokensTransaction(
          request.body,
          request.mid,
          request.tokenType,
          request.processorName
        )
      ),
      tag("SandboxService | tokens")
    );
  }

  public preAuthorization(request: ChargeInput): Observable<AurusResponse> {
    return this._handleCharge(request);
  }

  public reAuthorization(
    amount: Amount,
    _: AuthorizerContext,
    request: Transaction
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._sandbox.reauthTransaction({
          currency_code: <CurrencyEnum>request.currency_code,
          language_indicator: "es",
          merchant_identifier: request.merchant_id,
          ticket_number: request.ticket_number,
          transaction_amount: {
            ICE: "0.00",
            IVA: amount.iva.toFixed(2).toString(),
            Subtotal_IVA: amount.subtotalIva.toFixed(2).toString(),
            Subtotal_IVA0: amount.subtotalIva0.toFixed(2).toString(),
            Total_amount: UtilsService.calculateFullAmount(amount)
              .toFixed(2)
              .toString(),
          },
          transaction_reference: v4(),
        })
      ),
      tag("SandboxService | reAuthorization")
    );
  }

  public charge(request: ChargeInput): Observable<AurusResponse> {
    return this._handleCharge(request);
  }

  public capture(request: CaptureInput): Observable<AurusResponse> {
    return this._handleCapture(request);
  }

  public validateAccount(
    _: AuthorizerContext,
    request: SandboxAccountValidationRequest
  ): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() => this._sandbox.validateAccountTransaction(request)),
      tag("SandboxService | validateAccount")
    );
  }

  private _handleCapture(request: CaptureInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._sandbox.captureTransaction(
          request.body,
          request.transaction,
          request.merchantId
        )
      ),
      tag("SandboxService | capture")
    );
  }

  private _handleCharge(request: ChargeInput): Observable<AurusResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._sandbox.chargesTransaction(
          request.event,
          request.processor.private_id,
          request.currentToken.transactionReference,
          request.plccInfo.flag,
          request.currentToken,
          get(request, "currentMerchant.country", ""),
          request.processor.processor_name
        )
      ),
      tag("SandboxService | charge")
    );
  }
}
