/**
 * AutomaticTriggersService file
 */
import {
  IAPIGatewayEvent,
  IDENTIFIERS as CORE_ID,
  ILambdaGateway,
  ISQSEvent,
} from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { QUEUES } from "constant/Resources";
import { AUTOMATIC_VOID_FAILED_NOTIFICATION } from "constant/SlackNotification";
import { TABLES } from "constant/Tables";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { inject, injectable } from "inversify";
import { defaultTo, filter } from "lodash";
import { IAutomaticTriggersService } from "repository/IAutomaticTriggersService";
import { ICardService } from "repository/ICardService";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ISQSGateway } from "repository/ISQSGateway";
import { forkJoin, from, iif, Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, last, map, mapTo, mergeMap } from "rxjs/operators";
import { AuthorizerContext } from "types/authorizer_context";
import { CardTrxFailed } from "types/card_trx_failed";
import { Transaction } from "types/transaction";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { VoidCardRequest } from "types/void_card_request";

/**
 * Implementation
 */
@injectable()
export class AutomaticTriggersService implements IAutomaticTriggersService {
  private readonly _storage: IDynamoGateway;
  private readonly _card: ICardService;
  private readonly _lambda: ILambdaGateway;
  private readonly _sqs: ISQSGateway;

  constructor(
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(IDENTIFIERS.CardService) card: ICardService,
    @inject(CORE_ID.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.SQSGateway) sqs: ISQSGateway
  ) {
    this._storage = storage;
    this._card = card;
    this._lambda = lambda;
    this._sqs = sqs;
  }

  public notifyAutomaticVoidFailed(
    event: ISQSEvent<CardTrxFailed>
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeFunction(
          `${process.env.SLACK_NOTIFICATION_LAMBDA}`,
          {
            body: {
              ...this._buildFailPreAuthNotification(event.Records[0].body),
            },
          }
        )
      ),
      map(() => true),
      tag("AutomaticTriggersService | notifyAutomaticVoidFailed")
    );
  }

  public automaticVoidPreAuth(): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        const now: Date = new Date();
        const end_date: number = now.setDate(now.getDate() - 6);
        const current_now: Date = new Date();
        const start_date: number = current_now.setDate(
          current_now.getDate() - 8
        );

        return this._storage.queryByTrxTypeAndCreated<Transaction>(
          TABLES.transaction,
          IndexEnum.transaction_type_created_index,
          TransactionTypeEnum.PREAUTH,
          start_date,
          end_date
        );
      }),
      mergeMap((transactions: Transaction[]) =>
        of(
          filter(transactions, [
            "transaction_status",
            TransactionStatusEnum.APPROVAL,
          ])
        )
      ),
      mergeMap((transactions: Transaction[]) =>
        iif(
          () => transactions.length <= 0,
          of(true),
          this._processVoid(transactions)
        )
      ),
      tag("AutomaticTriggersService | automaticVoidPreAuth")
    );
  }

  public processAutomaticVoid(
    event: ISQSEvent<Transaction>
  ): Observable<boolean> {
    let response = true;

    return of(event.Records[0].body).pipe(
      mergeMap((transaction: Transaction) =>
        this._card.chargeDelete(this._buildEventBody(transaction))
      ),
      catchError(() => {
        response = false;
        return of(undefined);
      }),
      mergeMap(() => of(response)),
      last(),
      tag("AutomaticTriggersService | processAutomaticVoid")
    );
  }

  public automaticVoidPreAuthDC(): Observable<boolean> {
    const current_date = new Date().setHours(0, 0, 0, 0);

    return of(1).pipe(
      mergeMap(() =>
        forkJoin([
          this._storage.queryByTrxAndCardType<Transaction>(
            TransactionTypeEnum.PREAUTH,
            current_date,
            CardTypeEnum.CREDIT,
            TransactionStatusEnum.APPROVAL,
            ProcessorEnum.KUSHKI
          ),
          this._storage.queryByTrxAndCardType<Transaction>(
            TransactionTypeEnum.PREAUTH,
            current_date,
            CardTypeEnum.DEBIT,
            TransactionStatusEnum.APPROVAL,
            ProcessorEnum.KUSHKI
          ),
        ])
      ),
      mergeMap(
        ([debit_transactions, credit_transactions]: [
          Transaction[],
          Transaction[]
        ]) =>
          this._filterPreAuthTransactions(
            debit_transactions,
            credit_transactions
          )
      ),
      tag("AutomaticTriggersService | automaticVoidPreAuthDC")
    );
  }

  private _processVoid(transactions: Transaction[]): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => from(transactions)),
      mergeMap((transaction: Transaction) =>
        forkJoin([
          this._storage.query<Transaction>(
            TABLES.transaction,
            IndexEnum.transactions_transaction_reference,
            "transaction_reference",
            defaultTo(transaction.transaction_reference, "")
          ),
          of(transaction),
        ])
      ),
      mergeMap(
        ([capture_transaction, transaction]: [Transaction[], Transaction]) =>
          iif(
            () =>
              capture_transaction.length === 1 &&
              [ProcessorEnum.MCPROCESSOR, ProcessorEnum.FIS].includes(
                <ProcessorEnum>transaction.processor_name
              ),
            this._void(this._buildEventBody(transaction)),
            of(true)
          )
      ),
      last(),
      tag("AutomaticTriggersService | _processVoid")
    );
  }

  private _void(
    event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => this._card.chargeDelete(event)),
      mapTo(true),
      tag("AutomaticTriggersService | _void")
    );
  }

  private _buildFailPreAuthNotification(trxFailed: CardTrxFailed): object {
    return {
      messageBody: {
        text: AUTOMATIC_VOID_FAILED_NOTIFICATION(
          defaultTo(trxFailed.transaction.transactionReference, "")
        ),
      },
      weebhook: `${process.env.AUTOMATIC_PREAUTH_VOIDS_ACQ}`,
    };
  }

  private _buildEventBody(
    transaction: Transaction
  ): IAPIGatewayEvent<
    VoidCardRequest | null,
    VoidCardPath,
    null,
    AuthorizerContext,
    VoidCardHeader
  > {
    return {
      body: null,
      headers: {
        "PRIVATE-MERCHANT-ID": "",
      },
      httpMethod: "",
      isBase64Encoded: false,
      path: "",
      pathParameters: {
        ticketNumber: transaction.ticket_number,
      },
      queryStringParameters: null,
      requestContext: {
        authorizer: {
          credentialAlias: "",
          credentialId: transaction.merchant_id,
          merchantId: transaction.merchant_id,
          privateMerchantId: "",
          publicMerchantId: transaction.merchant_id,
        },
      },
      resource: "",
      stageVariables: null,
    };
  }

  private _filterPreAuthTransactions(
    debitTrx: Transaction[],
    creditTrx: Transaction[]
  ): Observable<boolean> {
    const transactions: Transaction[] = debitTrx.concat(creditTrx);

    return of(1).pipe(
      mergeMap(() => from(transactions)),
      mergeMap((trx: Transaction) =>
        forkJoin([
          this._storage.query<Transaction>(
            TABLES.transaction,
            IndexEnum.transactions_transaction_reference,
            "transaction_reference",
            defaultTo(trx.transaction_reference, "")
          ),
          of(trx),
        ])
      ),
      mergeMap(
        ([capture_transaction, transaction]: [Transaction[], Transaction]) =>
          iif(
            () => capture_transaction.length === 1,
            this._sendTrxToSqs(transaction),
            of(true)
          )
      ),
      tag("AutomaticTriggersService | _filterPreAuthTransactions")
    );
  }

  private _sendTrxToSqs(trx: Transaction): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => this._sqs.put(QUEUES.processAutomaticVoidSQS, trx)),
      tag("AutomaticTriggersService | _sendTrxToSqs")
    );
  }
}
