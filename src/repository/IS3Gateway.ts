/**
 * S3 Gateway Interface
 */
import { Observable } from "rxjs";

export interface IS3Gateway {
  /**
   * Get an object from Amazon S3
   * @param bucket - bucket where is located the file
   * @param key - file path including its name
   */
  getObject(bucket: string, key: string): Observable<Buffer>;
}
