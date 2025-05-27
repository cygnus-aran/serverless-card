import { AurusError, ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { FS_ERRORS } from "@kushki/core/lib/infrastructure/FisErrorEnum";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CategoryTypeEnum } from "infrastructure/CategoryTypeEnum";
import { CONTAINER } from "infrastructure/Container";
import { ERRORS } from "infrastructure/ErrorEnum";
import { JurisdictionEnum } from "infrastructure/JurisdictionEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TokenTypeEnum } from "infrastructure/TokenTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, set } from "lodash";
import { Done } from "mocha";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import * as Rollbar from "rollbar";
import { of } from "rxjs";
import { delay } from "rxjs/operators";
import { CaptureInput, ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { BusinessPartner } from "types/business_partner";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { SubMerchantData } from "types/fis_charge_request";
import { HierarchyCore } from "types/hierarchy_core";
import { TimeoutTransactionsTables } from "types/timeout_transactions_tables";
import { TimeoutVars } from "types/timeout_vars";
import { TokensCardResponse } from "types/tokens_card_response";

use(sinonChai);

describe("FisService Unit Tests", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];
  let token_stub: SinonStub;
  let stub_hierarchy_query_response: HierarchyCore;
  let stub_merchant_get_response: DynamoMerchantFetch;
  let put_stub: SinonStub;
  let query_stub: SinonStub;
  let get_stub: SinonStub;
  const error_message_response = "Transacción declinada.";
  const error_message_response_honor =
    "Honor con ID O Transacción aprobada con ID.";
  const success_response_code = "000";

  beforeEach(() => {
    sandbox = createSandbox();
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(Mock.of());
    CONTAINER.unbind(CORE.RollbarInstance);
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<Rollbar>({
        critical: sandbox.stub(),
        warn: sandbox.stub(),
        warning: sandbox.stub(),
      })
    );
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
    stub_merchant_get_response = {
      acceptCreditCards: [],
      address: "testAddres",
      city: "testCity",
      cityDescription: "myCity",
      clientType: "",
      config: undefined,
      constitutionalCountry: "",
      country: "Polombia",
      deferredOptions: undefined,
      merchant_name: "Mai Mercant",
      merchant_url: "",
      merchantCategory: "",
      province: "provincita",
      provinceDescription: "",
      public_id: "342334324",
      sandboxEnable: false,
      sift_science: {},
      socialReason: "aReason",
      taxId: "32143",
      whiteList: false,
      zipCode: "999666",
    };
  });

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<Rollbar>({
        warn: sandbox.stub(),
      })
    );
  });

  function mockDynamoGateway(
    queryResponse: SinonStub | undefined,
    getResponse: SinonStub | undefined
  ): void {
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: getResponse,
        put: put_stub,
        query: queryResponse,
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
  function testMethodError(err: KushkiError, done: Mocha.Done): void {
    expect(err.code).to.be.eq("K041");
    expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
    expect(err).to.be.instanceOf(KushkiError);
    done();
  }

  function mockAurus() {
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        getAurusToken: token_stub,
      })
    );
  }

  function setTimeoutVars(value: number): void {
    const tables: TimeoutVars = {
      fis: value,
      redeban: value,
      transbank: value,
    };

    process.env.TIMEOUT_VARS = JSON.stringify(tables);
  }

  describe("charge Method", () => {
    let charge_request_mock: ChargeInput;
    let charge_response_mock: AurusResponse;
    let trx_reference: string;

    const current_merchant = {
      address: "Calle 1234",
      city: "Brasileira",
      merchant_name: "test",
      pfId: "",
      province: "AC",
      public_id: "11112",
      taxId: "124567875432",
      whiteList: true,
      zipCode: "7777777",
    };
    let merchant_data_by_branch: SubMerchantData;
    let merchant_data_by_customer: SubMerchantData;

    beforeEach(() => {
      trx_reference = "124asdsa123asdk123131";
      charge_request_mock = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "123",
          merchantId: "0000",
        },
        currentMerchant: current_merchant,
        currentToken: {
          amount: 4444,
          bin: "123132",
          binInfo: {
            brand: CardBrandEnum.MASTERCARD,
          },
          created: 2131312,
          currency: "USD",
          id: "sadasds2",
          ip: "ip1",
          lastFourDigits: "4343",
          maskedCardNumber: "23424werwr",
          merchantId: "dasdass",
          transactionReference: trx_reference,
        },
        event: {
          amount: {
            iva: 3424232,
            subtotalIva: 42432,
            subtotalIva0: 4234,
          },
          contactDetails: {
            documentNumber: "1234567890",
            documentType: "CNPJ",
            email: "user@example.com",
            firstName: "John",
            lastName: "Doe",
            phoneNumber: "+593912345678",
          },
          deferred: {
            creditType: "0",
            graceMonths: "0",
            months: 3,
          },
          periodicity: "monthly",
          processorToken: "abc-123",
          tokenId: "asdad",
          usrvOrigin: UsrvOriginEnum.CARD,
        },
        plccInfo: { flag: "" },
        processor: {
          category_model: CategoryTypeEnum.FORMAL,
          is_business_partner: false,
          jurisdiction: JurisdictionEnum.MOR,
          private_id: "1412312",
          processor_merchant_id: "KushkiTest",
          processor_name: "Try",
          public_id: "112",
          soft_descriptor: "",
          sub_mcc_code: "8999",
          username: "userTest",
        },
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: "charge",
        trxRuleResponse: {
          body: {
            softDescriptor: "mySoftDescriptor",
          },
        },
      });
      charge_response_mock = Mock.of<AurusResponse>({
        response_code: success_response_code,
        response_text: get(FS_ERRORS[`FS8`], "message", ""),
        transaction_reference: trx_reference,
      });

      merchant_data_by_branch = {
        pfId: "",
        subCity: "testCity",
        subCountryCode: "076",
        subId: "11112",
        subName: "",
        subPostalCode: "999666",
        subState: "provincita",
        subStreet: "testAddres",
        subTaxId: "32143",
      };
      merchant_data_by_customer = {
        pfId: "",
        subCity: "Brasileira",
        subCountryCode: "076",
        subId: "11112",
        subName: "",
        subPostalCode: "7777777",
        subState: "AC",
        subStreet: get(current_merchant, "address"),
        subTaxId: "124567875432",
      };

      put_stub = sandbox.stub().returns(of(true));
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
        })
      );

      query_stub = sandbox.stub().returns(of(undefined));
      get_stub = sandbox.stub().returns(of(undefined));

      process.env.FIS_VARIABLES = JSON.stringify({
        chargerequest: {
          subMerchantData: {
            pfId: "",
          },
        },
      });

      mockDynamoGateway(query_stub, get_stub);
    });

    afterEach(() => {
      sandbox.reset();
      setTimeoutVars(30000);
    });

    function commonExpectSuccessCharge(
      done: Done,
      isSubscription: boolean,
      isCommission: boolean
    ): void {
      setTimeoutVars(30000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(rs.transaction_reference).eq(trx_reference);
          expect(rs.response_code).eq(success_response_code);
          expect(charge_stub).calledOnce;
          expect(charge_stub.args[0][1].processorInfo.dynamicMcc).to.be.eqls(
            charge_request_mock.processor.sub_mcc_code
          );
          if (isSubscription && !isCommission) {
            expect(charge_stub.args[0][1].card.months).to.be.eqls(
              charge_request_mock.event.deferred?.months
            );
            expect(charge_stub.args[0][1].isDeferred).to.be.false;
            expect(charge_stub.args[0][1].subscription).to.be.eqls("monthly");
            expect(
              charge_stub.args[0][1].processorInfo.categoryModel
            ).to.be.eqls(CategoryTypeEnum.FORMAL);
            expect(charge_stub.args[0][1].processorInfo.username).to.be.eqls(
              charge_request_mock.processor.username
            );
            expect(charge_stub.args[0][1].processorToken).to.be.eqls(
              charge_request_mock.event.processorToken
            );
          } else
            expect(charge_stub.args[0][1].tokenType).to.be.eqls(
              TokenTypeEnum.TRANSACTION
            );

          done();
        },
      });
    }

    it("should make a charge", (done: Done) => {
      commonExpectSuccessCharge(done, false, false);
    });
    it("should make a charge and take data from customer, when merchant is centralized", (done: Done) => {
      query_stub = sandbox.stub().returns(of([stub_hierarchy_query_response]));
      get_stub = sandbox.stub().returns(of(stub_merchant_get_response));

      mockDynamoGateway(query_stub, get_stub);

      setTimeoutVars(10000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(charge_stub.args[0][1].subMerchantData).deep.eq(
            merchant_data_by_branch
          );
          expect(rs.response_code).eq(success_response_code);
          done();
        },
      });
    });
    it("should make a charge and take data from customer, when merchant is centralized with error in the query", (done: Done) => {
      query_stub = sandbox.stub().throws(new Error("Fis Error"));

      get_stub = sandbox.stub().returns(of(undefined));

      mockDynamoGateway(query_stub, get_stub);

      setTimeoutVars(10000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(charge_stub.args[0][1].subMerchantData).deep.eq(
            merchant_data_by_customer
          );
          expect(rs.response_code).eq(success_response_code);
          done();
        },
      });
    });
    it("should make a charge and take data from customer, when merchant is centralized with error in the getItem", (done: Done) => {
      get_stub = sandbox.stub().throws(new Error("Fis Error Dynamo getItem"));

      query_stub = sandbox.stub().returns(of([stub_hierarchy_query_response]));

      mockDynamoGateway(query_stub, get_stub);

      setTimeoutVars(10000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[10].charge(charge_request_mock).subscribe({
        next: (res: AurusResponse): void => {
          expect(charge_stub.args[0][1].subMerchantData).deep.eq(
            merchant_data_by_customer
          );
          expect(res.response_code).eq(success_response_code);
          done();
        },
      });
    });
    it("should make a charge with subMerchantData from ssm, with corresponding pfId and subname", (done: Done) => {
      const business_partner: BusinessPartner = {
        pfId: { mastercard: "m43242432", visa: "v28313921" },
        subCity: "Bogota",
        subCountryCode: "001",
        subId: "123423",
        subName: "name",
        subPostalCode: "0932",
        subState: "scsa",
        subStreet: "street",
        subTaxId: "2821",
      };
      const expected_response = {
        pfId: "m43242432",
        subCity: "Bogota",
        subCountryCode: "001",
        subId: "123423",
        subName: "mySoftDescriptor",
        subPostalCode: "0932",
        subState: "scsa",
        subStreet: "street",
        subTaxId: "2821",
      };

      process.env.BUSINESS_PARTNER = JSON.stringify(business_partner);
      charge_request_mock.processor.jurisdiction = JurisdictionEnum.PAYFAC;
      charge_request_mock.processor.is_business_partner = true;

      setTimeoutVars(30000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(charge_stub.args[0][1].subMerchantData).deep.eq(
            expected_response
          );
          expect(rs.response_code).eq(success_response_code);
          expect(charge_stub).calledOnce;
          done();
        },
      });
    });
    it("should make a charge with subMerchantData from data, with corresponding pfId and subname", (done: Done) => {
      const business_partner: BusinessPartner = {
        pfId: { mastercard: "m43242432", visa: "v28313921" },
        subCity: "Bogota",
        subCountryCode: "001",
        subId: "123423",
        subName: "name",
        subPostalCode: "0932",
        subState: "scsa",
        subStreet: "street",
        subTaxId: "2821",
      };
      const expected_response = {
        pfId: "m43242432",
        subCity: "Brasileira",
        subCountryCode: "076",
        subId: "11112",
        subName: "mySoftDescriptor",
        subPostalCode: "7777777",
        subState: "AC",
        subStreet: "Calle 1234",
        subTaxId: "124567875432",
      };

      process.env.BUSINESS_PARTNER = JSON.stringify(business_partner);
      charge_request_mock.processor.jurisdiction = JurisdictionEnum.PAYFAC;
      charge_request_mock.processor.is_business_partner = false;

      setTimeoutVars(35000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        next: (): void => {
          expect(charge_stub.args[0][1].subMerchantData).deep.eq(
            expected_response
          );
          done();
        },
      });
    });
    it("should throw error when getting BusinessPartner ssm", (done: Done) => {
      delete process.env.BUSINESS_PARTNER;
      charge_request_mock.processor.is_business_partner = true;
      charge_request_mock.processor.jurisdiction = JurisdictionEnum.PAYFAC;

      setTimeoutVars(30000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      try {
        service[10].charge(charge_request_mock).subscribe();
        expect(true).to.equal(false);
      } catch (err: unknown) {
        expect((err as KushkiError).code).to.equal("K047");
        done();
      }
    });
    it("should throw error when no softDescriptor ", (done: Done) => {
      const business_partner: BusinessPartner = {
        pfId: { mastercard: "m43242432", visa: "v28313921" },
        subCity: "Bogota",
        subCountryCode: "001",
        subId: "123423",
        subName: "name",
        subPostalCode: "0932",
        subState: "scsa",
        subStreet: "street",
        subTaxId: "2821",
      };

      process.env.BUSINESS_PARTNER = JSON.stringify(business_partner);
      charge_request_mock.processor.is_business_partner = true;
      charge_request_mock.processor.jurisdiction = JurisdictionEnum.PAYFAC;
      delete charge_request_mock.trxRuleResponse.body.softDescriptor;

      setTimeoutVars(30000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      try {
        service[10].charge(charge_request_mock).subscribe();
        expect(true).to.equal(false);
      } catch (err: unknown) {
        expect((err as KushkiError).code).to.equal("K047");
        done();
      }
    });

    it("should make a charge with the public_id is older than 15", (done: Done) => {
      set(
        charge_request_mock.currentMerchant,
        "public_id",
        "123456789098907654"
      );
      commonExpectSuccessCharge(done, false, false);
    });

    it("should make a charge with month is not empty and deferred empty", (done: Done) => {
      set(charge_request_mock.event, "months", 3);
      delete charge_request_mock.event.deferred;
      commonExpectSuccessCharge(done, false, false);
    });

    it("should make a charge with usrvOrigin = usrv-subscriptions", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      charge_request_mock.event.periodicity = "monthly";
      charge_request_mock.event.deferred = {
        creditType: "1",
        graceMonths: "",
        months: 1,
      };
      commonExpectSuccessCharge(done, true, false);
    });

    it("should make a subscription charge with usrvOrigin = usrv-commission ", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      charge_request_mock.event.isSubscriptionCharge = true;
      commonExpectSuccessCharge(done, true, true);
    });

    it("should make a charge with usrvOrigin = usrv-commission and isSubscriptionCharge is false", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.COMMISSION;
      charge_request_mock.event.isSubscriptionCharge = false;
      set(charge_request_mock, "currentToken.vaultToken", "2323827");
      commonExpectSuccessCharge(done, false, true);
    });

    it("should make a charge with usrvOrigin = usrv-subscriptions and isSubscriptionCharge is true and ksh_subscriptionValidation false", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      charge_request_mock.event.isSubscriptionCharge = true;
      set(charge_request_mock, "currentToken.vaultToken", "23434");
      commonExpectSuccessCharge(done, true, false);
    });

    it("should make a preAuthorization with usrvOrigin = usrv-subscriptions and  ksh_subscriptionValidation is true", (done: Done) => {
      charge_request_mock.event.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
      charge_request_mock.event.isSubscriptionCharge = true;
      set(
        charge_request_mock,
        "event.metadata.ksh_subscriptionValidation",
        true
      );
      commonExpectSuccessCharge(done, false, false);
    });

    it("should make a charge with 3DS", (done: Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              specificationVersion: 0,
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cardType: "cardType test",
                cavv: "cavv test",
                eci: "eci test",
                eciRaw: "eciRaw test",
                ucafAuthenticationData: "ucafAuthenticationData test",
                xid: "xid",
              },
            },
            privateId: "privateId",
            processor: "NIUBIZ",
            publicId: "publicId",
          },
        },
      };
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(charge_stub).calledOnce;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;
          expect(charge_stub.args[0][1].is3DS).to.be.true;
          done();
        },
      });
    });

    it("should make a charge with 3DS with eciRaw, cardType and ucafAuthenticationData", (done: Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              specificationVersion: 0,
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cardType: "cardType test",
                cavv: "cavv test",
                eci: "eci test",
                eciRaw: "eciRaw test",
                ucafAuthenticationData: "ucafAuthenticationData test",
                xid: "xid",
              },
            },
            privateId: "privateId",
            processor: "NIUBIZ",
            publicId: "publicId",
          },
        },
      };
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      process.env.TIMEOUT_VARS = `{"redeban": 12341234, "transbank": 1234,"fis": 123}`;

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          const charge_stub_3ds_args: object = charge_stub.args[0][1]["3DS"];

          expect(rs).not.to.be.undefined;
          expect(charge_stub).calledOnce;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;
          expect(charge_stub.args[0][1].is3DS).to.be.true;
          expect(charge_stub_3ds_args).to.haveOwnProperty(
            "ucafAuthenticationData"
          );

          done();
        },
      });
    });

    it("should make a charge with 3DS with no fields eciRaw, cardType and ucafAuthenticationData", (done: Done) => {
      charge_request_mock = {
        ...charge_request_mock,
        currentToken: {
          ...charge_request_mock.currentToken,
          "3ds": {
            authentication: true,
            detail: {
              cavv: "cavv",
              eci: "eci",
              specificationVersion: 0,
              xid: "xid",
            },
          },
        },
        trxRuleResponse: {
          body: {
            cybersource: {
              detail: {
                cavv: "cavv test",
                eci: "eci test",
                xid: "xid",
              },
            },
            privateId: "privateId",
            processor: "NIUBIZ",
            publicId: "publicId",
          },
        },
      };
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      process.env.TIMEOUT_VARS = `{"redeban": 12341234, "transbank": 1234, "fis": 123}`;

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(charge_stub.args[0][1]["3DS"]).to.be.not.undefined;
          expect(charge_stub.args[0][1].is3DS).to.be.true;
          expect(charge_stub).calledOnce;

          done();
        },
      });
    });

    it("Fis when make a charge, it should return a kushki error K006", (done: Mocha.Done) => {
      setTimeoutVars(30000);
      set(charge_response_mock, "response_code", "57");
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err.code).to.be.equal("006");
          expect(err.getMessage()).to.be.equal(error_message_response_honor);
          expect(get(err.getMetadata(), "response_text")).to.be.equal(
            error_message_response_honor
          );
          done();
        },
      });
    });

    it("Fis when make a charge, it should return differ kushki", (done: Mocha.Done) => {
      setTimeoutVars(30000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .throws(new Error("Fis Error"));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err.getMessage()).eq("Transacción declinada.");
          done();
        },
      });
    });

    it("Fis should throw error when its time out", (done: Done) => {
      setTimeoutVars(30);
      const tables: TimeoutTransactionsTables = {
        fis: "fis-timeout-table",
        redeban: "redeban-timeout-table",
        transbank: "transbank-timeout-table",
      };

      process.env.TIMEOUT_TRANSACTIONS_TABLES = JSON.stringify(tables);

      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(charge_response_mock).pipe(delay(400)));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].charge(charge_request_mock).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.equal(ERRORS.E500.message);
          expect(put_stub).to.have.been.calledOnce;
          expect(put_stub.args[0][0].transactionReference).to.be.equal(
            "124asdsa123asdk123131"
          );
          expect(charge_stub).calledOnce;
          done();
        },
      });
    });
  });

  describe("preAuthorization Fis method", () => {
    let pre_auth_fis_request_mock: ChargeInput;
    let pre_auth_response_mock: AurusResponse;
    const trx_reference: string = "12345678900987654321";

    beforeEach(() => {
      sandbox = createSandbox();
      setTimeoutVars(30000);
      CONTAINER.snapshot();
      CONTAINER.bind(CORE.LambdaContext).toConstantValue({});

      pre_auth_fis_request_mock = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "555176247343",
          merchantId: "1234567890",
        },
        contactDetails: {
          documentNumber: "1900123456",
          documentType: "CC",
          email: "mi@email.com",
          firstName: "Mike",
          lastName: "Zq",
        },
        currentMerchant: {
          merchant_name: "testing",
          public_id: "123456789",
          whiteList: true,
        },
        currentToken: {
          amount: 123,
          bin: "424242",
          created: 65191827272,
          currency: "BRL",
          id: "id",
          ip: "127.0.0.1",
          lastFourDigits: "4242",
          maskedCardNumber: "424242XXXXXX4242",
          merchantId: "0987654321",
          transactionReference: trx_reference,
        },
        event: {
          amount: {
            iva: 0,
            subtotalIva: 123,
            subtotalIva0: 0,
          },
          tokenId: "abcdefghijklmnopqrstuvwxyz",
          usrvOrigin: UsrvOriginEnum.CARD,
        },
        plccInfo: { flag: "" },
        processor: {
          category_model: CategoryTypeEnum.GATEWAY,
          private_id: "11223344",
          processor_name: "name processor",
          public_id: "44332211",
          sub_mcc_code: "8999",
        },
        ruleInfo: {
          ip: "127.0.0.0.1",
          maskedCardNumber: "555555XXXXXX4444",
          user_agent: "myUserAgent",
        },
        transactionType: "preAuthorization",
      });

      pre_auth_response_mock = Mock.of<AurusResponse>({
        response_code: success_response_code,
        response_text: get(FS_ERRORS[`FS8`], "message", ""),
        transaction_reference: trx_reference,
      });

      mockDynamoGateway(undefined, undefined);
    });
    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    function commonSuccessExpectFisPreAuth(done: Mocha.Done): void {
      const pre_auth_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockLambdaGateway(pre_auth_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[10].preAuthorization(pre_auth_fis_request_mock).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.transaction_reference).to.be.equal(trx_reference);
          expect(pre_auth_stub).to.have.been.calledOnce;
          expect(pre_auth_stub.args[0][1]["3DS"]).to.be.undefined;
          expect(pre_auth_stub.args[0][1].is3DS).to.be.false;
          expect(
            pre_auth_stub.args[0][1].processorInfo.categoryModel
          ).to.be.eqls(CategoryTypeEnum.GATEWAY);
          expect(pre_auth_stub.args[0][1].processorInfo.username).to.be.empty;
          expect(pre_auth_stub.args[0][1].processorInfo.dynamicMcc).to.be.eqls(
            pre_auth_fis_request_mock.processor.sub_mcc_code
          );
          done();
        },
      });
    }

    it("When call a preAuthorization fis method without, it should be success", (done: Mocha.Done) => {
      commonSuccessExpectFisPreAuth(done);
    });

    it("Fis when make a preAuth, it should return a kushki error K006", (done: Mocha.Done) => {
      set(pre_auth_response_mock, "response_code", "8");
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(pre_auth_response_mock));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].preAuthorization(pre_auth_fis_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err.code).to.be.equal("006");
          expect(err.getMessage()).to.be.equal(error_message_response_honor);
          done();
        },
      });
    });

    it("Fis when make a preAuth, it should return differ kushki", (done: Mocha.Done) => {
      const charge_stub: SinonStub = sandbox
        .stub()
        .throws(new Error("Fis Error"));

      mockLambdaGateway(charge_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[10].preAuthorization(pre_auth_fis_request_mock).subscribe({
        error: (err: AurusError): void => {
          expect(err.getMessage()).eq(error_message_response);
          done();
        },
      });
    });
  });

  describe("Methot processors error", () => {
    let services: IProviderService[];
    let invoke_stub: SinonStub;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
      invoke_stub = sandbox.stub().returns(of(true));
      mockLambdaGateway(invoke_stub);

      token_stub = sandbox.stub().throws(new Error("Aurus Error"));

      CONTAINER.unbind(IDENTIFIERS.CardGateway);
      CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
        Mock.of<ICardGateway>({
          getAurusToken: token_stub,
        })
      );
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Mocha.Done) => {
      services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      services[CardProviderIndexEnum.Fis]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (error: KushkiError): void => {
            testMethodError(error, done);
          },
        });
    });
    it("should throw K041 error when the method validateAccount is not supported by the processor Redeban", (done: Mocha.Done) => {
      services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      services[CardProviderIndexEnum.Fis]
        .validateAccount(undefined, undefined)
        .subscribe({
          error: (error: KushkiError): void => {
            testMethodError(error, done);
          },
        });
    });
  });

  describe("tokens Method", () => {
    it("Fis should make a tokens", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Fis].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
    it("Fis should make a tokens - on Aurus error", (done: Done) => {
      token_stub = sandbox.stub().throws(new Error("Aurus Error"));
      mockAurus();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.Fis].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
  });

  describe("capture Method", () => {
    const fake_trx_reference: string = "fakeTrxReference";
    const fake_merchant_id: string = "fakeMerchantId";
    let provider_services: IProviderService[];
    let capture_request: CaptureInput;
    let capture_response_mock: AurusResponse;
    let trx_reference: string;
    let fake_amount: Amount;

    beforeEach(() => {
      trx_reference = "124asdsa123asdk1231356";
      sandbox = createSandbox();
      CONTAINER.snapshot();
      fake_amount = {
        currency: "BRL",
        extraTaxes: {
          agenciaDeViaje: 0,
          iac: 0,
          propina: 0,
          tasaAeroportuaria: 0,
        },
        ice: 0,
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
      };
      capture_request = Mock.of<CaptureInput>({
        body: {
          amount: fake_amount,
          ticketNumber: "ticketNumber",
        },
        merchantId: fake_merchant_id,
        processor: {
          created: 1613149635690,
          merchant_id: "merchant_id",
          private_id: "private_id",
          processor_name: "processor_name",
          processor_type: "processor_type",
          public_id: "public_id",
        },
        transaction: {
          approval_code: "approval_code",
          approved_transaction_amount: 0,
          bin_card: "bin_card",
          card_holder_name: "card_holder_name",
          created: 1613149173701,
          currency_code: "BRL",
          iva_value: 0,
          last_four_digits: "7890",
          merchant_id: "merchant_id",
          merchant_name: "merchant_name",
          payment_brand: "payment_brand",
          processor_bank_name: "processor_bank_name",
          processor_id: "processor_id",
          processor_name: ProcessorEnum.FIS,
          recap: "recap",
          request_amount: 0,
          subtotal_iva: 0,
          subtotal_iva0: 0,
          sync_mode: "api",
          ticket_number: "ticket_number",
          transaction_id: "transaction_id",
          transaction_reference: "transaction_reference",
          transaction_status: "transaction_status",
          transaction_type: "transaction_type",
        },
        trxReference: fake_trx_reference,
      });
      capture_response_mock = Mock.of<AurusResponse>({
        response_code: success_response_code,
        response_text: get(FS_ERRORS[`FS8`], "message", ""),
        transaction_reference: trx_reference,
      });

      put_stub = sandbox.stub().returns(of(true));
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
        })
      );
    });

    afterEach(() => {
      setTimeoutVars(30000);
      sandbox.restore();
      CONTAINER.restore();
    });

    it("It should succeed when calling fis capture capture", (done: Done) => {
      setTimeoutVars(30000);

      set(capture_response_mock, "response_code", success_response_code);
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(capture_response_mock));

      mockLambdaGateway(charge_stub);
      provider_services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      provider_services[10].capture(capture_request).subscribe({
        next: (rs: AurusResponse): void => {
          expect(rs.response_code).to.be.eqls(success_response_code);
          expect(rs.transaction_reference).to.be.equal(
            "124asdsa123asdk1231356"
          );
          done();
        },
      });
    });
    it("It should failed when calling fis capture capture, return error response equals to 10", (done: Done) => {
      setTimeoutVars(30000);

      set(capture_response_mock, "response_code", "10");
      const charge_stub: SinonStub = sandbox
        .stub()
        .returns(of(capture_response_mock));

      mockLambdaGateway(charge_stub);
      provider_services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      provider_services[10].capture(capture_request).subscribe({
        error: (errorKs: AurusError): void => {
          expect(errorKs.code).to.be.equal("006");
          expect(errorKs.getMessage()).to.be.equal(
            error_message_response_honor
          );
          done();
        },
      });
    });
    it("It should failed when calling fis capture capture, return error response different to fisErrorEnum", (done: Done) => {
      setTimeoutVars(30000);
      const charge_stub: SinonStub = sandbox
        .stub()
        .throws(new Error("Fis Error"));

      mockLambdaGateway(charge_stub);
      provider_services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      provider_services[10].capture(capture_request).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.equal(error_message_response);
          done();
        },
      });
    });
  });
});
