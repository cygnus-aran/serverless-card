/**
 * SyncService Unit Tests
 */
import {
  DynamoEventNameEnum,
  IDENTIFIERS as CORE,
  IDynamoDbEvent,
  IDynamoElement,
  IDynamoRecord,
  IRecord,
  ISns,
  ISnsEvent,
  KushkiError,
} from "@kushki/core";
import {
  IKushkiInfo,
  ISecurityIdentity,
} from "@kushki/core/lib/repository/IDataFormatter";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { ERRORS } from "infrastructure/ErrorEnum";
import { IEventBusDetail } from "infrastructure/IEventBusDetail";
import { get, isEmpty, set, unset } from "lodash";
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IEventBridgeGateway } from "repository/IEventBridgeGateway";
import { ISyncService } from "repository/ISyncService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { createSandbox, match, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { ProcessorResponse } from "types/processor_response";
import { MerchantFetch } from "types/remote/merchant_fetch";
import { ProcessorFetch } from "types/remote/processor_fetch";
import { TransactionSNS } from "types/transactionSNS";

use(sinonChai);

const API_KEY_COMPLETE_TRANSACTION: string =
  "dynamodb.NewImage.apiKeyCompleteTransaction";
const ONE_CLICK_MALL: string = "dynamodb.NewImage.commerceCodeOneClickMall";

function mockCore(sandBox: SinonSandbox) {
  if (CONTAINER.isBound(CORE.RollbarInstance))
    CONTAINER.unbind(CORE.RollbarInstance);
  CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
    Mock.of<rollbar>({
      critical: sandBox.stub(),
      warn: sandBox.stub(),
    })
  );
  CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
}

function mockDynamo(getStub: SinonStub, putStub: SinonStub) {
  CONTAINER.unbind(IDENTIFIERS.DynamoGateway);

  CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
    Mock.of<IDynamoGateway>({
      getDynamoMerchant: getStub,
      put: putStub,
    })
  );
}

describe("SyncService - Merchant", () => {
  let box: SinonSandbox;
  let merchant: DynamoMerchantFetch;
  let get_item: SinonStub;
  let put_item: SinonStub;

  beforeEach(async () => {
    box = createSandbox();
    merchant = {
      acceptCreditCards: ["amex", "visa"],
      deferredOptions: [
        {
          deferredType: [],
          months: [],
          monthsOfGrace: [],
        },
      ],
      merchant_name: "incididunt ad Lorem deserunt",
      public_id: "nostrud Excepteur",
      sift_science: {
        ProdAccountId: "aliqua qui",
        ProdApiKey: "dolor minim cillum",
        SandboxAccountId: "quis culpa dolore sunt",
        SandboxApiKey: "ipsum ullamco cupidatat",
        SiftScore: -7788477.076453313,
      },
    };
    CONTAINER.snapshot();
    mockCore(box);
    get_item = box.stub().returns(of(merchant));
    put_item = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_item,
        put: put_item,
      })
    );
  });
  afterEach(() => {
    CONTAINER.restore();
    box.restore();
  });
  it("Should update a merchant record on dynamo when receive a modify event from eventbus", (done: Mocha.Done) => {
    const merchant_fetch: MerchantFetch = {
      categoryMerchant: "categoryMerchantUpdate",
      country: "Ecuador",
      created: 10010101,
      name: "sync",
      publicMerchantId: "10000032323232121212121",
      socialReason: "socialReasonUpdate",
      taxId: "taxIdUpdate",
    };
    const event: IEventBusDetail<IDynamoRecord<MerchantFetch>> = {
      action: "test",
      mappingType: "test",
      originUsrv: "usrv-cash",
      payload: {
        dynamodb: Mock.of<IDynamoElement<MerchantFetch>>({
          NewImage: merchant_fetch,
        }),
        eventName: DynamoEventNameEnum.MODIFY,
      },
    };
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncMerchants(event).subscribe((data: boolean) => {
      const put_item_args = put_item.args[0][0];

      expect(data).to.be.eq(true);
      expect(get_item).to.have.been.calledOnce;
      expect(put_item).to.have.been.calledOnce;
      expect(put_item_args.merchantCategory).to.be.eqls(
        "categoryMerchantUpdate"
      );
      expect(put_item_args.socialReason).to.be.eqls("socialReasonUpdate");
      expect(put_item_args.taxId).to.be.eqls("taxIdUpdate");
      done();
    });
  });
  it("Should put a new merchant on Dynamo when receive an insert event from eventbus", (done: Mocha.Done) => {
    get_item = box.stub().returns(of(undefined));
    const merchant_fetch: MerchantFetch = {
      categoryMerchant: "merchantCategoryInsert",
      country: "Ecuador",
      created: 10010101,
      name: "sync",
      publicMerchantId: "2030303033030303030303",
      socialReason: "socialReasonInsert",
      taxId: "taxIdInsert",
    };
    const event: IEventBusDetail<IDynamoRecord<MerchantFetch>> = {
      action: "test",
      mappingType: "test",
      originUsrv: "usrv-cash",
      payload: {
        dynamodb: Mock.of<IDynamoElement<MerchantFetch>>({
          NewImage: merchant_fetch,
        }),
        eventName: DynamoEventNameEnum.INSERT,
      },
    };

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_item,
        put: put_item,
      })
    );

    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncMerchants(event).subscribe((data: boolean) => {
      const put_item_args = put_item.args[0][0];

      expect(data).to.be.eq(true);
      expect(get_item).to.have.been.calledOnce;
      expect(put_item).to.have.been.calledOnce;
      expect(put_item_args.merchantCategory).to.be.eqls(
        "merchantCategoryInsert"
      );
      expect(put_item_args.socialReason).to.be.eqls("socialReasonInsert");
      expect(put_item_args.taxId).to.be.eqls("taxIdInsert");
      expect(put_item_args.acceptCreditCards).to.be.eqls([]);
      expect(put_item_args.public_id).to.be.eqls("2030303033030303030303");
      expect(put_item_args.sift_science).to.be.eqls({});
      done();
    });
  });
  it("Should throws an error when dynamodb param is undefined", (done: Mocha.Done) => {
    const event: IEventBusDetail<IDynamoRecord<MerchantFetch>> = {
      action: "test",
      mappingType: "test",
      originUsrv: "usrv-cash",
      payload: {
        eventName: DynamoEventNameEnum.MODIFY,
      },
    };
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncMerchants(event).subscribe({
      complete: (): void => done(),
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq(ERRORS.E020);
        expect(get_item).to.not.have.been.called;
        expect(put_item).to.not.have.been.called;
        done();
      },
    });
  });
  it("Should return true when DynamoDb's put method throws error", (done: Mocha.Done) => {
    put_item = box.stub().throws(new Error());
    const merchant_fetch: MerchantFetch = {
      categoryMerchant: "merchantCategoryInsert",
      country: "Ecuador",
      created: 10010101,
      name: "sync",
      publicMerchantId: "2030303033030303030303",
      socialReason: "socialReasonInsert",
      taxId: "taxIdInsert",
    };
    const event: IEventBusDetail<IDynamoRecord<MerchantFetch>> = {
      action: "test",
      mappingType: "test",
      originUsrv: "usrv-cash",
      payload: {
        dynamodb: Mock.of<IDynamoElement<MerchantFetch>>({
          NewImage: merchant_fetch,
        }),
        eventName: DynamoEventNameEnum.INSERT,
      },
    };

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_item,
        put: put_item,
      })
    );

    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncMerchants(event).subscribe({
      complete: (): void => done(),
      next: (data: boolean): void => {
        expect(get_item).to.have.been.called;
        expect(put_item).to.have.been.called;
        expect(data).to.be.eq(true);
      },
    });
  });
});

describe("SyncService - Processor", () => {
  let box: SinonSandbox;
  let get_stub: SinonStub;
  let put_stub: SinonStub;
  let service: ISyncService;
  let processor_fetch: ProcessorResponse;
  let put_events_stub: SinonStub;
  const pass_test = "test";

  function mockEventBridgeGateway() {
    put_events_stub = box.stub().returns(of(true));
    CONTAINER.rebind(IDENTIFIERS.EventBridgeGateway).toConstantValue(
      Mock.of<IEventBridgeGateway>({
        putEvent: put_events_stub,
      })
    );
  }

  function mockProcessorResponse(
    eventName: DynamoEventNameEnum,
    hasOldImage: boolean
  ): IDynamoDbEvent<ProcessorResponse> {
    const dynamo_images = {
      NewImage: processor_fetch,
      OldImage: processor_fetch,
    };

    if (!hasOldImage) unset(dynamo_images, "OldImage");
    return Mock.of<IDynamoDbEvent<ProcessorResponse>>({
      Records: [
        Mock.of<IDynamoRecord<ProcessorResponse>>({
          eventName,
          dynamodb: Mock.of<IDynamoElement<ProcessorResponse>>(dynamo_images),
        }),
      ],
    });
  }

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    mockCore(box);
    const merchant: DynamoMerchantFetch = {
      contactPerson: "",
      country: "Narnia",
      email: "",
      merchant_name: "asd",
      private_id: "",
      public_id: "",
      sift_science: {},
    };

    processor_fetch = {
      apiKeyCompleteTransaction: "111",
      businessBank: "test bank",
      businessBankAccountNumber: "0101",
      businessBankAccountType: "0",
      commerceCode: "222",
      commerceCodeOneClickMall: "333",
      commerceCodeWebPay: "444",
      corporateId: "1234",
      created: 3223,
      currency: "USD",
      enableRestCompleteTransaction: true,
      isCrypto: true,
      key: "555",
      lowerLimit: 1000,
      merchantCategoryCode: "6400",
      merchantId: "12345",
      notificationEnable: false,
      omitCVV: true,
      password: pass_test,
      plcc: true,
      privateId: "123331",
      processorCode: "000",
      processorMerchantId: "1234",
      processorName: "Processor XT",
      processorType: "traditional",
      publicId: "23444",
      subMccCode: "01010",
      subTerminalId: "222",
      terminalId: "K69",
      traceInfo: {
        operationTime: 1234482226,
        userIp: "1.1.1.2",
        userName: "userDiana",
        userRoles: "userAdmin",
      },
      uniqueCode: "333",
      upperLimit: 2000,
      username: "testUser",
    };

    process.env.USRV_NAME = undefined;

    get_stub = box.stub().returns(of(merchant));
    put_stub = box.stub().returns(of(true));
  });

  afterEach(() => {
    CONTAINER.restore();
    box.restore();
  });

  it("test put data to event bridge", (done: Mocha.Done) => {
    mockEventBridgeGateway();
    const event: IDynamoDbEvent<ProcessorResponse> = mockProcessorResponse(
      DynamoEventNameEnum.INSERT,
      false
    );

    set(event, "payload.dynamodb.NewImage.status", "active");

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.putEventBridgeProcessor(event).subscribe({
      // tslint:disable-next-line:max-func-body-length
      complete: (): void => {
        expect(put_events_stub).to.have.been.calledOnce;
        expect(put_events_stub.firstCall).to.be.calledWith({
          action: "INSERT",
          mappingType: "dynamo",
          originUsrv: "undefined",
          payload: {
            dynamodb: {
              NewImage: {
                alias: get(
                  event.Records[0],
                  "dynamodb.NewImage.processorAlias"
                ),
                apiKeyCompleteTransaction: get(
                  event.Records[0],
                  API_KEY_COMPLETE_TRANSACTION
                ),
                businessBank: get(
                  event.Records[0],
                  "dynamodb.NewImage.businessBank"
                ),
                businessBankAccountNumber: get(
                  event.Records[0],
                  "dynamodb.NewImage.businessBankAccountNumber"
                ),
                businessBankAccountType: get(
                  event.Records[0],
                  "dynamodb.NewImage.businessBankAccountType"
                ),
                categoryModel: get(
                  event.Records[0],
                  "dynamodb.NewImage.categoryModel"
                ),
                certificates: {
                  completeTransaction:
                    !isEmpty(
                      get(
                        event.Records[0],
                        "dynamodb.NewImage.certificates.completeTransaction"
                      )
                    ) ||
                    !isEmpty(
                      get(event.Records[0], API_KEY_COMPLETE_TRANSACTION)
                    ),
                  firstData: !isEmpty(
                    get(
                      event.Records[0],
                      "dynamodb.NewImage.certificates.firstData"
                    )
                  ),
                  oneClickMall: !isEmpty(get(event.Records[0], ONE_CLICK_MALL)),
                  webPay: !isEmpty(
                    get(
                      event.Records[0],
                      "dynamodb.NewImage.certificates.webPay"
                    )
                  ),
                },
                commerceCode: get(
                  event.Records[0],
                  "dynamodb.NewImage.commerceCode"
                ),
                commerceCodeOneClickMall: get(event.Records[0], ONE_CLICK_MALL),
                commerceCodeWebPay: get(
                  event.Records[0],
                  "dynamodb.NewImage.commerceCodeWebPay"
                ),
                corporateId: get(
                  event.Records[0],
                  "dynamodb.NewImage.corporateId"
                ),
                created: get(event.Records[0], "dynamodb.NewImage.created"),
                credentials: get(
                  event.Records[0],
                  "dynamodb.NewImage.credentials"
                ),
                currency: get(event.Records[0], "dynamodb.NewImage.currency"),
                deleteAt: get(event.Records[0], "dynamodb.NewImage.deletedAt"),
                enableRestCompleteTransaction: get(
                  event.Records[0],
                  "dynamodb.NewImage.enableRestCompleteTransaction"
                ),
                failOverProcessor: get(
                  event.Records[0],
                  "dynamodb.NewImage.failOverProcessor"
                ),
                isCrypto: get(event.Records[0], "dynamodb.NewImage.isCrypto"),
                key: get(event.Records[0], "dynamodb.NewImage.key"),
                lowerLimit: get(
                  event.Records[0],
                  "dynamodb.NewImage.lowerLimit"
                ),
                merchantCategoryCode: get(
                  event.Records[0],
                  "dynamodb.NewImage.merchantCategoryCode"
                ),
                merchantId: get(
                  event.Records[0],
                  "dynamodb.NewImage.merchantId"
                ),
                notificationEnable: get(
                  event.Records[0],
                  "dynamodb.NewImage.notificationEnable"
                ),
                omitCVV: get(event.Records[0], "dynamodb.NewImage.omitCVV"),
                password: get(event.Records[0], "dynamodb.NewImage.password"),
                paymentMethod: "card",
                plcc: get(event.Records[0], "dynamodb.NewImage.plcc"),
                privateId: get(event.Records[0], "dynamodb.NewImage.privateId"),
                processorCode: get(
                  event.Records[0],
                  "dynamodb.NewImage.processorCode"
                ),
                processorMerchantId: get(
                  event.Records[0],
                  "dynamodb.NewImage.processorMerchantId"
                ),
                processorName: get(
                  event.Records[0],
                  "dynamodb.NewImage.processorName"
                ),
                processorType: get(
                  event.Records[0],
                  "dynamodb.NewImage.processorType"
                ),
                publicProcessorId: get(
                  event.Records[0],
                  "dynamodb.NewImage.publicId"
                ),
                status: get(event.Records[0], "dynamodb.NewImage.status"),
                subMccCode: get(
                  event.Records[0],
                  "dynamodb.NewImage.subMccCode"
                ),
                subTerminalId: get(
                  event.Records[0],
                  "dynamodb.NewImage.subTerminalId"
                ),
                terminalId: get(
                  event.Records[0],
                  "dynamodb.NewImage.terminalId"
                ),
                traceInfo: get(event.Records[0], "dynamodb.NewImage.traceInfo"),
                uniqueCode: get(
                  event.Records[0],
                  "dynamodb.NewImage.uniqueCode"
                ),
                updatedAt: get(event.Records[0], "dynamodb.NewImage.updatedAt"),
                upperLimit: get(
                  event.Records[0],
                  "dynamodb.NewImage.upperLimit"
                ),
                username: get(event.Records[0], "dynamodb.NewImage.username"),
                webpayType: get(
                  event.Records[0],
                  "dynamodb.NewImage.webpayType"
                ),
              },
            },
            eventName: "INSERT",
          },
        });
        done();
      },
    });
  });

  it("should put eventName as REMOVE when deletedAt come in event", (done: Mocha.Done) => {
    processor_fetch.deletedAt = 123456789;
    mockEventBridgeGateway();
    const event: IDynamoDbEvent<ProcessorResponse> = mockProcessorResponse(
      DynamoEventNameEnum.REMOVE,
      true
    );

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.putEventBridgeProcessor(event).subscribe({
      complete: (): void => {
        expect(put_events_stub).to.have.been.calledOnce;
        expect(event.Records[0].eventName).to.be.equal(
          DynamoEventNameEnum.REMOVE
        );
        done();
      },
    });
  });

  it("test sync processor", (done: Mocha.Done) => {
    const processor_fetch_gateway: ProcessorFetch = Mock.of<ProcessorFetch>({
      merchantId: "33333333333",
      paymentMethod: "card",
      privateMerchantId: "222222222222",
      publicMerchantId: "111111111",
      StoreInformation: {
        CreditInfo: {
          processorMerchantId: "3223",
          processorName: "Credimatic Processor",
          processorTerminalId: "12345",
          uniqueCode: "54321",
        },
        DemographicalInfo: {
          acquirerBank: "Davivienda",
          omitCVV: false,
        },
        ProcessorInfo: {
          processorType: "GATEWAY",
        },
      },
    });
    const event: IDynamoDbEvent<ProcessorFetch> = Mock.of<
      IDynamoDbEvent<ProcessorFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<ProcessorFetch>>({
          dynamodb: Mock.of<IDynamoElement<ProcessorFetch>>({
            NewImage: processor_fetch_gateway,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.syncProcessors(event).subscribe({
      next: (data: boolean): void => {
        expect(data).to.equal(true);
        done();
      },
    });
  });

  it("test sync transaction  - success - with webhooks", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      created: 1562084538948,
      currency: "CLP",
      description: "-",
      id: "04913ab6-8186-4a99-a578-f51372182610",
      mccCode: "1234",
      merchantId: "20000000103098876000",
      processorType: "aggregator_formal",
      returnURL: "htttp://",
      status: "requestedToken",
      ticketNumber: "1234456777",
      token: "c8204cdaec0e46d08fe2186eed6d9fe2",
      totalAmount: 250,
      webhooks: [
        {
          urls: ["url1.com", "url2.com"],
        },
      ],
      webpayType: "webpayType",
    };
    event.Records = [transaction_sns];

    mockDynamo(get_stub, put_stub);

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub).to.be.called;
      expect(put_stub).to.have.been.calledWithMatch({
        country: "Narnia",
        integration_method: "webpayType",
        mccCode: "1234",
        processor_type: "aggregator_formal",
      });
      expect(get_stub).to.have.been.calledOnce;
      expect(put_stub).to.have.been.calledWith(match.has("webhooks"));
      done();
    });
  });

  it("test sync transaction  - success - with customer and owner ID", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      created: 1562084538948,
      currency: "CLP",
      customerMerchantId: "20000000103098871234",
      description: "-",
      id: "04913ab6-8186-4a99-a578-f51372182619",
      mccCode: "1234",
      merchantId: "20000000103098876000",
      ownerId: "20000000103098876000",
      processorType: "aggregator_formal",
      returnURL: "htttp://",
      status: "requestedToken",
      ticketNumber: "1234456777",
      token: "c8204cdaec0e46d08fe2186eed6d9fe2",
      totalAmount: 250,
      webhooks: [
        {
          urls: ["url1.com", "url2.com"],
        },
      ],
      webpayType: "webpayType",
    };
    event.Records = [transaction_sns];

    mockDynamo(get_stub, put_stub);

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub).to.be.called;
      expect(put_stub).to.have.been.calledWithMatch({
        country: "Narnia",
        integration_method: "webpayType",
        mccCode: "1234",
        processor_type: "aggregator_formal",
        ownerId: "20000000103098876000",
        customerMerchantId: "20000000103098871234",
      });

      expect(get_stub).to.have.been.calledOnce;
      expect(put_stub).to.have.been.calledWith(match.has("webhooks"));
      done();
    });
  });

  it("should sync transaction with success when kushkiInfo and securityIdentity are in the transaction", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });
    const current_kushki_info: IKushkiInfo = {
      manager: "test",
      managerId: "3333",
      methodId: "123",
      methodName: "prueba",
      platformId: "555",
      platformName: "pruebas",
      platformVersion: "version prueba",
    };
    const current_security_identity: ISecurityIdentity = {
      identityCategory: "abc",
      identityCode: "123",
      partnerName: "partner",
    };

    transaction_sns.Sns.Message = {
      created: 1562084538948,
      currency: "CLP",
      description: "-",
      id: "04913ab6-8186-4a99-545-54",
      kushkiInfo: current_kushki_info,
      merchantId: "20000000103098876000",
      processorType: "aggregator_formal",
      returnURL: "htttp://",
      securityIdentity: current_security_identity,
      status: "requestedToken",
      ticketNumber: "1234456777",
      token: "c8204cdaec0e46d08fe2186eed6d9fe2",
      totalAmount: 250,
      webpayType: "webpayType",
    };
    event.Records = [transaction_sns];

    mockDynamo(get_stub, put_stub);

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub).to.be.called;
      expect(put_stub).to.have.been.calledWithMatch({
        country: "Narnia",
        integration_method: "webpayType",
        kushkiInfo: current_kushki_info,
        processor_type: "aggregator_formal",
        securityIdentity: current_security_identity,
      });
      expect(get_stub).to.have.been.calledOnce;
      done();
    });
  });

  it("should sync transaction with success when kushkiInfo is not in the transaction and securityIdentity is empty", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      created: 1562084538948,
      currency: "CLP",
      description: "-",
      id: "04913ab6-8186-4a99-a578-123",
      merchantId: "20000000103098876000",
      processorType: "aggregator_formal",
      returnURL: "htttp://",
      securityIdentity: {},
      status: "requestedToken",
      ticketNumber: "1234456777",
      token: "c8204cdaec0e46d08fe2186eed6d9fe2",
      totalAmount: 250,
      webpayType: "webpayType",
    };
    event.Records = [transaction_sns];

    mockDynamo(get_stub, put_stub);

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub).to.be.called;
      expect(put_stub.getCall(0).args[0]).not.to.haveOwnProperty("kushkiInfo");
      expect(put_stub.getCall(0).args[0]).not.to.haveOwnProperty(
        "securityInfo"
      );
      expect(get_stub).to.have.been.calledOnce;
      done();
    });
  });

  it("test sync transaction with extraxes  - success - without webhooks", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      amount: {
        extraTaxes: { iac: 0 },
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
      },
      created: 1562084538948,
      currency: "USD",
      description: "test",
      id: "04913ab6-8186-4a99-a578-f51372182619",
      merchantId: "200000103098876000",
      returnURL: "www.google.com",
      status: "approvedTransaction",
      ticketNumber: "132324",
      token: "c8204cdaec0e46d08fe2186eed6d9fe2",
    };
    event.Records = [transaction_sns];

    mockDynamo(get_stub, put_stub);

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub.callCount).to.be.equal(1);
      expect(get_stub).to.have.been.calledOnce;
      expect(put_stub).to.not.have.been.calledWith(match.has("webhooks"));
      done();
    });
  });

  it("test sync transaction without extraxes  - success ", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      amount: {
        iva: 1,
        subtotalIva: 10,
        subtotalIva0: 110,
      },
      created: Date.now(),
      currency: "USD",
      description: "test 1",
      id: "0799999ab6-8186-4a99-a578-f51372182619",
      merchantId: "20001233103098876000",
      preauthTransactionReference: "asas",
      returnURL: "www.yahhoo.com",
      status: "declinedTransaction",
      ticketNumber: "890000",
      token: "vgdfh7e387878908fe2186eed6d9fe2",
    };
    event.Records = [transaction_sns];

    mockDynamo(get_stub, put_stub);

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub.callCount > 0);
      expect(get_stub).to.have.been.calledOnce;
      done();
    });
  });

  it("test add new field to TransactionSNS", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      amount: {
        iva: 1,
        subtotalIva: 10,
        subtotalIva0: 110,
      },
      created: Date.now(),
      currency: "USD",
      description: "test 2",
      id: "0799999ab6-8186-4a99-a578-f51372182619",
      merchantId: "20001233103098876000",
      preauthTransactionReference: "test preauth_transaction_reference",
      returnURL: "www.yahhoo.com",
      status: "declinedTransaction",
      ticketNumber: "890000",
      token: "vgdfh7e387878908fe2186eed6d9fe2",
      webpayInitTransactionToken: "1234abcd",
    };
    event.Records = [transaction_sns];

    mockDynamo(get_stub, put_stub);

    service = CONTAINER.get(IDENTIFIERS.SyncService);
    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub.callCount > 0);
      expect(get_stub).to.have.been.calledOnce;
      expect(put_stub.args[0][0]).to.have.own.property(
        "preauth_transaction_reference"
      );
      expect(put_stub.args[0][0]).to.have.own.property(
        "webpay_init_transaction_token"
      );
      done();
    });
  });
});
