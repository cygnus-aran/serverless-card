/**
 * TransactionStatusEnum
 */
export enum TransactionModeEnum {
  ACCOUNT_VALIDATION = "accountValidation",
  AUTHORIZATION = "authorization",
  INITIAL_RECURRENCE = "initialRecurrence",
  SUBSEQUENT_RECURRENCE = "subsequentRecurrence",
  TRANSACTION = "transaction",
  VALIDATE_CARD = "validateCard",
}
