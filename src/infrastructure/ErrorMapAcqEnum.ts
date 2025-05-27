/**
 * ErrorMapAcqEnum
 */
export enum ErrorMapAcqEnum {
  E002 = "K002",
  E003 = "K003",
  E004 = "K004",
  E005 = "K005",
  E006 = "K006",
  E011 = "K011",
  E012 = "K012",
  E211 = "K211",
  E228 = "K228",
  E500 = "K500",
  E600 = "K600",
  K012 = "E012",
  K500 = "E500",
  E505 = "K505",
  E506 = "K506",
  K600 = "E600",
  K601 = "K601",
  E028 = "K028",
}

export const ERROR_ACQ_RESPONSE_RECORD: Record<ErrorMapAcqEnum, string> = {
  [ErrorMapAcqEnum.E002]: "002",
  [ErrorMapAcqEnum.E003]: "003",
  [ErrorMapAcqEnum.E004]: "004",
  [ErrorMapAcqEnum.E005]: "005",
  [ErrorMapAcqEnum.E006]: "006",
  [ErrorMapAcqEnum.E011]: "011",
  [ErrorMapAcqEnum.E012]: "012",
  [ErrorMapAcqEnum.E211]: "211",
  [ErrorMapAcqEnum.E228]: "228",
  [ErrorMapAcqEnum.E500]: "500",
  [ErrorMapAcqEnum.E600]: "600",
  [ErrorMapAcqEnum.K012]: "012",
  [ErrorMapAcqEnum.K500]: "500",
  [ErrorMapAcqEnum.E505]: "505",
  [ErrorMapAcqEnum.E506]: "506",
  [ErrorMapAcqEnum.K600]: "600",
  [ErrorMapAcqEnum.K601]: "601",
  [ErrorMapAcqEnum.E028]: "028",
};
