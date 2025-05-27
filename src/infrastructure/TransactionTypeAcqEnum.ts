/**
 * TransactionTypeEnum
 */
export enum TransactionTypeAcqEnum {
  CAPTURE = "capture",
  REAUTHORIZATION = "reauthorization",
  PREAUTHORIZATION = "preauthorization",
  SALE = "sale",
  REFUND = "refund",
  REVERSE = "reverse",
  VOID = "void",
  DEFERRED = "deferred",
  CHARGE_WITHOUT_CVV = "chargeWithoutCVV",
  SUBSCRIPTION = "subscription",
  CHARGE = "charge",
  CHARGE_3DS = "charge3D",
  CARD_VALIDATION = "validate-card",
  COF_INITIAL = "cofInitial",
  COF_SUBSEQUENT = "cofSubsequent",
}
