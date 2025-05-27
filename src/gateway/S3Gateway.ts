/**
 * S3Gateway imports and implementation
 */
import { IDENTIFIERS } from "constant/Identifiers";
import { inject, injectable } from "inversify";
import "reflect-metadata";
import { IS3Gateway } from "repository/IS3Gateway";
import { Observable, of, from } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { map, mergeMap, switchMap } from "rxjs/operators";
import {
  GetObjectCommand,
  GetObjectCommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";

/**
 * S3Gateway implementation
 */
@injectable()
export class S3Gateway implements IS3Gateway {
  private readonly _s3Client: S3Client;

  constructor(@inject(IDENTIFIERS.S3Client) s3Client: S3Client) {
    this._s3Client = s3Client;
  }

  public getObject(bucket: string, key: string): Observable<Buffer> {
    return of(1).pipe(
      switchMap(async () =>
        this._s3Client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        )
      ),
      mergeMap(({ Body }: GetObjectCommandOutput) => {
        const stream = Body as Readable;
        const buffer_promise: Observable<Buffer> = from(
          new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on("data", (chunk) => chunks.push(chunk));
            stream.once("end", () => resolve(Buffer.concat(chunks)));
            stream.once("error", reject);
          })
        );

        return buffer_promise;
      }),
      tag("S3Gateway | getObject")
    );
  }
}
