import { IAPIGatewayEvent, ILogger, KushkiError } from "@kushki/core";
import { TokenTypeEnum } from "@kushki/core/lib/infrastructure/TokenTypeEnum";
import { Context } from "aws-lambda";
import { VALID_CARDS } from "constant/Resources";
import { TABLES } from "constant/Tables";
import { countryToAlpha3 } from "country-to-iso";
import { AuthValidationEnum } from "infrastructure/AuthValidationEnum";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { EnvironmentEnum } from "infrastructure/EnvironmentEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { ProcessorSsmKeyEnum } from "infrastructure/ProcessorSsmKeyEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { VaultTokenTypeEnum } from "infrastructure/VaultTokenTypeEnum";
import {
  defaultTo,
  get,
  has,
  isEmpty,
  isNil,
  isObject,
  remove,
  set,
  trim,
  unset,
} from "lodash";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, map, mergeMap, timeoutWith } from "rxjs/operators";
import {
  CaptureInput,
  ChargeInput,
  InvokeTrxRuleResponse,
} from "service/CardService";
import stringSimilarity = require("string-similarity");
import { Amount } from "types/amount";
import { AuthorizerContext, HierarchyConfig } from "types/authorizer_context";
import { BinInfoAcq } from "types/bin_info_acq";
import { BusinessPartner } from "types/business_partner";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { Configs, HierarchyCore } from "types/hierarchy_core";
import { CaptureKushkiAcqRequest } from "types/kushki_acq_capture_request";
import { LambdaValues } from "types/lambda_values";
import { ProsaCaptureRequest } from "types/prosa_capture_request";
import { ReAuthKushkiAcqRequest } from "types/reauth_kushki_request";
import { SandboxValues } from "types/sandbox_values";
import { SubMerchantData } from "types/sub_merchant_data";
import { TimeoutTransactionsTables } from "types/timeout_transactions_tables";
import { TimeoutVars } from "types/timeout_vars";
import { TokensCardBody } from "types/tokens_card_body";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { v4 } from "uuid";
import { CurrencyTypes } from "constant/CardTypes";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { DirectMerchantEnabledEnum } from "infrastructure/DirectMerchantEnabledEnum";

export class UtilsService {
  public static tokenGenerator(
    service: string
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      map(() => ({
        token: v4().replace(/-/g, ""),
      })),
      tag(`${defaultTo(service, "UtilsService")} | tokens`)
    );
  }

  public static triggerNotSupportMethodError(
    service: string,
    error?: KushkiError
  ): Observable<never> {
    return of(1).pipe(
      mergeMap(() =>
        throwError(defaultTo(error, new KushkiError(ERRORS.E041)))
      ),
      tag(`${service} | _triggerNotSupportMethodError`)
    );
  }

  public static checkBrand(
    brand: string,
    brandEnum: CardBrandEnum
  ): CardBrandEnum {
    const min: number = 0.6;
    const path_match: string = "bestMatch";
    const path_rating: string = "rating";

    const cards: string[] = Array.from(VALID_CARDS.keys());

    for (const card of cards) {
      const match = stringSimilarity.findBestMatch(
        brand,
        VALID_CARDS.get(card)!.options
      );

      if (match[path_match][path_rating] >= min)
        return VALID_CARDS.get(card)!.value;
    }
    return brandEnum;
  }

  public static getTimeoutProcessorTransactionsTable(
    tableKeyEnum: ProcessorSsmKeyEnum
  ): string {
    const tables: TimeoutTransactionsTables = JSON.parse(
      `${process.env.TIMEOUT_TRANSACTIONS_TABLES}`
    );

    return tables[tableKeyEnum];
  }

  public static getSubMerchantData(
    brand: string,
    softDescriptor: string,
    isBusinessPartner: boolean,
    subMerchantData: SubMerchantData
  ): SubMerchantData {
    try {
      if (isNil(softDescriptor)) throw new KushkiError(ERRORS.E047);
      const bs_partner: BusinessPartner = JSON.parse(
        `${process.env.BUSINESS_PARTNER}`
      );
      const cleared_brand = brand.toLowerCase().replace(/ /g, "");

      let sub_merchant_data = subMerchantData;

      if (isBusinessPartner)
        sub_merchant_data = {
          ...bs_partner,
          pfId: bs_partner.pfId[cleared_brand],
        };

      return {
        ...sub_merchant_data,
        pfId: bs_partner.pfId[cleared_brand],
        subName: softDescriptor,
      };
    } catch (e) {
      throw new KushkiError(ERRORS.E047);
    }
  }

  public static getStaticProcesorTimeoutValue(
    tableKeyEnum: ProcessorSsmKeyEnum
  ): number {
    const tables: TimeoutVars = JSON.parse(`${process.env.TIMEOUT_VARS}`);

    return tables[tableKeyEnum];
  }

  public static calculateFullAmount(amount: Amount): number {
    let total_amount: number =
      get(amount, "iva", 0) +
      get(amount, "subtotalIva", 0) +
      get(amount, "subtotalIva0", 0);

    if (get(amount, "ice", undefined) !== undefined)
      total_amount += get(amount, "ice", 0);

    if (get(amount, "extraTaxes", undefined) !== undefined) {
      total_amount += get(amount, "extraTaxes.agenciaDeViaje", 0);
      total_amount += get(amount, "extraTaxes.iac", 0);
      total_amount += get(amount, "extraTaxes.propina", 0);
      total_amount += get(amount, "extraTaxes.tip", 0);
      total_amount += get(amount, "extraTaxes.tasaAeroportuaria", 0);
    }

    return parseFloat(total_amount.toFixed(2));
  }

  public static getLambdaValues(): LambdaValues {
    return JSON.parse(`${process.env.LAMBDA_VALUES}`);
  }

  public static getSandboxValues(): SandboxValues {
    return JSON.parse(`${process.env.SANDBOX_VALUES}`);
  }

  public static add3DSFields(
    input: ChargeInput,
    request: object,
    version: string | undefined | number
  ): void {
    if (has(input, "currentToken.3ds"))
      set(
        request,
        "isFrictionless",
        isEmpty(get(input, "currentToken.3ds.detail.acsURL", ""))
      );

    if (
      isEmpty(
        defaultTo(
          get(input, "currentToken.3ds.detail.eci"),
          get(input, "currentToken.3ds.detail.eciRaw")
        )
      )
    )
      return;

    set(request, "3DS.cavv", get(input, "currentToken.3ds.detail.cavv"));
    set(
      request,
      "3DS.eci",
      defaultTo(
        get(input, "currentToken.3ds.detail.eci"),
        get(input, "currentToken.3ds.detail.eciRaw")
      )
    );
    set(request, "3DS.xid", get(input, "currentToken.3ds.detail.xid"));
    set(
      request,
      "3DS.directoryServerTransactionID",
      get(input, "currentToken.3ds.detail.directoryServerTransactionID")
    );
    set(request, "3DS.specificationVersion", version);
    set(
      request,
      "3DS.ucafAuthenticationData",
      get(input, "currentToken.3ds.detail.ucafAuthenticationData")
    );
    set(
      request,
      "3DS.ucafCollectionIndicator",
      get(input, "currentToken.3ds.detail.ucafCollectionIndicator")
    );
  }

  public static buildCaptureRequest(
    request: CaptureInput
  ): CaptureKushkiAcqRequest | ProsaCaptureRequest {
    const country_bin: string = UtilsService.getCountryISO(
      get(request, "transaction.card_country", "")
    );

    return {
      amount: !isNil(get(request, "body.amount"))
        ? get(request, "body.amount")
        : {
            currency: get(
              request,
              "transaction.currency_code"
            ) as CurrencyTypes,
            extraTaxes: get(request, "body.amount.extraTaxes"),
            ice: !isNil(request.transaction.ice_value)
              ? +request.transaction.ice_value.toFixed(2)
              : 0,
            iva: +get(request, "transaction.iva_value", 0).toFixed(2),
            subtotalIva: +get(request, "transaction.subtotal_iva", 0).toFixed(
              2
            ),
            subtotalIva0: +get(request, "transaction.subtotal_iva0", 0).toFixed(
              2
            ),
          },
      binInfo: {
        bank: get(request, "transaction.issuing_bank", ""),
        bin: get(request, "transaction.bin_card", ""),
        brand: get(request, "transaction.payment_brand", "").toUpperCase(),
        country: country_bin,
        prepaid: get(request, "currentToken.binInfo.info.prepaid", false),
        type: get(request, "transaction.card_type", "").toLowerCase(),
      },
      preauthTransactionReference: get(
        request,
        "transaction.transaction_reference",
        ""
      ),
      transactionReference: get(request, "trxReference", ""),
    };
  }

  public static buildReauthorizationValues(
    transaction: Transaction,
    amount: Amount,
    authorizerContext: AuthorizerContext
  ): ReAuthKushkiAcqRequest {
    const country_bin: string = UtilsService.getCountryISO(
      get(transaction, "card_country", "")
    );

    return {
      acquirerBank: get(transaction, "acquirer_bank", ""),
      authorizerContext:
        UtilsService.mapAuthorizerContextAcq(authorizerContext),
      binInfo: {
        bank: get(transaction, "issuing_bank", ""),
        bin: get(transaction, "bin_card", ""),
        brand: get(transaction, "payment_brand", "").toUpperCase(),
        country: country_bin,
        prepaid: get(transaction, "prepaid", false),
        type: get(transaction, "card_type", "").toLowerCase(),
      },
      card: {
        amount: {
          currency: get(amount, "currency", ""),
          extraTaxes: {
            agenciaDeViaje: get(amount, "extraTaxes.agenciaDeViaje", 0),
            iac: get(amount, "extraTaxes.iac", 0),
            ice: get(amount.extraTaxes, "extraTaxes.ice_value", 0),
            propina: get(amount, "extraTaxes.propina", 0),
            tasaAeroportuaria: get(amount, "extraTaxes.tasaAeroportuaria", 0),
          },
          iva: get(amount, "iva"),
          subtotalIva: get(amount, "subtotalIva"),
          subtotalIva0: get(amount, "subtotalIva0"),
        },
        bin: get(transaction, "bin_card"),
        brand: get(transaction, "payment_brand"),
        holderName: get(transaction, "card_holder_name", ""),
        lastFourDigits: get(transaction, "last_four_digits"),
        type: get(transaction, "card_type", ""),
      },
      isSubscription: true,
      maskedCardNumber: "",
      merchantId: get(transaction, "merchant_id"),
      merchantName: get(transaction, "merchant_name"),
      originalTrxReference: get(transaction, "transaction_reference", ""),
      processorBankName: get(transaction, "processor_bank_name"),
      processorId: get(transaction, "processor_id"),
      processorMerchantId: get(transaction, "processor_merchant_id", ""),
      terminalId: "",
      tokenType: get(transaction, "token_type", "transaction"),
      transactionReference: v4(),
      vaultToken: get(transaction, "vault_token", ""),
    };
  }

  public static mapAuthorizerContextAcq(
    authorizerContext: AuthorizerContext
  ): AuthorizerContext {
    const hierarchy_path: string = "hierarchyConfig";
    const is_object_hierarchy_config: boolean = isObject(
      get(authorizerContext, hierarchy_path, {})
    );
    const hierarchy_config: HierarchyConfig = is_object_hierarchy_config
      ? get(authorizerContext, hierarchy_path, {})
      : JSON.parse(<string>get(authorizerContext, hierarchy_path, "{}"));

    return {
      ...authorizerContext,
      hierarchyConfig: { ...hierarchy_config },
    };
  }

  public static validateIf(
    condition: boolean,
    ifTrue: VoidFunction,
    ifFalse?: VoidFunction
  ) {
    if (condition) ifTrue();
    if (ifFalse) ifFalse();
  }

  public static cleanProcessorName(name: string): string {
    return name.replace(/Processor/g, "").replace(/^\s+|\s+$/g, "");
  }

  public static transformCardName(cardName: string): string {
    if (!cardName) return "NA";

    let str = cardName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    str = str.replace(/[^\x00-\x7F]/g, "");
    str = str.replace(/[^a-zA-Z 0-9]+/g, "");

    return str;
  }

  public static getdetailNames(fullName: string | undefined): object {
    if (fullName === undefined) return {};

    fullName = UtilsService.transformCardName(fullName);
    const names: string[] = remove(
      trim(fullName).split(" "),
      (value: string) => value !== ""
    );
    const names_length: number = names.length;

    switch (names_length) {
      case 1:
        return {
          name: names[0],
        };
      case 2:
        return {
          lastName: names[1],
          name: names[0],
        };
      default:
        return {
          lastName: names[2],
          name: names[0],
        };
    }
  }

  public static getCountryISO(country: string): string {
    return defaultTo(countryToAlpha3(country), "");
  }

  public static invalidBinInfo(binInfo?: BinInfoAcq): boolean {
    return !binInfo || !binInfo.bin || !binInfo.brand || !binInfo.country;
  }

  public static buildChargeInput(
    amount: Amount,
    currentToken: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch,
    transactionType: TransactionRuleTypeEnum,
    body: ChargesCardRequest | UnifiedChargesPreauthRequest,
    authorizerContext: AuthorizerContext,
    data: InvokeTrxRuleResponse,
    context: Context,
    tokenType: TokenTypeEnum,
    convertedAmount?: Amount | undefined
  ): ChargeInput {
    let charge_input: ChargeInput = {
      amount,
      authorizerContext,
      convertedAmount,
      currentMerchant,
      currentToken,
      tokenType,
      transactionType,
      address: get(body, "orderDetails.billingDetails.address"),
      event: <UnifiedChargesPreauthRequest>body,
      initialRecurrenceReference: body.initialRecurrenceReference,
      isAft: body.isAft,
      isFailoverRetry: false,
      isOCT: body.isOCT,
      lambdaContext: context,
      originUsrv: body.usrvOrigin,
      plccInfo: data.plccInfo,
      postalCode: get(body, "orderDetails.billingDetails.zipCode"),
      processor: data.processor,
      trxRuleResponse: data.trxRuleResponse,
    };

    const is_subscriptions: boolean = get(
      body,
      "usrvOrigin",
      UsrvOriginEnum.CARD
    ).includes(UsrvOriginEnum.SUBSCRIPTIONS);

    if (is_subscriptions) {
      const charges_names: object = UtilsService.getdetailNames(
        body.cardHolderName
      );

      set(charge_input, "email", get(body, "contactDetails.email", ""));
      set(
        charge_input,
        "name",
        get(
          charges_names,
          "name",
          UtilsService.transformCardName(get(body, "contactDetails.name", null))
        )
      );
      set(
        charge_input,
        "lastName",
        get(
          charges_names,
          "lastName",
          UtilsService.transformCardName(
            get(body, "contactDetails.lastName", null)
          )
        )
      );
      set(charge_input, "metadata", body.metadata);
      set(charge_input, "orderDetails", body.orderDetails);
      set(charge_input, "token", body.tokenId);
      set(charge_input, "deferred", body.deferred);

      if (!isEmpty(get(body, "cvv")))
        set(charge_input, "cvv", get(body, "cvv"));

      if (body.merchant.whiteList)
        set(charge_input, "skipSecurityValidation", true);

      charge_input = UtilsService.getPlccMetadata(charge_input);

      charge_input.subscriptionMinChargeTrxRef =
        body.subscriptionMinChargeTrxRef;
    }

    const is_datafast_all_enabled = this.isDatafastDirectAllEnabled(
      data.processor.processor_name
    );
    const is_credimatic_all_enabled = this.isCredimaticDirectAllEnabled(
      data.processor.processor_name
    );

    if (is_datafast_all_enabled || is_credimatic_all_enabled)
      set(charge_input, "trxRuleResponse.body.integration", "direct");

    return charge_input;
  }

  public static getPlccMetadata(chargeBody: ChargeInput): ChargeInput {
    if (
      !(
        (Boolean(get(chargeBody, "event.plccMetadataId")) &&
          chargeBody.plccInfo.flag === "1") ||
        Boolean(get(chargeBody, "event.subMetadataId"))
      )
    )
      return chargeBody;

    const token_type: VaultTokenTypeEnum = !isEmpty(
      get(chargeBody.event, "subMetadataId", "")
    )
      ? VaultTokenTypeEnum.SUB_METADATA
      : VaultTokenTypeEnum.PLCC_INFO;

    const id: string = !isEmpty(get(chargeBody.event, "subMetadataId", ""))
      ? get(chargeBody.event, "subMetadataId", "")
      : get(chargeBody.event, "plccMetadataId", "");

    return {
      ...chargeBody,
      metadataId: id,
      subtokenType: token_type,
    };
  }

  public static getFisVariables() {
    return JSON.parse(defaultTo(process.env.FIS_VARIABLES, "{}"));
  }

  public static getCustomerInfo(
    storage: IDynamoGateway,
    logger: ILogger,
    publicMerchantId: string
  ): Observable<DynamoMerchantFetch | undefined> {
    return of(1).pipe(
      mergeMap(() =>
        storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
          public_id: publicMerchantId,
        })
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      catchError((chargeError: KushkiError | Error) => {
        logger.error("UtilService | getCustomerInfo", chargeError);
        return of(undefined);
      }),
      tag("UtilService | getCustomerInfo")
    );
  }

  public static validateRequestHierarchyMerchant(
    storage: IDynamoGateway,
    logger: ILogger,
    publicMerchantId: string,
    node: string
  ): Observable<string> {
    return of(1).pipe(
      mergeMap(() =>
        UtilsService.getHierarchyMerchant(storage, logger, publicMerchantId)
      ),
      mergeMap((hierarchyMerchant: HierarchyCore[]) =>
        of(
          get(hierarchyMerchant, "[0].configs", []).filter(
            (config: Configs) =>
              config.configuration === node &&
              !isEmpty(config.centralizedNodesId)
          )
        )
      ),
      mergeMap((configs: Configs[]) =>
        iif(() => isEmpty(configs), of(""), of(get(configs, "[0].value", "")))
      ),
      tag("UtilService | validateRequestHierarchyMerchant")
    );
  }

  public static getHierarchyMerchant(
    storage: IDynamoGateway,
    logger: ILogger,
    publicMerchantId: string
  ): Observable<HierarchyCore[]> {
    return of(1).pipe(
      mergeMap(() =>
        storage.query<HierarchyCore>(
          TABLES.hierarchy_core,
          IndexEnum.merchant_id_index,
          "merchantId",
          publicMerchantId
        )
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      catchError((chargeError: KushkiError | Error) => {
        logger.error("UtilService | getHierarchyMerchant", chargeError);
        return of([]);
      }),
      tag("UtilService | getHierarchyMerchant")
    );
  }

  public static hasCybersourceApiValidationUrl({
    transactionRuleInfo: trx_rule_info,
    authValidation: auth_validation,
  }: TokensCardBody): boolean {
    return (
      trx_rule_info.cybersourceApiValidation &&
      (auth_validation === AuthValidationEnum.URL ||
        auth_validation === AuthValidationEnum.IFRAME)
    );
  }

  public static isDatafastDirectAllEnabled(proccessorName: string): boolean {
    return (
      proccessorName === ProcessorEnum.DATAFAST &&
      this.getDatafastDirectEnabled() === DirectMerchantEnabledEnum.ALL
    );
  }

  public static isCredimaticDirectAllEnabled(proccessorName: string): boolean {
    return (
      proccessorName === ProcessorEnum.CREDIMATIC &&
      this.getCredimaticDirectEnabled() === DirectMerchantEnabledEnum.ALL
    );
  }

  public static getDatafastDirectEnabled(): string {
    return (
      process.env.DATAFAST_DIRECT_ENABLED || DirectMerchantEnabledEnum.NONE
    );
  }

  public static getCredimaticDirectEnabled(): string {
    return (
      process.env.CREDIMATIC_DIRECT_ENABLED || DirectMerchantEnabledEnum.NONE
    );
  }

  public static generateSecureValidationUrl(
    token: string,
    {
      requestContext: context,
      body,
    }: IAPIGatewayEvent<TokensCardBody, null, null, AuthorizerContext>,
    isSandboxEnable: boolean
  ): string {
    const merchant_id = get(context, "authorizer.publicCredentialId", "");
    const bin = get(body, "binInfo.bin", "");
    const bin_encoded = Buffer.from(bin, "binary").toString("base64");
    const callback_url = get(body, "callbackUrl", "");
    const iframe_param =
      get(body, "authValidation") !== AuthValidationEnum.IFRAME
        ? ""
        : `&authValidation=iframe`;
    const sandbox_param =
      process.env.USRV_STAGE === EnvironmentEnum.PRIMARY
        ? ""
        : `&isSandbox=${isSandboxEnable}`;

    return `${process.env.SECURE_VALIDATION_URL}?token=${token}&merchantId=${merchant_id}&bin=${bin_encoded}&callbackUrl=${callback_url}${sandbox_param}${iframe_param}`;
  }
}
