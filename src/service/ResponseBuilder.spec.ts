import { expect } from "chai";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, set } from "lodash";
import { ResponseBuilder } from "service/ResponseBuilder";
import { Mock } from "ts-mockery";
import { AurusChargesResponse } from "types/aurus_charges_response";
import { AurusResponse } from "types/aurus_response";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { LambdaTransactionRuleBodyResponse } from "types/lambda_transaction_rule_response";
import { PreauthFullResponseV2 } from "types/preauth_full_response_v2";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { VoidCardResponse } from "types/void_card_response";
import { VoidCardResponseV2 } from "types/void_card_response_v2";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";

describe("ResponseBuilder", () => {
  describe("getVoidFullResponse", () => {
    let bin_fetch: DynamoBinFetch | undefined;
    let transaction: Transaction;

    beforeEach(() => {
      bin_fetch = {
        bank: "",
        bin: "",
        brand: "",
        info: {},
        processor: "",
      };
      transaction = Mock.of<Transaction>({
        approval_code: "21321",
        approved_transaction_amount: 344,
        bin_card: "333333",
        card_holder_name: "name",
        created: 123242342,
        currency_code: "COP",
        iva_value: 5,
        last_four_digits: "1234",
        merchant_id: "merchant_id",
        merchant_name: "merchant_name",
        payment_brand: "visa",
        processor_bank_name: "processor_bank_name",
        processor_id: "processor_id",
        processor_name: "processor_name",
        recap: "recap",
        request_amount: 344,
        subtotal_iva: 5,
        subtotal_iva0: 2,
        sync_mode: "api",
        ticket_number: "934988943",
        transaction_id: "11111111",
        transaction_reference: "098765432221",
        transaction_status: TransactionStatusEnum.INITIALIZED,
        transaction_type: TransactionTypeEnum.VOID,
      });
    });

    it("getVoidFullResponseV1 should return VoidCardResponse", () => {
      const rs: VoidCardResponse = ResponseBuilder.getVoidFullResponseV1(
        bin_fetch,
        "asdacre",
        "saleTicketNumber",
        transaction
      );

      expect(rs).not.to.be.undefined;
      expect(rs.ticketNumber).to.be.eqls("934988943");
    });

    it("getVoidFullResponseV2 should return VoidCardResponseV2", () => {
      transaction.email = "test@mail.co";
      transaction.bin_card = "12345678";

      const rs: VoidCardResponseV2 = ResponseBuilder.getVoidFullResponseV2(
        bin_fetch,
        "asdasd",
        "saleTicketNumber",
        transaction,
        "some externalReferenceId"
      );

      expect(rs).not.to.be.undefined;
      expect(rs.details.contactDetails).not.be.undefined;
      expect(rs.ticketNumber).to.be.eqls("934988943");
      expect(rs.transactionReference).to.be.eqls("098765432221");
    });

    it("when getVoidFullResponseV2 is called with undefined email should return VoidCardResponseV2", () => {
      transaction.email = undefined;
      const rs: VoidCardResponseV2 = ResponseBuilder.getVoidFullResponseV2(
        bin_fetch,
        "extraordinary",
        "213213123213123",
        transaction,
        "some externalReferenceId"
      );

      expect(rs).not.to.be.undefined;
    });

    it("should return success response when externalReferenceId is undefined", () => {
      const rs: VoidCardResponseV2 = ResponseBuilder.getVoidFullResponseV2(
        bin_fetch,
        "extraordinary",
        "213213123213123",
        transaction,
        undefined
      );

      expect(rs).not.to.be.undefined;
      expect(rs.details.externalReferenceId).to.be.undefined;
    });
  });
  describe("Capture fullResponse", () => {
    let transaction: Transaction;
    let processor: DynamoProcessorFetch;
    let aurus_response: AurusResponse;
    let capture_transaction: Transaction;
    let bin_fetch: DynamoBinFetch | undefined;

    beforeEach(() => {
      transaction = {
        approval_code: "",
        approved_transaction_amount: 0,
        bin_card: "",
        card_holder_name: "",
        created: 0,
        currency_code: "",
        iva_value: 0,
        last_four_digits: "",
        merchant_id: "",
        merchant_name: "",
        payment_brand: "",
        processor_bank_name: "",
        processor_id: "",
        processor_name: ProcessorEnum.BILLPOCKET,
        recap: "",
        request_amount: 0,
        subtotal_iva: 0,
        subtotal_iva0: 0,
        sync_mode: "online",
        ticket_number: "",
        transaction_id: "",
        transaction_reference: "02394-2jdsof-02934kj-spdf0",
        transaction_status: "",
        transaction_type: "",
      };
      processor = {
        created: 4343,
        merchant_id: "20000000004050465",
        private_id: "100000000002394503405345",
        processor_name: "Visa Net Processor",
        processor_type: "gateway",
        public_id: "2000002300324",
        terminal_id: "234034",
      };
      aurus_response = {
        approved_amount: "400",
        binCard: "12345678",
        recap: "30",
        response_code: "00",
        response_text: "Transaccion declinada",
        ticket_number: "120045060540600",
        transaction_details: {
          approvalCode: "",
          binCard: "",
          cardHolderName: "",
          cardType: "",
          isDeferred: "",
          lastFourDigitsOfCard: "",
          merchantName: "",
          processorBankName: "",
          processorName: "",
        },
        transaction_id: "",
        transaction_reference: "",
      };
      capture_transaction = {
        approval_code: "",
        approved_transaction_amount: 0,
        bin_card: "",
        card_holder_name: "",
        created: 0,
        currency_code: "",
        iva_value: 0,
        last_four_digits: "",
        merchant_id: "",
        merchant_name: "",
        payment_brand: "",
        processor_bank_name: "",
        processor_id: "",
        processor_name: "",
        recap: "",
        request_amount: 400,
        subtotal_iva: 0,
        subtotal_iva0: 400,
        sync_mode: "online",
        ticket_number: "",
        transaction_id: "",
        transaction_reference: "98234ls-s09diufao-as0d9f-98dsfk",
        transaction_status: "",
        transaction_type: "",
      };
      bin_fetch = {
        bank: "banco",
        bin: "",
        brand: "",
        info: {},
        processor: "",
      };
      transaction.transaction_type = TransactionTypeEnum.CAPTURE;
    });

    it("should return a valid SubscriptionChargesResponse object v2 version", () => {
      transaction.email = "test2@mail.com";
      aurus_response.binCard = "123456";
      delete transaction.transactionType;
      const rs: object = ResponseBuilder.getCaptureFullResponse(
        transaction,
        processor,
        aurus_response,
        capture_transaction,
        bin_fetch,
        "v2"
      );

      expect(rs).not.to.be.undefined;
      expect(rs).to.be.eqls({
        details: {
          amount: capture_transaction.amount,
          approvalCode: aurus_response.transaction_details.approvalCode,
          approvedTransactionAmount:
            capture_transaction.approved_transaction_amount,
          binInfo: {
            bank: get(bin_fetch, "bank"),
            binCard: get(
              aurus_response,
              "transaction_details.binCard",
              "XXXXXX"
            ),
            lastFourDigits: get(
              aurus_response,
              "transaction_details.lastFourDigitsOfCard",
              "XXXX"
            ),
            type: undefined,
          },
          cardHolderName: transaction.card_holder_name,
          contactDetails: { email: transaction.email },
          created: capture_transaction.created,
          merchantId: transaction.merchant_id,
          merchantName: transaction.merchant_name,
          paymentBrand: transaction.payment_brand,
          preauthTransactionReference: transaction.transaction_reference,
          processorBankName: transaction.processor_bank_name,
          recap: aurus_response.recap,
          requestAmount: transaction.request_amount,
          responseCode: aurus_response.response_code,
          responseText: aurus_response.response_text,
          ticketNumber: aurus_response.ticket_number,
          token: transaction.token,
          transactionReference: capture_transaction.transaction_reference,
          transactionStatus: TransactionStatusEnum.APPROVAL,
          transactionType: TransactionStatusEnum.CAPTURE,
        },
        ticketNumber: aurus_response.ticket_number,
        transactionReference: capture_transaction.transaction_reference,
      });
    });

    it("should return a valid SubscriptionChargesResponse object v2 version without the contactDetails", () => {
      delete transaction.transactionType;
      aurus_response.binCard = "123456";
      const rs: object = ResponseBuilder.getCaptureFullResponse(
        transaction,
        processor,
        aurus_response,
        capture_transaction,
        bin_fetch,
        "v2"
      );

      expect(rs).not.to.be.undefined;
      expect(rs).to.be.eqls({
        details: {
          amount: capture_transaction.amount,
          approvalCode: aurus_response.transaction_details.approvalCode,
          approvedTransactionAmount:
            capture_transaction.approved_transaction_amount,
          binInfo: {
            bank: get(bin_fetch, "bank"),
            binCard: get(
              aurus_response,
              "transaction_details.binCard",
              "XXXXXX"
            ),
            lastFourDigits: get(
              aurus_response,
              "transaction_details.lastFourDigitsOfCard",
              "XXXX"
            ),
            type: undefined,
          },
          cardHolderName: transaction.card_holder_name,
          created: capture_transaction.created,
          merchantId: transaction.merchant_id,
          merchantName: transaction.merchant_name,
          paymentBrand: transaction.payment_brand,
          preauthTransactionReference: transaction.transaction_reference,
          processorBankName: transaction.processor_bank_name,
          recap: aurus_response.recap,
          requestAmount: transaction.request_amount,
          responseCode: aurus_response.response_code,
          responseText: aurus_response.response_text,
          ticketNumber: aurus_response.ticket_number,
          token: transaction.token,
          transactionReference: capture_transaction.transaction_reference,
          transactionStatus: TransactionStatusEnum.APPROVAL,
          transactionType: TransactionStatusEnum.CAPTURE,
        },
        ticketNumber: aurus_response.ticket_number,
        transactionReference: capture_transaction.transaction_reference,
      });
    });

    it("should return a valid SubscriptionChargesResponse object v1 version", () => {
      delete transaction.transactionType;
      const rs: object = ResponseBuilder.getCaptureFullResponse(
        transaction,
        processor,
        aurus_response,
        capture_transaction,
        bin_fetch,
        "v1"
      );

      expect(rs).not.to.be.undefined;
      expect(rs).to.be.eqls({
        details: {
          approvalCode: aurus_response.transaction_details.approvalCode,
          approvedTransactionAmount: transaction.approved_transaction_amount,
          binCard: aurus_response.transaction_details.binCard,
          binInfo: {
            bank: get(bin_fetch, "bank"),
            type: undefined,
          },
          cardHolderName: transaction.card_holder_name,
          currencyCode: transaction.currency_code,
          fullResponse: true,
          lastFourDigits:
            aurus_response.transaction_details.lastFourDigitsOfCard,
          maskedCardNumber: `${transaction.bin_card}XXXXXX${transaction.last_four_digits}`,
          merchantId: transaction.merchant_id,
          merchantName: transaction.merchant_name,
          paymentBrand: transaction.payment_brand,
          preauthTransactionReference: transaction.transaction_reference,
          processorBankName: transaction.processor_bank_name,
          processorId: transaction.processor_id,
          processorName: ProcessorEnum.PROSA_AGR,
          recap: aurus_response.recap,
          responseCode: aurus_response.response_code,
          responseText: aurus_response.response_text,
          syncMode: "online",
          ticketNumber: aurus_response.ticket_number,
          transactionReference: capture_transaction.transaction_reference,
          transactionType: TransactionStatusEnum.CAPTURE,
        },
        ticketNumber: aurus_response.ticket_number,
        transactionReference: capture_transaction.transaction_reference,
      });
    });

    it("should return a valid SubscriptionChargesResponse object v1 version with billpocket", () => {
      delete transaction.transactionType;
      transaction.processor_name = "BillPocket Processor";

      const rs: object = ResponseBuilder.getCaptureFullResponse(
        transaction,
        processor,
        aurus_response,
        capture_transaction,
        bin_fetch,
        "v1"
      );

      expect(rs).not.to.be.undefined;
      expect(rs).to.be.eqls({
        details: {
          approvalCode: aurus_response.transaction_details.approvalCode,
          approvedTransactionAmount: transaction.approved_transaction_amount,
          binCard: aurus_response.transaction_details.binCard,
          binInfo: {
            bank: get(bin_fetch, "bank"),
            type: undefined,
          },
          cardHolderName: transaction.card_holder_name,
          currencyCode: transaction.currency_code,
          fullResponse: true,
          lastFourDigits:
            aurus_response.transaction_details.lastFourDigitsOfCard,
          maskedCardNumber: `${transaction.bin_card}XXXXXX${transaction.last_four_digits}`,
          merchantId: transaction.merchant_id,
          merchantName: transaction.merchant_name,
          paymentBrand: transaction.payment_brand,
          preauthTransactionReference: transaction.transaction_reference,
          processorBankName: transaction.processor_bank_name,
          processorId: transaction.processor_id,
          processorName: "Prosa Agr",
          recap: aurus_response.recap,
          responseCode: aurus_response.response_code,
          responseText: aurus_response.response_text,
          syncMode: "online",
          ticketNumber: aurus_response.ticket_number,
          transactionReference: capture_transaction.transaction_reference,
          transactionType: TransactionStatusEnum.CAPTURE,
        },
        ticketNumber: aurus_response.ticket_number,
        transactionReference: capture_transaction.transaction_reference,
      });
    });

    it("should include the 'externalReferenceId' field for 'v2' responses if its present in the capture request", () => {
      const genericExternalId: string = "abcd-1234";
      const transaction_with_external: Transaction = {
        ...capture_transaction,
        external_reference_id: genericExternalId,
      };
      const rs: object = ResponseBuilder.getCaptureFullResponse(
        transaction,
        processor,
        aurus_response,
        transaction_with_external,
        bin_fetch,
        "v2"
      );
      expect(rs["details"]["externalReferenceId"]).to.equal(genericExternalId);
    });
  });
});

const notify_email: string = "test@kushki.com";
const mockTrx = Mock.of<Transaction>({
  approval_code: "in culpa commodo",
  approved_transaction_amount: -41493847.86029624,
  bin_card: "12345678",
  buy_order: "Excepteur sint irure proident exercitation",
  card_holder_name: "proident",
  card_type: "dolor",
  channel: "quis",
  contact_details: {
    document_number: "est",
    document_type: "sit mollit commodo",
    email: "YlVXWSTI5ZHe8@vcjmKEowwoubGhjBOyXrnUEhb.rbt",
    first_name: "in aute",
    last_name: "laboris et culpa in",
    phone_number: "quis sunt sed non ex",
  },
  contactPerson: "eu cupidatat et",
  created: -32399635.145268664,
  currency_code: "elit",
  email: notify_email,
  ice_value: -91167681.92959954,
  issuing_bank: "adipisicing tempor irure",
  iva_value: 63031102.72143093,
  last_four_digits: "aliquip labore esse adipisicing sint",
  merchant_id: "occaecat",
  merchant_name: "laborum Excepteur tempor",
  method: "dolor amet esse ea voluptate",
  number_of_months: 91544498,
  payment_brand: "quis aute ullamco ut dolor",
  pendingAmount: 60509340.64798859,
  preauth_transaction_reference: "in",
  processor_bank_name: "dolor sint ea elit eiusmod",
  processor_id: "labore in",
  processor_merchant_id: "voluptate et cupidatat proident adipisicing",
  processor_name: "exercitation",
  recap: "est",
  request_amount: 97873694.18090233,
  response_code: "aliqua in sed sunt cupidatat",
  response_text: "et Ut exercitation",
  rules: [
    {
      code: "dolor dolor ullamco sint",
      message: "sunt do ex irure sit",
    },
    {
      code: "dolore et tempor mollit",
      message: "in dolore irure sed culpa",
    },
    {
      code: "ex ad non aliquip consectetur",
      message: "exercitation enim consectetur",
    },
    {
      code: "occaecat aliqua ut tempor dolor",
      message: "tempor",
    },
  ],
  sale_ticket_number: "aliquip Duis ut laborum",
  security: {
    id: "reprehenderit",
    service: "cillum consectetur officia",
  },
  subscription_id: "adipisicing enim nostrud Duis in",
  subtotal_iva: -98954189.30910282,
  subtotal_iva0: 51528131.06444931,
  sync_mode: "online",
  ticket_number: "1343394808018",
  token: "qui ipsum dolore consectetur veniam",
  transaction_id: "ullamco ea",
  transaction_reference: "commodo Lorem",
  transaction_status: "nisi officia",
  transaction_type: "sint magna occaecat",
});

const token3dsMock = Mock.of<DynamoTokenFetch>({
  "3ds": {
    authentication: true,
    detail: {
      eci: "05",
      specificationVersion: 2.1,
      veresEnrolled: "Y",
    },
  },
});

const dummyExternalId: string = "abdc-1234-external-sample";

describe("ResponseBuilder - Preauth", () => {
  let transaction: Transaction;
  let bin_info: DynamoBinFetch;
  let token3ds: DynamoTokenFetch;
  let expected_full_response: PreauthFullResponseV2;
  let expected_aurus_response: AurusChargesResponse;

  beforeEach(() => {
    transaction = { ...mockTrx };
    bin_info = Mock.of<DynamoBinFetch>({
      bank: "ipsum in",
      bin: "310016",
      brand: "Excepteur nostrud",
      info: {
        country: {
          name: "Ecuador",
        },
        type: "debit",
      },
      processor: "in ut officia",
    });
    token3ds = { ...token3dsMock };

    expected_full_response = Mock.of<PreauthFullResponseV2>({
      details: {
        approvalCode: transaction.approval_code,
        approvedTransactionAmount: transaction.approved_transaction_amount,
        binInfo: {
          bank: get(bin_info, "bank"),
          binCard: transaction.bin_card.slice(0, 6),
          cardCountry: get(bin_info, "info.country.name"),
          lastFourDigits: transaction.last_four_digits,
          type: get(bin_info, "info.type", ""),
        },
        cardHolderName: transaction.card_holder_name,
        created: transaction.created,
        merchantId: transaction.merchant_id,
        merchantName: transaction.merchant_name,
        paymentBrand: transaction.payment_brand,
        processorBankName: transaction.processor_bank_name,
        recap: transaction.buy_order,
        requestAmount: transaction.request_amount,
        responseCode: transaction.response_code,
        responseText: transaction.response_text,
        token: "asdad",
        transactionId: transaction.transaction_id,
        transactionReference: transaction.transaction_reference,
        transactionStatus: transaction.transaction_status,
        transactionType: TransactionTypeEnum.PREAUTH,
      },
      subscriptionId: "12312312",
      ticketNumber: transaction.ticket_number,
    });

    expected_aurus_response = Mock.of<AurusChargesResponse>({
      approved_amount: "21",
      recap: get(transaction, "recap", ""),
      response_code: get(transaction, "response_code", ""),
      response_text: get(transaction, "response_text", ""),
      ticket_number: transaction.ticket_number,
      transaction_details: {
        approvalCode: transaction.approval_code,
        binCard: get(transaction, "bin_card", "XXXXXX"),
        cardHolderName: transaction.card_holder_name,
        cardType: get(bin_info, "info.type", ""),
        isDeferred: "Y",
        lastFourDigitsOfCard: get(transaction, "last_four_digits", "XXXX"),
        merchantName: transaction.merchant_name,
        processorBankName: transaction.processor_bank_name,
        processorName: transaction.processor_name,
      },
      transaction_id: transaction.transaction_id,
    });
  });

  function commonExpectFullResponse(): void {
    transaction.recap = "";
    const event: UnifiedChargesPreauthRequest =
      Mock.of<UnifiedChargesPreauthRequest>({
        amount: {
          iva: 342423,
          subtotalIva: 42432,
          subtotalIva0: 4234,
        },
        subscriptionId: "12312312",
        tokenId: "asdad",
        usrvOrigin: UsrvOriginEnum.SUBSCRIPTIONS,
      });

    transaction.transaction_status = "APPROVAL";
    const rs: PreauthFullResponseV2 =
      ResponseBuilder.getPreauthAndChargeFullResponseV2(
        transaction,
        bin_info,
        false,
        Mock.of<LambdaTransactionRuleBodyResponse>({}),
        event
      );

    expected_full_response.details!.transactionStatus = "APPROVAL";
    expected_full_response.transactionReference = get(
      transaction,
      "transaction_reference",
      ""
    );
    set(expected_full_response, "aurusResponse", {
      approved_amount: transaction.approved_transaction_amount.toFixed(2),
      response_code: "aliqua in sed sunt cupidatat",
      response_text: "et Ut exercitation",
      ticket_number: "1343394808018",
      transaction_details: {
        approvalCode: "in culpa commodo",
        binCard: "12345678",
        cardHolderName: "proident",
        cardType: "debit",
        lastFourDigitsOfCard: "aliquip labore esse adipisicing sint",
        merchantName: "laborum Excepteur tempor",
        processorBankName: "dolor sint ea elit eiusmod",
        processorName: "exercitation",
      },
      transaction_id: "ullamco ea",
    });

    expect(rs).not.to.be.undefined;
    expect(rs).to.be.eqls(expected_full_response);
    expect(rs.details).not.to.haveOwnProperty("rules");
  }

  it("getPreauthFullResponseV2 without amount on trx should return a valid PreauthFullResponseV2 object", () => {
    transaction.transaction_type = TransactionTypeEnum.PREAUTH;
    commonExpectFullResponse();
  });

  it("getPreauthFullResponseV2 without amount on trx should return a valid PreauthFullResponseV2 object with other transaction type", () => {
    transaction.transaction_type = "test";
    delete expected_full_response.details?.preauthTransactionReference;
    delete expected_full_response.details?.token;
    delete expected_full_response.subscriptionId;
    set(
      expected_full_response,
      "details.transactionType",
      transaction.transaction_type
    );
    commonExpectFullResponse();
  });

  it("getPreauthFullResponseV2 with isTrankbankProcessor flag set to true", () => {
    set(expected_full_response, "details.binInfo.type", "dolor");
    const rs: PreauthFullResponseV2 =
      ResponseBuilder.getPreauthAndChargeFullResponseV2(
        transaction,
        bin_info,
        true,
        Mock.of<LambdaTransactionRuleBodyResponse>({})
      );

    expect(rs).not.to.be.undefined;
    expect(rs.details).to.haveOwnProperty("rules");
  });

  it("getPreauthFullResponseV2 with some undefined on bin info should return a valid PreauthFullResponseV2 object", () => {
    set(bin_info, "info.country.name", undefined);
    set(bin_info, "bank", undefined);
    set(transaction, "rules", []);
    set(transaction, "email", undefined);

    const rs: PreauthFullResponseV2 =
      ResponseBuilder.getPreauthAndChargeFullResponseV2(
        transaction,
        bin_info,
        false,
        Mock.of<LambdaTransactionRuleBodyResponse>({})
      );

    expect(rs).not.to.be.undefined;
    expect(rs).to.be.eqls({
      details: {
        approvalCode: transaction.approval_code,
        approvedTransactionAmount: transaction.approved_transaction_amount,
        binInfo: {
          binCard: transaction.bin_card.slice(0, 6),
          lastFourDigits: transaction.last_four_digits,
          type: get(bin_info, "info.type"),
        },
        cardHolderName: transaction.card_holder_name,
        created: transaction.created,
        merchantId: transaction.merchant_id,
        merchantName: transaction.merchant_name,
        paymentBrand: transaction.payment_brand,
        processorBankName: transaction.processor_bank_name,
        recap: transaction.recap,
        requestAmount: transaction.request_amount,
        responseCode: transaction.response_code,
        responseText: transaction.response_text,
        transactionId: transaction.transaction_id,
        transactionReference: transaction.transaction_reference,
        transactionStatus: transaction.transaction_status,
        transactionType: transaction.transaction_type,
      },
      ticketNumber: transaction.ticket_number,
      transactionReference: get(transaction, "transaction_reference", ""),
    });
  });

  it("getPreauthFullResponseV2 with token3ds should return response with 3DS information", () => {
    const rs: PreauthFullResponseV2 =
      ResponseBuilder.getPreauthAndChargeFullResponseV2(
        transaction,
        bin_info,
        false,
        Mock.of<LambdaTransactionRuleBodyResponse>({}),
        undefined,
        token3ds
      );

    const expected3DSResponse = {
      authenticated: true,
      eci: "05",
      brand: bin_info.brand,
      version: "2.1",
      enrollment_status: "Y",
    };

    expect(rs).not.to.be.undefined;
    expect(rs).to.have.property("threeDSecure");
    expect(rs.threeDSecure).to.deep.equal(expected3DSResponse);
  });

  it("getPreauthFullResponseV2 with bad token3ds should return response without 3DS information", () => {
    token3ds["3ds"] = undefined;

    const rs: PreauthFullResponseV2 =
      ResponseBuilder.getPreauthAndChargeFullResponseV2(
        transaction,
        bin_info,
        false,
        Mock.of<LambdaTransactionRuleBodyResponse>({}),
        undefined,
        token3ds
      );

    expect(rs).not.to.be.undefined;
    expect(rs).to.not.have.property("threeDSecure");
  });

  it("should include the 'externalReferenceId' field in the response when it was included in the initial request", () => {
    const responseV2: PreauthFullResponseV2 =
      ResponseBuilder.getPreauthAndChargeFullResponseV2(
        transaction,
        bin_info,
        false,
        Mock.of<LambdaTransactionRuleBodyResponse>({}),
        Mock.of<UnifiedChargesPreauthRequest>({
          externalReferenceId: dummyExternalId,
        })
      );
    expect(responseV2.details?.externalReferenceId).to.equal(dummyExternalId);
  });

  it("should not include the 'externalReferenceId' field in the response when it was NOT included in the initial request", () => {
    const responseV2: PreauthFullResponseV2 =
      ResponseBuilder.getPreauthAndChargeFullResponseV2(
        transaction,
        bin_info,
        false,
        Mock.of<LambdaTransactionRuleBodyResponse>({}),
        Mock.of<UnifiedChargesPreauthRequest>()
      );
    expect(responseV2.details).to.not.have.property("externalReferenceId");
  });

  function commonExpectAurusChargeResponse(): void {
    transaction.recap = "est";
    const event: UnifiedChargesPreauthRequest =
      Mock.of<UnifiedChargesPreauthRequest>({
        amount: {
          iva: 342423,
          subtotalIva: 42432,
          subtotalIva0: 4234,
          totalAmount: 21,
        },
        isDeferred: "Y",
        subscriptionId: "12312312",
        tokenId: "asdad",
        usrvOrigin: UsrvOriginEnum.SUBSCRIPTIONS,
      });
    const rs: AurusChargesResponse =
      ResponseBuilder.getPreauthAndChargeAurusResponse(
        transaction,
        bin_info,
        false,
        event
      );

    expected_aurus_response.approved_amount =
      transaction.approved_transaction_amount.toFixed(2);

    expect(rs).not.to.be.undefined;
    expect(rs).to.be.eqls(expected_aurus_response);
  }

  it("getPreauthAndChargeAurusResponse should return a valid auruschargeresponse object", () => {
    commonExpectAurusChargeResponse();
  });
  it("getPreauthAndChargeAurusResponse with isTransbankProcessor return a valid auruschargeresponse object", () => {
    transaction.recap = "est";
    const rs: AurusChargesResponse =
      ResponseBuilder.getPreauthAndChargeAurusResponse(
        transaction,
        bin_info,
        true
      );

    expect(rs).not.to.be.undefined;
  });
});

describe("getErrorMetadataV2", () => {
  const three_ds_path: string = "3ds.detail";
  let token3ds: DynamoTokenFetch;
  beforeEach(() => {
    token3ds = { ...token3dsMock };
  });
  it("should map 3dsCustomer response when token3ds is present", () => {
    const result = ResponseBuilder.getErrorMetadataV2(
      { ...mockTrx },
      {},
      token3ds
    );
    expect(result).to.have.property("threeDSecure");
  });

  it("should include the 'external_reference_id' field when it was included in the initial request", () => {
    const errorMetadata: object = ResponseBuilder.getErrorMetadataV2(
      { ...mockTrx, external_reference_id: dummyExternalId },
      {},
      token3ds
    );
    expect(errorMetadata["externalReferenceId"]).to.equal(dummyExternalId);
  });

  it("should build3dsResponse when eci is present and eciRaw is empty", () => {
    set(token3ds, three_ds_path, {
      ...token3ds["3ds"]?.detail,
      eci: "05",
      eciRaw: "",
    });
    const result = ResponseBuilder.build3dsResponse({ ...token3dsMock });
    expect(result?.eci).to.be.eqls("05");
  });

  it("should build3dsResponse when eciRaw is present", () => {
    set(token3ds, three_ds_path, {
      ...token3ds["3ds"]?.detail,
      eci: "06",
      eciRaw: "01",
    });
    const result = ResponseBuilder.build3dsResponse({ ...token3dsMock });
    expect(result?.eci).to.be.eqls("01");
  });

  it("should build3dsResponse when ucafCollectionIndicator is present, eci and eciRaw are empty ", () => {
    set(token3ds, three_ds_path, {
      ...token3ds["3ds"]?.detail,
      ucafCollectionIndicator: "04",
      eci: "",
      eciRaw: "",
    });
    const result = ResponseBuilder.build3dsResponse({ ...token3dsMock });
    expect(result?.eci).to.be.eqls("04");
  });

  it("should build3dsResponse when eci origins are empty", () => {
    set(token3ds, three_ds_path, {
      ...token3ds["3ds"]?.detail,
      ucafCollectionIndicator: "",
      eci: "",
      eciRaw: "",
    });
    const result = ResponseBuilder.build3dsResponse({ ...token3dsMock });
    expect(result?.eci).to.be.eqls("");
  });
});
