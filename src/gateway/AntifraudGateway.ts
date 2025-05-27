/**
 * Antifraud Gateway File
 */
import { Tracer } from "@aws-lambda-powertools/tracer";
import { IAxiosGateway, IDENTIFIERS as CORE, KushkiError } from "@kushki/core";
import { AxiosError } from "axios";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import {
  AntiFraudErrorEnum,
  ErrorResponseTextEnum,
  ERRORS,
} from "infrastructure/ErrorEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, set } from "lodash";
import "reflect-metadata";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  concatMap,
  map,
  mapTo,
  mergeMap,
  switchMap,
} from "rxjs/operators";
import { Products } from "types/charges_card_request";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import { SiftScienceWorkflowsRequest } from "types/sift_science_workflows_request";
import { SiftScienceWorkflowsResponse } from "types/sift_science_workflows_response";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";

/**
 * Antifraud Gateway Implementation
 */
@injectable()
export class AntifraudGateway implements IAntifraudGateway {
  private readonly _axios: IAxiosGateway;
  private readonly _tracer: Tracer;

  constructor(
    @inject(CORE.AxiosGateway) axios: IAxiosGateway,
    @inject(CORE.Tracer) tracer: Tracer
  ) {
    this._tracer = tracer;
    this._axios = axios;
  }

  public request<T extends object = object>(
    body: object,
    method: "POST" | "post" | "GET" | "get",
    qs?: object
  ): Observable<T> {
    return of(1).pipe(
      switchMap(() =>
        this._axios.request<T>({
          method,
          data: body,
          params: qs,
          responseType: "json",
          url: `${process.env.SIFT_SCIENCE_API}`,
        })
      ),
      tag("Antifraud Gateway | request")
    );
  }

  public requestGet<T extends object = object>(
    auth: object,
    accountId: string,
    decisionId: string
  ): Observable<T> {
    return of(1).pipe(
      switchMap(() =>
        this._axios.request<T>({
          auth: {
            password: "",
            username: get(auth, "user", ""),
          },
          method: "get",
          responseType: "json",
          url: `${process.env.SIFT_SCIENCE_DECISION_API}${accountId}/decisions/${decisionId}`,
        })
      ),
      tag("Antifraud Gateway | requestGet")
    );
  }

  public getWorkflows(
    merchant: DynamoMerchantFetch,
    tokenInfo: Required<DynamoTokenFetch>,
    chargeBody: UnifiedChargesPreauthRequest
  ): Observable<SiftScienceWorkflowsResponse> {
    return of(1).pipe(
      map(() => {
        const sift_science_api_key: string =
          AntifraudGateway._getSiftScienceKey(merchant);
        let body: SiftScienceWorkflowsRequest = {
          $address_2: defaultTo(
            get(chargeBody, "orderDetails.shippingDetails.secondaryAddress"),
            get(chargeBody, "orderDetails.billingDetails.secondaryAddress")
          ),
          $amount: tokenInfo.amount * 1000000,
          $api_key: sift_science_api_key,
          $category: get(chargeBody, "productDetails.product[0].category"),
          $currency_code: tokenInfo.currency,
          $order_id: tokenInfo.transactionReference,
          $payment_methods: [
            {
              $card_bin: tokenInfo.bin,
              $card_last4: tokenInfo.lastFourDigits,
              $payment_type: "$credit_card",
            },
          ],
          $seller_user_id: get(chargeBody, "sellerUserId"),
          $session_id: tokenInfo.sessionId,
          $tags: get(chargeBody, "productDetails.product[0].tags"),
          $type: "$create_order",
          $user_email: defaultTo(
            get(chargeBody, "orderDetails.shippingDetails.userEmail"),
            get(chargeBody, "orderDetails.billingDetails.userEmail")
          ),
          $user_id: tokenInfo.userId,
        };

        body = this._addExtraProperties(body, chargeBody);

        return body;
      }),
      concatMap((body: SiftScienceWorkflowsRequest) =>
        this.request<SiftScienceWorkflowsResponse>(body, "POST", {
          return_workflow_status: true,
        })
      ),
      catchError((err: Error | AxiosError) => this._validateFlowError(err)),
      map((response: SiftScienceWorkflowsResponse) => {
        if (
          response.score_response !== undefined &&
          response.score_response.workflow_statuses !== undefined
        )
          for (const workflow of response.score_response.workflow_statuses)
            if (workflow.state === "failed") throw new KushkiError(ERRORS.E020);

        if (
          response.score_response !== undefined &&
          response.score_response.status !== undefined &&
          response.score_response.status !== 0 // Any other status number means error in siftScience with statusCode 200
        )
          return this.siftWorkflowGenericAnswer();

        return response;
      }),
      tag("Antifraud Gateway | getWorkflows")
    );
  }

  public transaction(
    merchant: DynamoMerchantFetch,
    tokenInfo: DynamoTokenFetch,
    ticketNumber: string
  ): Observable<boolean> {
    const sift_science_api_key: string =
      AntifraudGateway._getSiftScienceKey(merchant);

    return of(1).pipe(
      concatMap(() =>
        this.request(
          {
            $amount: tokenInfo.amount * 1000000,
            $api_key: sift_science_api_key,
            $currency_code:
              tokenInfo.currency === CurrencyEnum.UF
                ? CurrencyEnum.CLP
                : tokenInfo.currency,
            $order_id: tokenInfo.transactionReference,
            $session_id: tokenInfo.sessionId,
            $transaction_id: ticketNumber,
            $type: "$transaction",
            $user_id: tokenInfo.userId,
          },
          "POST"
        )
      ),
      catchError(() => of(true)),
      mapTo(true),
      tag("Antifraud Gateway | transaction")
    );
  }

  public getDecision(
    merchant: DynamoMerchantFetch,
    decisionId: string
  ): Observable<SiftScienceDecisionResponse> {
    const sift_science_api_key: string =
      AntifraudGateway._getSiftScienceKey(merchant);

    return of(1).pipe(
      concatMap(() =>
        this.requestGet<SiftScienceDecisionResponse>(
          { user: sift_science_api_key },
          process.env.USRV_STAGE === "primary" ||
            process.env.USRV_STAGE === "stg"
            ? `${merchant.sift_science.ProdAccountId}`
            : `${merchant.sift_science.SandboxAccountId}`,
          `${decisionId}`
        )
      ),
      catchError((err: Error) =>
        of(1).pipe(switchMap(() => of(this.getGenericDecision(err.message))))
      ),
      tag("AntifraudGateway | getDecision")
    );
  }

  public siftWorkflowGenericAnswer(
    errorMessage?: string
  ): SiftScienceWorkflowsResponse {
    return {
      error_message: errorMessage === undefined ? "OK" : errorMessage,
      request: "request",
      score_response: {
        scores: {
          payment_abuse: {
            score: 0,
          },
        },
        workflow_statuses: [
          {
            config_display_name: "displayName",
            history: [
              {
                app: "generic",
                name: "generic",
              },
            ],
          },
        ],
      },
      status: 1,
      time: 1,
    };
  }

  public getGenericDecision(errorMessage: string): SiftScienceDecisionResponse {
    return {
      description: errorMessage,
      id: "",
      name: "",
      type: "green",
    };
  }

  private _addExtraProperties(
    bodyRequest: SiftScienceWorkflowsRequest,
    chargeBody: UnifiedChargesPreauthRequest
  ): SiftScienceWorkflowsRequest {
    const sift_product: {
      $item_id: string;
      $product_title: string;
      $price: number;
      $sku: string;
      $quantity: number;
    }[] = [];

    if (!isEmpty(get(chargeBody, "contactDetails.email")))
      set(bodyRequest, "$user_email", get(chargeBody, "contactDetails.email"));
    if (!isEmpty(get(chargeBody, "orderDetails.billingDetails")))
      bodyRequest.$billing_address = {
        $address_1: get(chargeBody, "orderDetails.billingDetails.address"),
        $city: get(chargeBody, "orderDetails.billingDetails.city"),
        $country: get(chargeBody, "orderDetails.billingDetails.country"),
        $name: get(chargeBody, "orderDetails.billingDetails.name"),
        $phone: get(chargeBody, "orderDetails.billingDetails.phone"),
        $region: get(chargeBody, "orderDetails.billingDetails.region"),
      };
    if (!isEmpty(get(chargeBody, "orderDetails.shippingDetails")))
      bodyRequest.$shipping_address = {
        $address_1: get(chargeBody, "orderDetails.shippingDetails.address"),
        $city: get(chargeBody, "orderDetails.shippingDetails.city"),
        $country: get(chargeBody, "orderDetails.shippingDetails.country"),
        $name: get(chargeBody, "orderDetails.shippingDetails.name"),
        $phone: get(chargeBody, "orderDetails.shippingDetails.phone"),
        $region: get(chargeBody, "orderDetails.shippingDetails.region"),
      };
    if (
      !isEmpty(chargeBody.productDetails) &&
      !isEmpty(get(chargeBody, "productDetails.product"))
    ) {
      get(chargeBody, "productDetails.product").forEach((product: Products) => {
        sift_product.push({
          $item_id: get(product, "id", ""),
          $price: get(product, "price", 0),
          $product_title: get(product, "title", ""),
          $quantity: get(product, "quantity", 0),
          $sku: get(product, "sku", ""),
        });
      });
      bodyRequest.$items = sift_product;
    }

    return bodyRequest;
  }

  private static _getSiftScienceKey(merchant: DynamoMerchantFetch): string {
    let sift_science_api_key: string =
      process.env.SIFT_SCIENCE_API_KEY !== undefined
        ? process.env.SIFT_SCIENCE_API_KEY
        : "";

    if (
      get(merchant, "sift_science.ProdApiKey") !== undefined &&
      get(merchant, "sift_science.SandboxApiKey") !== undefined
    )
      if (
        process.env.USRV_STAGE === "dev" ||
        process.env.USRV_STAGE === "ci" ||
        process.env.USRV_STAGE === "qa" ||
        process.env.USRV_STAGE === "uat"
      )
        sift_science_api_key = get(merchant, "sift_science.SandboxApiKey");
      else sift_science_api_key = get(merchant, "sift_science.ProdApiKey");

    return sift_science_api_key;
  }

  private _validateFlowError(
    err: Error | AxiosError
  ): Observable<SiftScienceWorkflowsResponse> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () => `${get(err, "response.status", 0)}`.startsWith("5"),
          this._errorSiftDown(),
          of(this.siftWorkflowGenericAnswer(err.message))
        )
      ),
      tag("Antifraud Gateway | _validateFlowError")
    );
  }

  private _errorSiftDown(): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        throwError(
          new KushkiError(
            ERRORS.E021,
            ErrorResponseTextEnum.ERROR_TIMEOUT_ANTIFRAUD_TRANSACTION,
            {
              responseCode: AntiFraudErrorEnum.K021,
              responseText:
                ErrorResponseTextEnum.ERROR_TIMEOUT_ANTIFRAUD_TRANSACTION,
            }
          )
        )
      ),
      tag("Antifraud Gateway | _errorSiftDown")
    );
  }
}
