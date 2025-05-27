/**
 * Processors available in Kushki
 */
import { MethodsEnum } from "infrastructure/MethodsEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";

export enum CountryEnum {
  ECUADOR = "Ecuador",
  PERU = "Peru",
  COLOMBIA = "Colombia",
  CHILE = "Chile",
  MEXICO = "Mexico",
  USA = "EEUU",
  COSTA_RICA = "CostaRica",
  EL_SALVADOR = "ElSalvador",
  GUATEMALA = "Guatemala",
  HONDURAS = "Honduras",
  NICARAGUA = "Nicaragua",
  PANAMA = "Panama",
  BRAZIL = "Brazil",
}

export enum CountryIsoEnum {
  MEX = "MEX",
  COL = "COL",
  PER = "PER",
  CHL = "CHL",
  ECU = "ECU",
}

export const AVAILABLE_COUNTRIES_PARTIAL_VOID: string[] = [
  CountryEnum.COLOMBIA,
  CountryEnum.PERU,
  CountryEnum.CHILE,
  CountryEnum.USA,
  CountryEnum.COSTA_RICA,
  CountryEnum.EL_SALVADOR,
  CountryEnum.GUATEMALA,
  CountryEnum.HONDURAS,
  CountryEnum.NICARAGUA,
  CountryEnum.PANAMA,
  CountryEnum.MEXICO,
  CountryEnum.BRAZIL,
];

export const COUNTRIES_ALWAYS_ACTIVE_DEFERRED: string[] = [
  CountryEnum.CHILE,
  CountryEnum.COLOMBIA,
];

export const PARTIAL_VOID_BY_COUNTRY_PROCESSOR: Record<string, string> = {
  [`${CountryEnum.MEXICO}_${ProcessorEnum.PROSA.replace(" ", "_")}`]:
    MethodsEnum.PARTIAL_VOID,
};
export const COUNTRIES_CENTRAL_AMERICA: string[] = [
  CountryEnum.COSTA_RICA,
  CountryEnum.EL_SALVADOR,
  CountryEnum.GUATEMALA,
  CountryEnum.HONDURAS,
  CountryEnum.MEXICO,
  CountryEnum.NICARAGUA,
  CountryEnum.PANAMA,
];
