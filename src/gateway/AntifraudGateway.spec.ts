/**
 * AntifraudGateway Unit Test
 */
import { IAxiosGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { AxiosError, AxiosResponse } from "axios";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import {
  AntiFraudErrorEnum,
  ErrorResponseTextEnum,
} from "infrastructure/ErrorEnum";
import { PaymentProductsEnum } from "infrastructure/PaymentProductsEnum";
import { TokenTypeEnum } from "infrastructure/TokenTypeEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { of } from "rxjs";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import {
  ScoreResponse,
  SiftScienceWorkflowsResponse,
} from "types/sift_science_workflows_response";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { has } from "lodash";

use(sinonChai);
const UNREACHABLE: string = "this line must be unreachable";
const COUNTRY: string = "Ecuador";
let gSiftScienceWorkflowsResponse: SiftScienceWorkflowsResponse;
let gTokenInfo: Required<DynamoTokenFetch>;
let gMerchantInfo: DynamoMerchantFetch;
let gSiftScienceDecisionResponse: SiftScienceDecisionResponse;
let gChargeRequest: UnifiedChargesPreauthRequest;

// tslint:disable-next-line:max-func-body-length
function createSchemas(): void {
  gSiftScienceDecisionResponse = Mock.of<SiftScienceDecisionResponse>({});
  gSiftScienceWorkflowsResponse = Mock.of<SiftScienceWorkflowsResponse>({
    error_message: "error",
    request: "req",
    status: 122,
    time: 22222,
  });
  gChargeRequest = {
    amount: {
      currency: "USD",
      iva: 10,
      subtotalIva: 10,
      subtotalIva0: 0,
    },
    authorizerContext: {
      credentialAlias: "credentialAliasUnified",
      credentialId: "credential_idUnified",
      credentialMetadata: { origin: "testU", data: "testU" },
      merchantCountry: COUNTRY,
      merchantId: "124376435789345",
      privateMerchantId: "testprivateMerchantId",
      publicMerchantId: "publicMerchantIdUnified",
      sandboxEnable: true,
    },
    cardHolderName: "",
    contactDetails: {
      email: "dev@dev.com",
    },
    ignoreWarnings: false,
    ip: "",
    isDeferred: false,
    lastFourDigits: "",
    maskedCardNumber: "",
    merchant: {
      country: COUNTRY,
      deferredOptions: [],
      merchantId: "merchantTest",
      merchantName: "merchantName",
      sandboxEnable: false,
      siftScience: {
        ProdAccountId: "jkakfdj9094",
        ProdApiKey: "0023409",
        SandboxAccountId: "lsdlsdf09",
        SandboxApiKey: "092340",
        SiftScore: 1000,
      },
      taxId: "taxIdTest",
      whiteList: false,
    },
    orderDetails: {
      billingDetails: {
        address: "Calle A",
        city: "Ciudad",
        country: COUNTRY,
        name: "Salander",
        phone: "2121212",
        region: "Region",
        zipCode: "170707",
      },
      shippingDetails: {
        address: "Calle A",
        city: "Ciudad",
        country: COUNTRY,
        name: "Salander",
        phone: "2121212",
        region: "Region",
        zipCode: "170707",
      },
    },
    productDetails: {
      product: [
        {
          id: "laksdlkasdla",
          price: 100,
          quantity: 1,
          sku: "daskdjaksjdkas-adasdad",
          title: "Harry Potter 1",
        },
      ],
    },
    tokenCreated: 0,
    tokenCurrency: "",
    tokenId: "asdfkaskakskakskaksakskasa",
    tokenObject: gTokenInfo,
    tokenType: TokenTypeEnum.TRANSACTION,
    transactionReference: "",
    transactionType: TransactionRuleTypeEnum.CHARGE,
    usrvOrigin: "",
  };
  gTokenInfo = Mock.of<Required<DynamoTokenFetch>>({});
  gMerchantInfo = Mock.of<DynamoMerchantFetch>({
    contactPerson: "person",
    email: "mail",
    merchant_name: "name",
    private_id: "pid",
    public_id: "id",
    sift_science: {
      ProdAccountId: "pai",
      ProdApiKey: "pak",
      SandboxAccountId: "sai",
      SandboxApiKey: "apk",
      SiftScore: 22,
    },
  });
}

function decisionSuccess(gateway: IAntifraudGateway, done: Mocha.Done): void {
  gateway.getDecision(gMerchantInfo, "decisionIdString").subscribe({
    next: (data: SiftScienceDecisionResponse): void => {
      expect(data).to.be.a("object");
      expect(has(data, "id")).to.exist;
      done();
    },
  });
}

function getWorkflowsSuccess(
  gateway: IAntifraudGateway,
  done: Mocha.Done
): void {
  gateway.getWorkflows(gMerchantInfo, gTokenInfo, gChargeRequest).subscribe({
    next: (data: SiftScienceWorkflowsResponse): void => {
      expect(data).to.be.a("object");
      expect(has(data, "status")).to.be.eql(true);
      expect(has(data, "time")).to.be.eql(true);
      done();
    },
  });
}

describe("AntifraudGateway", () => {
  let gateway: IAntifraudGateway;
  let box: SinonSandbox;
  let rps: SinonStub;

  function mockAxios(): void {
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
  }

  beforeEach(() => {
    createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();

    process.env.SIFT_SCIENCE_API = "https://siftScience.com";
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test siftScience transaction with no answer - success", (done: Mocha.Done) => {
    rps = box.stub().returns(of(gSiftScienceWorkflowsResponse));

    mockAxios();

    gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);

    gateway.transaction(gMerchantInfo, gTokenInfo, "124").subscribe({
      next: (): void => {
        expect(rps).to.be.calledOnce;
        done();
      },
    });
  });
  it("test siftScience transaction with error - success", (done: Mocha.Done) => {
    rps = box.stub().throws(
      of({
        response: {
          config: {},
          data: {},
          headers: {},
          status: 402,
          statusText: "",
        },
      })
    );

    mockAxios();

    gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
    gateway
      .transaction(
        gMerchantInfo,
        {
          ...gTokenInfo,
          currency: "UF",
        },
        "1245"
      )
      .subscribe({
        next: (): void => {
          expect(rps).to.be.calledOnce;
          done();
        },
      });
  });
  it("test siftScience getWorkflows with no active workflows - success", (done: Mocha.Done) => {
    gChargeRequest.channel = PaymentProductsEnum.vtex;
    process.env.SIFT_SCIENCE_API_KEY = undefined;
    delete gSiftScienceWorkflowsResponse.score_response;

    rps = box.stub().returns(of(gSiftScienceWorkflowsResponse));

    mockAxios();

    gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
    getWorkflowsSuccess(gateway, done);
  });

  describe("getWorkflows", () => {
    function mockWorkflowStatus(isEmpty?: boolean): ScoreResponse {
      return Mock.of<ScoreResponse>(
        isEmpty
          ? undefined
          : {
              scores: {
                payment_abuse: {
                  score: 0.2,
                },
              },
              workflow_statuses: [
                {
                  config_display_name: "name",
                  history: [
                    {
                      app: "decision",
                      name: "ApprovedTransaction",
                    },
                  ],
                  state: "failed",
                },
              ],
            }
      );
    }
    it("test siftScience getWorkflows with error in request - success", (done: Mocha.Done) => {
      gChargeRequest.channel = PaymentProductsEnum.vtex;
      delete gChargeRequest.productDetails;
      delete gChargeRequest.orderDetails;
      delete gChargeRequest.contactDetails;
      process.env.SIFT_SCIENCE_API_KEY = "API-KEY";
      delete gSiftScienceWorkflowsResponse.score_response;
      rps = box.stub().throwsException(new Error("Error SiftScience"));

      mockAxios();

      gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
      gateway
        .getWorkflows(gMerchantInfo, gTokenInfo, gChargeRequest)
        .subscribe({
          next: (data: SiftScienceWorkflowsResponse): void => {
            expect(has(data, "status")).to.be.eql(true);
            done();
          },
        });
    });

    it("test siftScience getWorkflows with error - success", (done: Mocha.Done) => {
      rps = box.stub().throws(
        of({
          response: {
            config: {},
            data: {},
            headers: {},
            status: 500,
            statusText: "",
          },
        })
      );

      CONTAINER.unbind(CORE.AxiosGateway);
      CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
        Mock.of<IAxiosGateway>({
          request: box.stub().rejects(
            Mock.of<AxiosError>({
              code: "500",
              response: Mock.of<AxiosResponse>({
                status: 500,
                statusText:
                  ErrorResponseTextEnum.ERROR_TIMEOUT_ANTIFRAUD_TRANSACTION,
              }),
            })
          ),
        })
      );

      gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
      gateway
        .getWorkflows(
          Mock.of<DynamoMerchantFetch>({ ...gMerchantInfo }),
          Mock.of<Required<DynamoTokenFetch>>({ ...gTokenInfo }),
          Mock.of<UnifiedChargesPreauthRequest>({ ...gChargeRequest })
        )
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.code).to.be.equal(AntiFraudErrorEnum.K021);
            expect(error.getMessage()).to.be.equal(
              ErrorResponseTextEnum.ERROR_TIMEOUT_ANTIFRAUD_TRANSACTION
            );
            expect(error.getMetadata()).to.be.deep.equal({
              responseCode: AntiFraudErrorEnum.K021,
              responseText:
                ErrorResponseTextEnum.ERROR_TIMEOUT_ANTIFRAUD_TRANSACTION,
            });

            done();
          },
        });
    });

    it("test siftScience getWorkflows with serverSide error, statusCode 200 - success with generic answer", (done: Mocha.Done) => {
      gChargeRequest.channel = PaymentProductsEnum.vtex;
      gChargeRequest.orderDetails = { billingDetails: {}, shippingDetails: {} };
      process.env.SIFT_SCIENCE_API_KEY = undefined;
      delete gSiftScienceWorkflowsResponse.score_response;
      rps = box.stub().returns(of(gSiftScienceWorkflowsResponse));
      gSiftScienceWorkflowsResponse.score_response = {
        scores: {
          payment_abuse: {
            score: 0,
          },
        },
        status: -1,
        workflow_statuses: [
          {
            config_display_name: "displayName",
            history: [
              {
                app: "generic",
                name: "generic",
              },
            ],
          },
        ],
      };

      mockAxios();

      gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
      getWorkflowsSuccess(gateway, done);
    });

    it("test siftScience getWorkflows with active workflows - success", (done: Mocha.Done) => {
      gSiftScienceWorkflowsResponse.score_response = {
        scores: {
          payment_abuse: {
            score: 0.2,
          },
        },
        workflow_statuses: [
          {
            config_display_name: "name2",
            history: [
              {
                app: "decision",
                name: "ApprovedTransaction",
              },
            ],
            state: "success",
          },
        ],
      };
      rps = box.stub().returns(of(gSiftScienceWorkflowsResponse));

      mockAxios();

      gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
      getWorkflowsSuccess(gateway, done);
    });

    it("test siftScience getWorkflows - fail because antifraud score", (done: Mocha.Done) => {
      gMerchantInfo.sift_science.ProdApiKey = "lkasdlaskd1";
      gMerchantInfo.sift_science.SandboxApiKey = "12091dakld";
      process.env.USRV_STAGE = "qa";
      gSiftScienceWorkflowsResponse.score_response = mockWorkflowStatus();
      rps = box.stub().returns(of(gSiftScienceWorkflowsResponse));

      mockAxios();
      gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
      gateway
        .getWorkflows(gMerchantInfo, gTokenInfo, gChargeRequest)
        .subscribe({
          error: (error: KushkiError): void => {
            expect(error.code).to.be.eql("K020");
            done();
          },
          next: (): void => {
            done(UNREACHABLE);
          },
        });
    });

    it("test siftScience getWorkflows and return error_message", (done: Mocha.Done) => {
      process.env.USRV_STAGE = "qa";
      gSiftScienceWorkflowsResponse.score_response = mockWorkflowStatus(true);
      gMerchantInfo.sift_science.ProdApiKey = "lkasdlaskd1";
      rps = box.stub().returns(of(gSiftScienceWorkflowsResponse));
      gMerchantInfo.sift_science.SandboxApiKey = "12091dakld";

      mockAxios();
      gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
      gateway
        .getWorkflows(gMerchantInfo, gTokenInfo, gChargeRequest)
        .subscribe({
          next: (res: SiftScienceWorkflowsResponse): void => {
            expect(res).to.haveOwnProperty("error_message");
            done();
          },
        });
    });
  });

  describe("getDecision", () => {
    it("test siftScience getDecision - success", (done: Mocha.Done) => {
      gMerchantInfo.sift_science.SandboxApiKey = "adajflkj12";
      gMerchantInfo.sift_science.ProdApiKey = "123134343121";
      process.env.USRV_STAGE = "ci";
      rps.returns(of(gSiftScienceDecisionResponse));
      decisionSuccess(gateway, done);
    });

    it("test siftScience getDecision error unexcepted - success with generic response", (done: Mocha.Done) => {
      process.env.USRV_STAGE = "ci";
      const errorget: Error = new Error("Error inesperado");

      rps = box.stub().throws(errorget);

      mockAxios();

      gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);

      gateway.getDecision(gMerchantInfo, "decisionIdString").subscribe({
        next: (data: SiftScienceDecisionResponse): void => {
          expect(data.type).equal("green");
          expect(data.description).equal(errorget.message);
          done();
        },
      });
    });

    it("test siftScience getDecision with ProdAccountID - success", (done: Mocha.Done) => {
      gMerchantInfo.sift_science.ProdApiKey = "123134343121";
      gMerchantInfo.sift_science.SandboxApiKey = "adajflkj12";
      process.env.USRV_STAGE = "primary";
      rps = box.stub().returns(of(gSiftScienceDecisionResponse));

      mockAxios();

      gateway = CONTAINER.get(IDENTIFIERS.AntifraudGateway);
      decisionSuccess(gateway, done);
    });
  });
});
