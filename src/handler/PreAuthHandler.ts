/**
 *  Pre Authorization Handler
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
import { ICardService } from "repository/ICardService";
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
      ICardService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.CardService, // Service Instance
      "preAuthorization", // Service Method
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
      StatusCodeEnum.Created,
      ContentTypeEnum.JSON,
      true
    )
  )
  .use(
    VALIDATION_MIDDLEWARE(ROLLBAR, {
      body: { name: SchemaEnum.charges_card_request },
    })
  );

export { HANDLER };
