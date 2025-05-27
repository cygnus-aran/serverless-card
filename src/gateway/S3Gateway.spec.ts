/**
 * S3Gateway Unit Tests
 */
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { IS3Gateway } from "repository/IS3Gateway";
import { createSandbox, SinonSandbox } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { mockClient } from "aws-sdk-client-mock";
import {
  GetObjectCommand,
  S3Client,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

use(sinonChai);
let gateway: IS3Gateway;
let gSandbox: SinonSandbox;

describe("S3 Gateway", () => {
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    gSandbox = createSandbox();

    CONTAINER.snapshot();
    gateway = CONTAINER.get<IS3Gateway>(IDENTIFIERS.S3Gateway);
  });
  afterEach(() => {
    gSandbox.restore();
    s3Mock.reset();
    CONTAINER.restore();
  });

  it("Should return object successfully", (done: Mocha.Done) => {
    const encoder = new TextEncoder();
    const encode_string = encoder.encode("input string");
    const readable = Readable.from([encode_string]);
    const output: GetObjectCommandOutput = Mock.of<GetObjectCommandOutput>({
      Body: readable,
    });
    s3Mock.on(GetObjectCommand).resolves(output);

    process.env.SLS_REGION = "us-east-1";
    gateway = CONTAINER.get<IS3Gateway>(IDENTIFIERS.S3Gateway);
    gateway.getObject("s3://setset/setset", "test").subscribe({
      next: (): void => {
        const commandCallCount = s3Mock.commandCalls(GetObjectCommand).length;
        expect(commandCallCount).to.be.equals(1);
        done();
      },
    });
  });

  it("Should return error when getObject function is called", (done: Mocha.Done) => {
    s3Mock.on(GetObjectCommand).rejects({ Code: "error" });
    process.env.SLS_REGION = "us-east-1";
    gateway = CONTAINER.get<IS3Gateway>(IDENTIFIERS.S3Gateway);
    gateway.getObject("s3://setset/setset", "test").subscribe({
      error: (err: Error): void => {
        expect(err).to.have.property("Code", "error");
        done();
      },
    });
  });
});
