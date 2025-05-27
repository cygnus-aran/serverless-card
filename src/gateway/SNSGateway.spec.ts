/**
 * SNSGateway Unit Tests
 */
import { expect } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { ISNSGateway } from "repository/ISNSGateway";
import { createSandbox, SinonSandbox } from "sinon";
import { mockClient } from "aws-sdk-client-mock";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

describe("SNSGateway -", () => {
  let gateway: ISNSGateway | undefined;
  let sandbox: SinonSandbox;
  let snsMock;

  beforeEach(async () => {
    CONTAINER.snapshot();
    snsMock = mockClient(SNSClient);
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    snsMock.restore();
    CONTAINER.restore();
  });

  it("when publish is called it will return true", (done: Mocha.Done) => {
    snsMock.on(PublishCommand).resolves({});
    gateway = CONTAINER.get<ISNSGateway>(IDENTIFIERS.ISNSGateway);
    gateway.publish("arn", {}).subscribe({
      next: (data: boolean): void => {
        expect(data).to.be.true;
        done();
      },
    });
  });

  it("should return error on PublishCommand fails", (done: Mocha.Done) => {
    snsMock.on(PublishCommand).rejects({ Code: "error" });
    gateway = CONTAINER.get<ISNSGateway>(IDENTIFIERS.ISNSGateway);
    gateway.publish("arn", {}).subscribe({
      error: (err: Error): void => {
        expect(err).to.have.property("Code", "error");
        done();
      },
    });
  });
});
