/**
 * EnvironmentEnum
 */
export enum EnvironmentEnum {
  PRIMARY = "primary",
  CI = "ci",
  QA = "qa",
  UAT = "uat",
  STG = "stg",
  PO = "po",
}

export const PROCESSOR_SANDBOX_STAGES: string[] = [
  EnvironmentEnum.CI,
  EnvironmentEnum.QA,
];
