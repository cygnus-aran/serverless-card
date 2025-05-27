/**
 * Injection identifiers
 */

export type containerSymbol = {
  AcqGateway: symbol;
  AntifraudGateway: symbol;
  AwsEventBridge: symbol;
  AwsSns: symbol;
  AwsSqs: symbol;
  CardGateway: symbol;
  CardService: symbol;
  CybersourceService: symbol;
  ConciliationService: symbol;
  DynamoGateway: symbol;
  EventBridgeGateway: symbol;
  KushkiGateway: symbol;
  FisService: symbol;
  MerchantService: symbol;
  ProcessorService: symbol;
  ProviderService: symbol;
  SandboxGateway: symbol;
  SQSGateway: symbol;
  SubscriptionService: symbol;
  SyncService: symbol;
  S3Client: symbol;
  S3Gateway: symbol;
  TokenGateway: symbol;
  TransactionService: symbol;
  ISNSGateway: symbol;
  AutomaticTriggersService: symbol;
};

const IDENTIFIERS: containerSymbol = {
  AcqGateway: Symbol.for("AcqGateway"),
  AntifraudGateway: Symbol.for("AntifraudGateway"),
  AutomaticTriggersService: Symbol.for("AutomaticTriggersService"),
  AwsEventBridge: Symbol.for("AwsEventBridge"),
  AwsSns: Symbol.for("AwsSns"),
  AwsSqs: Symbol.for("AwsSqs"),
  CardGateway: Symbol.for("CardGateway"),
  CardService: Symbol.for("CardService"),
  ConciliationService: Symbol.for("ConciliationService"),
  CybersourceService: Symbol.for("CybersourceService"),
  DynamoGateway: Symbol.for("DynamoGateway"),
  EventBridgeGateway: Symbol.for("EventBridgeGateway"),
  FisService: Symbol.for("FisService"),
  ISNSGateway: Symbol.for("SNSGateway"),
  KushkiGateway: Symbol.for("KushkiGateway"),
  MerchantService: Symbol.for("MerchantService"),
  ProcessorService: Symbol.for("ProcessorService"),
  ProviderService: Symbol.for("ProviderService"),
  S3Client: Symbol("S3Client"),
  S3Gateway: Symbol.for("S3Gateway"),
  SandboxGateway: Symbol.for("SandboxGateway"),
  SQSGateway: Symbol.for("SQSGateway"),
  SubscriptionService: Symbol.for("SubscriptionService"),
  SyncService: Symbol.for("SyncService"),
  TokenGateway: Symbol.for("TokenGateway"),
  TransactionService: Symbol.for("TransactionService"),
};

export { IDENTIFIERS };
