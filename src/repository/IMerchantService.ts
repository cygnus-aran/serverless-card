/**
 * IMerchant
 */
import { IAPIGatewayEvent, IDynamoRecord } from "@kushki/core";
import { Observable } from "rxjs";
import { AuthorizerContext } from "types/authorizer_context";
import { EventBusMerchant } from "types/event_bus_merchant";
import { GetBrandsLogosByMerchantResponse } from "types/get_brands_logos_by_merchant_response";
import { MerchantIdPathParameter } from "types/merchant_id_path_parameter";
import { ProcessorDeleteRequest } from "types/processor_delete_request";
import { ProcessorPathParameter } from "types/processor_id_path_parameter";
import { UpdateMerchantRequest } from "types/update_merchant_request";

/**
 * Event bus interface.
 */
export interface IEventBusDetail<T> {
  action: string;
  mappingType: string;
  originUsrv: string;
  payload: T;
}

export interface IMerchantService {
  /**
   * Update a merchant
   * @param event - ApiGW event
   */
  update(
    event: IAPIGatewayEvent<
      UpdateMerchantRequest,
      MerchantIdPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<object>;

  /**
   * Get a merchant brands by merchantID
   * @param event - ApiGW event
   */
  getBrandsByMerchant(
    event: IAPIGatewayEvent<null, null, null, AuthorizerContext>
  ): Observable<string[]>;

  /**
   * Get deferred options
   * @param event - ApiGW event
   */
  getDeferred(
    event: IAPIGatewayEvent<
      null,
      MerchantIdPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<object>;

  /**
   * Get merchant options
   * @param event - ApiGW event
   */
  getOptions(
    event: IAPIGatewayEvent<
      null,
      MerchantIdPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<object>;

  /**
   * Get merchant options
   * @param event - ApiGW event
   */
  getProcessorById(
    event: IAPIGatewayEvent<
      null,
      ProcessorPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<boolean>;

  /**
   * Delete processor
   * @param event - ApiGW event
   */
  deleteProcessor(
    event: IAPIGatewayEvent<
      ProcessorDeleteRequest,
      ProcessorPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<boolean>;

  /**
   * @param event - Lambda Event
   */
  updateMerchantFromBus(
    event: IEventBusDetail<IDynamoRecord<EventBusMerchant>>
  ): Observable<boolean>;

  /**
   * Get a merchant brands and logos url's by merchantId
   * @param event - ApiGW event
   */
  getBrandsLogosByMerchant(
    event: IAPIGatewayEvent<null, null, null, AuthorizerContext>
  ): Observable<GetBrandsLogosByMerchantResponse[]>;
}
