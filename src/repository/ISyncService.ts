/**
 * ISync Service file.
 */
import { IDynamoDbEvent, IDynamoRecord, ISnsEvent } from "@kushki/core";
import { IEventBusDetail } from "infrastructure/IEventBusDetail";
import { Observable } from "rxjs";
import { ProcessorResponse } from "types/processor_response";
import { ProcessorFetch } from "types/remote/processor_fetch";
import { TransactionSNS } from "types/transactionSNS";

/**
 * Sync Service Interface
 */
export interface ISyncService {
  /**
   *  Sync Merchants with merchant usrv
   *  @param event - Dynamo event
   */
  syncMerchants(event: IEventBusDetail<IDynamoRecord>): Observable<boolean>;
  /**
   * SyncTransaction from SNS
   * @param event - Transaction
   */
  syncAsyncTransactions(event: ISnsEvent<TransactionSNS>): Observable<boolean>;

  /**
   * Sync processor
   * @param event - Dynamo event
   */
  syncProcessors(event: IDynamoDbEvent<ProcessorFetch>): Observable<boolean>;

  /**
   * Put event to event bridge
   * @param event - Dynamo event
   */
  putEventBridgeProcessor(
    event: IDynamoDbEvent<ProcessorResponse>
  ): Observable<boolean>;
}
