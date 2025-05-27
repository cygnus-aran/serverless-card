/**
 * SQSGateway Unit Tests
 */
import { SendMessageResult } from "aws-sdk/clients/sqs";
import { expect } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { ISQSGateway } from "repository/ISQSGateway";
import { createSandbox, SinonSandbox } from "sinon";
import { mockClient } from "aws-sdk-client-mock";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

describe("SQSGateway", () => {
  let gateway: ISQSGateway;
  let sandbox: SinonSandbox;
  let sqsMock;

  beforeEach(() => {
    sqsMock = mockClient(SQSClient);
    sandbox = createSandbox();
    CONTAINER.snapshot();
  });

  afterEach(() => {
    sandbox.restore();
    sqsMock.restore();
    CONTAINER.restore();
  });

  it("should publish the message to the queue", (done: Mocha.Done) => {
    const expected_response: SendMessageResult = { MessageId: "test-message" };
    sqsMock.on(SendMessageCommand).resolves(expected_response);

    gateway = CONTAINER.get<ISQSGateway>(IDENTIFIERS.SQSGateway);
    gateway.put("url", {}).subscribe({
      complete: done,
      next: (data: boolean): void => {
        expect(data).to.be.eq(true, "data should be true");
      },
    });
  });

  it("should return error on SendMessageCommand fails", (done: Mocha.Done) => {
    sqsMock.on(SendMessageCommand).rejects({ Code: "error" });

    gateway = CONTAINER.get<ISQSGateway>(IDENTIFIERS.SQSGateway);
    gateway.put("url", {}).subscribe({
      error: (err: Error): void => {
        expect(err).to.have.property("Code", "error");
        done();
      },
    });
  });
});
