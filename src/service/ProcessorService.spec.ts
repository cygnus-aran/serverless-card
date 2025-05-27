/**
 * ProcessorService Unit Tests
 */
import {
  IAPIGatewayEvent,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { IDENTIFIERS as CORE_ID } from "@kushki/core/lib/constant/Identifiers";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { DynamoGateway } from "gateway/DynamoGateway";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import { EnvironmentEnum } from "infrastructure/EnvironmentEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { NiubizCommerceActionEnum } from "infrastructure/NiubizCommerceActionEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { get } from "lodash";
import "reflect-metadata";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IProcessorService } from "repository/IProcessorService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { delay } from "rxjs/operators";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusCreateProcessorResponse } from "types/aurus_create_processor_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CreateProcessorRequest } from "types/create_processor_request";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { ProcessorMetadata } from "types/processor_metadata";
import { ProcessorMetadataQuery } from "types/processor_metadata_query";

use(sinonChai);

describe("Processor Service - ", () => {
  const old_env: NodeJS.ProcessEnv = process.env;
  let sandbox: SinonSandbox;
  let put_item_stub: SinonStub;
  let invoke_stub: SinonStub;
  let mocked_body: CreateProcessorRequest;
  let service: IProcessorService;
  const public_id: string = "09876";
  const public_id_path: string = "publicId";

  beforeEach(() => {
    process.env = { ...old_env };
  });

  function mockCore() {
    CONTAINER.bind(CORE_ID.RollbarInstance).toConstantValue(Mock.of());
    CONTAINER.unbind(CORE.RollbarInstance);
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        critical: sandbox.stub(),
        warn: sandbox.stub(),
      })
    );
    CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeAsyncFunction: invoke_stub,
        invokeFunction: invoke_stub,
      })
    );
  }

  function mockLambda() {
    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeAsyncFunction: sandbox.stub().returns(of({})),
      })
    );
  }

  function mockDynamoGateway(putItemStub: SinonStub, getItemStub?: SinonStub) {
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getDynamoMerchant: sandbox.stub().returns(
          of(
            Mock.of<DynamoMerchantFetch>({
              country: CountryEnum.COLOMBIA,
            })
          )
        ),
        getSequential: getItemStub,
        put: putItemStub,
      })
    );
  }

  function mockGatewaysForProcessor() {
    CONTAINER.rebind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        createProcessor: sandbox.stub().returns(
          of(
            Mock.of<AurusCreateProcessorResponse>({
              response_code: "1232244",
              response_text: "Sucess",
              token_merchantId: public_id,
              transaction_merchantId: "12324",
            })
          )
        ),
        request: sandbox.stub().returns(
          of(
            Mock.of<AurusCreateProcessorResponse>({
              response_code: "1232244",
              response_text: "Sucess",
              token_merchantId: public_id,
              transaction_merchantId: "12324",
            })
          )
        ),
        updateProcessor: sandbox.stub().returns(of(true)),
      })
    );
  }

  function testGenericExpects(data: object, done: Mocha.Done): void {
    expect(data).to.be.an("object");
    done();
  }

  function mockInitialState(): void {
    sandbox = createSandbox();
    CONTAINER.snapshot();
    mocked_body = Mock.of<CreateProcessorRequest>({
      acquirerBank: "Test Bank",
      categoryModel: "GATEWAY",
      merchantId: "1111111",
      omitCVV: false,
      plcc: "01",
      processorAlias: "PC001",
      processorMerchantId: "123445",
      processorName: "Procesor 1",
      processorType: "Type 1",
      subTerminalId: "t001",
      uniqueCode: "4567",
    });
    put_item_stub = sandbox.stub().returns(of(true));
    invoke_stub = sandbox.stub().returns(
      of({
        body: {
          contactPerson: "Gonzalo Torterolo",
          country: "Ecuador",
          documentType: "0",
          email: "gtorterolo@zircon.tech",
          name: "GamesGGG",
          phoneNumber: "59898162928",
          publicMerchantId: "20000000102779010000",
          socialReason: "GamesGGG",
          taxId: "1234567890",
          webSite: "www.test.com",
        },
      })
    );
    mockCore();
  }

  describe("when create processor is called", () => {
    beforeEach(() => {
      mockInitialState();
    });

    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    it("test create processor", (done: Mocha.Done) => {
      const event: CreateProcessorRequest = mocked_body;

      process.env.USRV_STAGE = EnvironmentEnum.UAT;
      process.env.SANDBOX_PROCESSORS = `${ProcessorEnum.VISANET},${ProcessorEnum.FIS},${ProcessorEnum.TRANSBANK}`;
      event.processorName = ProcessorEnum.BILLPOCKET;

      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub);

      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.createProcessors(event).subscribe({
        next: (data: object): void => {
          expect(get(data, public_id_path)).to.be.equal(public_id);
          testGenericExpects(data, done);
        },
      });
    });

    it("test create processor with sandbox", (done: Mocha.Done) => {
      const event: CreateProcessorRequest = mocked_body;

      process.env.USRV_STAGE = EnvironmentEnum.UAT;
      process.env.SANDBOX_PROCESSORS = `${ProcessorEnum.VISANET},${ProcessorEnum.FIS},${ProcessorEnum.TRANSBANK}`;
      event.processorName = ProcessorEnum.FIS;

      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub);
      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.createProcessors(event).subscribe({
        next: (data: object): void => {
          expect(get(data, public_id_path)).to.be.not.equal(public_id);
          testGenericExpects(data, done);
        },
      });
    });

    it("test create processor with VisaNet", (done: Mocha.Done) => {
      mocked_body.processorName = ProcessorEnum.VISANET;
      mocked_body.isBusinessPartner = true;
      process.env.USRV_STAGE = EnvironmentEnum.PRIMARY;

      const get_sequential = sandbox.stub().returns(of({ quantity: 1 }));

      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub, get_sequential);

      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.createProcessors(mocked_body).subscribe({
        next: (_data: object): void => {
          expect(get_sequential).to.have.been.calledOnce;
          done();
        },
      });
    });

    it("test create processor with VisaNet and error", (done: Mocha.Done) => {
      mocked_body.processorName = ProcessorEnum.VISANET;

      const get_sequential = sandbox.stub().returns(of({ quantity: 1 }));

      invoke_stub = sandbox.stub().rejects(new KushkiError(ERRORS.E002));
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeAsyncFunction: invoke_stub,
          invokeFunction: invoke_stub,
        })
      );
      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub, get_sequential);

      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.createProcessors(mocked_body).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          expect(err.name).to.be.eq("KSH002");
          done();
        },
      });
    });

    it("test create processor with error of timeout", (done: Mocha.Done) => {
      process.env.EXTERNAL_TIMEOUT = "10";
      const event: CreateProcessorRequest = mocked_body;

      mockGatewaysForProcessor();
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          getDynamoMerchant: sandbox.stub().returns(
            of(
              Mock.of<DynamoMerchantFetch>({
                country: CountryEnum.COLOMBIA,
              })
            ).pipe(delay(11))
          ),
          put: sandbox.stub().returns(of(true)),
        })
      );
      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.createProcessors(event).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          expect(err.getMessage()).to.be.equal(ERRORS.E027.message);
          expect(err.code).to.be.contain("027");
          done();
        },
      });
    });
  });

  describe("when update processor is called", () => {
    beforeEach(() => {
      mockInitialState();
    });

    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    it("test update processor", (done: Mocha.Done) => {
      const event: CreateProcessorRequest = mocked_body;

      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub);
      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.updateProcessors(event).subscribe({
        next: (data: object): void => {
          testGenericExpects(data, done);
        },
      });
    });

    it("test update processor with sandbox", (done: Mocha.Done) => {
      const event: CreateProcessorRequest = mocked_body;

      process.env.USRV_STAGE = EnvironmentEnum.UAT;
      process.env.SANDBOX_PROCESSORS = `${ProcessorEnum.BILLPOCKET},${ProcessorEnum.NIUBIZ}`;
      event.processorName = ProcessorEnum.DATAFAST;

      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub);
      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.updateProcessors(event).subscribe({
        next: (data: object): void => {
          testGenericExpects(data, done);
        },
      });
    });

    it("test update processor with VisaNet and empty oldProcessorMerchantId", (done: Mocha.Done) => {
      mocked_body.processorName = ProcessorEnum.VISANET;

      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub);

      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.updateProcessors(mocked_body).subscribe({
        next: (data: object): void => {
          expect(invoke_stub).callCount(1);
          expect(invoke_stub.getCall(0).args[1].action).to.be.equal(
            NiubizCommerceActionEnum.UPDATE
          );
          testGenericExpects(data, done);
        },
      });
    });

    it("test update processor with VisaNet and not empty oldProcessorMerchantId", (done: Mocha.Done) => {
      mocked_body.processorName = ProcessorEnum.VISANET;
      mocked_body.oldProcessorMerchantId = "1234567";

      const get_sequential = sandbox.stub().returns(of({ quantity: 1 }));

      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub, get_sequential);

      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.updateProcessors(mocked_body).subscribe({
        next: (data: object): void => {
          expect(invoke_stub).callCount(1);
          expect(invoke_stub.getCall(0).args[1]).to.haveOwnProperty(
            "oldProcessorMerchantId"
          );
          expect(invoke_stub.getCall(0).args[1].action).to.be.equal(
            NiubizCommerceActionEnum.UPDATE
          );
          testGenericExpects(data, done);
        },
      });
    });

    it("test update processor with VisaNet and empty oldProcessorMerchantId error", (done: Mocha.Done) => {
      mocked_body.processorName = ProcessorEnum.VISANET;

      invoke_stub = sandbox.stub().returns(of(true));
      mockCore();
      mockLambda();
      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub);
      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.updateProcessors(mocked_body).subscribe({
        next: (data: object): void => {
          testGenericExpects(data, done);
        },
      });
    });

    it("test update processor with VisaNet and error", (done: Mocha.Done) => {
      mocked_body.processorName = ProcessorEnum.VISANET;

      invoke_stub = sandbox.stub().rejects(new KushkiError(ERRORS.E002));
      CONTAINER.rebind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeAsyncFunction: invoke_stub,
          invokeFunction: invoke_stub,
        })
      );
      mockGatewaysForProcessor();
      mockDynamoGateway(put_item_stub);

      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.updateProcessors(mocked_body).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          expect(err.name).to.be.eq("KSH002");
          done();
        },
        next: done,
      });
    });
  });

  describe("when get processor metadata", () => {
    let event: IAPIGatewayEvent<
      null,
      null,
      ProcessorMetadataQuery,
      AuthorizerContext
    >;
    let query_stub: SinonStub;
    let get_stub: SinonStub;
    let processor_metadata: ProcessorMetadata;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
      event = Mock.of<
        IAPIGatewayEvent<null, null, ProcessorMetadataQuery, AuthorizerContext>
      >({
        queryStringParameters: {
          id: "1",
          type: "AEROLINEA",
        },
        requestContext: {
          authorizer: {
            publicMerchantId: "1234",
          },
        },
      });

      processor_metadata = Mock.of<ProcessorMetadata>({
        country: "COLOMBIA",
        description: "AIR CANADA",
        id: "1",
        mcc: "3009",
        processor: "CREDIBANCO",
        type: "AEROLINEA",
      });
    });

    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    function mockGateway() {
      get_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(
          of({
            merchantName: "name",
            publicId: "asdsd",
          })
        );

      query_stub = sandbox.stub().returns(of({ items: processor_metadata }));

      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<DynamoGateway>({
          getItem: get_stub,
          querySimple: query_stub,
        })
      );
      mockCore();
    }

    it("should id query param, get processor metadata", (done: Mocha.Done) => {
      mockGateway();
      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.processorMetadata(event).subscribe({
        next: (data: ProcessorMetadata[]): void => {
          expect(data).not.to.be.empty;
          expect(query_stub).to.be.calledOnce;
          expect(query_stub.getCall(0).args[0]).to.be.eqls({
            ExpressionAttributeNames: { "#id": "id", "#type": "type" },
            ExpressionAttributeValues: { ":id": "1", ":type": "AEROLINEA" },
            IndexName: "id-type-index",
            KeyConditionExpression: "#type = :type and #id = :id",
            TableName: "undefined",
          });
          done();
        },
      });
    });

    it("should mcc query param, get processor metadata", (done: Mocha.Done) => {
      event = Mock.of<
        IAPIGatewayEvent<null, null, ProcessorMetadataQuery, AuthorizerContext>
      >({
        queryStringParameters: {
          mcc: "3009",
          type: "AEROLINEA",
        },
        requestContext: {
          authorizer: {
            publicMerchantId: "1234",
          },
        },
      });

      mockGateway();
      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.processorMetadata(event).subscribe({
        next: (data: ProcessorMetadata[]): void => {
          expect(data).not.to.be.empty;
          expect(query_stub).to.be.calledOnce;
          expect(event.queryStringParameters.mcc).to.be.eql("3009");
          expect(query_stub.getCall(0).args[0]).to.be.eqls({
            ExpressionAttributeNames: { "#mcc": "mcc", "#type": "type" },
            ExpressionAttributeValues: { ":mcc": "3009", ":type": "AEROLINEA" },
            IndexName: "mcc-type-index",
            KeyConditionExpression: "#type = :type and #mcc = :mcc",
            TableName: "undefined",
          });
          done();
        },
      });
    });

    it("should merchant not exist in dynamo", (done: Mocha.Done) => {
      get_stub = sandbox.stub().returns(of(undefined));
      mockCore();
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<DynamoGateway>({
          getItem: get_stub,
          querySimple: query_stub,
        })
      );

      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.processorMetadata(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.getMessage()).to.be.eqls(ERRORS.E004.message);
          done();
        },
      });
    });

    it("should is empty query param mcc and id", (done: Mocha.Done) => {
      event.queryStringParameters.mcc = undefined;
      event.queryStringParameters.id = "";

      mockGateway();

      mockCore();
      service = CONTAINER.get(IDENTIFIERS.ProcessorService);
      service.processorMetadata(event).subscribe({
        error: (err: KushkiError): void => {
          expect(err.getMessage()).to.be.eqls(ERRORS.E001.message);
          done();
        },
      });
    });
  });
});
