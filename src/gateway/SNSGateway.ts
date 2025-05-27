/**
 * SNS Gateway.
 */
import { IDENTIFIERS as ID } from "constant/Identifiers";
import { inject, injectable } from "inversify";
import "reflect-metadata";
import { ISNSGateway } from "repository/ISNSGateway";
import { Observable, of } from "rxjs";
import { map, switchMap } from "rxjs/operators";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

/**
 * Gateway to send message to specific SNS topic on AWS
 */
@injectable()
export class SNSGateway implements ISNSGateway {
  private readonly _client: SNSClient;

  constructor(@inject(ID.AwsSns) client: SNSClient) {
    this._client = client;
  }

  public publish(queue: string, event: object): Observable<boolean> {
    const topic_arn: string = queue;

    return of(1).pipe(
      switchMap(async () =>
        this._client.send(
          new PublishCommand({
            Message: JSON.stringify(event),
            TopicArn: topic_arn,
          })
        )
      ),
      map(() => true)
    );
  }
}
