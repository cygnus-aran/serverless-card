/**
 * ISync Service file.
 */
import { IAPIGatewayEvent } from "@kushki/core";
import { Observable } from "rxjs";
import { AuthorizerContext } from "types/authorizer_context";
import { CreateProcessorRequest } from "types/create_processor_request";
import { ProcessorMetadata } from "types/processor_metadata";
import { ProcessorMetadataQuery } from "types/processor_metadata_query";

/**
 * Processor Service Interface
 */
export interface IProcessorService {
  /**
   * Create processors
   * @param event - API Gateway event
   */
  createProcessors(event: CreateProcessorRequest): Observable<object>;

  /**
   *  Update processor
   *  @param event - API Gateway event
   */
  updateProcessors(event: CreateProcessorRequest): Observable<object>;

  /**
   * Get processor metadata
   * @param event - API Gateway event
   */
  processorMetadata(
    event: IAPIGatewayEvent<
      null,
      null,
      ProcessorMetadataQuery,
      AuthorizerContext
    >
  ): Observable<ProcessorMetadata[]>;
}
