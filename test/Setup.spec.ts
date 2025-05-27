import { IDENTIFIERS as CORE_ID } from "@kushki/core";
import { CONTAINER } from "infrastructure/Container";
import { createSandbox, SinonSandbox } from "sinon";
import { Mock } from "ts-mockery";

const SANDBOX: SinonSandbox = createSandbox();

exports.mochaHooks = {
  beforeEach() {
    CONTAINER.snapshot();
    CONTAINER.unbind(CORE_ID.Logger);
    CONTAINER.bind(CORE_ID.Logger).toConstantValue(
      Mock.of({
        error: SANDBOX.stub(),
        errorHttp: SANDBOX.stub(),
        info: SANDBOX.stub(),
        infoHttp: SANDBOX.stub(),
        log: SANDBOX.stub(),
        warn: SANDBOX.stub(),
      })
    );
  },
  afterEach() {
    SANDBOX.restore();
    CONTAINER.restore();
  },
};
