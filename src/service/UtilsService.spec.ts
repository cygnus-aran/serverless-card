/**
 * Utils service unit test file
 */
import { IAPIGatewayEvent, ILogger, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE_ID } from "@kushki/core/lib/constant/Identifiers";
import { TokenTypeEnum } from "@kushki/core/lib/infrastructure/TokenTypeEnum";
import { Context } from "aws-lambda";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum, CountryIsoEnum } from "infrastructure/CountryEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { HierarchyEnum } from "infrastructure/HierarchyEnum";
import { ProcessorSsmKeyEnum } from "infrastructure/ProcessorSsmKeyEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get } from "lodash";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { of } from "rxjs";
import { ChargeInput, InvokeTrxRuleResponse } from "service/CardService";
import { UtilsService } from "service/UtilsService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { AuthorizerContext } from "types/authorizer_context";
import { BinInfoAcq } from "types/bin_info_acq";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { HierarchyCore } from "types/hierarchy_core";
import { LambdaValues } from "types/lambda_values";
import { TimeoutTransactionsTables } from "types/timeout_transactions_tables";
import { TimeoutVars } from "types/timeout_vars";
import { TokensCardBody } from "types/tokens_card_body";
import { TokensCardResponse } from "types/tokens_card_response";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { CaptureInput } from "service/CardService";

use(sinonChai);

describe("utils service", () => {
  describe("when mapAuthorizerContextAcq is called", () => {
    let authorizer_context: AuthorizerContext;

    beforeEach(() => {
      authorizer_context = Mock.of<AuthorizerContext>({
        hierarchyConfig: {
          processing: { basicInfo: "666666666666666" },
        },
        merchantId: "5555555555555",
      });
    });

    it("should return authorizerContext with hierarchyConfig when hierarchyConfig is object", () => {
      expect(
        UtilsService.mapAuthorizerContextAcq(authorizer_context)
      ).to.haveOwnProperty("hierarchyConfig");
    });

    it("should return eturn authorizerContext with hierarchyConfig when hierarchy config doesnt exist", () => {
      authorizer_context.hierarchyConfig = {};
      expect(
        UtilsService.mapAuthorizerContextAcq(authorizer_context)
      ).to.haveOwnProperty("hierarchyConfig");
    });

    it("should return authorizerContext with hierarchyConfig when hierarchy config is string", () => {
      const authorizer_context_hierarchy_string: AuthorizerContext = {
        ...authorizer_context,
      };

      authorizer_context_hierarchy_string.hierarchyConfig = JSON.stringify(
        authorizer_context.hierarchyConfig
      );
      expect(
        UtilsService.mapAuthorizerContextAcq(
          authorizer_context_hierarchy_string
        )
      ).to.haveOwnProperty("hierarchyConfig");
    });
  });

  describe("when tokenGenerator is called", () => {
    it("should return a token", () => {
      UtilsService.tokenGenerator("service").subscribe({
        next: (response: TokensCardResponse) => {
          expect(response.token.length).to.be.eqls(32);
        },
      });
    });
  });

  describe("when triggerNotSupportMethodError is called", () => {
    it("should return a error", () => {
      UtilsService.triggerNotSupportMethodError("service").subscribe({
        error: (response: KushkiError) => {
          expect(response.code).to.be.eqls("K041");
          expect(response.getMessage()).to.be.eqls(ERRORS.E041.message);
        },
      });
    });
  });

  describe("when checkBrand is called", () => {
    it("should return brand American Express", () => {
      const brands: string[] = [
        "American express",
        "AMERICAN EXPRESS",
        "Amex",
        "AMEX",
        "AmEx",
      ];

      brands.forEach((brand: string) => {
        expect(
          UtilsService.checkBrand(
            brand.replace(/ /g, "").toLowerCase(),
            CardBrandEnum.AMEX
          )
        ).to.be.eqls(CardBrandEnum.AMEX);
      });
    });

    it("should return brand Visa", () => {
      const brands: string[] = ["visa", "VISA", "Visa"];

      brands.forEach((brand: string) => {
        expect(UtilsService.checkBrand(brand, CardBrandEnum.VISA)).to.be.eqls(
          CardBrandEnum.VISA
        );
      });
    });

    it("should return brand Carnet", () => {
      const brands: string[] = ["car net", "Car Net", "CARNET", "Carnet"];

      brands.forEach((brand: string) => {
        expect(UtilsService.checkBrand(brand, CardBrandEnum.CARNET)).to.be.eqls(
          CardBrandEnum.CARNET
        );
      });
    });

    it("should return brand MasterCard", () => {
      const brands: string[] = [
        "Master card",
        "MASTER CARD",
        "Mastercard",
        "MASTERCARD",
        "MasterCard",
        "Master Card",
      ];

      brands.forEach((brand: string) => {
        expect(
          UtilsService.checkBrand(brand, CardBrandEnum.MASTERCARD)
        ).to.be.eqls(CardBrandEnum.MASTERCARD);
      });
    });
  });

  describe("getTimeoutProcessorTransactionsTable", () => {
    beforeEach(() => {
      const tables: TimeoutTransactionsTables = {
        fis: "qa-usrv-card-fis-timedOutTransactions",
        redeban: "qa-usrv-card-redeban-timedOutTransactions",
        transbank: "qa-usrv-card-transbank-timedOutTransactions",
      };

      process.env.TIMEOUT_TRANSACTIONS_TABLES = JSON.stringify(tables);
    });

    afterEach(() => {
      process.env.TIMEOUT_TRANSACTIONS_TABLES = undefined;
    });

    it("should return a valid string with the name of redeban timeout transaction table", () => {
      const response: string =
        UtilsService.getTimeoutProcessorTransactionsTable(
          ProcessorSsmKeyEnum.REDEBAN
        );

      expect(response).to.be.eqls("qa-usrv-card-redeban-timedOutTransactions");
    });

    it("should return a valid string with the name of transbank timeout transaction table", () => {
      const response: string =
        UtilsService.getTimeoutProcessorTransactionsTable(
          ProcessorSsmKeyEnum.TRANSBANK
        );

      expect(response).to.be.eqls(
        "qa-usrv-card-transbank-timedOutTransactions"
      );
    });
  });

  describe("getStaticProcesorTimeoutValue", () => {
    beforeEach(() => {
      const tables: TimeoutVars = {
        fis: 15000,
        redeban: 15000,
        transbank: 14000,
      };

      process.env.TIMEOUT_VARS = JSON.stringify(tables);
    });

    afterEach(() => {
      process.env.TIMEOUT_VARS = undefined;
    });

    it("should return a valid string with the name of redeban timeout value", () => {
      const response: number = UtilsService.getStaticProcesorTimeoutValue(
        ProcessorSsmKeyEnum.REDEBAN
      );

      expect(response).to.be.eqls(15000);
    });

    it("should return a valid string with the name of transbank timeout value", () => {
      const response: number = UtilsService.getStaticProcesorTimeoutValue(
        ProcessorSsmKeyEnum.TRANSBANK
      );

      expect(response).to.be.eqls(14000);
    });

    it("Should calculate total amount with extraTaxes", () => {
      const amount: Amount = {
        currency: "USD",
        extraTaxes: {
          agenciaDeViaje: 1,
          iac: 1,
          propina: 1,
          tasaAeroportuaria: 1,
          tip: 1,
        },
        ice: 0,
        iva: 5.25,
        subtotalIva: 25.0,
        subtotalIva0: 25.0,
      };

      const total_amount = UtilsService.calculateFullAmount(amount);

      expect(total_amount).to.eq(60.25);
    });

    it("Should calculate total amount without ice", () => {
      const amount: Amount = {
        currency: "USD",
        iva: 5.25,
        subtotalIva: 25.0,
        subtotalIva0: 25.0,
      };

      const total_amount = UtilsService.calculateFullAmount(amount);

      expect(total_amount).to.eq(55.25);
    });
  });

  describe("cleanProcessorName", () => {
    function assertCleanProcessorName(
      processor: string,
      expected: string
    ): void {
      const response: string = UtilsService.cleanProcessorName(processor);

      expect(response).to.be.eqls(expected);
    }

    it("When call cleanProcessorName should return processor name without 'Processor' on string", () => {
      assertCleanProcessorName("BillPocket Processor ", "BillPocket");
      assertCleanProcessorName(" Processor BillPocket", "BillPocket");
      assertCleanProcessorName("Kushki Acquirer Processor", "Kushki Acquirer");
      assertCleanProcessorName("Processor Kushki Acquirer ", "Kushki Acquirer");
    });
  });

  describe("getCountryISO", () => {
    function assertGetCountryISO(
      countryName: string,
      countryIso: string
    ): void {
      const response: string = UtilsService.getCountryISO(countryName);

      expect(response).to.be.eqls(countryIso);
    }

    it("should return country ISO when pass country name", () => {
      assertGetCountryISO(CountryEnum.MEXICO, CountryIsoEnum.MEX);
      assertGetCountryISO(CountryEnum.COLOMBIA, CountryIsoEnum.COL);
      assertGetCountryISO(CountryEnum.PERU, CountryIsoEnum.PER);
      assertGetCountryISO(CountryEnum.CHILE, CountryIsoEnum.CHL);
      assertGetCountryISO(CountryEnum.ECUADOR, CountryIsoEnum.ECU);
    });
  });

  describe("getLambdaValues is called", () => {
    function assertGetLambdasValues(): void {
      const key = "LAMBDA_VALUES";

      const lambdas: LambdaValues = {
        DIRECT_VOID: "fake-lambda",
      };

      process.env[key] = JSON.stringify(lambdas);
      const response: LambdaValues = UtilsService.getLambdaValues();

      expect(response).to.be.eqls(lambdas);
    }

    it("should return lambdas values successfully", () => {
      assertGetLambdasValues();
    });
  });

  describe("generateSecureValidationUrl is called", () => {
    let tokens_event_mock: IAPIGatewayEvent<
      TokensCardBody,
      null,
      null,
      AuthorizerContext
    >;

    beforeEach(() => {
      process.env.USRV_STAGE = "qa";
      tokens_event_mock = Mock.of<
        IAPIGatewayEvent<TokensCardBody, null, null, AuthorizerContext>
      >({
        body: Mock.of<TokensCardBody>(),
        headers: {
          ["USER-AGENT"]: "PostmanRuntime",
        },
        requestContext: {
          authorizer: Mock.of<AuthorizerContext>(),
        },
      });
    });

    it("When it is called with sandbox in true and env is different of primary, it must return an string url with param isSandbox=true", () => {
      const sandbox = true;
      const url_generated = UtilsService.generateSecureValidationUrl(
        "token123",
        tokens_event_mock,
        sandbox
      );

      expect(url_generated).contains("&isSandbox=true");
    });

    it("When it is called with sandbox in false and env is primary, it must return an string url without param isSandbox", () => {
      process.env.USRV_STAGE = "primary";
      const sandbox = false;
      const url_generated = UtilsService.generateSecureValidationUrl(
        "token123",
        tokens_event_mock,
        sandbox
      );

      expect(url_generated).not.contains("&isSandbox=");
    });

    afterEach(() => {
      process.env.USRV_STAGE = undefined;
    });
  });

  describe("buildCaptureRequest", () => {
    it("should build a capture request when body.amount is not present", () => {
      const captureRequest = Mock.of<CaptureInput>({
        transaction: { ice_value: 3.0 },
      });
      const result = UtilsService.buildCaptureRequest(captureRequest);

      expect(result.amount).to.exist;
    });

    it("should use body.amount directly when it's present", () => {
      const amountObject = {
        ice: 2.0,
        iva: 3.0,
        subtotalIva: 20.0,
        subtotalIva0: 10.0,
      };

      const captureRequest = Mock.of<CaptureInput>({
        body: {
          amount: amountObject,
        },
      });

      const result = UtilsService.buildCaptureRequest(captureRequest);

      expect(result.amount).to.equal(amountObject);
    });
  });
});

describe("ValidateIf | for replacing if sentence into TransactionService - ", () => {
  let result: string;
  let condition: boolean;

  beforeEach(() => {
    result = "";
    condition = true;
  });

  it("when condition is true", () => {
    UtilsService.validateIf(condition, () => (result = "condition is true"));
    expect(result).to.be.equal("condition is true");
  });

  it("when condition is false", () => {
    condition = false;
    UtilsService.validateIf(
      condition,
      () => (result = ""),
      () => (result = "condition is false")
    );
    expect(result).to.be.equal("condition is false");
  });

  describe("invalidBinInfo", () => {
    let bin_info: BinInfoAcq;

    beforeEach(() => {
      bin_info = {
        bank: "Fake bank",
        bin: "1234567890",
        brand: "VISA",
        country: "ECU",
        type: "credit",
      };
    });

    it("should return false when binInfo is correct", () => {
      const resp = UtilsService.invalidBinInfo(bin_info);

      expect(resp).to.be.false;
    });

    describe("when BinInfo is not valid", () => {
      it("and binInfo is undefined should return true", () => {
        const resp = UtilsService.invalidBinInfo();

        expect(resp).to.be.true;
      });

      describe("and binInfo is different to undefined", () => {
        let resp: boolean;

        it("and bin is empty should return true", () => {
          bin_info.bin = "";
        });

        it("and brand is empty should return true", () => {
          bin_info.brand = "";
        });

        it("and country is empty should return true", () => {
          bin_info.country = "";
        });

        afterEach(() => {
          resp = UtilsService.invalidBinInfo(bin_info);
          expect(resp).to.be.true;
        });
      });
    });
  });
});

describe("Validate build charge input for card and subscriptions", () => {
  let box: SinonSandbox;
  let context: Context;
  let amount: Amount;
  let token: DynamoTokenFetch;
  let merchant: DynamoMerchantFetch;
  let body: UnifiedChargesPreauthRequest;
  let data: InvokeTrxRuleResponse;
  let authorizer_context: AuthorizerContext;
  const processor_info: DynamoProcessorFetch = {
    created: 123456789,
    merchant_id: "",
    private_id: "",
    processor_name: "Test processor",
    processor_type: "Aggregator",
    public_id: "222222222",
  };

  const sample_initial_reference: string = "xxx-xxxx-xxx-xxx";

  function createSchemas(origin = UsrvOriginEnum.CARD): void {
    amount = {
      iva: 20,
      subtotalIva: 100,
      subtotalIva0: 10,
    };
    token = {
      amount: 4444,
      bin: "123132",
      created: 2131312,
      currency: "USD",
      id: "sadasd",
      ip: "ip",
      lastFourDigits: "4344",
      maskedCardNumber: "23424werwe",
      merchantId: "dasdasd",
      transactionReference: "reasa",
    };
    merchant = {
      amount: 4444,
      bin: "123132",
      created: 2131312,
      currency: "USD",
      id: "sadasd",
      ip: "ip",
      lastFourDigits: "4344",
      maskedCardNumber: "23424werwe",
      merchant_name: "Pruebas",
      public_id: "",
      sift_science: {},
      transactionReference: "reasa",
    };
    body = {
      amount: {
        iva: 342423,
        subtotalIva: 42432,
        subtotalIva0: 4234,
      },
      authorizerContext: {
        credentialAlias: "",
        credentialId: "1",
        merchantId: "",
        privateMerchantId: "",
        publicMerchantId: "",
      },
      cardHolderName: "",
      ignoreWarnings: false,
      isDeferred: false,
      lastFourDigits: "1111",
      maskedCardNumber: "",
      merchant: {
        merchantId: "1234567",
        merchantName: "Pruebas merchant",
      },
      tokenCreated: 0,
      tokenCurrency: "",
      tokenId: "asdad",
      tokenObject: token,
      tokenType: "transaction",
      transactionReference: "",
      transactionType: "charge",
      usrvOrigin: origin,
    };
    data = {
      apiKey: "",
      plccInfo: { flag: "", brand: "prueba" },
      processor: processor_info,
      trxRuleResponse: {
        body: {
          privateId: "",
          processor: "string",
          publicId: "string",
        },
      },
    };
    authorizer_context = {
      credentialAlias: "",
      credentialId: "1",
      merchantId: "",
      privateMerchantId: "",
      publicMerchantId: "",
    };
  }

  beforeEach(() => {
    box = createSandbox();
    context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(600000),
    });
  });

  it("Should build charge input when usrv origin is card", () => {
    createSchemas();
    const response: ChargeInput = UtilsService.buildChargeInput(
      amount,
      token,
      merchant,
      TransactionRuleTypeEnum.CHARGE,
      (body = {
        ...body,
        initialRecurrenceReference: sample_initial_reference,
      }),
      authorizer_context,
      data,
      context,
      TokenTypeEnum.TRANSACTION
    );

    expect(response).to.be.deep.equals({
      address: undefined,
      amount: {
        iva: 20,
        subtotalIva: 100,
        subtotalIva0: 10,
      },
      authorizerContext: authorizer_context,
      convertedAmount: undefined,
      currentMerchant: merchant,
      currentToken: token,
      event: body,
      initialRecurrenceReference: sample_initial_reference,
      isAft: undefined,
      isFailoverRetry: false,
      isOCT: undefined,
      lambdaContext: context,
      originUsrv: "usrv-card",
      plccInfo: {
        brand: "prueba",
        flag: "",
      },
      postalCode: undefined,
      processor: processor_info,
      tokenType: TokenTypeEnum.TRANSACTION,
      transactionType: "charge",
      trxRuleResponse: {
        body: {
          privateId: "",
          processor: "string",
          publicId: "string",
        },
      },
    });
  });

  it("Should build charge input when usrv origin is subscription", () => {
    createSchemas(UsrvOriginEnum.SUBSCRIPTIONS);
    const response: ChargeInput = UtilsService.buildChargeInput(
      amount,
      token,
      merchant,
      TransactionRuleTypeEnum.CHARGE,
      body,
      authorizer_context,
      data,
      context,
      TokenTypeEnum.SUBSCRIPTION
    );

    expect(response).to.be.deep.equals({
      address: undefined,
      amount: {
        iva: 20,
        subtotalIva: 100,
        subtotalIva0: 10,
      },
      authorizerContext: authorizer_context,
      convertedAmount: undefined,
      currentMerchant: merchant,
      currentToken: token,
      deferred: undefined,
      email: "",
      event: body,
      initialRecurrenceReference: undefined,
      isAft: undefined,
      isFailoverRetry: false,
      isOCT: undefined,
      lambdaContext: context,
      lastName: "NA",
      metadata: undefined,
      name: "NA",
      orderDetails: undefined,
      originUsrv: UsrvOriginEnum.SUBSCRIPTIONS,
      plccInfo: {
        brand: "prueba",
        flag: "",
      },
      postalCode: undefined,
      processor: processor_info,
      subscriptionMinChargeTrxRef: undefined,
      token: "asdad",
      tokenType: TokenTypeEnum.SUBSCRIPTION,
      transactionType: "charge",
      trxRuleResponse: {
        body: {
          privateId: "",
          processor: "string",
          publicId: "string",
        },
      },
    });
  });

  it("Should build charge input with subscriptionMinChargeTrxRef when usrv origin is subscription and body has this prop", () => {
    createSchemas(UsrvOriginEnum.SUBSCRIPTIONS);
    const subs_card_trx_ref = "123ABC";
    const response: ChargeInput = UtilsService.buildChargeInput(
      amount,
      token,
      merchant,
      TransactionRuleTypeEnum.CHARGE,
      (body = {
        ...body,
        subscriptionMinChargeTrxRef: subs_card_trx_ref,
      }),
      authorizer_context,
      data,
      context,
      TokenTypeEnum.SUBSCRIPTION
    );

    expect(response).to.include({
      subscriptionMinChargeTrxRef: subs_card_trx_ref,
    });
  });
});

describe("test utilities Hierarchy", () => {
  let storage: IDynamoGateway;
  let logger: ILogger;
  let mock_get_item: SinonStub;
  let sandbox: SinonSandbox;
  let merchant: DynamoMerchantFetch;
  let query_stub: SinonStub;
  let stub_hierarchy_query_response: HierarchyCore;

  beforeEach(() => {
    sandbox = createSandbox();
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
      public_id: "123456789",
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
    stub_hierarchy_query_response = {
      configCoreId: "",
      configs: [
        {
          centralizedNodesId: "07a17bbf10c2",
          configuration: "cn016",
          status: "complete",
          updatedAt: 1690312117840,
          updatedBy: "backoffice",
          value: "20000000102042075000",
        },
      ],
      countryCode: "",
      createAt: 0,
      createdBy: "",
      description: "",
      entityName: "",
      isDeleted: false,
      merchantId: "",
      metadata: undefined,
      name: "",
      nodeId: "",
      nodeType: "",
      path: "",
      rootId: "",
      status: "",
      updateAt: 0,
      updatedBy: "",
    };

    logger = CONTAINER.get<ILogger>(CORE_ID.Logger);
    CONTAINER.snapshot();
  });

  afterEach(() => {
    CONTAINER.restore();
    sandbox.restore();
  });

  function mockDynamoGateway(
    getResponse: SinonStub | undefined,
    queryResponse: SinonStub | undefined
  ): void {
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: getResponse,
        query: queryResponse,
      })
    );
    storage = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
  }

  it("should make validateRequestHierarchyMerchant", (done: Mocha.Done) => {
    mock_get_item = sandbox.stub().returns(of(undefined));
    query_stub = sandbox.stub().returns(of([stub_hierarchy_query_response]));

    mockDynamoGateway(mock_get_item, query_stub);
    UtilsService.validateRequestHierarchyMerchant(
      storage,
      logger,
      "20000000102042075000",
      HierarchyEnum.CN016
    ).subscribe({
      next: (merchantId: string) => {
        expect(merchantId).to.equal("20000000102042075000");
        done();
      },
    });
  });
  it("should make getCustomerInfo", (done: Mocha.Done) => {
    mock_get_item = sandbox.stub().returns(of(merchant));
    query_stub = sandbox.stub().returns(of(undefined));
    mockDynamoGateway(mock_get_item, query_stub);
    UtilsService.getCustomerInfo(storage, logger, "123456789").subscribe({
      next: (data: DynamoMerchantFetch | undefined) => {
        expect(get(data, "public_id")).deep.eq("123456789");
        done();
      },
    });
  });

  it("should make getCustomerInfoTwo with Error", (done: Mocha.Done) => {
    mock_get_item = sandbox
      .stub()
      .throws(new Error("Fis Error Dynamo getItem"));
    query_stub = sandbox.stub().returns(of(undefined));
    mockDynamoGateway(mock_get_item, query_stub);
    UtilsService.getCustomerInfo(storage, logger, "123456789").subscribe({
      next: (data: DynamoMerchantFetch | undefined) => {
        expect(data).to.undefined;
        done();
      },
    });
  });
});
