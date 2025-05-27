/**
 * AcqGateway Unit Tests
 */
import { Tracer } from "@aws-lambda-powertools/tracer";
import {
  IDENTIFIERS as CORE,
  ILambdaGateway,
  KushkiError,
  StatusCodeEnum,
} from "@kushki/core";
import { IDENTIFIERS as CORE_ID } from "@kushki/core/lib/constant/Identifiers";
import { expect, use } from "chai";
import { BusinessProductID } from "constant/BusinessProductID";
import { IDENTIFIERS } from "constant/Identifiers";
import {
  AcqCodeResponseEnum,
  AcqStatusResponseEnum,
} from "infrastructure/AcqEnum";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum, CountryIsoEnum } from "infrastructure/CountryEnum";
import { ErrorAcqCode, ERRORS_ACQ } from "infrastructure/ErrorAcqEnum";
import { ErrorMapAcqEnum } from "infrastructure/ErrorMapAcqEnum";
import { ResponseTextEnum } from "infrastructure/ResponseTextEnum";
import { SchemaEnum } from "infrastructure/SchemaEnum";
import { SubscriptionTriggerEnum } from "infrastructure/SubscriptionEnum";
import {
  TransactionStatusEnum,
  TRX_OK_RESPONSE_CODE,
} from "infrastructure/TransactionStatusEnum";
import { TransactionTypeAcqEnum } from "infrastructure/TransactionTypeAcqEnum";
import { cloneDeep, set, unset } from "lodash";
import { Done } from "mocha";
import { IAcqGateway } from "repository/IAcqGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { of } from "rxjs";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AcqCaptureRequest } from "types/acq_capture_request";
import { AcqChargeRequest } from "types/acq_charge_request";
import { AcqInvokeFullResponse } from "types/acq_invoke_full_response";
import { AcqInvokeResponse } from "types/acq_invoke_response";
import { AcqRequest } from "types/acq_request";
import { AcqResponse } from "types/acq_response";
import { AcqSubscriptionChargeRequest } from "types/acq_subscription_charge_request";
import {
  AcqValidateAccountRequest,
  SubMerchantDynamo,
} from "types/acq_validate_account_request";
import { AuthorizerContext } from "types/authorizer_context";
import { BinInfoAcq } from "types/bin_info_acq";
import { Deferred, PreAuthRequest } from "types/preauth_request";
import { Transaction } from "types/transaction";

const ERROR: string = "Ha ocurrido un error inesperado.";
const MISSING_PARAMETERS_ERROR_CODE: string = "K601";

use(sinonChai);

describe("Acq Gateway", () => {
  let gateway: IAcqGateway;
  let sandbox: SinonSandbox;
  let bin_info: BinInfoAcq;
  let tracer: SinonStub;
  const transaction_reference = "5c55e964-d1e2-410d-8e7c-e3659f7b1e3c";
  const vault_token = "ASSD032AWE===";
  const fake_brand_product_code: string = "testBrandProductCode";
  const fake_subscription_id: string = "fakeID";
  const old_env: NodeJS.ProcessEnv = process.env;
  const bin_info_country_path: string = "binInfo.country";
  const sub_merchant_country_ans_path: string = "subMerchant.countryAns";

  beforeEach(() => {
    process.env = old_env;
    process.env.ENV_VARS = JSON.stringify({ declineZeroAmountTrx: true });
    bin_info = {
      bank: "CITIBANAMEX",
      bin: "405306",
      brand: "VISA",
      brandProductCode: fake_brand_product_code,
      country: "MEX",
      type: "credit",
    };
  });

  function mockLambdaInvoke(invokeFunction: SinonStub) {
    CONTAINER.unbind(CORE_ID.LambdaGateway);
    CONTAINER.bind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction,
      })
    );
  }

  function responseSuccess(res: object, acqInvokeStub: SinonStub) {
    expect(res).to.be.have.keys([
      "approval_code",
      "kushki_response",
      "message_fields",
      "reference_number",
      "transaction_reference",
      "transaction_status",
      "transaction_type",
    ]);

    const deferred = acqInvokeStub.args[0][1].body.deferred;

    expect(deferred).to.haveOwnProperty("credit_type");
    expect(deferred).to.haveOwnProperty("grace_months");
    expect(deferred).to.haveOwnProperty("months");
  }

  function responseError(
    acqInvokeStub: SinonStub,
    err: KushkiError,
    done: Mocha.Done
  ) {
    expect(acqInvokeStub).to.have.been.calledOnce;
    expect(err.code).to.be.eq("K002");
    expect(err.getMessage()).to.be.eq(ERROR);
    expect(err.getMetadata()).to.be.deep.equal({});
    done();
  }

  function responseErrorDeclined(
    acqInvokeStub: SinonStub,
    error: KushkiError,
    done: Mocha.Done
  ) {
    expect(acqInvokeStub).to.have.been.calledOnce;
    expect(error.code).to.be.eq("K006");
    expect(error.getMessage()).to.be.eq(ResponseTextEnum.ACQ_DECLINED);
    expect(error.getMetadata()).to.be.deep.equal({
      kushki_response: {
        code: "000",
        message: "",
      },
      message_fields: {
        f38: "",
        f39: "",
      },
      reference_number: "",
      transaction_reference: "",
      transaction_status: "declined",
      transaction_type: "",
    });
    done();
  }

  function getSubMerchant(): SubMerchantDynamo {
    const sub_merchant = Mock.of<SubMerchantDynamo>({
      address: "address",
      city: "city",
      code: "code",
      countryAns: "countryAns",
      facilitatorName: "facilitatorName",
      idAffiliation: "idAffiliation",
      idCompany: "idCompany",
      idFacilitator: "idFacilitator",
      mcc: "mcc",
      socialReason: "socialReason",
      softDescriptor: "softDescriptor",
      zipCode: "zipCode",
    });

    set(sub_merchant, "isInRequest", true);

    return sub_merchant;
  }

  function getAuthorizerContext(): AuthorizerContext {
    return {
      credentialAlias: "test",
      credentialId: "test",
      hierarchyConfig: {
        processing: { basicInfo: "test" },
      },
      merchantId: "test",
      privateMerchantId: "test",
      publicMerchantId: "test",
    };
  }

  function mockDynamoGtw(stubbedQuery: SinonStub) {
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        query: stubbedQuery,
      })
    );
  }

  function stubGetItem(trx?: Transaction): SinonStub {
    return sandbox
      .stub()
      .onFirstCall()
      .returns(of([trx]));
  }

  function buildBaseDynamoTransaction(): Transaction {
    return Mock.of<Transaction>({
      amount: {
        currency: "USD",
        extraTaxes: {
          agenciaDeViaje: 10,
          iac: 10,
          propina: 10,
          tasaAeroportuaria: 10,
        },
        ice: 60,
        iva: 40,
        subtotalIva: 400,
        subtotalIva0: 0,
      },
      processor_transaction_id:
        "some-processor-transaction-id-from-db-transaction",
    });
  }

  describe("validateAccount", () => {
    const direct_integration_authorization_lambda_name: string =
      "usrv-acq-ecommerce-ci-directIntegrationAuthorization";

    function buildBaseRequest(): AcqValidateAccountRequest {
      return {
        authorizerContext: getAuthorizerContext(),
        binInfo: bin_info,
        card: {
          bin: "4242",
          brand: "VISA",
          holderName: "Test test",
          lastFourDigits: "4242",
          type: "CREDIT",
        },
        currency: "USD",
        maskedCardNumber: "12312xx12",
        merchantId: "200023123123",
        merchantName: "merchant_name",
        processorBankName: "bank-processor",
        processorId: "200000003112",
        processorMerchantId: "1234",
        subMerchant: { ...getSubMerchant() },
        tokenType: "transaction",
        transactionReference: transaction_reference,
        vaultToken: vault_token,
      };
    }

    function buildAcqResponse(
      status: AcqStatusResponseEnum = AcqStatusResponseEnum.APPROVED
    ): AcqInvokeFullResponse {
      return {
        body: {
          transaction_reference,
          approval_code: "000",
          kushki_response: {
            code: "000",
            message: "",
          },
          message_fields: {
            f38: "1213456",
            f39: "00",
          },
          reference_number: "129120000487",
          transaction_status: status,
          transaction_type: "validate-card",
        },
      };
    }

    function expectK601Error(
      acqGateway: IAcqGateway,
      request: AcqValidateAccountRequest,
      done: Done
    ) {
      acqGateway.validateAccount(request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eq(MISSING_PARAMETERS_ERROR_CODE);
          done();
        },
      });
    }

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
      process.env.USRV_STAGE = "ci";
      sandbox.stub(Tracer.prototype, "putAnnotation");
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("should handle a transaction declined by acq", (done: Done) => {
      const acq_response = buildAcqResponse(AcqStatusResponseEnum.DECLINED);
      const acq_invoke_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(of(acq_response));
      const base_request: AcqValidateAccountRequest = buildBaseRequest();

      unset(base_request, "binInfo.bank");
      mockLambdaInvoke(acq_invoke_stub);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.validateAccount(base_request).subscribe({
        error: (err: KushkiError) => {
          expect(err.getMessage()).to.be.equal(ResponseTextEnum.ACQ_DECLINED);
          done();
        },
        next: (value: AcqInvokeResponse) => {
          expect(value).to.not.exist;
          done();
        },
      });
    });

    it("should handle some error, thrown when sending to acq", (done: Done) => {
      const acq_invoke_stub = sandbox
        .stub()
        .onFirstCall()
        .throws(new KushkiError(ERRORS_ACQ.E002));

      mockLambdaInvoke(acq_invoke_stub);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.validateAccount(buildBaseRequest()).subscribe({
        error: (err: KushkiError) => {
          expect(err.getMessage()).to.be.equal(
            ResponseTextEnum.ACQ_UNREACHABLE_PROCESSOR
          );
          done();
        },
        next: (value: AcqInvokeResponse) => {
          expect(value).to.not.exist;
          done();
        },
      });
    });

    it("should return the response from the acquirer gateway", (done: Done) => {
      const acq_invoke_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(of(buildAcqResponse()));

      mockLambdaInvoke(acq_invoke_stub);

      const request = buildBaseRequest();

      request["3DS"] = {
        cavv: "some-cavv",
        eci: "some-eci",
        xid: "some-xid",
      };

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.validateAccount(request).subscribe({
        error: (err) => {
          expect(err).to.not.exist;
          done();
        },
        next: (value: AcqInvokeResponse) => {
          expect(value.transaction_status).to.be.equal(
            AcqStatusResponseEnum.APPROVED
          );
          expect(value.transaction_type).to.be.equal(
            TransactionTypeAcqEnum.CARD_VALIDATION
          );
          expect(acq_invoke_stub).to.have.been.calledOnce;
          expect(acq_invoke_stub).to.have.been.calledWithMatch(
            direct_integration_authorization_lambda_name,
            {
              body: {
                amount: {
                  currency: "USD",
                  ice: 0,
                  iva: 0,
                  subtotal_iva: 0,
                  subtotal_iva0: 0,
                },
                bin_info: {
                  bank: "CITIBANAMEX",
                  bin: "405306",
                  brand: "VISA",
                  brandProductCode: fake_brand_product_code,
                  country: "MEX",
                  type: "credit",
                },
                client_transaction_id: "5c55e964-d1e2-410d-8e7c-e3659f7b1e3c",
                full_response: "",
                merchant_id: "200000003112",
                three_ds: {
                  authentication_data: "",
                  CAVV: "some-cavv",
                  directory_server_transactionID: "",
                  ECI: "some-eci",
                  XID: "some-xid",
                },
                token_type: "transaction",
                transaction_mode: "Authorization",
                transaction_type: "validate-card",
                vault_token: "ASSD032AWE===",
              },
            }
          );

          done();
        },
      });
    });

    it("Should return a KushkiError E601 in validate when companyId and facilitatorId is not empty and some value inside submerchant is empty", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox
        .stub()
        .returns(of(buildAcqResponse));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      const request: AcqValidateAccountRequest = buildBaseRequest();

      request.subMerchant = { ...getSubMerchant() };
      set(request, sub_merchant_country_ans_path, "");
      expectK601Error(gateway, request, done);
    });
    it("Should return a KushkiError E601 in validate when is Prosa and sub merchant doesn't have a cityCode", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox
        .stub()
        .returns(of(buildAcqResponse));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      const request: AcqValidateAccountRequest = buildBaseRequest();

      set(request, bin_info_country_path, CountryIsoEnum.MEX);
      set(request, SchemaEnum.merchant_country, CountryEnum.MEXICO);
      expectK601Error(gateway, request, done);
    });
  });

  describe("charge Method", () => {
    let request: AcqChargeRequest;
    let response: AcqInvokeFullResponse;
    let acq_invoke_stub: SinonStub;
    let query_stub: SinonStub;
    let response_with_franchise_time: AcqInvokeFullResponse;

    interface ITestRequestOptions {
      isInternalMigrated: boolean;
      hasCvv2: boolean;
      isFromProsa: boolean;
    }

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
      request = {
        authorizerContext: getAuthorizerContext(),
        binInfo: bin_info,
        card: {
          amount: {
            currency: "USD",
            extraTaxes: {
              agenciaDeViaje: 0,
              iac: 0,
              propina: 0,
              tasaAeroportuaria: 0,
            },
            ice: 0,
            iva: 0,
            subtotalIva: 10,
            subtotalIva0: 0,
          },
          bin: "4242",
          brand: "Visa",
          holderName: "",
          lastFourDigits: "4242",
          type: "CREDIT",
        },
        cardId: "card test",
        citMit: "C101",
        deferred: {
          creditType: "",
          graceMonths: "",
          months: "",
        },
        isBlockedCard: true,
        isCardValidation: false,
        isDeferred: false,
        isSubscription: false,
        maskedCardNumber: "12312xx12",
        merchantId: "200023123123",
        merchantName: "merchant_name",
        processorBankName: "",
        processorId: "200000003112",
        processorMerchantId: "",
        terminalId: "",
        tokenType: "subscription",
        transactionReference: "",
        vaultToken: vault_token,
      };
      response = {
        body: {
          transaction_reference,
          approval_code: "53453",
          kushki_response: {
            code: "000",
            message: "",
          },
          message_fields: {
            f38: "1213456",
            f39: "00",
          },
          reference_number: "129120000487",
          transaction_status: "approved",
          transaction_type: "charge",
        },
      };
      acq_invoke_stub = sandbox.stub().onFirstCall().returns(of(response));

      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: acq_invoke_stub,
        })
      );
      tracer = sandbox.stub(Tracer.prototype, "putAnnotation");
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
      tracer.restore();
    });

    function setRequestLikeTrxMigratedOrAcq(
      requestOptions: ITestRequestOptions
    ): void {
      request.cvv2 = requestOptions.hasCvv2 ? "cvv2_test" : undefined;
      request.isSubscription = true;
      request.subscriptionTrigger = SubscriptionTriggerEnum.ON_DEMAND;
      request.processorToken = requestOptions.isInternalMigrated
        ? undefined
        : "acqToken";
      request.initialRecurrenceReference = requestOptions.isInternalMigrated
        ? undefined
        : "initialRecurrence";

      request.authorizerContext.merchantCountry = requestOptions.isFromProsa
        ? CountryEnum.MEXICO
        : CountryEnum.COLOMBIA;
    }

    function add3DsToRequest(): void {
      request["3DS"] = {
        "3ds_indicator": "test_3ds_indicator",
        acctAuthValue: "acctAuthValue_test",
        cavv: "cavv_test",
        directoryServerTrxID: "directoryServerTrxID_test",
        eci: "eci_test",
        option: 0,
        xid: "xid_test",
      };
      request.isFrictionless = true;
    }

    function assertsWhenIsUniquePayNoCof(has3Ds: boolean, done: Mocha.Done) {
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        error: () => done(),
        next: (res: AcqInvokeResponse): void => {
          expect(res).be.have.keys([
            "approval_code",
            "kushki_response",
            "message_fields",
            "reference_number",
            "transaction_reference",
            "transaction_status",
            "transaction_type",
          ]);
          expect(acq_invoke_stub.args[0][1].body.transaction_type).to.equal(
            TransactionTypeAcqEnum.CHARGE
          );
          expect(acq_invoke_stub.args[0][1].body.cvv2).to.be.eq(request.cvv2);
          expect(acq_invoke_stub.args[0][1].body.subscription_type).to.be
            .undefined;
          expect(acq_invoke_stub.args[0][1].body.is_recurrent).to.be.eq(false);

          if (has3Ds) {
            expect(acq_invoke_stub.args[0][1].body.three_ds).to.have.keys([
              "3ds_indicator",
              "CAVV",
              "ECI",
              "UCAF",
              "XID",
              "authentication_data",
              "directory_server_transactionID",
            ]);
            expect(acq_invoke_stub.args[0][1].body.is_frictionless).to.exist;
          }

          done();
        },
      });
    }

    function assertsWhenIsRecurrentPayCof(hasCvv: boolean, done: Mocha.Done) {
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        error: () => done(),
        next: (res: AcqInvokeResponse): void => {
          expect(res).be.have.keys([
            "approval_code",
            "kushki_response",
            "message_fields",
            "reference_number",
            "transaction_reference",
            "transaction_status",
            "transaction_type",
          ]);
          expect(acq_invoke_stub.args[0][1].body.transaction_type).to.equal(
            TransactionTypeAcqEnum.COF_SUBSEQUENT
          );
          expect(acq_invoke_stub.args[0][1].body.subscription_type).to.be.eq(
            SubscriptionTriggerEnum.ON_DEMAND
          );
          expect(acq_invoke_stub.args[0][1].body.is_recurrent).to.be.undefined;

          if (hasCvv) {
            expect(acq_invoke_stub.args[0][1].body.cvv2).to.be.eq("cvv2_test");
          } else {
            expect(acq_invoke_stub.args[0][1].body.cvv2).to.not.haveOwnProperty;
          }

          done();
        },
      });
    }

    it("it should return a success response when charge is called with AFT data", (done: Mocha.Done) => {
      request.isAft = true;
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        error: () => done("should not be called"),
        next: (res: AcqInvokeResponse): void => {
          expect(res).be.have.keys([
            "approval_code",
            "kushki_response",
            "message_fields",
            "reference_number",
            "transaction_reference",
            "transaction_status",
            "transaction_type",
          ]);
          expect(acq_invoke_stub.args[0][1].body.transaction_type).to.equal(
            "charge"
          );
          expect(acq_invoke_stub.args[0][1].body.merchant_id).to.be.eq(
            request.processorId
          );
          done();
        },
      });
    });

    it("it should return a success response charge type when is called subscription on demand with 3ds and cvv data", (done: Mocha.Done) => {
      request.cvv2 = "cvv2_test";
      request.isSubscription = true;
      request.processorToken = "test";
      request.subscriptionTrigger = SubscriptionTriggerEnum.ON_DEMAND;
      request["3DS"] = {
        "3ds_indicator": "test_3ds_indicator",
        acctAuthValue: "acctAuthValue_test",
        cavv: "cavv_test",
        directoryServerTrxID: "directoryServerTrxID_test",
        eci: "eci_test",
        option: 0,
        xid: "xid_test",
      };
      const stubbed_get_item: SinonStub = stubGetItem({
        ...buildBaseDynamoTransaction(),
        is_initial_cof: true,
      });
      mockDynamoGtw(stubbed_get_item);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        error: () => done("should not be called"),
        next: (res: AcqInvokeResponse): void => {
          expect(res).be.have.keys([
            "approval_code",
            "kushki_response",
            "message_fields",
            "reference_number",
            "transaction_reference",
            "transaction_status",
            "transaction_type",
          ]);
          expect(acq_invoke_stub.args[0][1].body.transaction_type).to.equal(
            "charge"
          );
          expect(acq_invoke_stub.args[0][1].body.cvv2).to.be.eq(request.cvv2);
          expect(acq_invoke_stub.args[0][1].body.three_ds).to.have.keys([
            "3ds_indicator",
            "CAVV",
            "ECI",
            "UCAF",
            "XID",
            "authentication_data",
            "directory_server_transactionID",
          ]);
          expect(acq_invoke_stub.args[0][1].body.subscription_type).to.be
            .undefined;
          expect(acq_invoke_stub.args[0][1].body.is_recurrent).to.be.eq(false);
          done();
        },
      });
    });

    it("When a subscription is internally migrated and does not have 3DS, it should return a successful charge", (done: Mocha.Done) => {
      const requestOptions: ITestRequestOptions = {
        isInternalMigrated: true,
        hasCvv2: true,
        isFromProsa: false,
      };

      setRequestLikeTrxMigratedOrAcq(requestOptions);
      assertsWhenIsUniquePayNoCof(false, done);
    });

    it("If the subscription is recurrent and contains cvv2 but not 3ds then it should return a successful COF and cvv2 must be defined", (done: Mocha.Done) => {
      const requestOptions: ITestRequestOptions = {
        isInternalMigrated: false,
        hasCvv2: true,
        isFromProsa: false,
      };

      setRequestLikeTrxMigratedOrAcq(requestOptions);

      const stubbed_get_item: SinonStub = stubGetItem({
        ...buildBaseDynamoTransaction(),
        is_initial_cof: true,
      });
      mockDynamoGtw(stubbed_get_item);

      // TODO: temp comment, isOnDemand with cvv and created in acq will be a cob
      // assertsWhenIsRecurrentPayCof(true, done);
      assertsWhenIsUniquePayNoCof(false, done);
    });

    it("If the subscription recurrent and not contains cvv2 and 3ds then it should return a successful COF and cvv2 must not be defined", (done: Mocha.Done) => {
      const requestOptions: ITestRequestOptions = {
        isInternalMigrated: false,
        hasCvv2: false,
        isFromProsa: false,
      };
      setRequestLikeTrxMigratedOrAcq(requestOptions);

      const stubbed_get_item: SinonStub = stubGetItem({
        ...buildBaseDynamoTransaction(),
        is_initial_cof: true,
      });
      mockDynamoGtw(stubbed_get_item);
      assertsWhenIsRecurrentPayCof(false, done);
    });

    it("When a subscription is internally migrated and has 3DS, it should return a successful charge", (done: Mocha.Done) => {
      const requestOptions: ITestRequestOptions = {
        isInternalMigrated: true,
        hasCvv2: true,
        isFromProsa: false,
      };

      setRequestLikeTrxMigratedOrAcq(requestOptions);
      add3DsToRequest();
      assertsWhenIsUniquePayNoCof(true, done);
    });

    it("When a subscription is created by kushki-ACQ and has 3DS, it should return a successful Charge", (done: Mocha.Done) => {
      const requestOptions: ITestRequestOptions = {
        isInternalMigrated: false,
        hasCvv2: true,
        isFromProsa: false,
      };

      setRequestLikeTrxMigratedOrAcq(requestOptions);
      add3DsToRequest();

      const stubbed_get_item: SinonStub = stubGetItem({
        ...buildBaseDynamoTransaction(),
        is_initial_cof: true,
      });

      mockDynamoGtw(stubbed_get_item);
      assertsWhenIsUniquePayNoCof(true, done);
    });

    it("When a subscriptions is from PROSA and internally migrated, it should return a successful charge", (done: Mocha.Done) => {
      const requestOptions: ITestRequestOptions = {
        isInternalMigrated: true,
        hasCvv2: true,
        isFromProsa: true,
      };
      setRequestLikeTrxMigratedOrAcq(requestOptions);

      const stubbed_get_item: SinonStub = stubGetItem({
        ...buildBaseDynamoTransaction(),
        is_initial_cof: true,
      });
      mockDynamoGtw(stubbed_get_item);
      assertsWhenIsUniquePayNoCof(false, done);
    });

    it("When a subscriptions is from PROSA and is created by kushki-ACQ, it should return a successful charge", (done: Mocha.Done) => {
      const requestOptions: ITestRequestOptions = {
        isInternalMigrated: false,
        hasCvv2: true,
        isFromProsa: true,
      };
      setRequestLikeTrxMigratedOrAcq(requestOptions);

      const stubbed_get_item: SinonStub = stubGetItem({
        ...buildBaseDynamoTransaction(),
        is_initial_cof: true,
      });
      mockDynamoGtw(stubbed_get_item);
      assertsWhenIsUniquePayNoCof(false, done);
    });

    it("when charge called with external subscription should return success", (done: Mocha.Done) => {
      request.isDeferred = true;
      request.subMerchant = { ...getSubMerchant() };
      request.externalSubscriptionID = "testExternalSubscriptionID";
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        next: (res: AcqInvokeResponse): void => {
          responseSuccess(res, acq_invoke_stub);
          expect(
            acq_invoke_stub.args[0][1].body.bin_info.brand_product_code
          ).to.equal(request.binInfo?.brandProductCode);
          expect(
            acq_invoke_stub.args[0][1].body.sub_merchant.country_ans
          ).to.equal(request.subMerchant?.countryAns);
          expect(acq_invoke_stub.args[0][1].body.merchant_id).to.be.eq(
            request.processorId
          );
          expect(acq_invoke_stub.args[0][1].body.sub_merchant).to.not.be
            .undefined;
          expect(acq_invoke_stub.args[0][1].body.subscription_id).to.be.eq(
            request.externalSubscriptionID
          );
          expect(acq_invoke_stub.args[0][1].body.subscription_type).to.be.eq(
            "onDemand"
          );
          done();
        },
      });
    });

    it("when charge called with merchant country and bin country from Mexico should return success with submerchant", (done: Mocha.Done) => {
      const city_code: string = "001";

      request.isDeferred = true;
      request.subMerchant = { ...getSubMerchant(), cityCode: city_code };
      set(request, bin_info_country_path, CountryIsoEnum.MEX);
      set(request, SchemaEnum.merchant_country, CountryEnum.MEXICO);
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        next: (res: AcqInvokeResponse): void => {
          responseSuccess(res, acq_invoke_stub);
          expect(
            acq_invoke_stub.args[0][1].body.bin_info.brand_product_code
          ).to.equal(request.binInfo?.brandProductCode);
          expect(acq_invoke_stub.args[0][1].body.sub_merchant).not.to.be
            .undefined;
          expect(
            acq_invoke_stub.args[0][1].body.sub_merchant.city_code
          ).to.be.equals(city_code);
          done();
        },
      });
    });

    it("when charge called with merchant country and bin country from Mexico and sub merchant doesn't have cityCode then should return error", (done: Mocha.Done) => {
      request.isDeferred = true;
      request.subMerchant = { ...getSubMerchant() };
      set(request, bin_info_country_path, CountryIsoEnum.MEX);
      set(request, SchemaEnum.merchant_country, CountryEnum.MEXICO);
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq(MISSING_PARAMETERS_ERROR_CODE);
          done();
        },
      });
    });

    describe("Put Franchise Response Time annotations", () => {
      beforeEach(() => {
        response_with_franchise_time = {
          body: {
            ...response.body,
            franchise_response_time: {
              fr_message_code: "some-code",
              fr_response_time: "12312",
            },
          },
        };
        acq_invoke_stub = sandbox
          .stub()
          .onFirstCall()
          .returns(of(response_with_franchise_time));
        CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
          Mock.of<ILambdaGateway>({
            invokeFunction: acq_invoke_stub,
          })
        );
      });

      afterEach(() => {
        tracer.restore();
      });

      it("should be successfully when charge invoke response contains franchise_response_time object ", (done: Mocha.Done) => {
        request.isDeferred = true;
        gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
        gateway.charge(request).subscribe({
          next: (res: AcqInvokeResponse): void => {
            responseSuccess(res, acq_invoke_stub);
            done();
          },
        });
      });

      it("should be successful anyway when a valid charge fails to putAnnotations from franchiseResponseTimes", (done: Mocha.Done) => {
        request.isDeferred = true;
        gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
        tracer.restore();
        sandbox.stub(Tracer.prototype, "putAnnotation").throws();
        gateway.charge(request).subscribe({
          next: (res: AcqInvokeResponse): void => {
            responseSuccess(res, acq_invoke_stub);
            done();
          },
        });
      });
    });
    it("when charge called with isOCT true return success", (done: Mocha.Done) => {
      request.isOCT = true;
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        next: (res: AcqInvokeResponse): void => {
          expect(res).be.have.keys([
            "approval_code",
            "kushki_response",
            "message_fields",
            "reference_number",
            "transaction_reference",
            "transaction_status",
            "transaction_type",
          ]);
          done();
        },
      });
      expect(acq_invoke_stub.args[0][1].body.transaction_type).to.equal(
        "charge"
      );
      expect(acq_invoke_stub.args[0][1].body.business_application_id).to.equal(
        BusinessProductID.FD
      );
    });

    it("when charge called should return success on cvv2 data", (done: Mocha.Done) => {
      request.isDeferred = true;
      request.cvv2 = "1234";

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        next: (res: AcqInvokeResponse): void => {
          expect(acq_invoke_stub.args[0][1].body.cvv2).to.be.equal(
            request.cvv2
          );
          responseSuccess(res, acq_invoke_stub);
          done();
        },
      });
    });

    it("should call charge method, error 006 controled error", (done: Mocha.Done) => {
      request.isDeferred = true;
      const response_error: object = {
        body: {
          kushki_response: {
            code: "000",
            message: "",
          },
          message_fields: {
            f38: "",
            f39: "",
          },
          reference_number: "",
          transaction_reference: "",
          transaction_status: "declined",
          transaction_type: "",
        },
      };

      acq_invoke_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(of(response_error));
      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: acq_invoke_stub,
        })
      );

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          responseErrorDeclined(acq_invoke_stub, err, done);
        },
      });
    });

    it("should call charge method, error 002 controled error", (done: Mocha.Done) => {
      const response_error: object = {
        body: {
          kushki_response: {
            Code: "000",
            Message: "",
          },
          reference_number: "",
          transaction_reference: "",
          transaction_status: "declineda",
          transaction_type: "",
        },
      };

      acq_invoke_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(of(response_error));
      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: acq_invoke_stub,
        })
      );

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          responseError(acq_invoke_stub, err, done);
        },
      });
    });

    it("Should return a KushkiError E601 in charge when companyId and facilitatorId is not empty and some value inside submerchant is empty", (done: Mocha.Done) => {
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      request.subMerchant = { ...getSubMerchant() };
      set(request, "subMerchant.mcc", "");
      gateway.charge(request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eq("K601");
          done();
        },
      });
    });

    it("when it's an external subscription, it should send is_external_subscription as true in lambda payload", (done: Mocha.Done) => {
      request.externalSubscriptionID = "testExternalSubscriptionID";

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        next: (): void => {
          expect(acq_invoke_stub.args[0][1].body.is_external_subscription).to.be
            .true;
          done();
        },
      });
    });

    it("when it isn't an external subscription, it should send is_external_subscription as false in lambda payload", (done: Mocha.Done) => {
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        next: (): void => {
          expect(acq_invoke_stub.args[0][1].body.is_external_subscription).to.be
            .false;
          done();
        },
      });
    });

    it("should return error E600 when amount is 0 and isCardValidation is false in charge", (done: Mocha.Done) => {
      request.card.amount = {
        currency: "USD",
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
        ice: 0,
        extraTaxes: {
          agenciaDeViaje: 0,
          iac: 0,
          propina: 0,
          tasaAeroportuaria: 0,
        },
      };
      request.isCardValidation = false;
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.eqls("K600");
          expect(err.getMessage()).to.eqls(ERRORS_ACQ.E600.message);
          done();
        },
        next: done,
      });
    });

    it("should NOT return error E600 when amount is 0 but isCardValidation is true in charge", (done: Mocha.Done) => {
      request.card.amount = {
        currency: "USD",
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
        ice: 0,
        extraTaxes: {
          agenciaDeViaje: 0,
          iac: 0,
          propina: 0,
          tasaAeroportuaria: 0,
        },
      };
      request.isCardValidation = true;
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request).subscribe({
        next: () => done(),
        error: (err) => done(err),
      });
    });
  });

  describe("subscriptionCharge Method", () => {
    let request: AcqSubscriptionChargeRequest;
    let response: AcqInvokeFullResponse;
    let acq_invoke_stub: SinonStub;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();

      request = {
        authorizerContext: getAuthorizerContext(),
        card: {
          amount: {
            currency: "MXN",
            ice: 0,
            iva: 0,
            subtotalIva: 50,
            subtotalIva0: 0,
          },
          bin: "4242",
          brand: "Visa",
          holderName: "",
          lastFourDigits: "4242",
          type: "CREDIT",
        },
        deferred: {
          creditType: "",
          graceMonths: "",
          months: "",
        },
        isDeferred: false,
        isSubscription: false,
        maskedCardNumber: "12312xx12",
        merchantId: "200023123123",
        merchantName: "merchant_name",
        processorBankName: "",
        processorId: "200000003112",
        processorMerchantId: "",
        terminalId: "",
        tokenType: "subscription",
        transactionReference: "",
        vaultToken: vault_token,
      };

      response = {
        body: {
          transaction_reference,
          approval_code: "5345345",
          kushki_response: {
            code: "000",
            message: "",
          },
          message_fields: {
            f38: "",
            f39: "",
          },
          reference_number: "129120000487",
          transaction_status: "approved",
          transaction_type: "charge",
        },
      };

      acq_invoke_stub = sandbox.stub().onFirstCall().returns(of(response));

      CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: acq_invoke_stub,
        })
      );
      sandbox.stub(Tracer.prototype, "putAnnotation");
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("when charge called should return success response with subscription tokenType", (done: Mocha.Done) => {
      request.isSubscription = true;
      set(request, "3DS.eci", "05");
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.subscriptionCharge(request).subscribe({
        next: (res: AcqInvokeResponse): void => {
          expect(res).to.be.have.keys([
            "approval_code",
            "kushki_response",
            "message_fields",
            "reference_number",
            "transaction_reference",
            "transaction_status",
            "transaction_type",
          ]);

          const acq_invoke: AcqRequest = acq_invoke_stub.args[0][1].body;

          expect(acq_invoke).to.haveOwnProperty("three_ds");
          expect(acq_invoke.merchant_id).to.be.eq(request.processorId);
          done();
        },
      });
    });

    it("should call charge method, error 006 controled error", (done: Mocha.Done) => {
      request.isDeferred = true;
      const response_error: object = {
        body: {
          kushki_response: {
            code: "000",
            message: "",
          },
          message_fields: {
            f38: "",
            f39: "",
          },
          reference_number: "",
          transaction_reference: "",
          transaction_status: "declined",
          transaction_type: "",
        },
      };

      acq_invoke_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(of(response_error));

      CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: acq_invoke_stub,
        })
      );

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.subscriptionCharge(request).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          responseErrorDeclined(acq_invoke_stub, err, done);
        },
      });
    });

    it("should call charge method, error 002 controled error", (done: Mocha.Done) => {
      const response_error: object = {
        body: {
          kushki_response: {
            Code: "000",
            Message: "",
          },
          reference_number: "",
          transaction_reference: "",
          transaction_status: "declineda",
          transaction_type: "",
        },
      };

      acq_invoke_stub = sandbox
        .stub()
        .onFirstCall()
        .returns(of(response_error));

      CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: acq_invoke_stub,
        })
      );

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);

      gateway.subscriptionCharge(request).subscribe({
        complete: done,
        error: (err: KushkiError): void => {
          responseError(acq_invoke_stub, err, done);
        },
      });
    });
  });

  describe("PreAuthorization Method", () => {
    let pre_auth_request: PreAuthRequest;
    let acq_response: AcqInvokeFullResponse;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();

      pre_auth_request = {
        authorizerContext: getAuthorizerContext(),
        binInfo: bin_info,
        card: {
          amount: {
            currency: "USD",
            iva: 0,
            subtotalIva: 123,
            subtotalIva0: 0,
          },
          bin: "4242",
          brand: "visa",
          holderName: "testing Test",
          lastFourDigits: "4242",
          months: 0,
          type: "CREDIT",
        },
        isDeferred: false,
        isSubscription: false,
        maskedCardNumber: "121212xxx",
        merchantId: "1234567890",
        merchantName: "test",
        processorBankName: "bank test",
        processorId: "2376387",
        processorMerchantId: "09282393739",
        subscriptionId: fake_subscription_id,
        terminalId: "KushkiTerminal",
        tokenType: "transaction",
        citMit: "C101",
        transactionReference: "abcd-128736-dgiut478",
        vaultToken: "jhafuyst897345tduigf8o495t09gdft89gbt748tv9",
      };

      acq_response = {
        body: {
          approval_code: "4543534",
          kushki_response: {
            code: "000",
            message: TransactionStatusEnum.APPROVAL,
          },
          message_fields: {
            f38: "1213456",
            f39: "00",
          },
          reference_number: "121212",
          transaction_reference: "1212121",
          transaction_status: "approved",
          transaction_type: "PREAUTHORIZATION",
        },
      };
      sandbox.stub(Tracer.prototype, "putAnnotation");
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("Should preAuthorize a transaction successfully", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      pre_auth_request.subMerchant = { ...getSubMerchant() };
      delete pre_auth_request.citMit;

      gateway.preAuthorization(pre_auth_request).subscribe({
        next: (res: AcqResponse) => {
          expect(res.kushki_response.code).to.be.eq("000");
          expect(response_stub).to.be.calledOnce;
          expect(response_stub.args[0][1].body.merchant_id).to.be.eq(
            pre_auth_request.processorId
          );
          expect(response_stub.args[0][1].body.subscription_id).to.be.eq(
            pre_auth_request.subscriptionId
          );
          expect(
            response_stub.args[0][1].body.sub_merchant.country_ans
          ).to.equal(pre_auth_request.subMerchant!.countryAns);
          done();
        },
      });
    });

    it("Should preAuthorize a transaction successfully when is Prosa and sub merchant has cityCode", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));
      const city_code: string = "123";

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      pre_auth_request.subMerchant = {
        ...getSubMerchant(),
        cityCode: city_code,
      };
      set(pre_auth_request, bin_info_country_path, CountryIsoEnum.MEX);
      set(pre_auth_request, SchemaEnum.merchant_country, CountryEnum.MEXICO);

      gateway.preAuthorization(pre_auth_request).subscribe({
        next: (res: AcqResponse) => {
          expect(res.kushki_response.code).to.be.eq(TRX_OK_RESPONSE_CODE);
          expect(response_stub).to.be.calledOnce;
          expect(
            response_stub.args[0][1].body.sub_merchant.city_code
          ).to.be.equals(city_code);
          done();
        },
      });
    });

    it("when preAuthorize called with companyId and facilitatorId empty should return success without submerchant", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      pre_auth_request.subMerchant = { ...getSubMerchant() };
      pre_auth_request.subMerchant.idCompany = "";
      pre_auth_request.subMerchant.idFacilitator = "";
      pre_auth_request.externalSubscriptionID = "testExternalSubscriptionID";

      gateway.preAuthorization(pre_auth_request).subscribe({
        next: (res: AcqResponse) => {
          expect(res.kushki_response.code).to.be.eq("000");
          expect(response_stub).to.be.calledOnce;
          expect(response_stub.args[0][1].body.sub_merchant).to.be.undefined;
          expect(response_stub.args[0][1].body.subscription_id).to.be.eq(
            pre_auth_request.externalSubscriptionID
          );
          done();
        },
      });
    });

    it("Should preAuthorize a transaction with request with deferred, 3ds and without cvv successfully", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));
      const deferred: Deferred = {
        creditType: "test type",
        graceMonths: "03",
        months: 3,
      };

      mockLambdaInvoke(response_stub);
      pre_auth_request["3DS"] = {
        cavv: "1111",
        eci: "21212",
        xid: "13131",
      };
      pre_auth_request.isDeferred = true;
      pre_auth_request.isSubscription = true;
      pre_auth_request.tokenType = "subscription";

      pre_auth_request.card.deferred = deferred;
      set(pre_auth_request, "deferred", deferred);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.preAuthorization(pre_auth_request).subscribe({
        next: (res: AcqResponse) => {
          expect(response_stub.args[0][1].body.deferred).to.be.deep.equal({
            credit_type: "test type",
            grace_months: "03",
            months: "03",
          });
          expect(res.kushki_response.code).to.be.eq("000");
          done();
        },
      });
    });

    it("Should return a acq error on preauthorization", (done: Mocha.Done) => {
      acq_response.body.kushki_response.code = "01";
      acq_response.body.kushki_response.message = ResponseTextEnum.ACQ_REJECTED;
      acq_response.body.transaction_status = "declined";
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));

      mockLambdaInvoke(response_stub);

      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.preAuthorization(pre_auth_request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equal("K006");
          expect(err.getMessage()).to.be.equal("Transacción Declinada");
          done();
        },
      });
    });

    it("Should return a KushkiError 500", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox
        .stub()
        .throws(new KushkiError(ERRORS_ACQ.E500));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.preAuthorization(pre_auth_request).subscribe({
        error: (error: KushkiError) => {
          expect(error.getMessage()).to.be.equal("Procesador Inalcanzable");
          expect(error.code).to.be.equal("K500");
          done();
        },
      });
    });

    it("Should return a KushkiError 600", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox
        .stub()
        .throws(new KushkiError(ERRORS_ACQ.E600));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.preAuthorization(pre_auth_request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equal("K600");
          done();
        },
      });
    });

    it("Should return an unknown error", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox
        .stub()
        .throws({ message: "error", code: "400" });

      mockLambdaInvoke(response_stub);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.preAuthorization(pre_auth_request).subscribe({
        error: (err: object) => {
          expect(err).to.deep.equal({ message: "error", code: "400" });
          done();
        },
        next: done,
      });
    });

    it("Should return a KushkiError 200", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().throws(
        new KushkiError({
          code: "002",
          message: ERROR,
          statusCode: "700",
        })
      );

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.preAuthorization(pre_auth_request).subscribe({
        error: (err: KushkiError) => {
          expect(err.getMessage()).to.be.equal(ERROR);
          expect(err.code).to.be.equal("K002");
          done();
        },
      });
    });
    it("Should return a KushkiError E601 when is VISA and empty social reason in submerchant", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      pre_auth_request.subMerchant = { ...getSubMerchant() };
      set(pre_auth_request, "subMerchant.socialReason", "");
      gateway.preAuthorization(pre_auth_request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eq(MISSING_PARAMETERS_ERROR_CODE);
          done();
        },
      });
    });
    it("Should return a KushkiError E601 when cityCode is empty and is Prosa", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      pre_auth_request.subMerchant = { ...getSubMerchant() };
      set(pre_auth_request, bin_info_country_path, CountryIsoEnum.MEX);
      set(pre_auth_request, SchemaEnum.merchant_country, CountryEnum.MEXICO);
      gateway.preAuthorization(pre_auth_request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.eq(MISSING_PARAMETERS_ERROR_CODE);
          done();
        },
      });
    });

    it("should return error E600 when amount is 0 and isCardValidation is false in preAuthorization", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));
      mockLambdaInvoke(response_stub);
      pre_auth_request.card.amount = {
        currency: "USD",
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
        ice: 0,
        extraTaxes: {
          agenciaDeViaje: 0,
          iac: 0,
          propina: 0,
          tasaAeroportuaria: 0,
        },
      };
      pre_auth_request.isCardValidation = false;
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      gateway.preAuthorization(pre_auth_request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.eqls("K600");
          expect(err.getMessage()).to.eqls(ERRORS_ACQ.E600.message);
          done();
        },
        next: done,
      });
    });

    it("should NOT return error E600 when amount is 0 but isCardValidation is true in preAuthorization", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));
      mockLambdaInvoke(response_stub);
      pre_auth_request.card.amount = {
        currency: "USD",
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
        ice: 0,
        extraTaxes: {
          agenciaDeViaje: 0,
          iac: 0,
          propina: 0,
          tasaAeroportuaria: 0,
        },
      };
      pre_auth_request.isCardValidation = true;
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.preAuthorization(pre_auth_request).subscribe({
        next: (res: AcqResponse) => {
          expect(res.kushki_response.code).to.be.eq("000");
          done();
        },
        error: (err) => done(err),
      });
    });
  });

  describe("ReAuthorization Method", () => {
    let re_auth_request: PreAuthRequest;
    let acq_response: AcqInvokeFullResponse;
    const reference: string = "123";

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();

      re_auth_request = {
        authorizerContext: getAuthorizerContext(),
        binInfo: bin_info,
        card: {
          amount: {
            currency: "USD",
            iva: 1,
            subtotalIva: 1,
            subtotalIva0: 1,
          },
          bin: "4242",
          brand: "visa",
          holderName: "testing test",
          lastFourDigits: "4242",
          type: "CREDIT",
        },
        isDeferred: false,
        isSubscription: false,
        maskedCardNumber: "121212xxx",
        merchantId: "1234567890",
        merchantName: "test",
        processorBankName: "bank test",
        processorId: "2376387",
        processorMerchantId: "09282393739",
        terminalId: "KushkiTerminal",
        tokenType: "transaction",
        transactionReference: "abcd-128736-dgiut478",
        vaultToken: "jhafuyst897345tduigf8o495t09gdft89gbt748tv9",
      };

      acq_response = {
        body: {
          approval_code: "000",
          kushki_response: {
            code: "000",
            message: TransactionStatusEnum.APPROVAL,
          },
          message_fields: {
            f38: "1213456",
            f39: "00",
          },
          reference_number: "121212",
          transaction_reference: "1212121",
          transaction_status: AcqStatusResponseEnum.APPROVED,
          transaction_type: TransactionTypeAcqEnum.REAUTHORIZATION,
        },
      };
      sandbox.stub(Tracer.prototype, "putAnnotation");
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("Should reAuthorize a transaction successfully", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      re_auth_request.subMerchant = { ...getSubMerchant() };

      gateway.reAuthorization(re_auth_request, reference).subscribe({
        next: (res: AcqResponse) => {
          expect(res.kushki_response.code).to.be.eq(
            AcqCodeResponseEnum.SUCCESS
          );
          expect(response_stub).to.be.calledOnce;
          expect(response_stub.args[0][1].body.merchant_id).to.be.eq(
            re_auth_request.processorId
          );
          done();
        },
      });
    });

    it("Should reAuthorize a transaction with request with deferred, 3ds and without cvv successfully", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));

      mockLambdaInvoke(response_stub);
      re_auth_request["3DS"] = {
        cavv: "1111",
        eci: "21212",
        xid: "13131",
      };
      re_auth_request.isSubscription = true;
      re_auth_request.tokenType = "subscription";
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.reAuthorization(re_auth_request, reference).subscribe({
        next: (res: AcqResponse) => {
          expect(res.kushki_response.code).to.be.eq("000");
          done();
        },
      });
    });

    it("Should return a acq error on reauthorization", (done: Mocha.Done) => {
      acq_response.body.kushki_response.code = "01";
      acq_response.body.kushki_response.message = ResponseTextEnum.ACQ_REJECTED;
      const response_stub: SinonStub = sandbox
        .stub()
        .rejects(new KushkiError(ERRORS_ACQ.E600));

      mockLambdaInvoke(response_stub);

      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.reAuthorization(re_auth_request, reference).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equal(ErrorMapAcqEnum.E600);
          expect(err.getMessage()).to.be.equal("Operación Rechazada");
          done();
        },
      });
    });

    it("Should return a KushkiError 500", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox
        .stub()
        .throws(new KushkiError(ERRORS_ACQ.E500));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.reAuthorization(re_auth_request, reference).subscribe({
        error: (error: KushkiError) => {
          expect(error.getMessage()).to.be.equal(
            ResponseTextEnum.ACQ_UNREACHABLE_PROCESSOR
          );
          expect(error.code).to.be.equal(ErrorMapAcqEnum.E500);
          done();
        },
      });
    });

    it("Should return a KushkiError 600", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox
        .stub()
        .throws(new KushkiError(ERRORS_ACQ.E600));

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.reAuthorization(re_auth_request, reference).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.be.equal("K600");
          done();
        },
      });
    });

    it("Should return an unknown error", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox
        .stub()
        .throws({ message: "error", code: "400" });

      mockLambdaInvoke(response_stub);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.reAuthorization(re_auth_request, reference).subscribe({
        error: (err: object) => {
          expect(err).to.deep.equal({ message: "error", code: "400" });
          done();
        },
        next: done,
      });
    });

    it("Should return a KushkiError 200", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().throws(
        new KushkiError({
          code: "002",
          message: ERROR,
          statusCode: "700",
        })
      );

      mockLambdaInvoke(response_stub);
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);

      gateway.reAuthorization(re_auth_request, reference).subscribe({
        error: (err: KushkiError) => {
          expect(err.getMessage()).to.be.equal(ERROR);
          expect(err.code).to.be.equal(ErrorMapAcqEnum.E002);
          done();
        },
      });
    });

    it("should return error E600 when amount is 0 and isCardValidation is false in reAuthorization", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));
      mockLambdaInvoke(response_stub);
      re_auth_request.card.amount = {
        currency: "USD",
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
        ice: 0,
        extraTaxes: {
          agenciaDeViaje: 0,
          iac: 0,
          propina: 0,
          tasaAeroportuaria: 0,
        },
      };
      re_auth_request.isCardValidation = false;
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      gateway.reAuthorization(re_auth_request, reference).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.eqls("K600");
          expect(err.getMessage()).to.eqls(ERRORS_ACQ.E600.message);
          done();
        },
        next: done,
      });
    });

    it("should NOT return error E600 when amount is 0 but isCardValidation is true in reAuthorization", (done: Mocha.Done) => {
      const response_stub: SinonStub = sandbox.stub().returns(of(acq_response));
      mockLambdaInvoke(response_stub);
      re_auth_request.card.amount = {
        currency: "USD",
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
        ice: 0,
        extraTaxes: {
          agenciaDeViaje: 0,
          iac: 0,
          propina: 0,
          tasaAeroportuaria: 0,
        },
      };
      re_auth_request.isCardValidation = true;
      gateway = CONTAINER.get<IAcqGateway>(IDENTIFIERS.AcqGateway);
      gateway.reAuthorization(re_auth_request, reference).subscribe({
        next: (res: AcqResponse) => {
          expect(res.kushki_response.code).to.be.eq("000");
          done();
        },
        error: (err) => done(err),
      });
    });
  });

  describe("capture - test", () => {
    let invoke_function: SinonStub;

    const acq_response: AcqInvokeFullResponse = {
      body: {
        approval_code: "354353",
        kushki_response: {
          code: "000",
          message: "",
        },
        message_fields: {
          f38: "1213456",
          f39: "00",
        },
        reference_number: "12345",
        transaction_reference: "12345",
        transaction_status: "approved",
        transaction_type: "capture",
      },
    };

    const request: AcqCaptureRequest = {
      bin_info,
      amount: "100",
      authorizerContext: getAuthorizerContext(),
      client_transaction_id: "sdvsdv",
      transaction_reference: "qwd",
      transaction_type: "sdf",
    };

    beforeEach(() => {
      CONTAINER.snapshot();
      sandbox = createSandbox();

      invoke_function = sandbox.stub().returns(of(acq_response));
      mockLambdaInvoke(invoke_function);
      sandbox.stub(Tracer.prototype, "putAnnotation");
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
    });

    it("When capture method is called - happy, must return success response", (done: Mocha.Done) => {
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.capture(request).subscribe((data: AcqResponse) => {
        expect(data).to.deep.equal(acq_response.body);
        done();
      });
    });

    it("When capture method is called and invoke function response is failed with status code 400, must return an error with status code K600", (done: Mocha.Done) => {
      invoke_function = sandbox.stub().throws(new KushkiError(ERRORS_ACQ.E600));
      mockLambdaInvoke(invoke_function);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.capture(request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.eqls("K600");
          expect(err.getMessage()).to.eqls(ERRORS_ACQ.E600.message);
          done();
        },
        next: done,
      });
    });

    it("When capture method is called and invoke function response is failed with status code 500, must return an error with status code K500", (done: Mocha.Done) => {
      invoke_function = sandbox.stub().throws(new KushkiError(ERRORS_ACQ.E500));
      mockLambdaInvoke(invoke_function);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.capture(request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.eqls("K500");
          expect(err.getMessage()).to.eqls(ERRORS_ACQ.E500.message);
          done();
        },
        next: done,
      });
    });

    it("When capture method is called and invoke function response is failed with status code different 400 or 500, must return an error with status code K002", (done: Mocha.Done) => {
      invoke_function = sandbox.stub().throws(
        new KushkiError({
          code: ErrorAcqCode.E001,
          message: "Error",
          statusCode: StatusCodeEnum.Found,
        })
      );
      mockLambdaInvoke(invoke_function);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.capture(request).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.eqls("K002");
          expect(err.getMessage()).to.eqls(ERROR);
          done();
        },
        next: done,
      });
    });

    it("When capture method is called and invoke function response is failed with an unknown error, must return an error", (done: Mocha.Done) => {
      invoke_function = sandbox
        .stub()
        .throws({ message: "error", code: "400" });
      mockLambdaInvoke(invoke_function);

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.capture(request).subscribe({
        error: (err: object) => {
          expect(err).to.deep.equal({ message: "error", code: "400" });
          done();
        },
        next: done,
      });
    });

    it("should return an error with status code K600 when amount is 0 in capture method", (done: Mocha.Done) => {
      const zeroAmountRequest: AcqCaptureRequest = {
        ...request,
        amount: "0",
      };
      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.capture(zeroAmountRequest).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.eqls("K600");
          expect(err.getMessage()).to.eqls(ERRORS_ACQ.E600.message);
          done();
        },
        next: done,
      });
    });
  });

  describe("charge", () => {
    let original_env;
    const direct_integration_auth_lambda =
      "usrv-acq-ecommerce-ci-directIntegrationAuthorization";
    const dependent_transactions_lambda =
      "usrv-acq-ecommerce-ci-dependentTransactions";

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
      original_env = cloneDeep(process.env);
      process.env.USRV_STAGE = "ci";
      sandbox.stub(Tracer.prototype, "putAnnotation");
    });

    afterEach(() => {
      sandbox.restore();
      CONTAINER.restore();
      process.env = cloneDeep(original_env);
    });

    describe("when the request is a common charge", () => {
      it("should execute the common charge process with charge type", (done: Mocha.Done) => {
        const request = buildDeferredRequest();
        const stubbed_lambda_response = mockLambdaGtw(
          buildApprovedLambdaResponse()
        );

        unset(request, "binInfo.type");

        getAcqGateway()
          .charge(request)
          .subscribe({
            error: (err) => assertNoValue(done, err),
            next: (res: AcqInvokeResponse): void =>
              assertChargeResponse(
                done,
                stubbed_lambda_response,
                direct_integration_auth_lambda,
                res,
                (payload) => {
                  expect(payload.transaction_type).to.be.eq("charge");
                }
              ),
          });
      });
    });

    describe("when the request is cof initial", () => {
      it("should execute the common charge process with cofInitial type", (done: Mocha.Done) => {
        process.env.ENABLE_VALIDATE_CARD_SUBS = "true";
        const request = buildRequestWithCallerLambda();
        const stubbed_lambda_response = mockLambdaGtw(
          buildApprovedLambdaResponse()
        );

        getAcqGateway()
          .charge(request)
          .subscribe({
            error: (err) => assertNoValue(done, err),
            next: (res: AcqInvokeResponse): void =>
              assertChargeResponse(
                done,
                stubbed_lambda_response,
                direct_integration_auth_lambda,
                res,
                (payload) => {
                  expect(payload.transaction_type).to.be.eq(
                    TransactionTypeAcqEnum.COF_INITIAL
                  );
                }
              ),
          });
      });

      it("should execute the common charge process with validate card type", (done: Mocha.Done) => {
        process.env.ENABLE_VALIDATE_CARD_SUBS = "true";
        const request = buildRequestWithCallerLambda();
        const stubbed_lambda_response = mockLambdaGtw(
          buildApprovedLambdaResponse()
        );

        set(request, "card.amount", {
          currency: "USD",
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
        });

        getAcqGateway()
          .charge(request)
          .subscribe({
            next: (res: AcqInvokeResponse): void =>
              assertChargeResponse(
                done,
                stubbed_lambda_response,
                direct_integration_auth_lambda,
                res,
                (payload) => {
                  expect(payload.transaction_type).to.be.eq(
                    TransactionTypeAcqEnum.CARD_VALIDATION
                  );
                }
              ),
          });
      });

      function buildRequestWithCallerLambda(): AcqChargeRequest {
        const request = buildBaseRequest();

        set(request, "isCardValidation", true);
        return request;
      }
    });

    describe("when the request is cof subsequent", () => {
      describe("and there IS an original transaction on Dynamo", () => {
        describe("and the request DOES come with the amount info", () => {
          it("should use the request's amount info and start cof subsequent process", (done: Mocha.Done) => {
            const request = buildSubscriptionRequest();
            const stubbed_lambda_response = mockLambdaGtw(
              buildApprovedLambdaResponse()
            );

            const stubbed_get_item = stubGetItem({
              ...buildBaseDynamoTransaction(),
              is_initial_cof: true,
            });

            mockDynamoGtw(stubbed_get_item);

            request.isDeferred = true;
            getAcqGateway()
              .charge(request)
              .subscribe({
                error: (err) => assertNoValue(done, err),
                next: (res: AcqInvokeResponse): void => {
                  const request_amount_total = "166";
                  const expected_deferred: object = {
                    credit_type: "",
                    grace_months: "00",
                    months: "00",
                  };

                  assertChargeResponse(
                    done,
                    stubbed_lambda_response,
                    dependent_transactions_lambda,
                    res,
                    assertLambdaPayload(
                      request_amount_total,
                      SubscriptionTriggerEnum.ON_DEMAND,
                      expected_deferred
                    )
                  );
                },
              });
          });
        });

        describe("and the request does NOT come with the amount info", () => {
          it("should use the transaction's amount info and start cof subsequent process", (done: Mocha.Done) => {
            const request = buildRequestWithoutAmountInfo();
            const stubbed_lambda_response = mockLambdaGtw(
              buildApprovedLambdaResponse()
            );
            const stubbed_get_item = stubGetItem({
              ...buildBaseDynamoTransaction(),
              is_initial_cof: true,
            });

            mockDynamoGtw(stubbed_get_item);

            request.subscriptionTrigger = undefined;
            getAcqGateway()
              .charge(request)
              .subscribe({
                error: (err) => assertNoValue(done, err),
                next: (res: AcqInvokeResponse): void => {
                  const transaction_amount_total = "540";

                  assertChargeResponse(
                    done,
                    stubbed_lambda_response,
                    dependent_transactions_lambda,
                    res,
                    assertLambdaPayload(transaction_amount_total)
                  );
                },
              });
          });

          it("should make a common charge when initial cof false", (done: Mocha.Done) => {
            const request = buildSubscriptionRequest();
            const stubbed_get_item = stubGetItem({
              ...buildBaseDynamoTransaction(),
              isInitialCof: false,
            });

            delete request.citMit;
            mockLambdaGtw(buildApprovedLambdaResponse());
            mockDynamoGtw(stubbed_get_item);

            getAcqGateway()
              .charge(request)
              .subscribe({
                next: (res: AcqInvokeResponse): void => {
                  expect(res.transaction_status).to.eql("approved");
                  expect(res.approval_code).to.eql("53453");
                  done();
                },
              });
          });

          it("should process a cof subsequent trx as recurrent when the initialRecurrenceReference is present", (done: Mocha.Done) => {
            const request: AcqChargeRequest = buildSubscriptionRequest();

            request.subscriptionTrigger = undefined;
            request.initialRecurrenceReference = "xxxxx-xxxxxx-xxxxx-xxxxxx";
            request.isSubscription = false;
            const stubbed_get_item = stubGetItem({
              ...buildBaseDynamoTransaction(),
              is_initial_cof: true,
            });

            mockDynamoGtw(stubbed_get_item);
            const lambda_mock = mockLambdaGtw(buildApprovedLambdaResponse());

            getAcqGateway()
              .charge(request)
              .subscribe({
                next: (res: AcqInvokeResponse): void => {
                  expect(
                    lambda_mock.args[0][1].body.subscription_type
                  ).to.be.eq(SubscriptionTriggerEnum.ON_DEMAND);
                  expect(res.approval_code).to.eql("53453");
                  expect(res.transaction_status).to.eql("approved");
                  done();
                },
              });
          });

          it("should make a common charge when trx not found", (done: Mocha.Done) => {
            const request = buildSubscriptionRequest();
            const stubbed_get_item = stubGetItem();

            mockLambdaGtw(buildApprovedLambdaResponse());
            mockDynamoGtw(stubbed_get_item);

            getAcqGateway()
              .charge(request)
              .subscribe({
                next: (res: AcqInvokeResponse): void => {
                  expect(res).to.not.be.null;
                  expect(res.approval_code).to.eql("53453");
                  done();
                },
              });
          });
        });

        function buildRequestWithoutAmountInfo(): AcqChargeRequest {
          const request = buildSubscriptionRequest();

          unset(request.card, "amount");
          return request;
        }

        function assertLambdaPayload(
          amount: string,
          subscriptionType?: string,
          deferred?: object
        ): (string) => void {
          const expected: object = {
            amount,
            authorizerContext: getAuthorizerContext(),
            bin_info: {
              bank: "Nexi Payments U1",
              bin: "5552819200",
              brand: "MASTERCARD",
              brandProductCode: fake_brand_product_code,
              country: "PER",
              type: "debit",
            },
            client_transaction_id: "some-transaction-reference-from-request",
            merchant_id: "200000003112",
            cit_mit: "C101",
            subscription_type: subscriptionType,
            transaction_reference:
              "some-processor-transaction-id-from-db-transaction",
            transaction_type: "cofSubsequent",
          };

          if (deferred) set(expected, "deferred", deferred);

          return (payload) => {
            expect(payload).to.be.deep.equal(expected);
          };
        }
      });

      function buildSubscriptionRequest(): AcqChargeRequest {
        const request = buildBaseRequest();

        request.isSubscription = true;
        request.processorToken = "324324";
        request.subscriptionTrigger = SubscriptionTriggerEnum.ON_DEMAND;
        return request;
      }
    });

    describe("when the transaction has been declined by acq", () => {
      it("should should return an 006 error", (done: Mocha.Done) => {
        const request = buildDeferredRequest();
        const stubbed_lambda_response = mockLambdaGtw(
          buildDeclinedLambdaResponse()
        );

        getAcqGateway()
          .charge(request)
          .subscribe({
            error: (err: KushkiError): void =>
              responseErrorDeclined(stubbed_lambda_response, err, done),
            next: (response) => assertNoValue(done, response),
          });
      });

      function buildDeclinedLambdaResponse(): AcqInvokeFullResponse {
        const request = buildBaseLambdaResponse();

        request.body.transaction_status = "declined";
        request.body.transaction_type = "";
        unset(request.body, "approval_code");

        return request;
      }
    });

    describe("when acq return a transaction with unknown status", () => {
      it("should return an 002 error", (done: Mocha.Done) => {
        const acq_invoke_stub = mockLambdaGtw(
          buildTransactionWithUnknownStatus()
        );

        gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
        gateway.charge(buildBaseRequest()).subscribe({
          error: (err: KushkiError): void =>
            responseError(acq_invoke_stub, err, done),
          next: (response) => assertNoValue(done, response),
        });
      });

      function buildTransactionWithUnknownStatus(): AcqInvokeFullResponse {
        const lambda_response = buildBaseLambdaResponse();

        lambda_response.body.transaction_status = "some-unknown-status";
        return lambda_response;
      }
    });

    it("should return 011 error when bin info is invalid", (done) => {
      const request_charge: AcqChargeRequest = buildBaseRequest();

      unset(request_charge, "binInfo");

      mockLambdaGtw(buildBaseLambdaResponse());

      gateway = CONTAINER.get(IDENTIFIERS.AcqGateway);
      gateway.charge(request_charge).subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K011");
          expect(err.getMessage()).to.be.eq("Bin no válido.");
          done();
        },
        next: (response) => assertNoValue(done, response),
      });
    });

    function assertChargeResponse(
      done: Mocha.Done,
      stubbedLambdaResponse: SinonStub,
      lambdaName: string,
      response: AcqInvokeResponse,
      makeAssertionsOnLambdaPayload: (payload) => void
    ) {
      const function_name = stubbedLambdaResponse.args[0][0];
      const payload: AcqRequest = stubbedLambdaResponse.args[0][1].body;

      expect(function_name).to.be.equal(lambdaName);
      makeAssertionsOnLambdaPayload(payload);
      expect(response).to.not.be.null;

      done();
    }

    function assertNoValue(done: Mocha.Done, val: object) {
      expect(val).to.not.exist;
      done();
    }

    function getAcqGateway(): IAcqGateway {
      return CONTAINER.get(IDENTIFIERS.AcqGateway);
    }

    function buildDeferredRequest(): AcqChargeRequest {
      const request = buildBaseRequest();

      request.isDeferred = true;
      return request;
    }

    function stubLambdaResponse(response: AcqInvokeFullResponse): SinonStub {
      return stubObservableOnFirstCall(response);
    }

    function stubObservableOnFirstCall(value): SinonStub {
      return sandbox.stub().onFirstCall().returns(of(value));
    }

    function mockLambdaGtw(lambdaResponse: AcqInvokeFullResponse): SinonStub {
      const stubbed: SinonStub = stubLambdaResponse(lambdaResponse);

      CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
        Mock.of<ILambdaGateway>({
          invokeFunction: stubbed,
        })
      );

      return stubbed;
    }

    function buildBaseLambdaResponse(): AcqInvokeFullResponse {
      return {
        body: {
          approval_code: "",
          kushki_response: {
            code: "000",
            message: "",
          },
          message_fields: {
            f38: "",
            f39: "",
          },
          reference_number: "",
          transaction_reference: "",
          transaction_status: "",
          transaction_type: "charge",
        },
      };
    }

    function buildApprovedLambdaResponse(): AcqInvokeFullResponse {
      const request = buildBaseLambdaResponse();

      request.body.approval_code = "53453";
      request.body.reference_number = "129120000487";
      request.body.transaction_status = "approved";
      request.body.transaction_reference = transaction_reference;

      return request;
    }

    function buildBaseRequest(): AcqChargeRequest {
      const acq_request: AcqChargeRequest = {
        authorizerContext: getAuthorizerContext(),
        binInfo: bin_info,
        card: {
          amount: {
            currency: "USD",
            extraTaxes: {
              agenciaDeViaje: 13,
              iac: 14,
              propina: 16,
              tasaAeroportuaria: 9,
            },
            ice: 4,
            iva: 10,
            subtotalIva: 100,
            subtotalIva0: 0,
          },
          bin: "4242",
          brand: "Visa",
          holderName: "",
          lastFourDigits: "4242",
          type: "CREDIT",
        },
        citMit: "C101",
        deferred: {
          creditType: "",
          graceMonths: "",
          months: "",
        },
        isCardValidation: false,
        isDeferred: false,
        isSubscription: false,
        maskedCardNumber: "12312xx12",
        merchantId: "200023123123",
        merchantName: "merchant_name",
        processorBankName: "",
        processorId: "200000003112",
        processorMerchantId: "",
        processorToken: "asdf-1234-abcd",
        terminalId: "",
        tokenType: "subscription",
        transactionReference: "some-transaction-reference-from-request",
        vaultToken: vault_token,
      };

      set(acq_request, "binInfo", {
        bank: "Nexi Payments U1",
        bin: "5552819200",
        brand: "MASTERCARD",
        brandProductCode: fake_brand_product_code,
        country: "PER",
        type: "debit",
      });

      return acq_request;
    }
  });
});
