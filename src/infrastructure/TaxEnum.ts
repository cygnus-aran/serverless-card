/**
 * Tax enum
 */

export enum TaxCode {
  agenciaDeViaje = "agenciaDeViaje",
  iac = "iac",
  municipalTax = "municipalTax",
  propina = "propina",
  reducedStateTax = "reducedStateTax",
  stateTax = "stateTax",
  tasaAeroportuaria = "tasaAeroportuaria",
}

export const TAXES: Taxes = {
  [TaxCode.tasaAeroportuaria]: {
    code: "TASA_AERO",
    id: "4",
  },
  [TaxCode.propina]: {
    code: "PROPINA",
    id: "3",
  },
  [TaxCode.iac]: {
    code: "IAC",
    id: "6",
  },
  [TaxCode.agenciaDeViaje]: {
    code: "TASA_ADMIN_AGEN_COD",
    id: "5",
  },
  [TaxCode.stateTax]: {
    code: "STATE_TAX",
    id: "11",
  },
  [TaxCode.municipalTax]: {
    code: "MUNICIPAL_TAX",
    id: "12",
  },
  [TaxCode.reducedStateTax]: {
    code: "REDUCED_STATE_TAX",
    id: "13",
  },
};

export type TaxAttr = {
  code: string;
  id: string;
};
export type Taxes<T extends string = TaxCode> = { [k in T]: TaxAttr };
