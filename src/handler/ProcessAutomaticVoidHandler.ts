/**
 *  ProcessAutomaticVoid Handler
 */
import { captureLambdaHandler, Tracer } from "@aws-lambda-powertools/tracer";
import {
  BUILDER_SQS_MIDDLEWARE,
  ERROR_MIDDLEWARE,
  IDENTIFIERS as ID,
  IHandler,
  INPUT_OUTPUT_LOGS,
  IRollbar,
  ISQSEvent,
  SETUP_MIDDLEWARE,
  SSM_MIDDLEWARE,
} from "@kushki/core";
import core, { MiddyfiedHandler } from "@middy/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { IAutomaticTriggersService } from "repository/IAutomaticTriggersService";
import rollbar = require("rollbar");
import sourceMapSupport from "source-map-support";

sourceMapSupport.install();

const TRACER: Tracer = CONTAINER.get<Tracer>(ID.Tracer);
const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: MiddyfiedHandler<ISQSEvent<string | object>, object> = core<
  ISQSEvent<string | object>
>(
  ROLLBAR.lambdaHandler(
    CORE.run<
      IAutomaticTriggersService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.AutomaticTriggersService, // Service Instance
      "processAutomaticVoid", // Service Method
      CONTAINER,
      ROLLBAR
    )
  )
)
  .use(captureLambdaHandler(TRACER))
  .use(SETUP_MIDDLEWARE(ROLLBAR))
  .use(INPUT_OUTPUT_LOGS(ROLLBAR))
  .use(ERROR_MIDDLEWARE(ROLLBAR))
  .use(BUILDER_SQS_MIDDLEWARE(ROLLBAR))
  .use(SSM_MIDDLEWARE(ROLLBAR));

export { HANDLER };
