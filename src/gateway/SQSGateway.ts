/**
 * SQSGateway
 */

import { IDENTIFIERS, ILogger } from "@kushki/core";
import { SQS } from "aws-sdk";
import { IDENTIFIERS as ID } from "constant/Identifiers";
import { inject, injectable } from "inversify";
import "reflect-metadata";
import { ISQSGateway } from "repository/ISQSGateway";
import { Observable, of, map, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, mapTo, switchMap } from "rxjs/operators";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

/**
 * Gateway to send message to specific SQS queue on AWS
 */
@injectable()
export class SQSGateway implements ISQSGateway {
  private readonly _client: SQSClient;
  private readonly _logger: ILogger;

  constructor(
    @inject(ID.AwsSqs) client: SQSClient,
    @inject(IDENTIFIERS.Logger) logger: ILogger
  ) {
    this._client = client;
    this._logger = logger;
  }

  public put(queue: string, data: object): Observable<boolean> {
    return of(1).pipe(
      switchMap(async () =>
        this._client.send(
          new SendMessageCommand({
            MessageBody: JSON.stringify(data),
            QueueUrl: queue,
          })
        )
      ),
      map(() => true),
      tag("SQSGateway | put")
    );
  }
}
