/**
 * Aurus Gateway File
 */
import { Tracer } from "@aws-lambda-powertools/tracer";
import {
  AurusError,
  IAxiosGateway,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  ILogger,
  KushkiError,
} from "@kushki/core";
import { Context } from "aws-lambda";
import { AxiosError } from "axios";
import { AMEX_NAMES_MAX_LENGTH } from "constant/AmexValidations";
import { NON_ASCII_CHARACTERS } from "constant/ASCIICharacters";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { AurusChargeRequestEnum } from "infrastructure/AurusChargeRequestEnum";
import { CategoryTypeEnum } from "infrastructure/CategoryTypeEnum";
import { CountryEnum } from "infrastructure/CountryEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { DefaultLimitsEnum } from "infrastructure/DefaultLimitsEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { MethodsEnum } from "infrastructure/MethodsEnum";
import { IS_TEST_PROCESSOR } from "infrastructure/MinorTestStages";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { ProcessorTypeEnum } from "infrastructure/ProcessorTypeEnum";
import { TAXES } from "infrastructure/TaxEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { inject, injectable } from "inversify";
import {
  defaultTo,
  filter,
  get,
  has,
  includes,
  isEmpty,
  isObject,
  merge,
  omit,
  set,
  sum,
} from "lodash";
import moment = require("moment");
import nanoSeconds = require("nano-seconds");
import nodeRsa = require("node-rsa");
import "reflect-metadata";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import rollbar = require("rollbar");
import { iif, Observable, Observer, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  map,
  mergeMap,
  switchMap,
  timeoutWith,
} from "rxjs/operators";
import { CardService, ChargeInput } from "service/CardService";
import { UtilsService } from "service/UtilsService";
import { Amount } from "types/amount";
import { AurusAmount } from "types/aurus_amount";
import { AurusCaptureRequest } from "types/aurus_capture_request";
import {
  AurusChargesRequest,
  TransactionAmount,
} from "types/aurus_charges_request";
import { AurusCreateProcessorResponse } from "types/aurus_create_processor_response";
import { AurusPreAuthRequest } from "types/aurus_preauth_request";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { AurusTokensRequest } from "types/aurus_tokens_request";
import { AurusTokensResponse } from "types/aurus_tokens_response";
import { AurusVoidRequest } from "types/aurus_void_request";
import { CaptureCardRequest } from "types/capture_card_request";
import { CaptureSubscriptionRequest } from "types/capture_subscription_request";
import { Currency } from "types/charges_card_request";
import { CreateProcessorRequest } from "types/create_processor_request";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { LambdaTransactionRuleBodyResponse } from "types/lambda_transaction_rule_response";
import { TokenRequest } from "types/remote/token_request";
import { CardToken, TokensCardRequest } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { UpdateProcessorRequest } from "types/update_processor_request";
import { VoidCardRequest } from "types/void_card_request";
import { AurusVars, CvvFlag } from "types/aurus_vars";
import { SubscriptionTriggerEnum } from "infrastructure/SubscriptionEnum";

export type AurusRequest =
  | AurusChargesRequest
  | AurusPreAuthRequest
  | AurusCaptureRequest;

/**
 * Aurus Gateway Implementation
 */

@injectable()
export class AurusGateway implements ICardGateway {
  private static readonly sDeferredMonthsPath: string = "deferred.months";

  private readonly _rsa: nodeRsa;
  private readonly _tracer: Tracer;
  private readonly _logger: ILogger;
  private readonly _storage: IDynamoGateway;
  private readonly _rollbar: rollbar;
  private readonly _lambda: ILambdaGateway;
  private readonly _axios: IAxiosGateway;
  private readonly _processEmail: string = "dev@kushkipagos.com";
  private readonly _transactionIdPath: string = "response.data.transaction_id";
  private readonly _transactionDetailsPath: string =
    "response.data.transaction_details";
  private readonly _responseCodePath: string = "response.data.response_code";
  private readonly _responseTextPath: string = "response.data.response_text";
  private readonly _responseStatusPath: string = "response.status";
  private readonly _statusCodePath: string = "response.status";
  private readonly _unreachableProcessorMessage: string =
    "Procesador inalcanzable";
  private readonly _processorCodePath: string = "response.data.processor_code";
  private readonly _processorNamePath: string =
    "response.data.transaction_details.processorName";
  private readonly _responseDataPath: string = "response.data";
  private readonly _shippingDetailsAddressPath: string =
    "orderDetails.shippingDetails.address";
  private readonly _shippingDetailsZipCodePath: string =
    "orderDetails.shippingDetails.zipCode";
  private readonly _contactDetailsEmailPath: string = "contactDetails.email";

  constructor(
    @inject(CORE.Logger) logger: ILogger,
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(CORE.RollbarInstance) rollbarInstance: rollbar,
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway,
    @inject(CORE.AxiosGateway) axios: IAxiosGateway,
    @inject(CORE.Tracer) tracer: Tracer
  ) {
    this._tracer = tracer;
    this._storage = storage;
    this._logger = logger;
    this._rollbar = rollbarInstance;
    this._lambda = lambda;
    this._axios = axios;
    const public_key: string = `
    -----BEGIN PUBLIC KEY-----
    MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC81t5iu5C0JxYq5/XNPiD5ol3Zw8rw3LtFI
    Um7y3m8o8wv5qVnzGh6XwQ8LWypdkbBDKWZZrAUd3lybZOP7/82Nb1/noYj8ixVRdbnYtbsSA
    bu9PxjB7a/7LCGKsugLkou74PJDadQweM88kzQOx/kzAyVbS9gCCVUguHcq2vRRQIDAQAB
    -----END PUBLIC KEY-----
    `;

    this._rsa = new nodeRsa(public_key, "public", {
      encryptionScheme: "pkcs1",
    });
  }

  private static _aurusError(data: object): boolean {
    return has(data, "response_code");
  }

  public buildAurusAmount(
    data:
      | Required<VoidCardRequest>
      | UnifiedChargesPreauthRequest
      | Required<CaptureCardRequest>,
    processorID: string,
    tokenAmount?: number
  ): Observable<AurusAmount> {
    return new Observable((observer: Observer<Amount>) => {
      try {
        const amount: Amount = data.amount;
        let currency: string = defaultTo(amount.currency, CurrencyEnum.USD);
        const processor_array: string[] =
          `${process.env.CLARO_EC_PROCESSOR}`.split(",");

        if (processor_array.includes(processorID) && tokenAmount) {
          const amended_amount: Amount = this._getClaroAmendedAmount(
            amount,
            tokenAmount
          );

          observer.next(amended_amount);

          return;
        }

        if (amount.iva !== 0 || amount.subtotalIva === 0) {
          observer.next(amount);

          return;
        }

        const iva_list: object = JSON.parse(`${process.env.IVA_VALUES}`);

        if (currency !== CurrencyEnum.COP && currency !== CurrencyEnum.PEN)
          currency = CurrencyEnum.USD;

        const iva: number | undefined = iva_list[currency];

        if (iva === undefined) {
          observer.error(new Error("IVA parameters are not set review SSM"));

          return;
        }

        const total: number = amount.subtotalIva;

        amount.subtotalIva = parseFloat((total / (iva + 1)).toFixed(2));
        amount.iva = parseFloat((total - amount.subtotalIva).toFixed(2));
        observer.next(amount);
      } finally {
        observer.complete();
      }
    }).pipe(
      map((amountKushki: Amount) => ({
        ICE: defaultTo(amountKushki.ice, 0).toFixed(2),
        IVA: amountKushki.iva.toFixed(2),
        Subtotal_IVA: amountKushki.subtotalIva.toFixed(2),
        Subtotal_IVA0: amountKushki.subtotalIva0.toFixed(2),
        Total_amount: sum(
          filter(
            [...Object.values(omit(amountKushki, ["totalAmount"]))],
            (v: string | number) => typeof v === "number"
          )
        ).toFixed(2),
      })),
      map((aurusAmount: AurusAmount) => {
        const extra_taxes: object | undefined = data.amount.extraTaxes;

        if (extra_taxes === undefined) return aurusAmount;
        aurusAmount.Total_amount = (
          Number(aurusAmount.Total_amount) +
          sum([...Object.values(extra_taxes)])
        ).toFixed(2);
        aurusAmount.tax = Object.keys(extra_taxes).map((tax: string) => ({
          taxAmount: extra_taxes[tax].toFixed(2),
          taxId: TAXES[tax].id,
          taxName: TAXES[tax].code,
        }));

        return aurusAmount;
      }),
      tag("Aurus Gateway | _buildAurusAmount")
    );
  }

  // tslint:disable-next-line:cognitive-complexity
  public request<T extends object = object>(
    merchantCountry: string | undefined,
    body: object,
    method: string,
    headers: object,
    decryptedBody?: object,
    context?: Context,
    hasFailover?: boolean,
    isFailoverRetry?: boolean,
    metadata?: object
  ): Observable<T | object> {
    return of(1).pipe(
      switchMap(() =>
        this._axios.request<T>({
          headers,
          data: body,
          method: "post",
          responseType: "json",
          url: `${process.env.AURUS_URL}/${method}`,
        })
      ),
      catchError((err: AxiosError) => {
        const is_subscription_trx: boolean =
          get(decryptedBody, "usrvOrigin") === UsrvOriginEnum.SUBSCRIPTIONS;

        return is_subscription_trx
          ? this._handleAurusSubscriptionError(err, metadata)
          : this._handleAurusCardError(
              err,
              method,
              merchantCountry,
              decryptedBody,
              context,
              hasFailover,
              metadata,
              isFailoverRetry
            );
      }),
      tag("AurusGateway | request")
    );
  }

  public getAurusToken(
    request: AurusTokenLambdaRequest
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: TokensCardResponse }>(
          `usrv-vault-${process.env.USRV_STAGE}-aurusToken`,
          {
            body: request,
          }
        )
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      catchError((err: KushkiError | Error) => {
        let response_code: string = "020";
        let response_text: string = "Error al tokenizar la tarjeta.";

        if (err instanceof KushkiError) {
          response_code = get(
            err.getMetadata(),
            "response_code",
            response_code
          );
          response_text = get(
            err.getMetadata(),
            "response_text",
            response_code
          );
        }

        return throwError(() => new AurusError(response_code, response_text));
      }),
      map((response: { body: TokensCardResponse }) => response.body),
      tag("AurusGateway | getAurusToken")
    );
  }

  public tokensTransaction(
    body: CardToken,
    mid: string,
    tokenType: string,
    processorName: string,
    transactionReference: string,
    context: Context,
    merchantCountry: string | undefined
  ): Observable<TokensCardResponse> {
    return AurusGateway._buildTokensRequest(body, mid, tokenType).pipe(
      map((request: AurusTokensRequest) => {
        this._logger.info(
          `Aurus Encryption Decrypted: ${AurusGateway._clearSensitiveData(
            JSON.stringify(request)
          )}`
        );

        return this._encrypt(request);
      }),
      switchMap((encrypted: object) =>
        this.request<AurusTokensResponse>(
          merchantCountry,
          encrypted,
          MethodsEnum.TOKENS,
          {}
        )
      ),
      timeoutWith(
        Number(`${this._calculateTimeout(context)}`),
        throwError(
          new AurusError("504", this._unreachableProcessorMessage, {
            processorName,
          })
        )
      ),
      map(
        (response: AurusTokensResponse | object) =>
          <AurusTokensResponse>response
      ),
      switchMap((response: AurusTokensResponse) => {
        if (
          processorName === ProcessorEnum.TRANSBANK &&
          (body.currency === "CLP" || body.currency === "UF")
        )
          return this._transbankToken(
            body,
            mid,
            transactionReference,
            response.transaction_token,
            body.currency
          );

        return of({
          token: response.transaction_token,
        });
      }),
      tag("Aurus Gateway | tokensTransaction")
    );
  }

  public preAuthorization(
    body: UnifiedChargesPreauthRequest,
    processor: DynamoProcessorFetch,
    tokenInfo: DynamoTokenFetch,
    transactionReference: string,
    context: Context,
    taxId?: string,
    merchantCountry?: string | undefined
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() =>
        this._buildPreAuthRequest(
          body,
          tokenInfo,
          transactionReference,
          processor,
          taxId
        )
      ),
      map((request: AurusPreAuthRequest) => this._encrypt(request)),
      switchMap((encrypted: object) =>
        this._performCustomRequest(
          encrypted,
          MethodsEnum.PREAUTH,
          body,
          merchantCountry
        )
      ),
      timeoutWith(
        Number(`${this._calculateTimeout(context)}`),
        throwError(
          new AurusError("504", this._unreachableProcessorMessage, {
            processorName: get(processor, "processor_name"),
          })
        )
      ),
      map((response: AurusResponse | object) => <AurusResponse>response),
      tag("Aurus Gateway | preAuthorization")
    );
  }

  public chargesTransaction(input: ChargeInput): Observable<AurusResponse> {
    const is_card_transaction: boolean = input.event.usrvOrigin.includes(
      UsrvOriginEnum.CARD
    );
    const is_subscription_transaction: boolean =
      input.event.usrvOrigin.includes(UsrvOriginEnum.SUBSCRIPTIONS);
    const method: string =
      (get(input, "event.deferred.months") !== undefined &&
        get(input, "event.deferred.months", 0) > 0) ||
      get(input, "event.deferred") !== undefined
        ? MethodsEnum.DEFERRED
        : MethodsEnum.CHARGE;

    if (is_card_transaction)
      input.event.tokenId = Boolean(input.isFailoverRetry)
        ? <string>input.currentToken.failoverToken
        : input.event.tokenId;

    return of(1).pipe(
      mergeMap(() =>
        iif(
          () =>
            get(input, "metadataId", "") !== "" &&
            get(input, "subtokenType", "") !== "" &&
            is_subscription_transaction &&
            isEmpty(input.cvv),
          this._invokeVaultPlcc(input),
          of(input)
        )
      ),
      mergeMap((chargeInput: ChargeInput) =>
        this._buildChargeParams(chargeInput)
      ),
      map((request: AurusChargesRequest) => this._encrypt(request)),
      switchMap((encrypted: object) =>
        this.request<AurusResponse>(
          input.currentMerchant.country,
          encrypted,
          method,
          {},
          input.event,
          input.lambdaContext,
          Boolean(
            get(input, "trxRuleResponse.body.failOverProcessor", undefined)
          ),
          Boolean(input.isFailoverRetry),
          get(input, "event.metadata", undefined)
        )
      ),
      timeoutWith(
        Number(`${this._calculateTimeout(input.lambdaContext)}`),
        throwError(
          new AurusError("504", this._unreachableProcessorMessage, {
            processorName: get(input, "processor.processor_name"),
          })
        )
      ),
      catchError((err: AurusError) => {
        if (err instanceof AurusError) return throwError(err);

        return throwError(
          new AurusError("504", this._unreachableProcessorMessage, {
            processorName: get(input, "processor.processor_name"),
          })
        );
      }),
      map((response: AurusResponse | object) => <AurusResponse>response),
      tag("Aurus Gateway | chargesTransaction")
    );
  }

  public captureTransaction(
    body: CaptureCardRequest,
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    context: Context,
    taxId?: string,
    subscription?: CaptureSubscriptionRequest
  ): Observable<AurusResponse> {
    return this._buildCaptureParams(
      body,
      transaction,
      processor,
      taxId,
      subscription
    ).pipe(
      map((request: AurusCaptureRequest) => this._encrypt(request)),
      switchMap((encrypted: object) =>
        this._performCustomRequest(
          encrypted,
          MethodsEnum.CAPTURE,
          body,
          transaction.country
        )
      ),
      timeoutWith(
        Number(`${this._calculateTimeout(context)}`),
        throwError(
          new AurusError("504", this._unreachableProcessorMessage, {
            processorName: get(processor, "processor_name", ""),
          })
        )
      ),
      map((response: AurusResponse | object) => <AurusResponse>response),
      tag("Aurus Gateway | captureTransaction")
    );
  }

  public voidTransaction(
    data: VoidCardRequest | null | undefined,
    ticket: string,
    mid: string,
    trxReference: string,
    merchantCountry: string | undefined
  ): Observable<AurusResponse> {
    return this._buildChargeDeleteRequest(data, ticket, mid, trxReference).pipe(
      map((request: AurusVoidRequest) => this._encrypt(request)),
      switchMap((encrypted: object) =>
        this.request<AurusResponse>(
          merchantCountry,
          encrypted,
          MethodsEnum.VOID,
          {}
        )
      ),
      map((response: AurusResponse | object) => <AurusResponse>response),
      tag("AurusGateway | voidTransaction")
    );
  }

  public createProcessor(
    processorBody: CreateProcessorRequest,
    country: string | undefined,
    merchantName: string | undefined
  ): Observable<AurusCreateProcessorResponse> {
    return of(1).pipe(
      map(() => this._buildProcessorBody(processorBody, country, merchantName)),
      map((body: object) => this._encrypt(body)),
      mergeMap((encrypted: object) =>
        this.request<AurusCreateProcessorResponse>(
          country,
          encrypted,
          "storeCreation",
          {
            password: process.env.AURUS_API_PASSWORD,
            username: process.env.AURUS_API_USERNAME,
          }
        )
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      map((response: AurusCreateProcessorResponse | object) => {
        if (!has(response, "response_code")) throw new KushkiError(ERRORS.E006);
        return <AurusCreateProcessorResponse>response;
      }),
      tag("AurusGateway | createProcessor")
    );
  }

  public updateProcessor(
    processorBody: UpdateProcessorRequest,
    country: string,
    merchantName: string
  ): Observable<boolean> {
    return of(1).pipe(
      map(() => {
        const body: object = this._buildProcessorBody(
          processorBody,
          country,
          merchantName
        );

        set(
          body,
          "StoreInformation.DemographicalInfo.TransactionMerchantID",
          processorBody.privateId
        );

        return body;
      }),
      map((body: object) => this._encrypt(body)),
      mergeMap((encrypted: object) =>
        this.request(country, encrypted, "storeModify", {
          password: process.env.AURUS_API_PASSWORD,
          username: process.env.AURUS_API_USERNAME,
        })
      ),
      mergeMap((response: object) => {
        if (!has(response, "response_code")) throw new KushkiError(ERRORS.E006);
        return of(true);
      })
    );
  }

  private _buildProcessorBody(
    body: CreateProcessorRequest | UpdateProcessorRequest,
    country: string | undefined,
    merchantName: string | undefined
  ): object {
    return {
      AppVersion: "1.0",
      StoreInformation: {
        CreditInfo: {
          AccountTypeId: "01",
          FinancialId: "1",
          IsProcessorTestAccount: IS_TEST_PROCESSOR.includes(
            `${process.env.USRV_STAGE}`
          )
            ? "Y"
            : "N",
          IsTraditionalMerchant: this._setIsTraditionalMerchant(
            body.processorType,
            body.categoryModel!
          ),
          key: defaultTo(body.key, ""),
          MerchantCategoryCode: get(body, "merchantCategoryCode", "5964"),
          password: defaultTo(body.password, ""),
          ProcessorMerchantId: defaultTo(body.processorMerchantId, ""),
          ProcessorName:
            body.processorName === ProcessorEnum.FIRST_DATA
              ? ProcessorEnum.TRANSBANK
              : body.processorName,
          ProcessorTerminalId: defaultTo(body.terminalId, ""),
          SubMCCCode:
            body.processorName === ProcessorEnum.REDEBAN
              ? ""
              : defaultTo(body.subMccCode, ""),
          SubTerminalID: defaultTo(body.subTerminalId, ""),
          UniqueCode: defaultTo(body.uniqueCode, ""),
          username: defaultTo(body.username, ""),
        },
        DemographicalInfo: {
          "12MonthsDeferredPay": "1",
          "3MonthsDeferredPay": "1",
          "6MonthsDeferredPay": "1",
          "9MonthsDeferredPay": "1",
          Address1: "address1",
          Address2: "",
          AllowDeferredPay: "1",
          AllowRememberMe: "1",
          AllowSubscription: "0",
          Bank_Merch_ID: "1",
          BankFee: this._getFee(),
          BusinessBank: defaultTo(body.businessBank, ""),
          BusinessBankAccountNumber: defaultTo(
            body.businessBankAccountNumber,
            ""
          ),
          BusinessBankAccountType: defaultTo(body.businessBankAccountType, ""),
          BusinessOwnerIDNumber: "1234567890",
          BusinessOwnerIDType: "0",
          City: "city",
          ContactPerson: "contactPerson",
          CorporateID: defaultTo(body.corporateId, ""),
          Country: this._getCountryCreateProcessor(country),
          cutoff_time: "0800",
          DebitBankFee: this._getFee(),
          DebitKushkiFee: this._getFee(),
          DoingBusinessAs: merchantName,
          EmailId: "kushki@kushki.com",
          ExcemptToIncomeTax: "0",
          fee_withdrawal_time: "0800",
          frequency: "1",
          KushkiAcquiringEntity: "0",
          KushkiFee: this._getFee(),
          LiquidationFee: "0",
          MerchantAccountNumber: Number(new Date().getTime())
            .toString()
            .substring(0, 11),
          MerchantCategoryCode: get(body, "merchantCategoryCode", "5964"),
          OtherInfo: {
            LowerLimit: DefaultLimitsEnum.LOWER_LIMIT,
            UpperLimit: DefaultLimitsEnum.UPPER_LIMIT,
          },
          PhoneNumber: "098765432",
          PlccProcessorDetails: body.plcc === "Y" ? "1" : "0",
          RetentionOnICATax: "0",
          RISE: "0",
          saasFee: "0",
          saasFeeDate: "010130",
          SaasFrequencyMonth: "1",
          SocialReason: merchantName,
          SpecialContributor: "0",
          State: this._getProcessorState(<CountryEnum>country),
          TaxInfo: {
            DebitRetentionOnIncomeTax: 0,
            DebitRetentionOnSalesTax: 0,
            DebitSalesTaxOnGoods: 0,
            DebitSalesTaxOnServices: 0,
            RetentionOnIncomeTax: 0,
            RetentionOnSalesTax: 0,
            SalesTaxOnGoods: 0,
            SalesTaxOnServices: 0,
            TaxId: "1918171615140",
          },
          Timezone: "ECT",
          TypeOfFee: "fixed",
          Zip: this._getZipCode(<CountryEnum>country),
        },
        PlccInfo:
          body.plcc === "Y"
            ? {
                IsProcessorTestAccount: IS_TEST_PROCESSOR.includes(
                  `${process.env.USRV_STAGE}`
                )
                  ? "1"
                  : "0",
                ProcessorMerchantId: defaultTo(body.processorMerchantId, ""),
                ProcessorName: body.processorName,
                ProcessorTerminalId: defaultTo(body.terminalId, ""),
              }
            : undefined,
      },
    };
  }

  private _handleAurusSubscriptionError(
    err: AxiosError,
    metaData?: object
  ): Observable<object> {
    const status_code: number | undefined = get(err, this._responseStatusPath);

    if (isEmpty(get(err, this._responseDataPath)))
      return throwError(
        new AurusError(`228`, this._unreachableProcessorMessage)
      );

    if (status_code !== undefined && `${status_code}`.startsWith("5"))
      return throwError(
        this._build5XXAurusError(err, false, undefined, metaData)
      );
    if (AurusGateway._aurusError(get(err, this._responseDataPath)))
      return throwError(
        new AurusError(
          get(err, this._responseCodePath),
          get(err, this._responseTextPath),
          {
            approved_amount: get(err, "response.data.approved_amount"),
            processorCode: get(err, this._processorCodePath),
            processorName: get(err, this._processorNamePath, "AURUS"),
            response_code: get(err, this._responseCodePath),
            response_text: get(err, this._responseTextPath),
            ticket_number: get(err, "response.data.ticket_number"),
            transaction_details: {
              metadata: metaData,
              ...get(err, "response.data.transaction_details", {}),
            },
            transaction_id: get(err, "response.data.transaction_id"),
          }
        )
      );

    return throwError(err);
  }

  private _handleAurusCardError(
    err: AxiosError,
    method: string,
    merchantCountry: string | undefined,
    decryptedBody: object | undefined,
    context?: Context,
    hasFailover?: boolean,
    metadata?: object,
    isFailoverRetry?: boolean
  ): Observable<object> {
    const status_code: number | undefined = get(err, this._statusCodePath);

    if (
      AurusGateway._aurusError(get(err, this._responseDataPath)) ||
      (status_code !== undefined && `${status_code}`.startsWith("5"))
    ) {
      if (get(err, this._responseCodePath) === "1032") return of({});

      if (
        get(err, this._responseCodePath) === "228" &&
        hasFailover &&
        context !== undefined &&
        context.getRemainingTimeInMillis() >= 27000 &&
        !isFailoverRetry
      )
        return of(
          new AurusError(
            get(err, this._responseCodePath),
            get(err, this._responseTextPath),
            get(err, this._transactionDetailsPath)
          )
        );
      return this._checkAurusError(
        err,
        method,
        metadata,
        decryptedBody,
        status_code,
        merchantCountry
      );
    }

    return throwError(err);
  }

  private _invokeVaultPlcc(body: ChargeInput): Observable<ChargeInput> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction<{ body: { plccMetadata: string } }>(
          `${process.env.VAULT_PLCC_ID}`,
          {
            body: {
              token: body.metadataId,
              tokenType: body.subtokenType,
            },
          }
        )
      ),
      map((response: { body: { plccMetadata: string } }) => ({
        ...body,
        cvv: response.body.plccMetadata,
      }))
    );
  }

  private _getZipCode(country: CountryEnum): string {
    switch (country) {
      case CountryEnum.ECUADOR:
        return "000000";
      case CountryEnum.MEXICO:
        return "00000";
      case CountryEnum.CHILE:
        return "000000";
      case CountryEnum.PERU:
        return "00000";
      case CountryEnum.USA:
        return "35242";
      case CountryEnum.COLOMBIA:
      default:
        return "000000";
    }
  }

  private _getProcessorState(country: CountryEnum): string {
    switch (country) {
      case CountryEnum.CHILE:
        return "RM";
      case CountryEnum.COLOMBIA:
        return "AMA";
      case CountryEnum.PERU:
        return "LIM";
      case CountryEnum.MEXICO:
        return "AGU";
      case CountryEnum.USA:
        return "AL";
      case CountryEnum.ECUADOR:
      default:
        return "A";
    }
  }

  private _getFee(): object {
    return {
      StaticFee: {
        CurrentTransactionFee: "0",
        DeferredNineMonthsNoInterestTransFee: "0",
        DeferredNoInterestTransFee: "0",
        DeferredSixMonthsNoInterestTransFee: "0",
        DeferredThreeMonthsNoInterestTransFee: "0",
        DeferredTwelveMonthsNoInterestTransFee: "0",
      },
      VariableFee: {
        CurrentTransactionFee: "0",
        DeferredNineMonthsNoInterestTransFee: "0",
        DeferredNoInterestTransFee: "0",
        DeferredSixMonthsNoInterestTransFee: "0",
        DeferredThreeMonthsNoInterestTransFee: "0",
        DeferredTwelveMonthsNoInterestTransFee: "0",
      },
    };
  }

  private _setIsTraditionalMerchant(
    processorType: string,
    categoryModel: string
  ): string {
    if (
      processorType.toLowerCase() === ProcessorTypeEnum.GATEWAY ||
      (processorType.toLowerCase() === ProcessorTypeEnum.AGGREGATOR &&
        categoryModel.toLowerCase() === CategoryTypeEnum.GATEWAY)
    )
      return "0";

    return "1";
  }

  private _checkIfIs211Error(err: AxiosError): Observable<never | boolean> {
    if (
      !(
        isEmpty(get(err, this._transactionIdPath)) &&
        get(err, this._responseCodePath) === "211"
      )
    )
      return of(true);

    this._rollbar.warn(err.message);

    return throwError(
      new AurusError(
        get(err, this._responseCodePath),
        get(err, this._responseTextPath),
        get(err, this._transactionDetailsPath)
      )
    );
  }

  private _calculateTimeout(context: Context): number {
    if (
      isEmpty(context) ||
      Math.sign(context.getRemainingTimeInMillis() - 3000) === -1
    )
      return 27000;

    return context.getRemainingTimeInMillis() - 3000;
  }

  private _saveFailedCharge(
    err: AxiosError,
    decryptedBody: object | undefined
  ): Observable<boolean> {
    return of(1).pipe(
      switchMap(() =>
        this._storage.put(
          {
            transactionId:
              get(err, this._transactionIdPath) !== ""
                ? get(err, this._transactionIdPath)
                : nanoSeconds.now().toString().replace(",", ""),
            ...decryptedBody,
            expirationTime: Number(
              (new Date().getTime() + 86400000).toString().slice(0, 10)
            ),
          },
          TABLES.charges
        )
      ),
      tag("AurusGateway | _saveCharge")
    );
  }

  private static _buildTokensRequest(
    body: TokensCardRequest,
    mid: string,
    tokenType: string
  ): Observable<AurusTokensRequest> {
    let deferred: string = "0";
    let currency: string = "USD";

    if (body.isDeferred !== undefined) deferred = "1";
    if (body.currency !== undefined) currency = body.currency;
    if (
      body.card.expiryMonth.length === 1 &&
      parseInt(body.card.expiryMonth, 36) < 10 &&
      parseInt(body.card.expiryMonth, 36) > 0
    )
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

    return of(params);
  }

  private _getClaroAmendedAmount(amount: Amount, tokenAmount: number): Amount {
    const total_amount: number = parseFloat(tokenAmount.toFixed(2));
    const iva: number = 0.15;
    const ice: number = 0.1;
    const one: number = 1;
    const sub_first_calc: number = parseFloat(
      (total_amount / ((one + iva) * ice + (one + iva))).toFixed(2)
    );
    const sub_second_calc: number = parseFloat(
      ((total_amount / (one + iva)) * iva).toFixed(2)
    );
    const subtotal_iva_amended: number = parseFloat(
      ((sub_first_calc + sub_second_calc) / (iva + one)).toFixed(2)
    );
    let ice_amended: number = parseFloat(
      ((total_amount / ((one + iva) * ice + (one + iva))) * ice).toFixed(2)
    );
    const iva_amended: number = parseFloat(
      (subtotal_iva_amended * iva).toFixed(2)
    );
    const sum_total: number = parseFloat(
      sum([subtotal_iva_amended, ice_amended, iva_amended]).toFixed(2)
    );

    // istanbul ignore next
    if (total_amount !== sum_total) {
      const difference: number = parseFloat(
        (total_amount - sum_total).toFixed(2)
      );

      ice_amended = ice_amended + difference;
    }

    return {
      ...amount,
      ice: ice_amended,
      iva: iva_amended,
      subtotalIva: subtotal_iva_amended,
    };
  }

  // tslint:disable-next-line:cognitive-complexity
  private _buildChargeParams(
    body: ChargeInput
  ): Observable<AurusChargesRequest> {
    const mid: string = body.processor.private_id;
    const token_info: DynamoTokenFetch = body.currentToken;
    const processor: DynamoProcessorFetch = body.processor;
    const merchant: DynamoMerchantFetch = body.currentMerchant;
    const is_subscription_transaction: boolean = body.event.usrvOrigin.includes(
      UsrvOriginEnum.SUBSCRIPTIONS
    );
    const is_card_transaction: boolean = body.event.usrvOrigin.includes(
      UsrvOriginEnum.CARD
    );
    let currency: Currency = CurrencyEnum.USD;

    if (body.event.amount.currency !== undefined)
      currency = body.event.amount.currency;

    return this.buildAurusAmount(body.event, mid, token_info.amount).pipe(
      map((amount: AurusAmount) => {
        const aurus_charge_request: AurusChargesRequest =
          this._setAurusChargeProperties(processor, body, currency, amount);

        const brand: string = get(
          token_info.binInfo,
          "brand",
          ""
        ).toLowerCase();

        if (
          (brand === "amex" || brand === "american express") &&
          processor.processor_name === ProcessorEnum.BILLPOCKET
        )
          merge(aurus_charge_request, this._buildAmexProperties(body.event));

        if (is_subscription_transaction)
          AurusGateway._checkProcessorAndCvvSubscriptions(
            body,
            aurus_charge_request,
            brand
          );

        aurus_charge_request.metadata = AurusGateway._removeSpecialChar(
          body.event.metadata
        );

        if (
          get(body, "metadata.ksh_subscriptionValidation", false) ||
          (merchant.whiteList && is_card_transaction)
        )
          aurus_charge_request.security_validation = 0;

        AurusGateway._setDeferred(
          currency,
          body.event,
          aurus_charge_request,
          processor.processor_name
        );
        AurusGateway._sGetProcessorCodeVisaNet(aurus_charge_request, processor);
        return aurus_charge_request;
      })
    );
  }

  // istanbul ignore next
  private static _removeSpecialChar(
    metadata: object | undefined
  ): object | undefined {
    if (isEmpty(metadata) || !isObject(metadata)) return;

    const new_metadata: string = JSON.stringify(metadata);

    let str: string;

    str = defaultTo(new_metadata, "").replace(
      /[áéíóúÁÉÍÓÚÑñ]/gi,
      (matched: string): string => NON_ASCII_CHARACTERS[matched]
    );
    str = str.replace(/[^\x00-\x7F]/g, "");

    return JSON.parse(str);
  }

  private static _checkProcessorAndCvvSubscriptions(
    body: ChargeInput,
    aurusChargeRequest: AurusChargesRequest,
    brand: string
  ): void {
    if (!isEmpty(body.cvv)) aurusChargeRequest.cvv = body.cvv;
    if (body.skipSecurityValidation) aurusChargeRequest.security_validation = 0;

    AurusGateway._checkProcessor(
      body.trxRuleResponse,
      aurusChargeRequest,
      body,
      brand
    );
  }

  private static _setDataIfElavonProcessor(
    request: AurusRequest,
    address: string,
    zipCode: string,
    taxId: string
  ): void {
    request.street_address = address;
    request.postal_code = zipCode;
    request.merchant_tax_id = taxId;
  }

  private static _checkProcessor(
    ruleResponse: LambdaTransactionRuleBodyResponse,
    aurusChargeRequest: AurusChargesRequest,
    body: ChargeInput,
    brand: string
  ): void {
    if (ruleResponse.body.processor !== ProcessorEnum.MCPROCESSOR) return;

    aurusChargeRequest.name = body.name;
    aurusChargeRequest.lastName = body.lastName;
    aurusChargeRequest.email = body.email;
    aurusChargeRequest.fingerprint = aurusChargeRequest.transaction_reference;

    if (
      AurusGateway._avoidDefaultCvv(body, brand) ||
      get(aurusChargeRequest, "cvv", "") !== ""
    )
      return;

    brand === "amex" || brand === "american express"
      ? (aurusChargeRequest.cvv = "0000")
      : (aurusChargeRequest.cvv = "000");
  }

  private static _avoidDefaultCvv(body: ChargeInput, brand: string): boolean {
    const aurus_vars: AurusVars = get(
      JSON.parse(defaultTo(process.env.ENV_VARS, "{}")),
      "aurusVars",
      "{}"
    );
    const is_subs_validation: boolean = get(
      body,
      "metadata.ksh_subscriptionValidation",
      false
    );
    const is_subs_scheduled: boolean =
      get(body, "event.subscriptionTrigger") ===
      SubscriptionTriggerEnum.SCHEDULED;
    const avoid_cvv_subs_validation: CvvFlag = get(
      aurus_vars,
      "avoidCvvInSubsValidation",
      { active: false }
    );
    const avoid_cvv_subs_on_demand: CvvFlag = get(
      aurus_vars,
      "avoidCvvInSubsOnDemand",
      { active: false }
    );
    const avoid_cvv_subs_scheduled: CvvFlag = get(
      aurus_vars,
      "avoidCvvInSubsScheduled",
      { active: false }
    );

    return (
      AurusGateway._avoidCvvForSubsCharge(
        is_subs_validation,
        avoid_cvv_subs_validation,
        brand
      ) ||
      AurusGateway._avoidCvvForSubsCharge(
        is_subs_scheduled,
        avoid_cvv_subs_scheduled,
        brand
      ) ||
      AurusGateway._avoidCvvForSubsCharge(
        !is_subs_scheduled && !is_subs_validation,
        avoid_cvv_subs_on_demand,
        brand
      )
    );
  }

  private static _avoidCvvForSubsCharge(
    matchesSubsChargeType: boolean,
    avoidCvvFlag: CvvFlag,
    brand: string
  ): boolean {
    const cvvFlagIncludesBrand: boolean =
      isEmpty(avoidCvvFlag.brands) ||
      avoidCvvFlag.brands === "all" ||
      includes(avoidCvvFlag.brands, brand);

    return (
      matchesSubsChargeType &&
      cvvFlagIncludesBrand &&
      defaultTo(get(avoidCvvFlag, "active", false), false)
    );
  }

  private _buildAmexProperties(body: UnifiedChargesPreauthRequest): object {
    const contact_first_name: string = get(
      body,
      "contactDetails.firstName",
      "default"
    );
    const amex_first_name: string =
      contact_first_name.length > AMEX_NAMES_MAX_LENGTH
        ? contact_first_name.substring(0, AMEX_NAMES_MAX_LENGTH)
        : contact_first_name;

    const contact_last_name: string = get(
      body,
      "contactDetails.lastName",
      "default"
    );
    const amex_last_name: string =
      contact_last_name.length > AMEX_NAMES_MAX_LENGTH
        ? contact_last_name.substring(0, AMEX_NAMES_MAX_LENGTH)
        : contact_last_name;

    return {
      amexCallTypId: "61",
      amexCustAddress: "default",
      amexCustBrowserTypDescTxt: "CryoWeb",
      amexCustEmailAddr: get(
        body,
        this._contactDetailsEmailPath,
        "default@gmail.com"
      ),
      amexCustFirstName: CardService.transformCardName(amex_first_name),
      amexCustHostServerNm: "www.criol.com.mx",
      amexCustIdPhoneNbr: get(body, "contactDetails.phoneNumber", "00000000"),
      amexCustIPAddr: "192.168.0.1",
      amexCustLastName: CardService.transformCardName(amex_last_name),
      amexCustPostalCode: "123",
      amexMerSKUNbr: "CARGO",
      amexShipMthdCd: "01",
      amexShipToCtryCd: "484",
      customer_info: {
        address: "ABC, West",
        browser_type: "Chrome",
        call_type_id: "61",
        host_server: "Testing",
        ip_address: "127.0.0.0",
        mer_sku_number: "CARGO",
        phone_number: "1234567890",
        postal_code: "14495",
        ship_method_code: "02",
        ship_to_country_code: "484",
      },
      email: get(body, this._contactDetailsEmailPath, "kushkitest@gmail.com"),
      language_indicator: "es",
      lastName: CardService.transformCardName(amex_last_name),
      name: CardService.transformCardName(amex_first_name),
    };
  }

  private _buildCaptureParams(
    body: CaptureCardRequest,
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    taxId?: string,
    subscription?: CaptureSubscriptionRequest
  ): Observable<AurusCaptureRequest> {
    let currency: Currency = <Currency>transaction.currency_code;

    if (body.amount !== undefined && body.amount.currency !== undefined)
      currency = body.amount.currency;

    return iif(
      () => body.amount !== undefined,
      this.buildAurusAmount(
        <Required<CaptureCardRequest>>body,
        transaction.processor_id
      ),
      of(undefined)
    ).pipe(
      // tslint:disable-next-line:max-func-body-length
      map((amount: AurusAmount | undefined) => {
        const is_subscription_transaction: boolean = get(
          subscription,
          "usrvOrigin",
          UsrvOriginEnum.CARD
        ).includes(UsrvOriginEnum.SUBSCRIPTIONS);
        const partial_processors: string[] = [
          ProcessorEnum.NIUBIZ,
          ProcessorEnum.VISANET,
        ];
        const capture_request: AurusCaptureRequest = {
          currency_code: currency,
          language_indicator: "es",
          merchant_identifier: processor.private_id,
          merchant_tax_id: taxId || "",
          metadata: AurusGateway._removeSpecialChar(body.metadata),
          postal_code: get(
            transaction,
            "orderDetails.billingDetails.zipCode",
            ""
          ),
          street_address: get(
            transaction,
            "orderDetails.billingDetails.address",
            ""
          ),
          ticket_number: body.ticketNumber,
          transaction_amount:
            amount === undefined
              ? {
                  ICE:
                    transaction.ice_value !== undefined
                      ? transaction.ice_value.toFixed(2).toString()
                      : "0.00",
                  IVA: transaction.iva_value.toString(),
                  Subtotal_IVA: transaction.subtotal_iva.toString(),
                  Subtotal_IVA0: transaction.subtotal_iva0
                    .toFixed(2)
                    .toString(),
                  Total_amount: transaction.approved_transaction_amount
                    .toFixed(2)
                    .toString(),
                }
              : amount,
          transaction_reference: transaction.transaction_reference,
        };

        if (
          is_subscription_transaction &&
          processor.processorName === ProcessorEnum.ELAVON &&
          get(subscription, "merchantCountry") === CountryEnum.USA
        )
          AurusGateway._setDataIfElavonProcessor(
            capture_request,
            get(subscription, this._shippingDetailsAddressPath, ""),
            get(subscription, this._shippingDetailsZipCodePath, ""),
            taxId || ""
          );

        AurusGateway._sGetProcessorCodeVisaNet(capture_request, processor);

        if (
          partial_processors.includes(processor.processor_name) &&
          Number(
            get(capture_request, "transaction_amount.Total_amount", "0")
          ) !== transaction.approved_transaction_amount &&
          !isEmpty(`${get(process.env, "PARTIAL_CAPTURE_NIUBIZ", "").trim()}`)
        )
          capture_request.preauthorized_total_amount =
            transaction.approved_transaction_amount.toFixed(2);

        return capture_request;
      })
    );
  }

  private _buildPreAuthRequest(
    body: UnifiedChargesPreauthRequest,
    tokenInfo: DynamoTokenFetch,
    transactionReference: string,
    processor: DynamoProcessorFetch,
    taxId?: string
  ): Observable<AurusPreAuthRequest> {
    let currency: Currency = "USD";
    const names: object = UtilsService.getdetailNames(tokenInfo.cardHolderName);

    if (body.amount.currency !== undefined) currency = body.amount.currency;

    return this.buildAurusAmount(
      body,
      processor.private_id,
      tokenInfo.amount
    ).pipe(
      map((amount: AurusAmount) => {
        const is_card_trx: boolean =
          get(body, "usrvOrigin") === UsrvOriginEnum.CARD;
        const is_subscription_trx: boolean =
          get(body, "usrvOrigin") === UsrvOriginEnum.SUBSCRIPTIONS;

        const preauth_request: AurusPreAuthRequest = {
          currency_code: currency,
          fingerprint: moment().format("x"),
          language_indicator: "es",
          lastName: get(names, "lastName", "NA"),
          merchant_identifier: processor.private_id,
          name: get(names, "name", "NA"),
          transaction_amount: amount,
          transaction_reference: transactionReference,
          transaction_token: body.tokenId,
        };

        if (is_card_trx) {
          set(preauth_request, "email", this._processEmail);
          set(preauth_request, "merchant_tax_id", taxId || "");
          set(
            preauth_request,
            "postal_code",
            get(body, this._shippingDetailsZipCodePath, "")
          );
          set(
            preauth_request,
            "street_address",
            get(body, this._shippingDetailsAddressPath, "")
          );
        }

        if (is_subscription_trx) {
          set(
            preauth_request,
            "email",
            get(body, this._contactDetailsEmailPath, "")
          );
          set(
            preauth_request,
            "metadata",
            AurusGateway._removeSpecialChar(get(body, "metadata"))
          );

          if (
            processor.processor_name === ProcessorEnum.ELAVON &&
            get(body, "merchantCountry", CountryEnum.ECUADOR) ===
              CountryEnum.USA
          )
            AurusGateway._setDataIfElavonProcessor(
              preauth_request,
              get(body, this._shippingDetailsAddressPath, ""),
              get(body, this._shippingDetailsZipCodePath, ""),
              get(body, "merchant.taxId", "")
            );
        }

        AurusGateway._sGetProcessorCodeVisaNet(preauth_request, processor);

        return preauth_request;
      })
    );
  }

  private static _setDeferred(
    currency: string,
    body: UnifiedChargesPreauthRequest,
    aurusChargeRequest: AurusChargesRequest,
    processorName: string
  ): void {
    const is_card_transaction: boolean = body.usrvOrigin.includes(
      UsrvOriginEnum.CARD
    );

    aurusChargeRequest.months = get(body, AurusGateway.sDeferredMonthsPath);
    if (currency === "COP") return;

    if (get(body, "deferred.creditType", "") === "000") return;

    if (
      processorName === ProcessorEnum.DATAFAST &&
      is_card_transaction &&
      get(body, "deferred", undefined) === undefined
    ) {
      aurusChargeRequest[AurusChargeRequestEnum.TYPE_OF_CREDIT] = "03";
      aurusChargeRequest[AurusChargeRequestEnum.MONTHS_OF_GRACE] = "0";
      return;
    }

    if (body.deferred === undefined) return;

    const deferred_credit_type: string[] = get(body, "deferred.creditType", []);

    if (deferred_credit_type.length > 2)
      body.deferred.creditType = body.deferred.creditType.slice(1);

    aurusChargeRequest[AurusChargeRequestEnum.MONTHS_OF_GRACE] =
      body.deferred.graceMonths;
    aurusChargeRequest[AurusChargeRequestEnum.TYPE_OF_CREDIT] =
      body.deferred.creditType;
    aurusChargeRequest.months = body.deferred.months;
  }

  private _buildChargeDeleteRequest(
    data: VoidCardRequest | null | undefined,
    ticket: string,
    mid: string,
    trxReference: string
  ): Observable<AurusVoidRequest> {
    return iif(
      () => data !== null && data !== undefined && data.amount !== undefined,
      this.buildAurusAmount(<Required<VoidCardRequest>>data, mid, 0),
      of(null)
    ).pipe(
      map((amount: AurusAmount | null) => {
        const request: AurusVoidRequest = {
          language_indicator: "es",
          merchant_identifier: mid,
          ticket_number: ticket,
          transaction_reference: trxReference,
        };

        if (
          amount !== null &&
          data !== undefined &&
          "Total_amount" in amount &&
          data !== null &&
          data.amount !== undefined
        ) {
          request.transaction_amount = amount;
          request.currency_code = defaultTo(data.amount.currency, "USD");
        }

        return request;
      }),
      tag("Aurus Gateway | _buildChargeDeleteRequest")
    );
  }

  private _encrypt(params: object): object {
    let crypted_string: string = "";

    this._logger.info("Aurus Encryption Clean:", { params });
    const chunk_regex = /[\s\S]{1,117}/g;
    const chunks: string[] | null = JSON.stringify(params).match(chunk_regex);

    if (chunks === null) throw new KushkiError(ERRORS.E001);

    for (const chunk of chunks) {
      const crypted: string = this._rsa.encrypt(chunk).toString("base64");

      crypted_string += `${crypted}<FS>`;
    }
    this._logger.info(`Aurus Encryption Encrypted: ${crypted_string}`);

    return { request: crypted_string };
  }

  private _transbankToken(
    event: CardToken,
    processorId: string,
    referenceNumber: string,
    token: string,
    currency: TokenRequest["currency"]
  ): Observable<TokensCardResponse> {
    return this._lambda
      .invokeFunction<{ token: string; shareAmount?: number }, TokenRequest>(
        `${process.env.TRANSBANK_TOKEN_LAMBDA}`,
        {
          currency,
          processorId,
          referenceNumber,
          cardNumber: event.card.number,
          cvv: defaultTo(event.card.cvv, undefined),
          monthExpiration: event.card.expiryMonth,
          shareNumber: event.months,
          totalAmount: event.totalAmount,
          yearExpiration: event.card.expiryYear,
        }
      )
      .pipe(
        map((response: { token: string; shareAmount?: number }) => ({
          token,
          settlement: response.shareAmount,
        }))
      );
  }

  // TODO fix flacky test that avoid line 460
  // istanbul ignore next
  private static _clearSensitiveData(data: string): string {
    return data
      .replace(
        /"number": ?"[0-9]{14,19}"/g,
        (match: string) => `${match.slice(0, 16)}XXXXXX${match.slice(-5)}`
      )
      .replace(/"cvv": ?"[0-9]{3,4}"/g, () => `"cvv":"XXX"`);
  }

  private static _sGetProcessorCodeVisaNet(
    request: AurusRequest,
    processor?: DynamoProcessorFetch
  ): AurusRequest {
    if (
      !isEmpty(get(processor, "processor_code")) &&
      (get(processor, "processor_name", "") === ProcessorEnum.VISANET ||
        get(processor, "processorName", "") === ProcessorEnum.NIUBIZ)
    )
      set(request, "processor_code", get(processor, "processor_code", ""));

    return request;
  }

  private _buildCommonAurusError(
    err: AxiosError,
    country?: string
  ): AurusError {
    return new AurusError(
      get(err, this._responseCodePath),
      get(err, this._responseTextPath),
      {
        ...get(err, this._transactionDetailsPath),
        country,
        processor_code: get(err, this._processorCodePath),
        processorCode: get(err, this._processorCodePath),
        processorName: get(err, this._processorNamePath, "AURUS"),
      }
    );
  }

  private _build5XXAurusError(
    err: AxiosError,
    isCardTrx: boolean,
    country?: string,
    metadata?: object
  ): AurusError {
    this._rollbar.warn(`Error ${get(err, this._statusCodePath)} de Aurus`);
    const message_error: string = isCardTrx
      ? this._unreachableProcessorMessage
      : get(err, "response.data.message", "");

    return new AurusError(`${get(err, this._statusCodePath)}`, message_error, {
      country,
      processorName: get(err, this._processorNamePath, ""),
      ...metadata,
    });
  }

  private _checkAurusError(
    err: AxiosError,
    method: string,
    metadata: object | undefined,
    decryptedBody: object | undefined,
    statusCode: number | undefined,
    merchantCountry?: string
  ): Observable<AurusError> {
    return of(1).pipe(
      mergeMap(() => this._checkIfIs211Error(err)),
      mergeMap(() =>
        iif(
          () =>
            (method === MethodsEnum.DEFERRED ||
              method === MethodsEnum.CHARGE) &&
            !`${statusCode}`.startsWith("5"),
          this._saveFailedCharge(err, decryptedBody),
          of(true)
        )
      ),
      switchMap(() => {
        if (!isEmpty(metadata))
          set(err, "response.data.transaction_details.metadata", metadata);

        const aurus_error: AurusError = `${statusCode}`.startsWith("5")
          ? this._build5XXAurusError(err, true, merchantCountry)
          : this._buildCommonAurusError(err, merchantCountry);

        return throwError(aurus_error);
      })
    );
  }

  private _performCustomRequest(
    encryptedObject: object,
    method: string,
    body: UnifiedChargesPreauthRequest | CaptureCardRequest,
    merchantCountry: string | undefined
  ) {
    return this.request<AurusResponse>(
      merchantCountry,
      encryptedObject,
      method,
      {},
      body
    );
  }

  private _getCountryCreateProcessor(
    country: string | undefined
  ): string | undefined {
    return country === "EEUU" ? "United States" : country;
  }

  /* eslint-disable sonarjs/cognitive-complexity*/
  private _setAurusChargeProperties(
    processor: DynamoProcessorFetch,
    body: ChargeInput,
    currency: Currency,
    amount: TransactionAmount
  ): AurusChargesRequest {
    const is_subscription_transaction: boolean = body.event.usrvOrigin.includes(
      UsrvOriginEnum.SUBSCRIPTIONS
    );
    const is_card_transaction: boolean = body.event.usrvOrigin.includes(
      UsrvOriginEnum.CARD
    );

    const aurus_charge_request: AurusChargesRequest = {
      currency_code: currency,
      language_indicator: "es",
      merchant_identifier: body.processor.private_id,
      plcc: body.plccInfo.flag,
      transaction_amount: amount,
      transaction_reference: body.currentToken.transactionReference,
      transaction_token: body.event.tokenId,
    };

    if (is_subscription_transaction) {
      if (
        get(body.currentMerchant, "country") === CountryEnum.USA &&
        processor.processor_name === ProcessorEnum.ELAVON
      )
        AurusGateway._setDataIfElavonProcessor(
          aurus_charge_request,
          get(body, this._shippingDetailsAddressPath, ""),
          get(body, this._shippingDetailsZipCodePath, ""),
          get(body, "taxId", "") || ""
        );

      set(
        aurus_charge_request,
        "merchant_identifier",
        body.event.failOverSubscription
          ? get(body.trxRuleResponse, "body.failOverProcessor.privateId", "")
          : body.trxRuleResponse.body.privateId
      );

      if (
        (currency === CurrencyEnum.PEN || currency === CurrencyEnum.USD) &&
        (processor.processor_name === ProcessorEnum.MCPROCESSOR ||
          processor.processor_name === ProcessorEnum.VISANET)
      )
        aurus_charge_request.email = this._processEmail;
    }

    if (
      (currency === CurrencyEnum.PEN || currency === CurrencyEnum.USD) &&
      (processor.processor_name === ProcessorEnum.MCPROCESSOR ||
        processor.processor_name === ProcessorEnum.VISANET) &&
      is_card_transaction
    ) {
      const charges_names: object = UtilsService.getdetailNames(
        body.currentToken.cardHolderName
      );

      aurus_charge_request.fingerprint = body.currentToken.transactionReference;
      aurus_charge_request.email = this._processEmail;
      aurus_charge_request.name = get(charges_names, "name", "NA");
      aurus_charge_request.lastName = get(charges_names, "lastName", "NA");
    }

    return aurus_charge_request;
  }
}
