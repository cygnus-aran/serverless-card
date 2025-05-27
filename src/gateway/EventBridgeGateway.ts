/**
 * EventBridgeGateway
 */
import { IDENTIFIERS } from "constant/Identifiers";
import { inject, injectable } from "inversify";
import "reflect-metadata";
import { IEventBridgeGateway } from "repository/IEventBridgeGateway";
import { Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { map, switchMap } from "rxjs/operators";
import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsCommandInput,
} from "@aws-sdk/client-eventbridge";

/**
 * EventBridgeGateway to send data do EventBridge
 */
@injectable()
export class EventBridgeGateway implements IEventBridgeGateway {
  private readonly _client: EventBridgeClient;

  constructor(@inject(IDENTIFIERS.AwsEventBridge) client: EventBridgeClient) {
    this._client = client;
  }

  public putEvent(
    detail: object,
    eventBusName: string,
    source: string,
    detailType: string
  ): Observable<boolean> {
    return of(1).pipe(
      switchMap(async () => {
        const params: PutEventsCommandInput = {
          Entries: [
            {
              Detail: JSON.stringify(detail),
              DetailType: detailType,
              EventBusName: eventBusName,
              Source: source,
            },
          ],
        };

        return this._client.send(new PutEventsCommand(params));
      }),
      map(() => true),
      tag("EventBridgeGateway | putEvent")
    );
  }
}
