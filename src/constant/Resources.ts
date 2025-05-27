/**
 * SQS identifiers
 */
import { DynamoEventNameEnum } from "@kushki/core";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";

export type Payload_attribute = {
  DYNAMO_IMAGE: string;
  EVENT_NAME: string;
};

export type RuleTransaction = {
  code?: string;
  message?: string;
};

const PAYLOAD: Payload_attribute = {
  DYNAMO_IMAGE: "dynamodb.NewImage",
  EVENT_NAME: DynamoEventNameEnum.MODIFY,
};

export { PAYLOAD };

type SimilarityResponse = {
  options: string[];
  value: CardBrandEnum;
};

const VALID_CARDS = new Map<string, SimilarityResponse>([
  [
    "carnet",
    {
      options: ["car net", "Car Net", "CARNET", "Carnet"],
      value: CardBrandEnum.CARNET,
    },
  ],
  [
    "mastercard",
    {
      options: [
        "Master card",
        "MASTER CARD",
        "Mastercard",
        "MASTERCARD",
        "MasterCard",
        "Master Card",
      ],
      value: CardBrandEnum.MASTERCARD,
    },
  ],
  ["visa", { options: ["visa", "VISA", "Visa"], value: CardBrandEnum.VISA }],
  [
    "amex",
    {
      options: ["americanexpress", "amex"],
      value: CardBrandEnum.AMEX,
    },
  ],
]);

export { VALID_CARDS };

export type QueueList = {
  SQS_SAVE_ATTEMPT: string;
  sqsCardTransaction: string;
  processAutomaticVoidSQS: string;
  sqsChargesTransaction: string;
};

const QUEUES: QueueList = {
  processAutomaticVoidSQS: `${process.env.PROCESS_AUTOMATIC_VOID_SQS}`,
  SQS_SAVE_ATTEMPT: `${process.env.SQS_SAVE_ATTEMPT}`,
  sqsCardTransaction: `${process.env.SQS_SAVE_CARD_TRX}`,
  sqsChargesTransaction: `${process.env.SQS_SAVE_CHARGES_TRX}`,
};

export const AMEX_IDENTIFIER = "amex";

export const BUCKET_BRANDS_PREFIX_S3 =
  "https://kushki-static.s3.amazonaws.com/brands";

export const DEV_BUCKET_BRANDS_PREFIX_S3 =
  "https://kushki-static-dev.s3.amazonaws.com/brands";

export { QUEUES };

export const VALID_ECI_FOR_VISA: string[] = ["05", "06"];
export const VALID_ECI_FOR_MC: string[] = ["01", "02"];
