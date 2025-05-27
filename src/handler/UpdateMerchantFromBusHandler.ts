/**
 *  UpdateMerchantFromBusHandler Handler
 */
import { captureLambdaHandler, Tracer } from "@aws-lambda-powertools/tracer";
import {
  ERROR_MIDDLEWARE,
  IDENTIFIERS as ID,
  IHandler,
  INPUT_OUTPUT_LOGS,
  IRollbar,
  SETUP_MIDDLEWARE,
  SSM_MIDDLEWARE,
} from "@kushki/core";
import core, { MiddyfiedHandler } from "@middy/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import "reflect-metadata";
import rollbar = require("rollbar");
import { MerchantService } from "service/MerchantService";
import sourceMapSupport from "source-map-support";

sourceMapSupport.install();

const TRACER: Tracer = CONTAINER.get<Tracer>(ID.Tracer);
const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: MiddyfiedHandler<object, object> = core<object>(
  ROLLBAR.lambdaHandler(
    CORE.run<
      MerchantService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.MerchantService, // Service Instance
      "updateMerchantFromBus", // Service Method
      CONTAINER,
      ROLLBAR
    )
  )
)
  .use(captureLambdaHandler(TRACER))
  .use(SETUP_MIDDLEWARE(ROLLBAR))
  .use(INPUT_OUTPUT_LOGS(ROLLBAR))
  .use(SSM_MIDDLEWARE(ROLLBAR))
  .use(ERROR_MIDDLEWARE(ROLLBAR));

export { HANDLER };
