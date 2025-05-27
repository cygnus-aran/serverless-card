/**
 * CardProviderEnum
 */
import { ProcessorEnum } from "infrastructure/ProcessorEnum";

export enum CardProviderIndexEnum {
  Sandbox,
  Aurus,
  Redeban,
  Niubiz,
  Prosa,
  BillPocket,
  Transbank,
  Credomatic,
  CrediBank,
  KushkiAcq,
  Fis,
  Credimatic,
  Datafast,
}
export enum CardProviderEnum {
  AURUS = "Aurus",
  SANDBOX = "Sandbox",
  TRANSBANK = "Transbank",
  REDEBAN = "Redeban",
  NIUBIZ = "Niubiz",
  PROSA = "Prosa",
  CREDOMATIC = "Credomatic",
  BILLPOCKET = "Billpocket",
  CREDIBANK = "Credibanco",
  KUSHKI = "Kushki",
  TRANSBANK_WEBPAY = "transbankwebpay",
  TRANSBANK_ONECLICKMALL = "transbank-ocm",
  FIS = "Fis",
  CREDIMATIC = "Credimatic",
  DATAFAST = "Datafast",
}

export const PROVIDER_BY_PROCESSOR: Record<string, CardProviderEnum> = {
  [ProcessorEnum.CREDIMATIC]: CardProviderEnum.CREDIMATIC,
  [ProcessorEnum.DATAFAST]: CardProviderEnum.DATAFAST,
  [ProcessorEnum.BILLPOCKET]: CardProviderEnum.BILLPOCKET,
  [ProcessorEnum.PROSA_AGR]: CardProviderEnum.AURUS,
  [ProcessorEnum.CREDIBANCO]: CardProviderEnum.CREDIBANK,
  [ProcessorEnum.REDEBAN]: CardProviderEnum.REDEBAN,
  [ProcessorEnum.VISANET]: CardProviderEnum.NIUBIZ,
  [ProcessorEnum.NIUBIZ]: CardProviderEnum.NIUBIZ,
  [ProcessorEnum.MCPROCESSOR]: CardProviderEnum.AURUS,
  [ProcessorEnum.TRANSBANK]: CardProviderEnum.TRANSBANK,
  [ProcessorEnum.PROSA]: CardProviderEnum.PROSA,
  [ProcessorEnum.CREDOMATIC]: CardProviderEnum.CREDOMATIC,
  [ProcessorEnum.KUSHKI]: CardProviderEnum.KUSHKI,
  [ProcessorEnum.FIS]: CardProviderEnum.FIS,
};
