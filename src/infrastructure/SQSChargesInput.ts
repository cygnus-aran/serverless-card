import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { Transaction } from "types/transaction";

export type SQSChargesInput = {
  charge: object;
  merchant: DynamoMerchantFetch;
  token: DynamoTokenFetch;
  transaction: Transaction;
};
