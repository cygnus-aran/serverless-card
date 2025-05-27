/**
 * Transaction Types
 */
export enum TransactionRuleTypeEnum {
  CHARGE = "charge",
  PREAUTHORIZATION = "preauthorization",
  REAUTH = "reauthorization",
  CAPTURE = "capture",
  DEFERRED = "deferred",
  SUBSCRIPTION_VALIDATION = "subscriptionChargeValidation",
  ACCOUNT_VALIDATION = "accountValidation",
}

export enum TransactionRuleInvokeTypeEnum {
  TOKENLESS_CHARGE = "tokenless_charge",
}

export enum SubsTransactionRuleEnum {
  CHARGE = "subscriptionCharge",
  PREAUTHORIZATION = "subscriptionPreauthorization",
  CAPTURE = "subscriptionCapture",
}

export const SUBSCRIPTIONS_TYPE_RECORD: Record<
  string,
  SubsTransactionRuleEnum
> = {
  [TransactionRuleTypeEnum.CHARGE]: SubsTransactionRuleEnum.CHARGE,
  [TransactionRuleTypeEnum.CAPTURE]: SubsTransactionRuleEnum.CAPTURE,
  [TransactionRuleTypeEnum.PREAUTHORIZATION]:
    SubsTransactionRuleEnum.PREAUTHORIZATION,
};
