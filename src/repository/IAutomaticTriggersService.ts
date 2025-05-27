/**
 * IAutomaticTriggersService file.
 */
import { ISQSEvent } from "@kushki/core";
import { Observable } from "rxjs";
import { CardTrxFailed } from "types/card_trx_failed";
import { Transaction } from "types/transaction";

/**
 * Transaction Service Interface
 */
export interface IAutomaticTriggersService {
  /**
   * Automatic void for preauthorize transactions
   */
  automaticVoidPreAuth(): Observable<boolean>;

  /**
   * Notify an automatic void trx when fails to slack
   */
  notifyAutomaticVoidFailed(
    event: ISQSEvent<CardTrxFailed>
  ): Observable<boolean>;

  /**
   * Automatic void for preauthorize debit an credit transactions
   */
  automaticVoidPreAuthDC(): Observable<boolean>;

  /**
   * Automatic process void for transactions
   */
  processAutomaticVoid(event: ISQSEvent<Transaction>): Observable<boolean>;
}
