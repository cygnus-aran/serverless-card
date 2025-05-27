/**
 *  DeleteProcessor handler
 */
import { captureLambdaHandler, Tracer } from "@aws-lambda-powertools/tracer";
import {
  BUILDER_API_GATEWAY_MIDDLEWARE,
  ContentTypeEnum,
  ERROR_API_MIDDLEWARE,
  IAPIGatewayEvent,
  IDENTIFIERS as ID,
  IHandler,
  INPUT_OUTPUT_LOGS,
  IRollbar,
  SECURITY_MIDDLEWARE,
  SETUP_MIDDLEWARE,
  SSM_MIDDLEWARE,
  StatusCodeEnum,
  VALIDATION_MIDDLEWARE,
} from "@kushki/core";
import core, { MiddyfiedHandler } from "@middy/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { SchemaEnum } from "infrastructure/SchemaEnum";
import "reflect-metadata";
import { IMerchantService } from "repository/IMerchantService";
import rollbar = require("rollbar");
import sourceMapSupport from "source-map-support";

sourceMapSupport.install();

const TRACER: Tracer = CONTAINER.get<Tracer>(ID.Tracer);
const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: MiddyfiedHandler<
  IAPIGatewayEvent<string | object>,
  object
> = core<IAPIGatewayEvent<string | object>>(
  ROLLBAR.lambdaHandler(
    CORE.run<
      IMerchantService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.MerchantService, // Service Instance
      "deleteProcessor", // Service Method
      CONTAINER,
      ROLLBAR
    )
  )
)
  .use(captureLambdaHandler(TRACER))
  .use(SETUP_MIDDLEWARE(ROLLBAR))
  .use(INPUT_OUTPUT_LOGS(ROLLBAR))
  .use(ERROR_API_MIDDLEWARE(ROLLBAR))
  .use(SSM_MIDDLEWARE(ROLLBAR))
  .use(
    BUILDER_API_GATEWAY_MIDDLEWARE(
      ROLLBAR,
      ContentTypeEnum.JSON,
      StatusCodeEnum.Accepted,
      ContentTypeEnum.JSON,
      true
    )
  )
  .use(SECURITY_MIDDLEWARE(ROLLBAR))
  .use(
    VALIDATION_MIDDLEWARE(ROLLBAR, {
      body: { name: SchemaEnum.processor_delete_request },
      path: { name: SchemaEnum.processor_id_path_parameter },
    })
  );

export { HANDLER };
