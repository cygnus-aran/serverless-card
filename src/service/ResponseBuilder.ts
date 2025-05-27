/**
 * ResponseBuilder Static Class
 */
import camelcaseKeys = require("camelcase-keys");
import deepCleaner = require("deep-cleaner");
import dotObject = require("dot-object");
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import {
  TransactionTypeEnum,
  TRX_TYPE_SUBSCRIPTION,
} from "infrastructure/TransactionTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, isEmpty, set, unset } from "lodash";
import { AurusChargesResponse } from "types/aurus_charges_response";
import { AurusResponse } from "types/aurus_response";
import { ChargesCardResponse, Details } from "types/charges_card_response";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { LambdaTransactionRuleBodyResponse } from "types/lambda_transaction_rule_response";
import {
  MessageFields,
  PreauthFullResponseV2,
} from "types/preauth_full_response_v2";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { VoidCardResponse } from "types/void_card_response";
import { VoidCardResponseV2 } from "types/void_card_response_v2";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { ThreeDSCustomerResponseObject } from "types/three_domain_secure_customer_response";

type BinFetchType = DynamoBinFetch | undefined;
const ACQUIRER_BANK_TARGET_STRING: string = "details.acquirerBank";

export class ResponseBuilder {
  public static getVoidFullResponseV1(
    binFetch: DynamoBinFetch | undefined,
    acquirerBank: string | undefined,
    saleTicketNumber: string | undefined,
    voidTransaction: Transaction
  ): VoidCardResponse {
    const response: VoidCardResponse = {
      ticketNumber: voidTransaction.ticket_number,
    };

    unset(voidTransaction, "ticket_number");
    delete voidTransaction.mccCode;
    delete voidTransaction.amount;
    delete voidTransaction.transactionDetails;
    delete voidTransaction.transaction_details;
    delete voidTransaction.pendingAmount;
    delete voidTransaction.vault_token;
    delete voidTransaction.integration;
    delete voidTransaction.consortium_name;
    delete voidTransaction.card_country;
    delete voidTransaction.card_country_code;
    delete voidTransaction.card_type_bin;
    delete voidTransaction.commerceCode;
    delete voidTransaction.processorPrivateId;
    delete voidTransaction.security;
    delete voidTransaction.plcc;
    delete voidTransaction.processor_merchant_id;
    unset(voidTransaction, "transaction_type");

    response.details = <Details>camelcaseKeys({
      acquirerBank,
      saleTicketNumber,
      ...voidTransaction,
      binInfo: ResponseBuilder.summarizeBinInfo(binFetch),
      categoryMerchant: get(voidTransaction, "category_merchant"),
      integrationMethod: get(voidTransaction, "integration_method", null),
      issuingBank: get(binFetch, "bank"),
      maskedCreditCard: `${voidTransaction.bin_card}XXXX${voidTransaction.last_four_digits}`,
      socialReason: get(voidTransaction, "social_reason"),
      transaction_status: TransactionStatusEnum.INITIALIZED,
      transaction_type: TransactionTypeEnum.VOID,
    });

    unset(response, "details.cardCountry");
    unset(response, "details.cardCountryCode");
    unset(response, "details.externalReferenceId");

    return response;
  }

  public static getCaptureFullResponse(
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    aurusData: AurusResponse,
    captureTransaction: Transaction,
    binFetch: BinFetchType,
    version: "v1" | "v2"
  ): ChargesCardResponse {
    let new_response: ChargesCardResponse;
    const response: ChargesCardResponse = {
      details: {
        approvalCode: aurusData.transaction_details.approvalCode,
        approvedTransactionAmount:
          captureTransaction.approved_transaction_amount,
        binCard: ResponseBuilder.binLength(
          aurusData.transaction_details.binCard
        ),
        binInfo: ResponseBuilder.summarizeBinInfo(binFetch),
        cardHolderName: transaction.card_holder_name,
        lastFourDigits: aurusData.transaction_details.lastFourDigitsOfCard,
        merchantId: transaction.merchant_id,
        merchantName: transaction.merchant_name,
        paymentBrand: transaction.payment_brand,
        preauthTransactionReference: transaction.transaction_reference,
        processorBankName: transaction.processor_bank_name,
        recap: aurusData.recap,
        responseCode: aurusData.response_code,
        responseText: aurusData.response_text,
        ticketNumber: aurusData.ticket_number,
        transactionId: aurusData.transaction_id,
        transactionReference: captureTransaction.transaction_reference,
        transactionType: TransactionStatusEnum.CAPTURE,
      },
      ticketNumber: aurusData.ticket_number,
      transactionReference: get(
        captureTransaction,
        "transaction_reference",
        ""
      ),
    };

    unset(response, "details.transactionId");

    if (version === "v1")
      new_response = ResponseBuilder._getCaptureFullResponseV1(
        transaction,
        processor,
        response
      );
    else
      new_response = ResponseBuilder._getCaptureFullResponseV2(
        transaction,
        captureTransaction,
        response
      );

    return new_response;
  }

  private static _getCaptureFullResponseV1(
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    response: ChargesCardResponse
  ): ChargesCardResponse {
    let current_details: Details = <Details>response.details;

    delete transaction.card_country;
    delete transaction.card_country_code;

    current_details = {
      ...current_details,
      currencyCode: transaction.currency_code,
      fullResponse: true,
      maskedCardNumber: `${ResponseBuilder.binLength(
        transaction.bin_card
      )}XXXXXX${transaction.last_four_digits}`,
      processorId: transaction.processor_id,
      processorName:
        transaction.processor_name === ProcessorEnum.BILLPOCKET
          ? ProcessorEnum.PROSA_AGR
          : transaction.processor_name,
      syncMode: "online",
    };
    response = {
      ...response,
      details: current_details,
    };
    // istanbul ignore next
    if (processor.acquirer_bank !== undefined)
      dotObject.copy(
        "acquirer_bank",
        ACQUIRER_BANK_TARGET_STRING,
        processor,
        response
      );

    return response;
  }

  public static getVoidFullResponseV2(
    binFetch: DynamoBinFetch | undefined,
    acquirerBank: string | undefined,
    saleTicketNumber: string | undefined,
    voidTransaction: Transaction,
    externalReferenceId: string | undefined
  ): VoidCardResponseV2 {
    let response: VoidCardResponseV2 = {
      details: {
        acquirerBank,
        saleTicketNumber,
        amount: get(voidTransaction, "amount"),
        approvalCode: voidTransaction.approval_code,
        approvedTransactionAmount: voidTransaction.approved_transaction_amount,
        binInfo: {
          bank: get(binFetch, "bank"),
          binCard: ResponseBuilder.binLength(
            get(voidTransaction, "bin_card", "XXXXXX")
          ),
          lastFourDigits: get(voidTransaction, "last_four_digits", "XXXX"),
          type: get(binFetch, "info.type"),
        },
        cardHolderName: voidTransaction.card_holder_name,
        created: voidTransaction.created,
        externalReferenceId,
        merchantId: voidTransaction.merchant_id,
        merchantName: voidTransaction.merchant_name,
        paymentBrand: voidTransaction.payment_brand,
        processorBankName: voidTransaction.processor_bank_name,
        recap: voidTransaction.recap,
        requestAmount: voidTransaction.request_amount,
        responseCode: voidTransaction.response_code,
        responseText: voidTransaction.response_text,
        transactionId: voidTransaction.transaction_id,
        transactionStatus: TransactionStatusEnum.INITIALIZED,
        transactionType: TransactionTypeEnum.VOID,
      },
      ticketNumber: voidTransaction.ticket_number,
      transactionReference: get(voidTransaction, "transaction_reference", ""),
    };

    if (!isEmpty(voidTransaction.email))
      set(response, "details.contactDetails", { email: voidTransaction.email });

    unset(response, "details.merchantCountry");
    unset(response, "details.tokenCreated");
    unset(response, "details.transactionKind");
    unset(response, "details.tokenCurrency");
    unset(response, "details.usrvOrigin");
    unset(response, "details.cvv");
    unset(response, "details.vaultToken");
    unset(response, "details.tokenId");
    unset(response, "details.authorizerContext");
    unset(response, "details.expiryYear");
    unset(response, "details.merchant");
    unset(response, "details.expiryMonth");
    unset(response, "details.interestAmount");

    response = deepCleaner(response);

    return response;
  }

  public static binLength(
    binCard: string,
    isMaskedCreditCard?: boolean
  ): string {
    if (isMaskedCreditCard)
      return binCard.length === 6 ? binCard + "XX" : binCard;
    return binCard.length === 6 ? binCard : binCard.slice(0, 6);
  }

  private static _getCaptureFullResponseV2(
    transaction: Transaction,
    captureTransaction: Transaction,
    response: ChargesCardResponse
  ): ChargesCardResponse {
    let current_details: Details = <Details>response.details;

    current_details = {
      ...current_details,
      amount: captureTransaction.amount,
      binInfo: {
        ...get(response, "details.binInfo"),
        binCard: ResponseBuilder.binLength(
          get(response, "details.binCard", "XXXXXX")
        ),
        lastFourDigits: get(response, "details.lastFourDigits", "XXXX"),
      },
      created: captureTransaction.created,
      requestAmount: transaction.request_amount,
      token: transaction.token,
      transactionStatus: TransactionStatusEnum.APPROVAL,
    };

    if (!isEmpty(transaction.email))
      current_details.contactDetails = { email: transaction.email };

    if (!isEmpty(captureTransaction.external_reference_id))
      current_details.externalReferenceId =
        captureTransaction.external_reference_id;

    response = {
      ...response,
      details: current_details,
      transactionReference: get(
        captureTransaction,
        "transaction_reference",
        ""
      ),
    };

    unset(response, "details.lastFourDigits");
    unset(response, "details.binCard");

    return response;
  }

  public static summarizeBinInfo(binFetch: BinFetchType): object {
    return binFetch !== undefined && binFetch.info !== undefined
      ? // istanbul ignore next
        { bank: binFetch.bank, type: binFetch.info.type }
      : { bank: null, type: null };
  }

  public static getPreauthAndChargeFullResponseV2(
    transaction: Transaction,
    binFetch: DynamoBinFetch | undefined,
    isTransbankProcessor: boolean,
    trxRuleResponse: LambdaTransactionRuleBodyResponse,
    event?: UnifiedChargesPreauthRequest,
    token3ds?: DynamoTokenFetch
  ): PreauthFullResponseV2 {
    const is_subscription_trx: boolean = get(event, "usrvOrigin", "").includes(
      UsrvOriginEnum.SUBSCRIPTIONS
    );
    let rs: PreauthFullResponseV2 = {
      details: {
        amount: get(transaction, "amount"),
        approvalCode: transaction.approval_code,
        approvedTransactionAmount: transaction.approved_transaction_amount,
        binInfo: {
          bank: get(binFetch, "bank"),
          binCard: ResponseBuilder.binLength(
            get(transaction, "bin_card", "XXXXXX")
          ),
          cardCountry: get(binFetch, "info.country.name"),
          lastFourDigits: get(transaction, "last_four_digits", "XXXX"),
          type: isTransbankProcessor
            ? get(transaction, "card_type")
            : get(binFetch, "info.type", ""),
        },
        cardHolderName: transaction.card_holder_name,
        created: transaction.created,
        merchantId: transaction.merchant_id,
        merchantName: transaction.merchant_name,
        messageFields: get(transaction, "message_fields"),
        paymentBrand: transaction.payment_brand,
        processorBankName: transaction.processor_bank_name,
        recap: transaction.recap,
        requestAmount: transaction.request_amount,
        responseCode: transaction.response_code,
        responseText: transaction.response_text,
        rules: transaction.rules,
        transactionId: transaction.transaction_id,
        transactionReference: transaction.transaction_reference,
        transactionStatus: transaction.transaction_status,
        transactionType: transaction.transaction_type,
      },
      ticketNumber: transaction.ticket_number,
      transactionReference: get(transaction, "transaction_reference", ""),
    };
    if (token3ds?.["3ds"]) {
      set(
        rs,
        "threeDSecure",
        this.build3dsResponse(token3ds, get(binFetch, "brand", ""))
      );
    }

    if (is_subscription_trx) {
      set(rs, "details.maskedCreditCard", get(event, "maskedCardNumber"));
      set(
        rs,
        "aurusResponse",
        ResponseBuilder.getPreauthAndChargeAurusResponse(
          transaction,
          binFetch,
          isTransbankProcessor,
          event
        )
      );

      set(rs, "trxResponse", trxRuleResponse);

      if (
        TRX_TYPE_SUBSCRIPTION.includes(
          get(transaction, "transaction_type", TransactionTypeEnum.SALE)
        )
      ) {
        set(rs, "subscriptionId", get(event, "subscriptionId"));
        set(rs, "details.token", get(event, "tokenId"));
      }
    }

    if (transaction.transaction_status === TransactionStatusEnum.APPROVAL)
      delete rs.details!.rules;

    if (!isEmpty(transaction.email))
      set(transaction, "details.contactDetails", { email: transaction.email });

    if (
      !isEmpty(get(transaction, "buy_order")) &&
      isEmpty(get(rs, "details.recap"))
    )
      set(rs, "details.recap", get(transaction, "buy_order"));

    unset(rs, "details.amount.totalAmount");

    const external_reference_id: string = get(event, "externalReferenceId", "");

    if (!isEmpty(external_reference_id))
      set(rs, "details.externalReferenceId", external_reference_id);

    rs = deepCleaner(rs);

    return rs;
  }

  public static build3dsResponse(
    token3ds: DynamoTokenFetch | undefined,
    brand?: string | undefined
  ): ThreeDSCustomerResponseObject | undefined {
    const eci_value: string = ResponseBuilder._getECI(token3ds);

    return (
      token3ds && {
        authenticated: get(token3ds, "3ds.authentication", false),
        eci: eci_value,
        brand: brand || "",
        version: get(
          token3ds,
          "3ds.detail.specificationVersion",
          ""
        ).toString(),
        enrollment_status: get(token3ds, "3ds.detail.veresEnrolled", ""),
      }
    );
  }

  private static _getECI(token3ds: DynamoTokenFetch | undefined): string {
    const eciRaw: string = get(token3ds, "3ds.detail.eciRaw", "");
    if (!isEmpty(eciRaw)) {
      return eciRaw;
    }
    const eci_value: string = get(token3ds, "3ds.detail.eci", "");
    if (!isEmpty(eci_value)) {
      return eci_value;
    }
    const ucaf: string = get(
      token3ds,
      "3ds.detail.ucafCollectionIndicator",
      ""
    );
    if (!isEmpty(ucaf)) {
      return ucaf.padStart(2, "0");
    }
    return "";
  }

  public static getPreauthAndChargeAurusResponse(
    transaction: Transaction,
    binFetch: DynamoBinFetch | undefined,
    isTransbankProcessor: boolean,
    event?: UnifiedChargesPreauthRequest
  ): AurusChargesResponse {
    let rs: AurusChargesResponse = {
      approved_amount: get(
        transaction,
        "approved_transaction_amount",
        0
      ).toFixed(2),
      recap: get(transaction, "recap", ""),
      response_code: get(transaction, "response_code", ""),
      response_text: get(transaction, "response_text", ""),
      ticket_number: transaction.ticket_number,
      transaction_details: {
        approvalCode: transaction.approval_code,
        binCard: get(transaction, "bin_card", "XXXXXX"),
        cardHolderName: transaction.card_holder_name,
        cardType: isTransbankProcessor
          ? get(transaction, "card_type", "")
          : get(binFetch, "info.type", ""),
        isDeferred: get(event, "isDeferred", ""),
        lastFourDigitsOfCard: get(transaction, "last_four_digits", "XXXX"),
        merchantName: transaction.merchant_name,
        processorBankName: transaction.processor_bank_name,
        processorName: transaction.processor_name,
      },
      transaction_id: transaction.transaction_id,
    };

    rs = deepCleaner(rs);

    return rs;
  }

  public static getErrorMetadataV2(
    trx: Transaction,
    error_metadata: object,
    currentToken?: DynamoTokenFetch
  ): object {
    const message_fields: MessageFields = get(trx, "message_fields");
    let metadata: object = {
      amount: get(trx, "amount"),
      approvalCode: trx.approval_code,
      approvedTransactionAmount: trx.approved_transaction_amount,
      binInfo: {
        bank: trx.issuing_bank,
        binCard: ResponseBuilder.binLength(get(trx, "bin_card", "")),
        lastFourDigits: trx.last_four_digits,
        type: trx.card_type,
      },
      cardHolderName: trx.card_holder_name,
      created: trx.created,
      merchantId: trx.merchant_id,
      merchantName: trx.merchant_name,
      messageFields: {
        ...message_fields,
        restricted: get(error_metadata, "restricted"),
      },
      paymentBrand: trx.payment_brand,
      processorBankName: trx.processor_bank_name,
      recap: trx.recap,
      requestAmount: trx.request_amount,
      responseCode: trx.response_code,
      responseText: trx.response_text,
      rules: trx.rules,
      transactionId: trx.transaction_id,
      transactionReference: trx.transaction_reference,
      transactionStatus: trx.transaction_status,
      transactionType: trx.transaction_type,
    };

    if (get(trx, "processor.code"))
      set(metadata, "isoErrorCode", get(trx, "processor.code"));

    unset(metadata, "amount.totalAmount");

    if (currentToken?.["3ds"]) {
      set(
        metadata,
        "threeDSecure",
        this.build3dsResponse(currentToken, trx.payment_brand)
      );
    }

    const external_reference_id: string = get(trx, "external_reference_id", "");

    if (!isEmpty(external_reference_id))
      set(metadata, "externalReferenceId", external_reference_id);

    metadata = deepCleaner(metadata);

    return metadata;
  }
}
