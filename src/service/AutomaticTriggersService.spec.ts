/**
 * AutomaticTriggersService Unit test
 */

import {
  IDENTIFIERS as CORE,
  ILambdaGateway,
  ISQSEvent,
  ISQSRecord,
  KushkiError,
} from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { DynamoGateway } from "gateway/DynamoGateway";
import { CardTypeEnum } from "infrastructure/CardTypeEnum";
import { CONTAINER } from "infrastructure/Container";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { IAutomaticTriggersService } from "repository/IAutomaticTriggersService";
import { ISQSGateway } from "repository/ISQSGateway";
import { of } from "rxjs";
import { CardService } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { CardTrxFailed } from "types/card_trx_failed";
import { Transaction } from "types/transaction";

use(sinonChai);

describe("AutomaticTriggersService", () => {
  function mockLambda(lambdaStub: SinonStub) {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambdaStub,
      })
    );
  }

  describe("When voidMC is called", () => {
    let sandbox: SinonSandbox;
    let charge_delete_stub: SinonStub;
    let lambda_stub: SinonStub;
    let service: IAutomaticTriggersService;
    let transaction: Transaction;

    function bindDynamo(queryByTypeStub: SinonStub, queryStub: SinonStub) {
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<DynamoGateway>({
          query: queryStub,
          queryByTrxTypeAndCreated: queryByTypeStub,
        })
      );
    }

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
      charge_delete_stub = sandbox
        .stub()
        .returns(of({ ticketNumber: "2343493485" }));
      lambda_stub = sandbox.stub().returns(of(true));

      CONTAINER.unbind(IDENTIFIERS.CardService);
      CONTAINER.bind(IDENTIFIERS.CardService).toConstantValue(
        Mock.of<CardService>({
          chargeDelete: charge_delete_stub,
        })
      );
      transaction = {
        approval_code: "",
        approved_transaction_amount: 0,
        bin_card: "",
        card_holder_name: "",
        created: 0,
        currency_code: "",
        iva_value: 0,
        last_four_digits: "",
        merchant_id: "",
        merchant_name: "",
        payment_brand: "",
        processor_bank_name: "",
        processor_id: "",
        processor_name: "MC Processor",
        recap: "",
        request_amount: 0,
        subtotal_iva: 0,
        subtotal_iva0: 0,
        sync_mode: "online",
        ticket_number: "",
        transaction_id: "",
        transaction_status: TransactionStatusEnum.APPROVAL,
        transaction_type: "",
      };
      mockLambda(lambda_stub);
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("should void transaction - success", (done: Mocha.Done) => {
      const query_by_type_stub: SinonStub = sandbox.stub().returns(
        of([
          transaction,
          transaction,
          {
            ...transaction,
            processor_name: ProcessorEnum.FIS,
          },
          {
            ...transaction,
            transaction_status: TransactionStatusEnum.DECLINED,
          },
        ])
      );
      const query: SinonStub = sandbox.stub().returns(of([transaction]));

      bindDynamo(query_by_type_stub, query);
      service = CONTAINER.get(IDENTIFIERS.AutomaticTriggersService);
      service.automaticVoidPreAuth().subscribe({
        complete: (): void => {
          expect(query_by_type_stub).to.have.been.called;
          expect(charge_delete_stub).to.have.been.calledThrice;
          done();
        },
      });
    });

    it("should not void transaction, not found PREAUTHORIZATION transactions", (done: Mocha.Done) => {
      const query_by_type_stub: SinonStub = sandbox.stub().returns(of([]));
      const query: SinonStub = sandbox.stub().returns(of([]));

      bindDynamo(query_by_type_stub, query);
      service = CONTAINER.get(IDENTIFIERS.AutomaticTriggersService);
      service.automaticVoidPreAuth().subscribe({
        complete: (): void => {
          expect(query_by_type_stub).to.have.been.called;
          expect(charge_delete_stub).to.have.not.been.called;
          done();
        },
      });
    });
    it("should not void transaction for other processors", (done: Mocha.Done) => {
      transaction.processor_name = ProcessorEnum.VISANET;
      const query_by_type_stub = sandbox
        .stub()
        .returns(of([transaction, transaction]));

      transaction.transaction_type = "PREAUTHORIZATION";
      const query: SinonStub = sandbox.stub().returns(of([{ ...transaction }]));

      bindDynamo(query_by_type_stub, query);
      service = CONTAINER.get(IDENTIFIERS.AutomaticTriggersService);
      service.automaticVoidPreAuth().subscribe({
        complete: (): void => {
          expect(charge_delete_stub).to.have.not.been.called;
          expect(query_by_type_stub).to.have.been.called;
          done();
        },
      });
    });
    it("should not void transaction for OTHER transaction type exist", (done: Mocha.Done) => {
      const capture_trx: Transaction = {
        approval_code: "",
        approved_transaction_amount: 0,
        bin_card: "",
        card_holder_name: "",
        created: 0,
        currency_code: "",
        iva_value: 0,
        last_four_digits: "",
        merchant_id: "",
        merchant_name: "",
        payment_brand: "",
        processor_bank_name: "",
        processor_id: "",
        processor_name: "MC Processor",
        recap: "",
        request_amount: 0,
        subtotal_iva: 0,
        subtotal_iva0: 0,
        sync_mode: "online",
        ticket_number: "12409009340",
        transaction_id: "",
        transaction_reference: "8s9dsdf-98usdf9-9s8f9df",
        transaction_status: TransactionStatusEnum.APPROVAL,
        transaction_type: "PREAUTHORIZATION",
      };
      const query_by_type_stub: SinonStub = sandbox
        .stub()
        .returns(of([transaction, transaction]));
      const query: SinonStub = sandbox
        .stub()
        .onFirstCall()
        .returns(of([capture_trx]))
        .onSecondCall()
        .returns(
          of([capture_trx, { ...capture_trx, transaction_type: "CAPTURE" }])
        );

      bindDynamo(query_by_type_stub, query);
      service = CONTAINER.get(IDENTIFIERS.AutomaticTriggersService);
      service.automaticVoidPreAuth().subscribe({
        complete: (): void => {
          expect(query).to.have.been.called;
          expect(query_by_type_stub).to.have.been.called;
          expect(charge_delete_stub).to.have.been.calledOnce;
          done();
        },
      });
    });
  });

  describe("Preauthorization Transactions", () => {
    let sandbox: SinonSandbox;
    let charge_delete_stub: SinonStub;
    let service: IAutomaticTriggersService;
    let transaction: Transaction;
    let put_sqs_stub: SinonStub;
    let event_sqs: ISQSEvent<CardTrxFailed>;
    let card_fetch: CardTrxFailed;
    let lambda_stub: SinonStub;

    function bindDynamo(queryByCardTypeStub: SinonStub, queryStub: SinonStub) {
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<DynamoGateway>({
          query: queryStub,
          queryByTrxAndCardType: queryByCardTypeStub,
        })
      );
    }

    function mockSQSGateway(putStub: SinonStub): void {
      CONTAINER.unbind(IDENTIFIERS.SQSGateway);
      CONTAINER.bind(IDENTIFIERS.SQSGateway).toConstantValue(
        Mock.of<ISQSGateway>({
          put: putStub,
        })
      );
    }

    beforeEach(() => {
      sandbox = createSandbox();
      card_fetch = {
        description: "description",
        message: "message",
        priority: "critical",
        transaction: {
          transactionReference: "transactionreference",
        },
      };
      CONTAINER.snapshot();
      charge_delete_stub = sandbox
        .stub()
        .returns(of({ ticketNumber: "2343493485" }));
      lambda_stub = sandbox.stub().returns(of(true));
      event_sqs = Mock.of<ISQSEvent<CardTrxFailed>>({
        Records: [
          Mock.of<ISQSRecord<CardTrxFailed>>({
            body: Mock.of<CardTrxFailed>(card_fetch),
          }),
        ],
      });
      CONTAINER.unbind(IDENTIFIERS.CardService);
      CONTAINER.bind(IDENTIFIERS.CardService).toConstantValue(
        Mock.of<CardService>({
          chargeDelete: charge_delete_stub,
        })
      );
      put_sqs_stub = sandbox.stub().returns(of(true));
      mockSQSGateway(put_sqs_stub);
      process.env.AUTOMATIC_PREAUTH_VOIDS_ACQ = "https://google.com";

      transaction = {
        approval_code: "",
        approved_transaction_amount: 0,
        bin_card: "",
        card_holder_name: "",
        card_type: CardTypeEnum.CREDIT,
        created: 0,
        currency_code: "",
        iva_value: 0,
        last_four_digits: "",
        merchant_id: "",
        merchant_name: "",
        payment_brand: "",
        processor_bank_name: "",
        processor_id: "",
        processor_name: ProcessorEnum.KUSHKI,
        recap: "",
        request_amount: 0,
        subtotal_iva: 0,
        subtotal_iva0: 0,
        sync_mode: "online",
        ticket_number: "",
        transaction_id: "",
        transaction_reference: "123213213123",
        transaction_status: TransactionStatusEnum.APPROVAL,
        transaction_type: TransactionTypeEnum.PREAUTH,
      };
      mockLambda(lambda_stub);
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("should notify to slack when trx attempts fails", (done: Mocha.Done) => {
      service = CONTAINER.get(IDENTIFIERS.AutomaticTriggersService);
      service.notifyAutomaticVoidFailed(event_sqs).subscribe({
        complete: (): void => {
          expect(lambda_stub).to.have.been.called;
          done();
        },
      });
    });

    it("When automaticVoidPreAuthDC is called and bring transactions from the query, then it should put the filtered transactions on sqs", (done: Mocha.Done) => {
      const query_by_card_type_stub: SinonStub = sandbox
        .stub()
        .onFirstCall()
        .returns(
          of([
            transaction,
            {
              ...transaction,
              transaction_reference: "4564565465",
            },
          ])
        )
        .onSecondCall()
        .returns(
          of([
            {
              ...transaction,
              card_type: CardTypeEnum.DEBIT,
              transaction_reference: "6767767676767",
            },
          ])
        );

      const query: SinonStub = sandbox.stub().returns(of([transaction]));

      bindDynamo(query_by_card_type_stub, query);
      mockSQSGateway(put_sqs_stub);
      service = CONTAINER.get(IDENTIFIERS.AutomaticTriggersService);
      service.automaticVoidPreAuthDC().subscribe({
        complete: (): void => {
          expect(query_by_card_type_stub).to.have.been.called;
          expect(put_sqs_stub).to.have.been.calledThrice;
          done();
        },
      });
    });

    it("When automaticVoidPreAuthDC is called and transactions made a capture before, then it should not put the transactions to sqs", (done: Mocha.Done) => {
      const query_by_card_type_stub: SinonStub = sandbox
        .stub()
        .onFirstCall()
        .returns(
          of([
            transaction,
            {
              ...transaction,
              transaction_reference: "4564565465",
            },
          ])
        )
        .onSecondCall()
        .returns(
          of([
            {
              ...transaction,
              card_type: CardTypeEnum.DEBIT,
              transaction_reference: "6767767676767",
            },
          ])
        );

      const query: SinonStub = sandbox.stub().returns(
        of([
          transaction,
          {
            ...transaction,
            transaction_type: TransactionTypeEnum.CAPTURE,
          },
        ])
      );

      bindDynamo(query_by_card_type_stub, query);
      mockSQSGateway(put_sqs_stub);
      service = CONTAINER.get(IDENTIFIERS.AutomaticTriggersService);
      service.automaticVoidPreAuthDC().subscribe({
        complete: (): void => {
          expect(put_sqs_stub).not.to.have.been.called;
          done();
        },
      });
    });
  });

  describe("When Kushki void is called", () => {
    let sandbox: SinonSandbox;
    let charge_delete_stub: SinonStub;
    let transaction: Transaction;
    let lambda_stub: SinonStub;

    beforeEach(() => {
      transaction = {
        approval_code: "",
        approved_transaction_amount: 0,
        bin_card: "",
        card_holder_name: "",
        created: 0,
        currency_code: "",
        iva_value: 0,
        last_four_digits: "",
        merchant_id: "",
        merchant_name: "",
        payment_brand: "",
        processor_bank_name: "",
        processor_id: "",
        processor_name: "Kushki Processor",
        recap: "",
        request_amount: 0,
        subtotal_iva: 0,
        subtotal_iva0: 0,
        sync_mode: "online",
        ticket_number: "",
        transaction_id: "",
        transaction_status: TransactionStatusEnum.APPROVAL,
        transaction_type: "",
      };
    });

    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    it("should void transaction - success", (done: Mocha.Done) => {
      sandbox = createSandbox();
      charge_delete_stub = sandbox
        .stub()
        .returns(of({ ticketNumber: "2343493485" }));
      lambda_stub = sandbox.stub().returns(of(true));
      CONTAINER.snapshot();
      CONTAINER.unbind(IDENTIFIERS.CardService);
      CONTAINER.bind(IDENTIFIERS.CardService).toConstantValue(
        Mock.of<CardService>({
          chargeDelete: charge_delete_stub,
        })
      );
      mockLambda(lambda_stub);
      const event: ISQSEvent<Transaction> = Mock.of<ISQSEvent<Transaction>>({
        Records: [
          {
            body: transaction,
          },
        ],
      });
      const service: IAutomaticTriggersService = CONTAINER.get(
        IDENTIFIERS.AutomaticTriggersService
      );

      service.processAutomaticVoid(event).subscribe({
        complete: (): void => {
          expect(charge_delete_stub).to.have.been.calledOnce;
          done();
        },
      });
    });

    it("should return false when void transaction fail", (done: Mocha.Done) => {
      sandbox = createSandbox();
      lambda_stub = sandbox.stub().returns(of(true));
      CONTAINER.snapshot();
      CONTAINER.rebind(IDENTIFIERS.CardService).toConstantValue(
        Mock.of<CardService>({
          chargeDelete: sandbox.stub().returns(new KushkiError(ERRORS.E006)),
        })
      );
      mockLambda(lambda_stub);
      const event: ISQSEvent<Transaction> = Mock.of<ISQSEvent<Transaction>>({
        Records: [
          {
            body: transaction,
          },
        ],
      });
      const service: IAutomaticTriggersService = CONTAINER.get(
        IDENTIFIERS.AutomaticTriggersService
      );

      service.processAutomaticVoid(event).subscribe({
        next: (data: boolean): void => {
          expect(data).to.be.false;
          done();
        },
      });
    });
  });
});
