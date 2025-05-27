/**
 * DynamoDB's Index enum
 */
export enum IndexEnum {
  transaction_transaction_id = "transactions-transaction_id",
  transaction_sale_ticket_number = "transactions-sale_ticket_number",
  transaction_ticket_number = "transactions-ticket_number",
  merchant_private_id = "merchants-private_id-index",
  private_merchant_id_processor = "privateMerchantId",
  processors_merchant_id_index = "processors-merchant_id-index",
  transaction_type_created_index = "transactions-transaction_type",
  transaction_status_created_index = "transactions-status-created",
  transactions_transaction_reference = "transactions-transaction_reference",
  preauth_trx_reference_index = "preauth_trx_reference_index",
  transaction_tokenIndex = "transactions-tokenIndex",
  subs_trx_ticket_number_index = "ticketNumberIndex",
  subs_trx_transaction_reference_index = "transactionReferenceIndex",
  tokens_secure_id_index = "tokens-secureId-index",
  preauth_transaction_reference_index = "preauthTransactionReferenceIndex",
  transaction_reference = "transaction_reference",
  id_type_index = "id-type-index",
  mcc_type_index = "mcc-type-index",
  sequence_id_index = "sequence_id-index",
  sequence_id_created = "sequence_id_created",
  merchant_id_index = "merchantId-index",
}
