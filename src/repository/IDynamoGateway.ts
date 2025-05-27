/**
 * Dynamo gateway interface file.
 */
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { IndexEnum } from "infrastructure/IndexEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { Observable } from "rxjs";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { QueryCommandInput } from "@aws-sdk/lib-dynamodb";

/**
 * Gateway logic to connect to Dynamo.
 */
export interface IDynamoGateway {
  /**
   * Put an item in dynamo_put table
   * @param data - to save in table
   * @param table - name of the dynamo_put table
   * @param condition - condition expression on the put
   */
  put(data: object, table: string, condition?: string): Observable<boolean>;
  /**
   * Query on table using an index
   * @param table - name of the dynamo_put table
   * @param index - index's name on the table
   * @param field - index's field to filter the data
   * @param value - value to search on the index
   * @param options
   */
  query<T = object>(
    table: string,
    index: IndexEnum,
    field: string,
    value: string,
    options?: {
      FilterExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, any>;
    }
  ): Observable<T[]>;

  /**
   * Query on table using an index
   * @param table - name of the dynamo_put table
   * @param index - index's name on the table
   * @param field - index's field to filter the data
   * @param value - value to search on the index
   * @param fieldname - name of reserved word
   */
  queryReservedWord<T = object>(
    table: string,
    index: IndexEnum,
    field: string,
    value: string,
    fieldname: string
  ): Observable<T[]>;

  /**
   * Get a table item from dynamo
   * @param table - table name
   * @param key - object with the key filter
   */
  getItem<T extends object>(
    table: string,
    key: object
  ): Observable<T | undefined>;

  /**
   * Generic method to update any value
   * @param tableName - name of Dynamo table
   * @param key - primary hash of table
   * @param values - object with values to update
   * @param conditionExpression - check update condition
   */
  updateValues(
    tableName: string,
    key: DocumentClient.Key,
    values: object,
    conditionExpression?: string
  ): Observable<boolean>;

  /**
   * updates a token with a new processingCode and returns the record
   * @param id - primary hash of table
   * @param processingCode - processing uuid code v4
   */
  updateTokenValue(
    id: string,
    processingCode: string
  ): Observable<DynamoTokenFetch>;

  /**
   * queryByTrxTypeAndCreated on table using an index
   * @param table - name of the dynamo table
   * @param index - index's name on the table
   * @param transactionType - transaction type
   * @param startDate - start date to filter the data
   * @param endDate - end date to filter the data
   */
  queryByTrxTypeAndCreated<T = object>(
    table: string,
    index: IndexEnum,
    transactionType: TransactionTypeEnum,
    startDate: number,
    endDate: number
  ): Observable<T[]>;

  queryTrxsByStatusAndCreated<T>(
    transactionStatus: string,
    startDate: number,
    endDate: number
  ): Observable<T[]>;

  queryTransactionCustomOpsBySeqIdAndVoided<T>(
    sequenceId: string
  ): Observable<T[]>;

  queryTransactionBySeqIdAndCreated<T>(sequenceId: string): Observable<T[]>;

  getSequential(sequential: string): Observable<object>;

  /**
   * Get a dynamo merchant by public id
   * @params publicId
   */
  getDynamoMerchant(publicId: string): Observable<DynamoMerchantFetch>;

  /**
   * Query on table using an index
   * @param queryInput - object of query params
   */
  querySimple<T = object>(
    queryInput: QueryCommandInput
  ): Observable<DynamoQueryResponse<T>>;

  /**
   * queryByTrxAndCardType on table using an index
   * @param transactionType - transaction type
   * @param starDate - end date to filter the data
   * @param cardType - card type to filter debit or credit card
   * @param transactionStatus - end date to filter the data
   * @param processorName - processor name
   */
  queryByTrxAndCardType<T = object>(
    transactionType: TransactionTypeEnum,
    currentDate: number,
    cardType: string,
    transactionStatus: string,
    processorName: string
  ): Observable<T[]>;

  /**
   * queryTransactionByTicketNumber on table using an index
   * @param ticketNumber - ticket number.
   */
  queryTransactionByTicketNumber<T = object>(
    ticketNumber: string
  ): Observable<DynamoQueryResponse<T>>;
}

export type DynamoQueryResponse<T = object> = {
  items: T[];
  lastEvaluatedKey?: object;
};
