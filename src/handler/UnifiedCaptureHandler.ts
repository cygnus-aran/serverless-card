/**
 *  UnifiedCapture Handler
 */
import { captureLambdaHandler, Tracer } from "@aws-lambda-powertools/tracer";
import {
  ERROR_API_MIDDLEWARE,
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
import { ICardService } from "repository/ICardService";
import rollbar = require("rollbar");
import sourceMapSupport from "source-map-support";
import "source-map-support/register";
import { UnifiedCaptureRequest } from "types/unified_capture_request";

sourceMapSupport.install();

const TRACER: Tracer = CONTAINER.get<Tracer>(ID.Tracer);
const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: MiddyfiedHandler<UnifiedCaptureRequest, object> =
  core<UnifiedCaptureRequest>(
    ROLLBAR.lambdaHandler(
      CORE.run<
        ICardService, // Service Definition
        object // Service observable resolve type
      >(
        IDENTIFIERS.CardService, // Service Instance
        "unifiedCapture", // Service Method
        CONTAINER,
        ROLLBAR
      )
    )
  )
    .use(captureLambdaHandler(TRACER))
    .use(SETUP_MIDDLEWARE(ROLLBAR))
    .use(INPUT_OUTPUT_LOGS(ROLLBAR))
    .use(ERROR_API_MIDDLEWARE(ROLLBAR))
    .use(SSM_MIDDLEWARE(ROLLBAR));

export { HANDLER };
