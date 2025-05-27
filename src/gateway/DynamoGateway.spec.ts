/**
 * DynamoGateway Unit Tests
 */
import { KushkiError } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";
import { CONTAINER } from "infrastructure/Container";
import { DynamoReturnValues } from "infrastructure/DynamoReturnValuesEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { DynamoQueryResponse, IDynamoGateway } from "repository/IDynamoGateway";
import { createSandbox, SinonSandbox, SinonSpy } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { Transaction } from "types/transaction";
import { TransactionDynamo } from "types/transaction_dynamo";
import { mockClient } from "aws-sdk-client-mock";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

use(sinonChai);

describe("DynamoGateway -", () => {
  let gateway: IDynamoGateway;
  let box: SinonSandbox;
  let put_data: object;
  let query_data: object;
  const should_not_be_called_message = "this should not be called";
  const old_env: NodeJS.ProcessEnv = process.env;
  const testing_region = "us-east-1";
  let output: TransactionDynamo[];
  let spy_next: SinonSpy;
  let dynamoMock;

  beforeEach(async () => {
    process.env = { ...old_env };
    dynamoMock = mockClient(DynamoDBDocumentClient);
    box = createSandbox();
    output = [Mock.of<TransactionDynamo>()];
    spy_next = box.spy();
    CONTAINER.snapshot();
    query_data = { Items: output };
    put_data = { test: "hi!!", test2: "hello world" };
    dynamoMock.on(PutCommand).resolves(true);
    dynamoMock.on(UpdateCommand).resolves(true);
    dynamoMock.on(QueryCommand).resolves(query_data);
  });

  after(() => {
    process.env = old_env;
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function assertPutConfigRegion() {
    const putCall = dynamoMock.commandCalls(PutCommand)[0].firstArg.input.Item;
    expect(putCall).to.deep.equal({
      ...put_data,
      config: {
        region: testing_region,
      },
    });
  }

  it("test put without condition", (done: Mocha.Done) => {
    process.env.AWS_REGION = testing_region;
    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    const spy: SinonSpy = box.spy();

    gateway.put(put_data, "testStream").subscribe({
      complete: (): void => {
        const putCall = dynamoMock.commandCalls(PutCommand)[0];
        expect(spy).to.be.calledOnce.and.calledWithExactly(true);
        expect(putCall).to.not.have.property("ConditionExpression");
        assertPutConfigRegion();
        done();
      },
      error: done,
      next: spy,
    });
  });

  it("test put with condition", (done: Mocha.Done) => {
    process.env.AWS_REGION = testing_region;
    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    const spy: SinonSpy = box.spy();

    gateway.put(put_data, "testStream", "condition").subscribe({
      complete: (): void => {
        expect(spy).to.be.calledOnce.and.calledWithExactly(true);
        const putCall = dynamoMock.commandCalls(PutCommand)[0].firstArg.input;
        expect(putCall).to.have.property("ConditionExpression", "condition");
        assertPutConfigRegion();
        done();
      },
      error: done,
      next: spy,
    });
  });

  it("test put with condition and ConditionalCheckFailedException", (done: Mocha.Done) => {
    process.env.AWS_REGION = testing_region;
    dynamoMock
      .on(PutCommand)
      .rejects({ name: ConditionalCheckFailedException.name });
    const spy: SinonSpy = box.spy();

    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    gateway.put(put_data, "testStream", "condition").subscribe({
      complete: (): void => {
        expect(spy).to.be.calledOnce.and.calledWithExactly(true);
        assertPutConfigRegion();
        done();
      },
      error: done,
      next: spy,
    });
  });

  it("test put with error", (done: Mocha.Done) => {
    dynamoMock.on(PutCommand).rejects({ code: "error" });

    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    gateway.put(put_data, "testStream").subscribe({
      error: (err: Error): void => {
        expect(err).to.have.property("code", "error");
        done();
      },
      next: (): void => {
        done(should_not_be_called_message);
      },
    });
  });
  it("test query", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .query(
        TABLES.transaction,
        IndexEnum.transaction_sale_ticket_number,
        "sale_ticket_number",
        "181063568268500321"
      )
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });

  it("test query with filter", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .query(
        TABLES.transaction,
        IndexEnum.transaction_sale_ticket_number,
        "sale_ticket_number",
        "181063568268500321",
        {
          FilterExpression:
            "#transaction_status = :transaction_status_value AND #merchant_id = :merchant_id_value",
          ExpressionAttributeNames: {
            "#transaction_status": "transaction_status",
            "#merchant_id": "merchant_id",
          },
          ExpressionAttributeValues: {
            ":transaction_status_value": TransactionTypeEnum.PREAUTH,
            ":merchant_id_value": "33333",
          },
        }
      )
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });

  it("test queryReservedWord", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .queryReservedWord(
        TABLES.transaction,
        IndexEnum.transaction_tokenIndex,
        "token",
        "181063568268500321",
        "#token"
      )
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });
  it("test queryByStatusAndExpiration", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .queryByTrxTypeAndCreated(
        TABLES.transaction,
        IndexEnum.transaction_type_created_index,
        TransactionTypeEnum.PREAUTH,
        0,
        1
      )
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });
  it("Should run successfully queryPaginated test when second call has transactions", (done: Mocha.Done) => {
    const last_key: object = {
      somePrimaryKey: {},
    };
    const fake_transaction1: Transaction = {
      approval_code: "",
      approved_transaction_amount: 0,
      bin_card: "",
      card_holder_name: "",
      created: 0,
      currency_code: "",
      iva_value: 0,
      last_four_digits: "",
      merchant_id: "",
      merchant_name: "",
      payment_brand: "",
      processor_bank_name: "",
      processor_id: "",
      processor_name: "",
      recap: "",
      request_amount: 0,
      subtotal_iva: 0,
      subtotal_iva0: 0,
      sync_mode: "api",
      ticket_number: "",
      transaction_id: "",
      transaction_reference: "some id",
      transaction_status: "",
      transaction_type: "",
    };
    const fake_transaction2: Transaction = fake_transaction1;
    const fake_transaction3: Transaction = fake_transaction1;
    const fake_transaction4: Transaction = fake_transaction1;

    dynamoMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [fake_transaction1, fake_transaction2],
        LastEvaluatedKey: last_key,
      })
      .resolvesOnce({
        Items: [fake_transaction3, fake_transaction4],
        LastEvaluatedKey: last_key,
      })
      .resolves({});

    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);

    gateway
      .queryTransactionCustomOpsBySeqIdAndVoided<Transaction[]>("1234")
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly([
            fake_transaction1,
            fake_transaction2,
            fake_transaction3,
            fake_transaction4,
          ]);
          done();
        },
        error: done,
        next: spy_next,
      });
  });
  it("Should run queryTransactionCustomOpsBySeqIdAndVoided successfully", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .queryTransactionCustomOpsBySeqIdAndVoided("some sequenceId")
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });
  it("Should query transaction by id and created successfully", (done: Mocha.Done) => {
    const result: Transaction[] = [Mock.of<Transaction>()];
    dynamoMock.on(QueryCommand).resolves({ Items: result });

    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway.queryTransactionBySeqIdAndCreated("some sequenceId").subscribe({
      complete: (): void => {
        expect(spy_next).to.be.calledOnce.and.calledWithExactly(result);
        done();
      },
      error: done,
      next: spy_next,
    });
  });
  it("test getItem", (done: Mocha.Done) => {
    const output_result: object = {
      qwerty: "ipsum",
    };

    dynamoMock.on(GetCommand).resolves({ Item: output_result });
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);

    gateway
      .getItem("table", {
        key: "lorem",
      })
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(
            output_result
          );
          done();
        },
        error: done,
        next: spy_next,
      });
  });
  it("should update an Item", (done: Mocha.Done) => {
    const values_to_update: {
      booleanValue: boolean;
      numberValue: number;
      objectValue: object;
      stringValue: string;
    } = {
      booleanValue: false,
      numberValue: 123,
      objectValue: { some: "object" },
      stringValue: "string",
    };

    const key: object = {
      some: "key",
    };

    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway.updateValues("some_table", key, values_to_update).subscribe({
      error: done,
      next: (resp: boolean) => {
        expect(resp).to.be.true;
        const updateCalls = dynamoMock.commandCalls(UpdateCommand);
        expect(updateCalls.length).to.be.eql(1);
        expect(updateCalls[0].firstArg.input).to.deep.equal({
          ConditionExpression: undefined,
          ExpressionAttributeNames: {
            "#booleanValue": "booleanValue",
            "#numberValue": "numberValue",
            "#objectValue": "objectValue",
            "#stringValue": "stringValue",
          },
          ExpressionAttributeValues: {
            ":booleanValue": values_to_update.booleanValue,
            ":numberValue": values_to_update.numberValue,
            ":objectValue": values_to_update.objectValue,
            ":stringValue": values_to_update.stringValue,
          },
          Key: key,
          TableName: "some_table",
          UpdateExpression:
            "SET #booleanValue=:booleanValue, #numberValue=:numberValue, #objectValue=:objectValue, #stringValue=:stringValue",
        });
        done();
      },
    });
  });
  it("should update an Item with condition expression", (done: Mocha.Done) => {
    const values_to_update: {
      booleanValue: boolean;
      numberValue: number;
      objectValue: object;
      stringValue: string;
    } = {
      booleanValue: false,
      numberValue: 123,
      objectValue: { some: "object" },
      stringValue: "string",
    };

    const key: object = {
      some: "key",
    };

    const condition_expression: string = "some data";

    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .updateValues("some_table", key, values_to_update, condition_expression)
      .subscribe({
        error: done,
        next: (resp: boolean) => {
          expect(resp).to.be.true;
          const updateCalls = dynamoMock.commandCalls(UpdateCommand);
          expect(updateCalls.length).to.be.eql(1);
          expect(updateCalls[0].firstArg.input).to.be.eql({
            ConditionExpression: "some data",
            ExpressionAttributeNames: {
              "#booleanValue": "booleanValue",
              "#numberValue": "numberValue",
              "#objectValue": "objectValue",
              "#stringValue": "stringValue",
            },
            ExpressionAttributeValues: {
              ":booleanValue": values_to_update.booleanValue,
              ":numberValue": values_to_update.numberValue,
              ":objectValue": values_to_update.objectValue,
              ":stringValue": values_to_update.stringValue,
            },
            Key: key,
            TableName: "some_table",
            UpdateExpression:
              "SET #booleanValue=:booleanValue, #numberValue=:numberValue, #objectValue=:objectValue, #stringValue=:stringValue",
          });
          done();
        },
      });
  });

  describe("updateTokenValue", () => {
    describe("when the token is used for the first time", () => {
      it("should update the token and return the record", (done: Mocha.Done) => {
        const old_tokens_table = TABLES.tokens;
        dynamoMock.on(UpdateCommand).resolves(true);

        TABLES.tokens = "some-table";

        gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
        gateway.updateTokenValue("id", "123456789").subscribe({
          error: done,
          next: (resp) => {
            expect(resp).not.to.be.null;
            const updateCalls = dynamoMock.commandCalls(UpdateCommand);
            expect(updateCalls.length).to.be.eql(1);
            expect(updateCalls[0].firstArg.input).to.deep.equal({
              ConditionExpression:
                "tokenStatus = :tokenStatusCreated AND attribute_not_exists(processingCode)",
              ExpressionAttributeNames: {
                "#processingCode": "processingCode",
                "#tokenStatus": "tokenStatus",
              },
              ExpressionAttributeValues: {
                ":processingCode": "123456789",
                ":tokenStatusCreated": "CREATED",
                ":tokenStatusProcessed": "PROCESSED",
              },
              Key: { id: "id" },
              ReturnValues: DynamoReturnValues.ALL_NEW,
              TableName: "some-table",
              UpdateExpression:
                "SET #processingCode=:processingCode, #tokenStatus=:tokenStatusProcessed",
            });

            TABLES.tokens = old_tokens_table;
            done();
          },
        });
      });
    });

    describe("when updating the token fails", () => {
      it("should throw a K002 error", (done: Mocha.Done) => {
        const error: object = {
          code: "K002",
          message: "fail",
          name: "error",
          time: new Date(),
        };

        dynamoMock.on(UpdateCommand).rejects(error);

        gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
        gateway.updateTokenValue("id", "123456789").subscribe({
          error: (err: Error): void => {
            expect(err).to.have.property("code", "K002");
            done();
          },
          next: () => {
            done(should_not_be_called_message);
          },
        });
      });
    });
  });

  it("test getSequencial", (done: Mocha.Done) => {
    dynamoMock.on(UpdateCommand).resolves({ Attributes: { quantity: 1 } });

    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    gateway.getSequential("testTable").subscribe({
      next: (data: object): void => {
        expect({ quantity: 1 }).to.be.eql(data);
        done();
      },
    });
  });
  it("getDynamoMerchant should return a merchant", (done: Mocha.Done) => {
    const merchant: DynamoMerchantFetch = {
      merchant_name: "",
      public_id: "",
      sift_science: {},
    };

    dynamoMock.on(GetCommand).resolves({ Item: merchant });

    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    gateway.getDynamoMerchant("211212").subscribe({
      next: (data: DynamoMerchantFetch): void => {
        expect(data).to.be.eql(merchant);
        done();
      },
    });
  });
  it("getDynamoMerchant should throw an error if merchant is not found", (done: Mocha.Done) => {
    dynamoMock.on(GetCommand).resolves({ Item: undefined });

    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    gateway.getDynamoMerchant("21212112").subscribe({
      error: (err: KushkiError): void => {
        expect(err.getMessage()).to.be.eql("Id de comercio no válido.");
        done();
      },
    });
  });

  it("test querySimple", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway.querySimple({ TableName: "asd" }).subscribe({
      next: (response: DynamoQueryResponse): void => {
        expect(dynamoMock.calls(QueryCommand).length).to.be.eql(1);
        expect(response).to.haveOwnProperty("items");
        expect(response).to.haveOwnProperty("lastEvaluatedKey", undefined);
        done();
      },
    });
  });

  it("should return transaction by ticketNumber successfully", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway.queryTransactionByTicketNumber("123123123").subscribe({
      next: (response: DynamoQueryResponse): void => {
        expect(dynamoMock.calls(QueryCommand).length).to.be.eql(1);
        expect(response).to.haveOwnProperty("items");
        expect(response).to.haveOwnProperty("lastEvaluatedKey", undefined);
        done();
      },
    });
  });

  it("Should return transactions with card-type as credit", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .queryByTrxAndCardType(
        TransactionTypeEnum.CHARGE,
        1679203545,
        CardTypeEnum.CREDIT,
        TransactionStatusEnum.APPROVAL,
        ProcessorEnum.KUSHKI
      )
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });

  it("Should return transactions with card-type as debit", (done: Mocha.Done) => {
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .queryByTrxAndCardType(
        TransactionTypeEnum.CHARGE,
        1679203545,
        CardTypeEnum.DEBIT,
        TransactionStatusEnum.APPROVAL,
        ProcessorEnum.KUSHKI
      )
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });
});
