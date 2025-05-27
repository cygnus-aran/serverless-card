/**
 *  RecordApi Handler
 */
import { captureLambdaHandler, Tracer } from "@aws-lambda-powertools/tracer";
import {
  BUILDER_DYNAMO_MIDDLEWARE,
  ERROR_API_MIDDLEWARE,
  IDENTIFIERS as ID,
  IHandler,
  INPUT_OUTPUT_LOGS,
  IRollbar,
  SETUP_MIDDLEWARE,
  SSM_MIDDLEWARE,
} from "@kushki/core";
import core, { MiddyfiedHandler } from "@middy/core";
import { DynamoDBStreamEvent } from "aws-lambda";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import "reflect-metadata";
import { ITransactionService } from "repository/ITransactionService";
import rollbar = require("rollbar");
import sourceMapSupport from "source-map-support";

sourceMapSupport.install();

const TRACER: Tracer = CONTAINER.get<Tracer>(ID.Tracer);
const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: MiddyfiedHandler<DynamoDBStreamEvent, object> =
  core<DynamoDBStreamEvent>(
    ROLLBAR.lambdaHandler(
      CORE.run<
        ITransactionService, // Service Definition
        object // Service observable resolve type
      >(
        IDENTIFIERS.TransactionService, // Service Instance
        "syncTransactions", // Service Method
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
    .use(BUILDER_DYNAMO_MIDDLEWARE(ROLLBAR));

export { HANDLER };
