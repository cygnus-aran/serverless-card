/**
 * EventBridgeGateway Unit Tests
 */
import { expect } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { IEventBridgeGateway } from "repository/IEventBridgeGateway";
import { createSandbox, SinonSandbox } from "sinon";
import { mockClient } from "aws-sdk-client-mock";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

describe("EventBridgeGateway", () => {
  let gateway: IEventBridgeGateway;
  let sandbox: SinonSandbox;
  let eventBridgeMock;

  beforeEach(async () => {
    eventBridgeMock = mockClient(EventBridgeClient);
    sandbox = createSandbox();
    CONTAINER.snapshot();
  });
  afterEach(() => {
    sandbox.restore();
    eventBridgeMock.restore();
    CONTAINER.restore();
  });

  describe("putEvent method", () => {
    it("test putEvent", (done: Mocha.Done) => {
      eventBridgeMock.on(PutEventsCommand).resolves({});
      gateway = CONTAINER.get<IEventBridgeGateway>(
        IDENTIFIERS.EventBridgeGateway
      );
      gateway
        .putEvent({ detail: "detail" }, "eventBusName", "source", "detailType")
        .subscribe({
          next: (data: boolean): void => {
            expect(data).to.be.true;
            done();
          },
        });
    });

    it("Should return error when PutEventsCommand fails", (done: Mocha.Done) => {
      eventBridgeMock.on(PutEventsCommand).rejects({ Code: "error" });
      gateway = CONTAINER.get<IEventBridgeGateway>(
        IDENTIFIERS.EventBridgeGateway
      );
      gateway
        .putEvent({ detail: "detail" }, "eventBusName", "source", "detailType")
        .subscribe({
          error: (err: Error): void => {
            expect(err).to.have.property("Code", "error");
            done();
          },
        });
    });
  });
});
