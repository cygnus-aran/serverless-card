/**
 * Container
 */
import { Tracer } from "@aws-lambda-powertools/tracer";
import {
  CONTAINER as CONT_CORE,
  IDENTIFIERS as CORE,
  KushkiErrors,
  ILogger,
} from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { AcqGateway } from "gateway/AcqGateway";
import { AntifraudGateway } from "gateway/AntifraudGateway";
import { AurusGateway } from "gateway/AurusGateway";
import { DynamoGateway } from "gateway/DynamoGateway";
import { EventBridgeGateway } from "gateway/EventBridgeGateway";
import { S3Gateway } from "gateway/S3Gateway";
import { SandboxGateway } from "gateway/SandboxGateway";
import { SNSGateway } from "gateway/SNSGateway";
import { SQSGateway } from "gateway/SQSGateway";
import { ErrorCode, ERRORS } from "infrastructure/ErrorEnum";
import { Container, interfaces } from "inversify";
import { makeLoggerMiddleware } from "inversify-logger-middleware";
import { IAcqGateway } from "repository/IAcqGateway";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { IAutomaticTriggersService } from "repository/IAutomaticTriggersService";
import { ICardGateway } from "repository/ICardGateway";
import { ICardService } from "repository/ICardService";
import { ICybersourceService } from "repository/ICybersourceService";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IEventBridgeGateway } from "repository/IEventBridgeGateway";
import { IMerchantService } from "repository/IMerchantService";
import { IProcessorService } from "repository/IProcessorService";
import { IProviderService } from "repository/IProviderService";
import { IS3Gateway } from "repository/IS3Gateway";
import { ISandboxGateway } from "repository/ISandboxGateway";
import { ISNSGateway } from "repository/ISNSGateway";
import { ISQSGateway } from "repository/ISQSGateway";
import { ISyncService } from "repository/ISyncService";
import { ITransactionService } from "repository/ITransactionService";
import { AurusService } from "service/AurusService";
import { AutomaticTriggersService } from "service/AutomaticTriggersService";
import { BillpocketService } from "service/BillpocketService";
import { CardService } from "service/CardService";
import { CredibankService } from "service/CredibankService";
import { CredimaticService } from "service/CredimaticService";
import { CredomaticService } from "service/CredomaticService";
import { CybersourceService } from "service/CybersourceService";
import { FisService } from "service/FisService";
import { KushkiAcqService } from "service/KushkiAcqService";
import { MerchantService } from "service/MerchantService";
import { NiubizService } from "service/NiubizService";
import { ProcessorService } from "service/ProcessorService";
import { ProsaService } from "service/ProsaService";
import { RedebanService } from "service/RedebanService";
import { SandboxService } from "service/SandboxService";
import { SyncService } from "service/SyncService";
import { TransactionService } from "service/TransactionService";
import { TransbankService } from "service/TransbankService";
import { S3Client } from "@aws-sdk/client-s3";
import { defaultTo } from "lodash";
import { SQSClient } from "@aws-sdk/client-sqs";
import { SNSClient } from "@aws-sdk/client-sns";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { DatafastService } from "service/DatafastService";

const CONT_APP: Container = new Container();
const LOGGER: interfaces.Middleware = makeLoggerMiddleware();

CONT_APP.applyMiddleware(LOGGER);

// Service
CONT_APP.bind<ITransactionService>(IDENTIFIERS.TransactionService).to(
  TransactionService
);
CONT_APP.bind<ICardService>(IDENTIFIERS.CardService).to(CardService);
CONT_APP.bind<ISyncService>(IDENTIFIERS.SyncService).to(SyncService);
CONT_APP.bind<IMerchantService>(IDENTIFIERS.MerchantService).to(
  MerchantService
);
CONT_APP.bind<IAutomaticTriggersService>(
  IDENTIFIERS.AutomaticTriggersService
).to(AutomaticTriggersService);
CONT_APP.bind<IProcessorService>(IDENTIFIERS.ProcessorService).to(
  ProcessorService
);
CONT_APP.bind<ICybersourceService>(IDENTIFIERS.CybersourceService).to(
  CybersourceService
);

// Providers
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(SandboxService);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(AurusService);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(RedebanService);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(NiubizService);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(ProsaService);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(
  BillpocketService
);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(
  TransbankService
);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(
  CredomaticService
);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(
  CredibankService
);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(
  KushkiAcqService
);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(FisService);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(
  CredimaticService
);
CONT_APP.bind<IProviderService>(IDENTIFIERS.ProviderService).to(
  DatafastService
);

// Gateway
CONT_APP.bind<ICardGateway>(IDENTIFIERS.CardGateway).to(AurusGateway);
CONT_APP.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).to(DynamoGateway);
CONT_APP.bind<IAntifraudGateway>(IDENTIFIERS.AntifraudGateway).to(
  AntifraudGateway
);
CONT_APP.bind<ISandboxGateway>(IDENTIFIERS.SandboxGateway).to(SandboxGateway);
CONT_APP.bind<ISNSGateway>(IDENTIFIERS.ISNSGateway).to(SNSGateway);
CONT_APP.bind<IS3Gateway>(IDENTIFIERS.S3Gateway).to(S3Gateway);
CONT_APP.bind<IEventBridgeGateway>(IDENTIFIERS.EventBridgeGateway).to(
  EventBridgeGateway
);
CONT_APP.bind<ISQSGateway>(IDENTIFIERS.SQSGateway).to(SQSGateway);
CONT_APP.bind<IAcqGateway>(IDENTIFIERS.AcqGateway).to(AcqGateway);

// Core
CONT_APP.bind<KushkiErrors<ErrorCode>>(CORE.KushkiErrors).toConstantValue(
  ERRORS
);

// External
const TRACER: Tracer = CONT_CORE.get<Tracer>(CORE.Tracer);

const S3_CLIENT: S3Client = TRACER.captureAWSv3Client(
  new S3Client({
    region: defaultTo(process.env.SSM_REGION, "us-east-1"),
    logger: CONT_CORE.get<ILogger>(CORE.Logger),
  })
);

CONT_APP.bind<S3Client>(IDENTIFIERS.S3Client).toDynamicValue(() => S3_CLIENT);

const SNS_CLIENT: SNSClient = TRACER.captureAWSv3Client(
  new SNSClient({
    region: defaultTo(process.env.SSM_REGION, "us-east-1"),
    logger: CONT_CORE.get<ILogger>(CORE.Logger),
  })
);

CONT_APP.bind<SNSClient>(IDENTIFIERS.AwsSns).toDynamicValue(() => SNS_CLIENT);

const EVENT_BRIDGE_CLIENT: EventBridgeClient = TRACER.captureAWSv3Client(
  new EventBridgeClient({
    region: defaultTo(process.env.SSM_REGION, "us-east-1"),
    logger: CONT_CORE.get<ILogger>(CORE.Logger),
  })
);

CONT_APP.bind<EventBridgeClient>(IDENTIFIERS.AwsEventBridge).toDynamicValue(
  () => EVENT_BRIDGE_CLIENT
);

const SQS_CLIENT: SQSClient = TRACER.captureAWSv3Client(
  new SQSClient({
    region: defaultTo(process.env.SSM_REGION, "us-east-1"),
    logger: CONT_CORE.get<ILogger>(CORE.Logger),
  })
);

CONT_APP.bind<SQSClient>(IDENTIFIERS.AwsSqs).toDynamicValue(() => SQS_CLIENT);

const CONTAINER: interfaces.Container = Container.merge(CONT_CORE, CONT_APP);

export { CONTAINER };
