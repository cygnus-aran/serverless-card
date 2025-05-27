/**
 * EventBridgeGateway Interface
 */
import { Observable } from "rxjs";
/*
 * Gateway logic to send events to Event bridge
 * */
export interface IEventBridgeGateway {
  /*
   * Put an event in Event bridge
   * @param detail - detail of the event
   * @param eventBusName - name of the event bridge bus
   * @param source - source of the event
   * @param detailType - type of detail
   * */
  putEvent(
    detail: object,
    eventBusName: string,
    source: string,
    detailType: string
  ): Observable<boolean>;
}
