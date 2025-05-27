/**
 * ErrorMapEnum
 */

export enum ErrorMapEnum {
  K500 = "E500",
  K600 = "E600",
  K012 = "E012",
  E006 = "K006",
  E012 = "K012",
  E211 = "K211",
  E228 = "K228",
  E500 = "K500",
  E600 = "K600",
}

export const ERROR_AURUS_CREDIBANK: string[] = [
  ErrorMapEnum.E500,
  ErrorMapEnum.E600,
];

export const ERROR_AURUS_KUSHKI_ADQUIRER: string[] = [
  ErrorMapEnum.E500,
  ErrorMapEnum.E600,
];

export const ERROR_RESPONSE_RECORD: Record<ErrorMapEnum, string> = {
  [ErrorMapEnum.E012]: "012",
  [ErrorMapEnum.E500]: "500",
  [ErrorMapEnum.E600]: "600",
  [ErrorMapEnum.E228]: "228",
  [ErrorMapEnum.E211]: "211",
  [ErrorMapEnum.E006]: "006",
  [ErrorMapEnum.K500]: "500",
  [ErrorMapEnum.K600]: "600",
  [ErrorMapEnum.K012]: "012",
};
