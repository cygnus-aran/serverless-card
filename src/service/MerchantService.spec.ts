/**
 * MerchantService unit test file
 */
import {
  DynamoEventNameEnum,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE,
  IDynamoElement,
  IDynamoRecord,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import {
  BUCKET_BRANDS_PREFIX_S3,
  DEV_BUCKET_BRANDS_PREFIX_S3,
  PAYLOAD,
} from "constant/Resources";
import { CONTAINER } from "infrastructure/Container";
import { EnvironmentEnum } from "infrastructure/EnvironmentEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { get, set, unset } from "lodash";
import moment = require("moment");
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IEventBusDetail, IMerchantService } from "repository/IMerchantService";
import { of } from "rxjs";
import { delay } from "rxjs/operators";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AuthorizerContext } from "types/authorizer_context";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { EventBusMerchant } from "types/event_bus_merchant";
import {
  GetInfoSiftScienceResponse,
  SiftScienceResponse,
} from "types/getinfo_siftscience_response";
import { MerchantIdPathParameter } from "types/merchant_id_path_parameter";
import { ProcessorDeleteRequest } from "types/processor_delete_request";
import { ProcessorPathParameter } from "types/processor_id_path_parameter";
import { UpdateMerchantFromBus } from "types/update_merchant_from_bus";
import { UpdateMerchantRequest } from "types/update_merchant_request";

use(sinonChai);

describe("Merchant Service - ", () => {
  describe("update, getBrandsByMerchant,getDeferred,getOptions,", () => {
    let sandbox: SinonSandbox;
    let service: IMerchantService;
    let update_event: IAPIGatewayEvent<
      UpdateMerchantRequest,
      MerchantIdPathParameter,
      null,
      AuthorizerContext
    >;
    let merchant: DynamoMerchantFetch;
    let invoke_stub: SinonStub;
    let mock_get_item: SinonStub;

    let get_event_request_brand: IAPIGatewayEvent<
      null,
      null,
      null,
      AuthorizerContext
    >;

    beforeEach(async () => {
      const update_request: UpdateMerchantRequest = {
        acceptCreditCards: [
          "velit occaecat ut",
          "esse officia in",
          "ea commodo",
        ],
        commission: true,
        sandboxEnable: true,
        sift_science: {
          ProdAccountId: "aliqua qui",
          ProdApiKey: "dolor minim cillum",
          SandboxAccountId: "quis culpa dolore sunt",
          SandboxApiKey: "ipsum ullamco cupidatat",
          SiftScore: -7788477.076453313,
        },
        whiteList: true,
      };

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
          BaconProdApiKey: "BaconProdApiKey",
          BaconSandboxApiKey: "BaconSandboxApiKey",
          ProdAccountId: "aliqua qui",
          ProdApiKey: "dolor minim cillum",
          SandboxAccountId: "quis culpa dolore sunt",
          SandboxApiKey: "ipsum ullamco cupidatat",
          SiftScore: -7788477.076453313,
        },
      };
      get_event_request_brand = Mock.of<
        IAPIGatewayEvent<null, null, null, AuthorizerContext>
      >({
        requestContext: {
          authorizer: {
            merchantId: "123456",
          },
        },
      });
      sandbox = createSandbox();
      mock_get_item = sandbox.stub().returns(of(merchant));
      CONTAINER.snapshot();
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: mock_get_item,
          put: sandbox.stub().returns(of(true)),
        })
      );

      invoke_stub = sandbox.stub().returns(of({}));
      mockLambdaGateway(invoke_stub);
      service = CONTAINER.get(IDENTIFIERS.MerchantService);
      update_event = updateMerchantEvent(update_request);
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    function updateMerchantEvent(
      body: UpdateMerchantRequest
    ): IAPIGatewayEvent<
      UpdateMerchantRequest,
      MerchantIdPathParameter,
      null,
      AuthorizerContext
    > {
      return Mock.of<
        IAPIGatewayEvent<
          UpdateMerchantRequest,
          MerchantIdPathParameter,
          null,
          AuthorizerContext
        >
      >({
        body,
        pathParameters: { id: "100001912912" },
        requestContext: { authorizer: { merchantId: "1212121313131313" } },
      });
    }

    function mockDynamoTimeOut(): void {
      process.env.EXTERNAL_TIMEOUT = "1000";
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: sandbox.stub().returns(of(undefined).pipe(delay(1100))),
        })
      );
    }

    function mockLambdaGateway(invokeStub: SinonStub): void {
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: invokeStub,
        })
      );
    }

    function assertsWhenSearchMerchantBranchIsSuccess(
      getEvent: IAPIGatewayEvent<null, null, null, AuthorizerContext>,
      done: Mocha.Done
    ): void {
      service.getBrandsByMerchant(getEvent).subscribe({
        next: (data: object): void => {
          expect(data).to.deep.eq(["amex", "visa"]);
          done();
        },
      });
    }

    function assertsResponseGetBrandsLogos(
      data: object,
      firstCard: string,
      secondCard: string,
      prefixS3: string
    ): void {
      expect(data).to.deep.eq([
        {
          brand: firstCard,
          url: `${prefixS3}/${firstCard}.svg`,
        },
        {
          brand: secondCard,
          url: `${prefixS3}/${secondCard}.svg`,
        },
      ]);
    }

    it("search merchant Brand- successful response", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<null, null, null, AuthorizerContext> =
        Mock.of<IAPIGatewayEvent<null, null, null, AuthorizerContext>>({
          requestContext: {
            authorizer: {
              merchantId: "123456",
            },
          },
        });

      assertsWhenSearchMerchantBranchIsSuccess(get_event, done);
    });

    it("When hierarchyConfig is defined(Branch) in the requestContext and merchantId is taken of requestContext then search merchant Brand should response with successful", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<null, null, null, AuthorizerContext> =
        Mock.of<IAPIGatewayEvent<null, null, null, AuthorizerContext>>({
          requestContext: {
            authorizer: {
              hierarchyConfig:
                '{"processing":{"processors":"20000000108069937000","businessRules":"20000000108069937000","securityRules":"20000000108069937000","deferred":"20000000108069937000","service":"20000000108069937000"},"rootId":"79462591444c"}',
              merchantId: "123456",
            },
          },
        });

      assertsWhenSearchMerchantBranchIsSuccess(get_event, done);
    });

    it("search merchant Brand and logo with stage Primary- successful response brands and logos", (done: Mocha.Done) => {
      process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;
      const first_card = get(merchant, "acceptCreditCards[0]", "");
      const second_card = get(merchant, "acceptCreditCards[1]", "");

      service.getBrandsLogosByMerchant(get_event_request_brand).subscribe({
        next: (data: object): void => {
          assertsResponseGetBrandsLogos(
            data,
            first_card,
            second_card,
            BUCKET_BRANDS_PREFIX_S3
          );
          done();
        },
      });
    });

    it("search merchant Brand and logo with stage QA - successful response brands and logos", (done: Mocha.Done) => {
      process.env.USRV_STAGE = EnvironmentEnum.QA;
      const first_card = get(merchant, "acceptCreditCards[0]", "");
      const second_card = get(merchant, "acceptCreditCards[1]", "");

      service.getBrandsLogosByMerchant(get_event_request_brand).subscribe({
        next: (data: object): void => {
          assertsResponseGetBrandsLogos(
            data,
            first_card,
            second_card,
            DEV_BUCKET_BRANDS_PREFIX_S3
          );
          done();
        },
      });
    });

    it("search merchant Brand throw error if _getDynamoMerchant gives timeout", (done: Mocha.Done) => {
      mockDynamoTimeOut();
      service = CONTAINER.get(IDENTIFIERS.MerchantService);
      service.getBrandsByMerchant(get_event_request_brand).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K027");
          done();
        },
        next: done,
      });
    });

    it("update merchant - success response", (done: Mocha.Done) => {
      service.update(update_event).subscribe({
        next: (data: object): void => {
          expect(data).to.deep.eq({ status: "OK" });
          done();
        },
      });
    });

    it("update merchant - error response", (done: Mocha.Done) => {
      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: sandbox.stub().returns(of(undefined)),
        })
      );
      service = CONTAINER.get(IDENTIFIERS.MerchantService);

      service.update(update_event).subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.deep.eq("K004");
          done();
        },
      });
    });

    it("update merchant - throws error if _getDynamoMerchant gives timeout", (done: Mocha.Done) => {
      mockDynamoTimeOut();
      service = CONTAINER.get(IDENTIFIERS.MerchantService);

      service.update(update_event).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K027");
          done();
        },
        next: done,
      });
    });

    it("get deferred - success response", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<
        null,
        MerchantIdPathParameter,
        null,
        AuthorizerContext
      > = Mock.of<
        IAPIGatewayEvent<null, MerchantIdPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          merchantId: "123242",
        },
        requestContext: { authorizer: { merchantId: "1220102010201202" } },
      });

      service.getDeferred(get_event).subscribe({
        next: (data: object): void => {
          expect(data).to.deep.eq({
            deferredOptions: [
              {
                deferredType: [],
                months: [],
                monthsOfGrace: [],
              },
            ],
          });
          done();
        },
      });
    });

    it("get deferred - throws error if _getDynamoMerchant gives timeout", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<
        null,
        MerchantIdPathParameter,
        null,
        AuthorizerContext
      > = Mock.of<
        IAPIGatewayEvent<null, MerchantIdPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          merchantId: "123242",
        },
        requestContext: { authorizer: { merchantId: "292912919291929192" } },
      });

      mockDynamoTimeOut();
      service = CONTAINER.get(IDENTIFIERS.MerchantService);

      service.getDeferred(get_event).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K027");
          done();
        },
        next: done,
      });
    });

    it("get deferred - when merchant has no deferred options", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<
        null,
        MerchantIdPathParameter,
        null,
        AuthorizerContext
      > = Mock.of<
        IAPIGatewayEvent<null, MerchantIdPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          merchantId: "123242",
        },
        requestContext: { authorizer: { merchantId: "2010201020120102012" } },
      });

      delete merchant.deferredOptions;

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: sandbox.stub().returns(of(merchant)),
        })
      );
      service = CONTAINER.get(IDENTIFIERS.MerchantService);

      service.getDeferred(get_event).subscribe({
        next: (data: object): void => {
          expect(data).to.deep.eq({});
          done();
        },
      });
    });

    it("get merchant options - success response", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<
        null,
        MerchantIdPathParameter,
        null,
        AuthorizerContext
      > = Mock.of<
        IAPIGatewayEvent<null, MerchantIdPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          merchantId: "123242",
        },
        requestContext: { authorizer: { merchantId: "39391929192192919" } },
      });

      delete merchant.deferredOptions;
      unset(merchant, "public_id");
      unset(merchant, "merchant_name");

      service.getOptions(get_event).subscribe({
        next: (data: object): void => {
          expect(data).to.deep.eq({
            ...merchant,
          });
          expect(invoke_stub).to.be.not.called;
          done();
        },
      });
    });

    it("get merchant options - throws error if _getDynamoMerchant gives timeout", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<
        null,
        MerchantIdPathParameter,
        null,
        AuthorizerContext
      > = Mock.of<
        IAPIGatewayEvent<null, MerchantIdPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          merchantId: "123242",
        },
        requestContext: { authorizer: { merchantId: "20201020192939193" } },
      });

      mockDynamoTimeOut();
      service = CONTAINER.get(IDENTIFIERS.MerchantService);

      service.getOptions(get_event).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K027");
          done();
        },
        next: done,
      });
    });

    it("get merchant options when card-merchants doesnt have sift credentials and invoke trx rule - success response", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<
        null,
        MerchantIdPathParameter,
        null,
        AuthorizerContext
      > = Mock.of<
        IAPIGatewayEvent<null, MerchantIdPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          merchantId: "123242",
        },
        requestContext: { authorizer: { merchantId: "39391929192192919" } },
      });
      const sift_response: SiftScienceResponse = {
        baconProdApiKey: "baconProdApiKey",
        baconSandboxApiKey: "baconSandboxApiKey",
        migrated: true,
        prodAccountId: "prodAccountId",
        prodApiKey: "prodApiKey",
        sandboxAccountId: "sandboxAccountId",
        sandboxApiKey: "sandboxApiKey",
      };
      const invoke_response: GetInfoSiftScienceResponse = {
        siftCredentials: sift_response,
      };

      merchant.sift_science = {};

      invoke_stub = sandbox.stub().returns(
        of({
          body: invoke_response,
        })
      );
      mockLambdaGateway(invoke_stub);

      service = CONTAINER.get(IDENTIFIERS.MerchantService);
      service.getOptions(get_event).subscribe({
        next: (data: object): void => {
          expect(data).to.deep.eq({
            ...merchant,
          });
          expect(invoke_stub).to.be.calledOnce;
          expect(get(data, "sift_science")).to.deep.eq({
            BaconProdApiKey: sift_response.baconProdApiKey,
            BaconSandboxApiKey: sift_response.baconSandboxApiKey,
            ProdAccountId: sift_response.prodAccountId,
            ProdApiKey: sift_response.prodApiKey,
            SandboxAccountId: sift_response.sandboxAccountId,
            SandboxApiKey: sift_response.sandboxApiKey,
          });
          done();
        },
      });
    });

    it("get merchant options when card-merchants doesnt have sift credentials and invoke trx rule - error", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<
        null,
        MerchantIdPathParameter,
        null,
        AuthorizerContext
      > = Mock.of<
        IAPIGatewayEvent<null, MerchantIdPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          merchantId: "123242",
        },
        requestContext: { authorizer: { merchantId: "39391929192192919" } },
      });

      merchant.sift_science = {};

      invoke_stub = sandbox.stub().throws(new KushkiError(ERRORS.E020));
      mockLambdaGateway(invoke_stub);

      service = CONTAINER.get(IDENTIFIERS.MerchantService);
      service.getOptions(get_event).subscribe({
        next: (data: object): void => {
          expect(data).to.deep.eq({
            ...merchant,
          });
          expect(invoke_stub).to.be.calledOnce;
          done();
        },
      });
    });

    it("get merchant options when card-merchants doesnt have sift credentials and invoke trx rule contains migrated with false - success response", (done: Mocha.Done) => {
      const get_event: IAPIGatewayEvent<
        null,
        MerchantIdPathParameter,
        null,
        AuthorizerContext
      > = Mock.of<
        IAPIGatewayEvent<null, MerchantIdPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          merchantId: "123242",
        },
        requestContext: { authorizer: { merchantId: "39391929192192919" } },
      });
      const sift_response: SiftScienceResponse = {
        baconProdApiKey: "baconProdApiKey",
        baconSandboxApiKey: "baconSandboxApiKey",
        migrated: false,
        prodAccountId: "prodAccountId",
        prodApiKey: "prodApiKey",
        sandboxAccountId: "sandboxAccountId",
        sandboxApiKey: "sandboxApiKey",
      };
      const invoke_sift_response: GetInfoSiftScienceResponse = {
        siftCredentials: sift_response,
      };

      merchant.sift_science = {};

      invoke_stub = sandbox.stub().returns(
        of({
          body: invoke_sift_response,
        })
      );
      mockLambdaGateway(invoke_stub);

      service = CONTAINER.get(IDENTIFIERS.MerchantService);
      service.getOptions(get_event).subscribe({
        next: (data: object): void => {
          expect(invoke_stub).to.be.calledOnce;
          expect(get(data, "sift_science")).to.deep.eq({});
          expect(data).to.deep.eq({
            ...merchant,
          });
          done();
        },
      });
    });
  });

  describe("getProcessorById", () => {
    let sandbox: SinonSandbox;
    let service: IMerchantService;
    let get_processor_event: IAPIGatewayEvent<
      null,
      ProcessorPathParameter,
      null,
      AuthorizerContext
    >;
    let get_item_stub: SinonStub;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();

      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: sandbox.stub().returns(of({})),
        })
      );
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("should return a processorMerchantObject", (done: Mocha.Done) => {
      const processor: DynamoProcessorFetch = Mock.of<DynamoProcessorFetch>({
        certificates: {
          complete_transaction: {
            private_key: {
              file_name: "name",
              value: "",
            },
          },
        },
        plcc: true,
        private_id: "wdqwd",
        public_id: "123123",
      });

      get_item_stub = sandbox.stub().returns(of(processor));

      get_processor_event = Mock.of<
        IAPIGatewayEvent<null, ProcessorPathParameter, null, AuthorizerContext>
      >({
        pathParameters: {
          processorId: "qw",
        },
      });

      CONTAINER.rebind<IDynamoGateway>(
        IDENTIFIERS.DynamoGateway
      ).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: get_item_stub,
        })
      );

      service = CONTAINER.get(IDENTIFIERS.MerchantService);
      service.getProcessorById(get_processor_event).subscribe({
        next: (resp: boolean): void => {
          expect(resp).to.be.equal(true);
          done();
        },
      });
    });
  });

  describe("when deleteProcessor is called", () => {
    let sandbox: SinonSandbox;
    let put_item_stub: SinonStub;
    let get_item_stub: SinonStub;
    let delete_processor_event: IAPIGatewayEvent<
      ProcessorDeleteRequest,
      ProcessorPathParameter,
      null,
      AuthorizerContext
    >;
    let service: IMerchantService;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: sandbox.stub().returns(of({})),
        })
      );
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    function mockDynamoGateway(
      putItemStub: SinonStub,
      getItemStub?: SinonStub
    ) {
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: getItemStub,
          put: putItemStub,
        })
      );
    }

    it("should delete a card processor success", (done: Mocha.Done) => {
      const processor: DynamoProcessorFetch = Mock.of<DynamoProcessorFetch>({
        merchant_id: "merchant_id",
        private_id: "wdqwd",
        public_id: "123123",
      });

      get_item_stub = sandbox.stub().returns(of(processor));
      put_item_stub = sandbox.stub().returns(of(true));
      delete_processor_event = Mock.of<
        IAPIGatewayEvent<
          ProcessorDeleteRequest,
          ProcessorPathParameter,
          null,
          AuthorizerContext
        >
      >({
        body: {
          merchantId: "merchant_id",
        },
        pathParameters: {
          processorId: "qw",
        },
        requestContext: {
          authorizer: {
            merchantId: "merchant_id",
          },
        },
      });

      mockDynamoGateway(put_item_stub, get_item_stub);
      service = CONTAINER.get(IDENTIFIERS.MerchantService);
      service.deleteProcessor(delete_processor_event).subscribe({
        next: (resp: boolean): void => {
          expect(resp).to.be.equal(true);
          done();
        },
      });
    });
  });

  describe("MerchantService - Update merchant from bus", () => {
    let cb_merchant_fetch: EventBusMerchant;
    let event_bus_detail: IEventBusDetail<IDynamoRecord<EventBusMerchant>>;
    let get_stub: SinonStub;
    let merchant: DynamoMerchantFetch;
    let merchant_service: IMerchantService;
    let put_stub: SinonStub;
    let sandbox: SinonSandbox;
    let sync_card_event: IDynamoRecord<EventBusMerchant>;
    let update_merchant_request: UpdateMerchantFromBus;
    let update_stub: SinonStub;
    let constitutional_country: string;
    let client_type: string;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();

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
          ProdAccountId: "5dfbc5764e",
          ProdApiKey: "f7945f5ed7",
          SandboxAccountId: "5b6b2d4c9f0c223b40809ebe",
          SandboxApiKey: "7d73b9a353d8172gf",
          SiftScore: -7788477.076453313,
        },
      };

      update_merchant_request = {
        country: "CO",
        merchant_name: "new merchant name",
        taxId: "1235",
        updatedAt: moment().valueOf(),
      };

      cb_merchant_fetch = Mock.of<EventBusMerchant>({
        accountNumber: "1716458332",
        accountType: "1",
        address: "Calle falsa 123",
        bankId: "105510",
        chargeFrequency: "daily",
        chargeMin: "deductible",
        chargeMinAmount: 112333,
        city: "Guadalajara",
        contactPerson: "Iraida Mercedes",
        country: update_merchant_request.country,
        created: 1223,
        documentNumber: "0001234567890",
        documentType: "NIT",
        email: "mercedes@kushkipagos.com",
        gracePeriod: 12,
        invoiceFrequency: "daily",
        name: update_merchant_request.merchant_name,
        phoneNumber: "6713456",
        privateMerchantId: "10000003161430373231152546473725",
        publicMerchantId: "20000000100729020000",
        socialReason: "Iraida Events SA",
        taxId: update_merchant_request.taxId,
        updatedAt: "12222",
      });

      sync_card_event = Mock.of<IDynamoRecord<EventBusMerchant>>({
        dynamodb: Mock.of<IDynamoElement<EventBusMerchant>>({
          NewImage: {
            ...cb_merchant_fetch,
          },
        }),
        eventName: DynamoEventNameEnum.MODIFY,
      });

      event_bus_detail = Mock.of<
        IEventBusDetail<IDynamoRecord<EventBusMerchant>>
      >({
        action: PAYLOAD.EVENT_NAME,
        mappingType: "object",
        originUsrv: "usrv-billing-core",
        payload: sync_card_event,
      });

      get_stub = sandbox.stub().returns(of(merchant));
      put_stub = sandbox.stub().returns(of(false));
      update_stub = sandbox.stub().returns(of(true));

      CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
      CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: get_stub,
          put: put_stub,
          updateValues: update_stub,
        })
      );
      CONTAINER.unbind(CORE.LambdaGateway);
      CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: sandbox.stub().returns(of({})),
        })
      );
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("When update merchant from bus is called, should return true in update values", (done: Mocha.Done) => {
      merchant_service = CONTAINER.get(IDENTIFIERS.MerchantService);
      merchant_service.updateMerchantFromBus(event_bus_detail).subscribe({
        next: (response: boolean): void => {
          expect(response).to.be.true;
          expect(put_stub).to.have.been.not.called;
          expect(update_stub).to.have.been.calledOnce;
          expect(update_stub.args[0][1]).to.have.property(
            "public_id",
            "20000000100729020000"
          );
          expect(update_stub.args[0][2]).to.have.property("country", "CO");
          expect(update_stub.args[0][2]).to.have.property(
            "merchant_name",
            "new merchant name"
          );
          expect(update_stub.args[0][2]).to.have.property("taxId", "1235");
          expect(update_stub.args[0][2]).to.have.property(
            "updatedAt",
            Number(update_stub.args[0][2].updatedAt)
          );
          done();
        },
      });
    });

    it("When update merchant from bus is called and merchant is undefined, should return true in put event", (done: Mocha.Done) => {
      sync_card_event = Mock.of<IDynamoRecord<EventBusMerchant>>({
        dynamodb: Mock.of<IDynamoElement<EventBusMerchant>>({
          NewImage: { ...cb_merchant_fetch },
        }),
        eventName: DynamoEventNameEnum.INSERT,
      });

      get_stub = sandbox.stub().returns(of(undefined));
      put_stub = sandbox.stub().returns(of(true));

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: get_stub,
          put: put_stub,
          updateValues: update_stub,
        })
      );

      merchant_service = CONTAINER.get(IDENTIFIERS.MerchantService);
      merchant_service.updateMerchantFromBus(event_bus_detail).subscribe({
        next: (response: boolean): void => {
          expect(response).to.be.true;
          expect(update_stub).to.have.been.not.called;
          expect(put_stub).to.have.been.calledOnce;
          expect(put_stub.args[0][0]).to.have.property("acceptCreditCards");
          expect(put_stub.args[0][0]).to.have.property("country");
          expect(put_stub.args[0][0]).to.have.property("merchant_name");
          expect(put_stub.args[0][0]).to.have.property("public_id");
          expect(put_stub.args[0][0]).to.have.property("sift_science");
          done();
        },
      });
    });

    it("When update merchant from bus is called and record is undefined, should throw error E020", (done: Mocha.Done) => {
      sync_card_event.dynamodb = undefined;
      merchant_service = CONTAINER.get(IDENTIFIERS.MerchantService);
      merchant_service.updateMerchantFromBus(event_bus_detail).subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eq(new KushkiError(ERRORS.E020).code);
          done();
        },
      });
    });

    it("When update merchant from bus is called and New Image is undefined, should throw error E020", (done: Mocha.Done) => {
      sync_card_event.dynamodb!.NewImage = undefined;
      merchant_service = CONTAINER.get(IDENTIFIERS.MerchantService);
      merchant_service.updateMerchantFromBus(event_bus_detail).subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.be.eq(new KushkiError(ERRORS.E020).code);
          done();
        },
      });
    });

    function mockUpdateMerchantFromBusWithOpeCountryAndClientType(
      constitutionalCountry: string,
      clientType: string
    ) {
      constitutional_country = constitutionalCountry;
      client_type = clientType;

      set(
        event_bus_detail,
        "payload.dynamodb.NewImage.constitutionalCountry",
        constitutionalCountry
      );
      set(event_bus_detail, "payload.dynamodb.NewImage.clientType", clientType);
    }

    it("Should return true in put event when merchant is undefined", (done: Mocha.Done) => {
      mockUpdateMerchantFromBusWithOpeCountryAndClientType("Ecuador", "None 1");
      put_stub = sandbox.stub().returns(of(true));
      get_stub = sandbox.stub().returns(of(undefined));
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getItem: get_stub,
          put: put_stub,
          updateValues: update_stub,
        })
      );
      merchant_service = CONTAINER.get(IDENTIFIERS.MerchantService);
      merchant_service.updateMerchantFromBus(event_bus_detail).subscribe({
        next: (response: boolean): void => {
          expect(put_stub).to.have.been.calledOnce;
          expect(put_stub.args[0][0]).to.have.property(
            "constitutionalCountry",
            constitutional_country
          );
          expect(put_stub.args[0][0]).to.have.property(
            "clientType",
            client_type
          );
          expect(update_stub).to.have.been.not.called;
          expect(response).to.be.true;
          done();
        },
      });
    });

    it("Should return true in put event when merchant is not undefined", (done: Mocha.Done) => {
      mockUpdateMerchantFromBusWithOpeCountryAndClientType(
        "Colombia",
        "None 2"
      );
      merchant_service = CONTAINER.get(IDENTIFIERS.MerchantService);
      merchant_service.updateMerchantFromBus(event_bus_detail).subscribe({
        next: (response: boolean): void => {
          expect(put_stub).to.have.been.not.called;
          expect(update_stub).to.have.been.calledOnce;
          expect(update_stub.args[0][2]).to.have.property(
            "constitutionalCountry",
            constitutional_country
          );
          expect(update_stub.args[0][2]).to.have.property(
            "clientType",
            client_type
          );
          expect(response).to.be.true;
          done();
        },
      });
    });
  });
});
