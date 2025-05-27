/**
 * Transaction Status Type
 */
export enum TransactionStatusEnum {
  APPROVAL = "APPROVAL",
  DECLINED = "DECLINED",
  INITIALIZED = "INITIALIZED",
  CAPTURE = "CAPTURE",
  TIMED_OUT = "TIMED_OUT",
  PENDING = "PENDING",
}

export const ACCOUNT_TYPE_CREDIBANK_TRANSACTION_STATUS: string[] = [
  TransactionStatusEnum.APPROVAL,
  TransactionStatusEnum.DECLINED,
];

export enum SuccessfulAuthentication3DSEnum {
  THREEDS = "3dsecure",
  OK_CODE = "000",
  OK_REASON_CODE = "100",
  OK_MESSAGE = "Autenticación exitosa",
  OK_EXTERNAL_MESSAGE = "Autenticación externa exitosa",
}

export enum DeclinedAuthentication3DSEnum {
  ERROR_CODE = "K325",
  ERROR_MESSAGE = "Autenticación externa fallida - Datos enviados por comercio no son seguros",
}

export const TRX_OK_RESPONSE_CODE: string = "000";

export const TRANSACTION_STATUS_EXPRESSION = ":transaction_status";
