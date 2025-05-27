/**
 *    Dynamo Gateway
 */
import { IDENTIFIERS, KushkiError } from "@kushki/core";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { TABLES } from "constant/Tables";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { TokenStatusEnum } from "infrastructure/TokenTypeEnum";
import {
  TRANSACTION_STATUS_EXPRESSION,
  TransactionStatusEnum,
} from "infrastructure/TransactionStatusEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, isUndefined, pickBy, set } from "lodash";
import "reflect-metadata";
import { DynamoQueryResponse, IDynamoGateway } from "repository/IDynamoGateway";
import { EMPTY, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  expand,
  map,
  mapTo,
  mergeMap,
  reduce,
  switchMap,
} from "rxjs/operators";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  GetCommandOutput,
  PutCommand,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
  UpdateCommand,
  UpdateCommandInput,
  PutCommandInput,
  GetCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { UpdateItemOutput } from "aws-sdk/clients/dynamodb";

/**
 * DynamoGateway to send data do DynamoDB
 */
@injectable()
export class DynamoGateway implements IDynamoGateway {
  private readonly _client: DynamoDBClient;

  constructor(
    @inject(IDENTIFIERS.CoreAwsDocumentClient) client: DynamoDBClient
  ) {
    this._client = client;
  }

  public put(
    data: object,
    table: string,
    condition?: string
  ): Observable<boolean> {
    set(
      data,
      "config.region",
      get(data, "config.region") || `${process.env.AWS_REGION}`
    );
    const cleaned_item = pickBy(data, (value) => value !== undefined);

    const params: PutCommandInput = {
      Item: cleaned_item,
      TableName: table,
    };

    if (condition !== undefined) params.ConditionExpression = condition;
    const command: PutCommand = new PutCommand(params);

    return of(1).pipe(
      switchMap(async () => this._client.send(command)),
      catchError((err: Error) => {
        if (
          condition !== undefined &&
          err.name === "ConditionalCheckFailedException"
        )
          return of(true);

        return throwError(err);
      }),
      tag("DynamoGateway | put"),
      map(() => true)
    );
  }

  public query<T>(
    table: string,
    index: IndexEnum,
    field: string,
    value: string,
    options: {
      FilterExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, any>;
    } = {}
  ): Observable<T[]> {
    return of(1).pipe(
      switchMap(async () => {
        const params: QueryCommandInput = {
          ...options,
          ExpressionAttributeValues: {
            ":d": value,
            ...options.ExpressionAttributeValues,
          },
          IndexName: index,
          KeyConditionExpression: `${field} = :d`,
          TableName: table,
        };
        const command: QueryCommand = new QueryCommand(params);

        return this._client.send(command);
      }),
      map((output: QueryCommandOutput) => defaultTo(<T[]>output.Items, [])),
      tag("DynamoGateway | query")
    );
  }

  public queryReservedWord<T>(
    table: string,
    index: IndexEnum,
    field: string,
    value: string,
    fieldname: string
  ): Observable<T[]> {
    return of(1).pipe(
      switchMap(async () => {
        const query_input: QueryCommandInput = {
          ExpressionAttributeNames: {
            [`${fieldname}`]: `${field}`,
          },
          ExpressionAttributeValues: {
            ":d": value,
          },
          IndexName: index,
          KeyConditionExpression: `${fieldname} = :d`,
          TableName: table,
        };
        const command: QueryCommand = new QueryCommand(query_input);

        return this._client.send(command);
      }),
      map((output: QueryCommandOutput) => defaultTo(<T[]>output.Items, [])),
      tag("DynamoGateway | queryReservedWord")
    );
  }

  public queryByTrxTypeAndCreated<T>(
    table: string,
    index: IndexEnum,
    transactionType: TransactionTypeEnum,
    startDate: number,
    endDate: number
  ): Observable<T[]> {
    return of(1).pipe(
      map(() => ({
        ExpressionAttributeNames: {
          "#created": "created",
          "#transaction_type": "transaction_type",
        },
        ExpressionAttributeValues: {
          ":enddate": endDate,
          ":startdate": startDate,
          ":transaction_type": transactionType,
        },
        IndexName: index,
        KeyConditionExpression:
          "#transaction_type = :transaction_type and #created between :startdate and :enddate",
        TableName: table,
      })),
      switchMap(async (params: QueryCommandInput) =>
        this._client.send(new QueryCommand(params))
      ),
      map((output: QueryCommandOutput) => defaultTo(<T[]>output.Items, [])),
      tag("DynamoGateway | queryByTrxTypeAndCreated")
    );
  }

  public queryTransactionCustomOpsBySeqIdAndVoided<T>(
    sequenceId: string
  ): Observable<T[]> {
    const query_args: QueryCommandInput = {
      ExpressionAttributeValues: {
        ":sequenceId": sequenceId,
        ":voided": "false",
      },
      IndexName: IndexEnum.sequence_id_index,
      KeyConditionExpression: "sequence_id = :sequenceId and voided = :voided",
      ProjectionExpression:
        "transaction_reference, approved_transaction_amount, created, processor_transaction_id",
      TableName: TABLES.transaction_custom_ops,
    };

    return this._queryPaginated(query_args);
  }

  public queryTransactionBySeqIdAndCreated<T>(
    sequenceId: string
  ): Observable<T[]> {
    const expression_attribute_values: Record<string, string> = {
      ":sequenceId": sequenceId,
    };

    expression_attribute_values[TRANSACTION_STATUS_EXPRESSION] =
      TransactionStatusEnum.APPROVAL;

    const query_args: QueryCommandInput = {
      ExpressionAttributeValues: expression_attribute_values,
      FilterExpression: "transaction_status = :transaction_status",
      IndexName: IndexEnum.sequence_id_created,
      KeyConditionExpression: "sequence_id = :sequenceId",
      ScanIndexForward: false,
      TableName: TABLES.transaction,
    };

    return this._queryPaginated(query_args);
  }

  // jscpd:ignore-start
  // istanbul ignore next
  public queryTrxsByStatusAndCreated<T>(
    transactionStatus: string,
    startDate: number,
    endDate: number
  ): Observable<T[]> {
    return of(1).pipe(
      map(() => ({
        ExpressionAttributeNames: {
          "#created": "created",
          "#transaction_status": "transaction_status",
        },
        ExpressionAttributeValues: {
          ":enddate": endDate,
          ":startdate": startDate,
          ":transaction_status": transactionStatus,
        },
        IndexName: IndexEnum.transaction_status_created_index,
        KeyConditionExpression:
          "#transaction_status = :transaction_status and #created between :startdate and :enddate",
        TableName: TABLES.transaction,
      })),
      switchMap(async (params: QueryCommandInput) =>
        this._client.send(new QueryCommand(params))
      ),
      map((output: QueryCommandOutput) => defaultTo(<T[]>output.Items, [])),
      tag("DynamoGateway | queryByTrxTypeAndCreated")
    );
  }
  // jscpd:ignore-end

  public getItem<T extends object>(
    table: string,
    key: object
  ): Observable<T | undefined> {
    return of(1).pipe(
      switchMap(async () => {
        const params: GetCommandInput = {
          ConsistentRead: true,
          Key: key,
          TableName: table,
        };

        return this._client.send(new GetCommand(params));
      }),
      map((output: GetCommandOutput) => <T>output.Item),
      tag("DynamoGateway | getItem")
    );
  }

  public updateValues(
    tableName: string,
    key: Record<string, NativeAttributeValue>,
    values: object,
    conditionExpression?: string
  ): Observable<boolean> {
    return of(1).pipe(
      map(() => {
        const attribute_names: Record<string, string> = {};
        const attribute_values: Record<string, string> = {};
        let update_expression: string = "SET";

        Object.keys(values).forEach((valueKey: string) => {
          attribute_names[`#${valueKey}`] = valueKey;
          attribute_values[`:${valueKey}`] = values[`${valueKey}`];
          update_expression += ` #${valueKey}=:${valueKey},`;
        });

        update_expression = update_expression.substring(
          0,
          update_expression.length - 1
        );

        return {
          ConditionExpression: conditionExpression,
          ExpressionAttributeNames: attribute_names,
          ExpressionAttributeValues: attribute_values,
          Key: key,
          TableName: tableName,
          UpdateExpression: update_expression,
        };
      }),
      mergeMap(async (params: UpdateCommandInput) =>
        this._client.send(new UpdateCommand(params))
      ),
      mapTo(true),
      tag("DynamoClient | update")
    );
  }

  public updateTokenValue(
    id: string,
    processingCode: string
  ): Observable<DynamoTokenFetch> {
    return of(1).pipe(
      switchMap(async () =>
        this._client.send(
          new UpdateCommand(this._buildUpdateTokenInput(id, processingCode))
        )
      ),
      map(
        (output: UpdateItemOutput) =>
          <DynamoTokenFetch>defaultTo(output.Attributes, {})
      ),
      tag("DynamoClient | updateTokenValue")
    );
  }

  public getDynamoMerchant(publicId: string): Observable<DynamoMerchantFetch> {
    return of(1).pipe(
      mergeMap(() =>
        this.getItem(TABLES.merchants, {
          public_id: publicId,
        })
      ),
      map((response: object | undefined) => {
        if (response === undefined) throw new KushkiError(ERRORS.E004);

        return <DynamoMerchantFetch>response;
      }),
      tag("DynamoGateway | getDynamoMerchant")
    );
  }

  public getSequential(sequential: string): Observable<object> {
    const params: UpdateCommandInput = {
      ExpressionAttributeValues: { ":incr": 1 },
      Key: { id: sequential },
      ReturnValues: "UPDATED_NEW",
      TableName: TABLES.atomic_counter,
      UpdateExpression: "SET quantity = quantity + :incr",
    };
    const command = new UpdateCommand(params);

    return of(1).pipe(
      switchMap(async () => this._client.send(command)),
      map((x: UpdateItemOutput) => defaultTo(x.Attributes, {})),
      tag("DynamoClient | getSequential")
    );
  }

  public queryByTrxAndCardType<T>(
    transactionType: TransactionTypeEnum,
    currentDate: number,
    cardType: string,
    transactionStatus: string,
    processorName: string
  ): Observable<T[]> {
    const date = new Date(currentDate);
    const upper_case_card_type = cardType.toUpperCase();
    const start_date: number =
      cardType === CardTypeEnum.DEBIT
        ? date.setDate(date.getDate() - 7)
        : date.setDate(date.getDate() - 28);

    const end_date: number = date.setDate(date.getDate() + 1);

    return of(1).pipe(
      map(() => ({
        ExpressionAttributeNames: {
          "#card_type": "card_type",
          "#created": "created",
          "#processor_name": "processor_name",
          "#transaction_status": "transaction_status",
          "#transaction_type": "transaction_type",
        },
        ExpressionAttributeValues: {
          ":card_type": cardType,
          ":end_date": end_date,
          ":processor_name": processorName,
          ":start_date": start_date,
          ":transaction_status": transactionStatus,
          ":transaction_type": transactionType,
          ":upper_case_card_type": upper_case_card_type,
        },
        FilterExpression:
          "#transaction_status = :transaction_status and #processor_name = :processor_name and (#card_type = :card_type or #card_type = :upper_case_card_type)",
        IndexName: IndexEnum.transaction_type_created_index,
        KeyConditionExpression:
          "#transaction_type = :transaction_type and #created between :start_date and :end_date",
        TableName: TABLES.transaction,
      })),
      switchMap(async (param: QueryCommandInput) =>
        this._client.send(new QueryCommand(param))
      ),
      map((output: QueryCommandOutput) => defaultTo(<T[]>output.Items, [])),
      tag("DynamoGateway | queryByTrxAndCardType")
    );
  }

  public querySimple<T = object>(
    queryInput: QueryCommandInput
  ): Observable<DynamoQueryResponse<T>> {
    return of(queryInput).pipe(
      switchMap((params: QueryCommandInput) => this._query(params)),
      map((response: QueryCommandOutput) => ({
        items: defaultTo(<T[]>response.Items, []),
        lastEvaluatedKey: response.LastEvaluatedKey,
      }))
    );
  }

  public queryTransactionByTicketNumber<T = object>(
    ticketNumber: string
  ): Observable<DynamoQueryResponse<T>> {
    return of(1).pipe(
      mergeMap(() => {
        const query_args: QueryCommandInput =
          this._buildQueryTransactionInput(ticketNumber);

        return this._query(query_args);
      }),
      map((response: QueryCommandOutput) => ({
        items: defaultTo(<T[]>response.Items, []),
        lastEvaluatedKey: response.LastEvaluatedKey,
      }))
    );
  }

  private _buildQueryTransactionInput(ticketNumber: string): QueryCommandInput {
    const expression_attribute_values: Record<string, string> = {
      ":tn": ticketNumber,
      ":ttp": TransactionTypeEnum.PREAUTH,
      ":ttv": TransactionTypeEnum.VOID,
    };

    const query_args: QueryCommandInput = {
      ExpressionAttributeNames: {
        "#tn": "ticket_number",
        "#tt": "transaction_type",
      },
      ExpressionAttributeValues: expression_attribute_values,
      FilterExpression: "#tt <> :ttp AND #tt <> :ttv",
      IndexName: IndexEnum.transaction_ticket_number,
      KeyConditionExpression: "#tn = :tn",
      ScanIndexForward: false,
      TableName: TABLES.transaction,
    };

    return query_args;
  }

  private _buildUpdateTokenInput(
    id: string,
    processingCode: string
  ): UpdateCommandInput {
    const attribute_names: Record<string, string> = {
      "#processingCode": "processingCode",
      "#tokenStatus": "tokenStatus",
    };
    const attribute_values: Record<string, string> = {
      ":processingCode": processingCode,
      ":tokenStatusCreated": TokenStatusEnum.CREATED,
      ":tokenStatusProcessed": TokenStatusEnum.PROCESSED,
    };
    const update_expression: string =
      "SET #processingCode=:processingCode, #tokenStatus=:tokenStatusProcessed";
    const key: Record<string, NativeAttributeValue> = { id };

    return {
      ConditionExpression: `tokenStatus = :tokenStatusCreated AND attribute_not_exists(processingCode)`,
      ExpressionAttributeNames: attribute_names,
      ExpressionAttributeValues: attribute_values,
      Key: key,
      ReturnValues: "ALL_NEW",
      TableName: TABLES.tokens,
      UpdateExpression: update_expression,
    };
  }

  private _query(
    queryInput: QueryCommandInput
  ): Observable<QueryCommandOutput> {
    return of(1).pipe(
      switchMap(async () => this._client.send(new QueryCommand(queryInput))),
      tag("DynamoGateway | _query")
    );
  }
  private _queryPaginated<T>(queryInput: QueryCommandInput): Observable<T[]> {
    return of(1).pipe(
      switchMap(async () => this._client.send(new QueryCommand(queryInput))),
      expand((queryResponse: QueryCommandOutput) => {
        if (this._checkLastEvaluatedKey(queryResponse)) return EMPTY;

        return this._query({
          ...queryInput,
          ExclusiveStartKey: queryResponse.LastEvaluatedKey,
        });
      }),
      reduce(
        (queryArr: T[], curr: QueryCommandOutput) => [
          ...queryArr,
          ...defaultTo(<T[]>curr.Items, []),
        ],
        []
      ),
      tag("DynamoGateway | query paginated")
    );
  }

  private _checkLastEvaluatedKey(queryResponse: QueryCommandOutput): boolean {
    return (
      isUndefined(queryResponse.LastEvaluatedKey) ||
      isEmpty(queryResponse.LastEvaluatedKey)
    );
  }
}
