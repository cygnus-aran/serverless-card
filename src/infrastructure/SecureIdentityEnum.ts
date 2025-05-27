/**
 * SecureIdentity enum for transaction traceability
 */
import {
  PartnerNameEnum,
  SecurityIdentityEnum,
} from "@kushki/core/lib/infrastructure/DataFormatterCatalogEnum";
import { ISecurityIdentityRequest } from "@kushki/core/lib/repository/IDataFormatter";
import { CardProviderEnum } from "infrastructure/CardProviderEnum";
import {
  SuccessfulAuthentication3DSEnum,
  TransactionStatusEnum,
} from "infrastructure/TransactionStatusEnum";

export enum PartnerValidatorEnum {
  OTP = "KushkiOTP",
  THREEDS = "3dsecure",
  TRANSBANK = "transbankToken",
  AURUS = "aurusToken",
  KUSHKI = "kushkiToken",
  TRANSUNION = "transunion",
  SIFT_SCIENCE = "sift",
  EXPERIAN = "experian",
  THREEDS_VALIDATE = "3Dsecure_validate",
  THREEDS_CHECK = "3Dsecure_check",
  OTP_VALIDATE = "KushkiOTP_validate",
  OTP_CHECK = "KushkiOTP_check",
}

export const SECURE_SERVICE_PARTNERS: string[] = [
  PartnerValidatorEnum.OTP,
  PartnerValidatorEnum.THREEDS,
];

export const SECURE_IDENTITY_SECURE_SERVICE: Record<
  string,
  ISecurityIdentityRequest
> = {
  [SuccessfulAuthentication3DSEnum.THREEDS]: {
    info: {
      status: TransactionStatusEnum.PENDING,
    },
    partner: PartnerValidatorEnum.THREEDS,
  },
  [PartnerValidatorEnum.THREEDS_VALIDATE]: {
    info: {
      status: TransactionStatusEnum.PENDING,
    },
    partner: PartnerValidatorEnum.THREEDS,
  },
  [PartnerValidatorEnum.THREEDS_CHECK]: {
    info: {
      status: TransactionStatusEnum.PENDING,
    },
    partner: PartnerValidatorEnum.THREEDS,
  },
  [PartnerValidatorEnum.OTP]: {
    partner: PartnerValidatorEnum.OTP,
  },
  [PartnerValidatorEnum.OTP_VALIDATE]: {
    partner: PartnerValidatorEnum.OTP,
  },
  [PartnerValidatorEnum.OTP_CHECK]: {
    partner: PartnerValidatorEnum.OTP,
  },
};

export const SECURE_IDENTITY_PROVIDER: Record<
  string,
  ISecurityIdentityRequest
> = {
  [CardProviderEnum.TRANSBANK]: { partner: PartnerValidatorEnum.TRANSBANK },
  [CardProviderEnum.AURUS]: { partner: PartnerValidatorEnum.AURUS },
  [CardProviderEnum.KUSHKI]: { partner: PartnerValidatorEnum.KUSHKI },
};

export const SECURITY_IDENTITY: Record<
  SecurityIdentityEnum,
  { partner: string; partnerName: string; validated: boolean }
> = {
  [SecurityIdentityEnum.THREE_DS]: {
    partner: SecurityIdentityEnum.THREE_DS,
    partnerName: PartnerNameEnum.THREE_DS,
    validated: false,
  },
  [SecurityIdentityEnum.AURUS_TOKEN]: {
    partner: SecurityIdentityEnum.AURUS_TOKEN,
    partnerName: PartnerNameEnum.AURUS,
    validated: false,
  },
  [SecurityIdentityEnum.EXPERIAN]: {
    partner: SecurityIdentityEnum.EXPERIAN,
    partnerName: PartnerNameEnum.EXPERIAN,
    validated: false,
  },
  [SecurityIdentityEnum.KUSHKI_OTP]: {
    partner: SecurityIdentityEnum.KUSHKI_OTP,
    partnerName: PartnerNameEnum.KUSHKI,
    validated: false,
  },
  [SecurityIdentityEnum.KUSHKI_TOKEN]: {
    partner: SecurityIdentityEnum.KUSHKI_TOKEN,
    partnerName: PartnerNameEnum.KUSHKI,
    validated: false,
  },
  [SecurityIdentityEnum.SIFT_SCIENCE]: {
    partner: SecurityIdentityEnum.SIFT_SCIENCE,
    partnerName: PartnerNameEnum.SIFT_SCIENCE,
    validated: false,
  },
  [SecurityIdentityEnum.TRANSBANK_TOKEN]: {
    partner: SecurityIdentityEnum.TRANSBANK_TOKEN,
    partnerName: PartnerNameEnum.TRANSBANK,
    validated: false,
  },
  [SecurityIdentityEnum.TRANSUNION]: {
    partner: SecurityIdentityEnum.TRANSUNION,
    partnerName: PartnerNameEnum.TRANSUNION,
    validated: false,
  },
};

export const SECURITY_PARTNERS: Record<string, string> = {
  [SecurityIdentityEnum.EXPERIAN]: "ExperianSignature",
  [SecurityIdentityEnum.SIFT_SCIENCE]: "SiftScience",
  [SecurityIdentityEnum.TRANSUNION]: "TransUnion",
};
