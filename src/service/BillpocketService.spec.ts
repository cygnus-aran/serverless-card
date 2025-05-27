import { AurusError, ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CONTAINER } from "infrastructure/Container";
import { ERRORS } from "infrastructure/ErrorEnum";
import { get } from "lodash";
import { Done } from "mocha";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IProviderService } from "repository/IProviderService";
import { of } from "rxjs";
import { delay } from "rxjs/operators";
import { ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusResponse } from "types/aurus_response";
import { AmexInfo } from "types/billpocket_charge_request";
import { BillpocketVars } from "types/billpocket_vars";
import { TokensCardResponse } from "types/tokens_card_response";

use(sinonChai);

describe("BillpocketService", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];
  let invoke_stub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(Mock.of());
  });

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
  });

  function mockLambdaGateway(invokeStub: SinonStub): void {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invokeStub,
      })
    );
  }

  describe("tokens Method", () => {
    it("should make a tokens", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[5].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
  });

  describe("charges Method", () => {
    let charge_body_request: ChargeInput;
    let charge_body_response: AurusResponse;
    let put_stub: SinonStub;
    let trx_reference: string;
    let invoke_response_stub: SinonStub;
    let billpocket_vars: BillpocketVars;

    function setBillpocketVars(billpocketVars: BillpocketVars): void {
      process.env.BILLPOCKET_VARS = JSON.stringify(billpocketVars);
    }

    function expectErrorResponse(
      responseText: string,
      kushkiError: KushkiError,
      done: Mocha.Done
    ): void {
      invoke_response_stub = sandbox.stub().throws(kushkiError);

      mockLambdaGateway(invoke_response_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[5].charge(charge_body_request).subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).eq(responseText);
          expect(get(error.getMetadata(), "response_text")).eq(responseText);
          done();
        },
      });
    }

    function mockError600(
      aurusCode: string,
      responseText: string,
      done: Mocha.Done
    ): void {
      const kushki_error: KushkiError = new KushkiError(
        ERRORS.E600,
        ERRORS.E600.message,
        {
          response_code: aurusCode,
          response_text: responseText,
        }
      );

      expectErrorResponse(responseText, kushki_error, done);
    }

    beforeEach(() => {
      billpocket_vars = {
        AMEX_DEFAULT_INFO: {
          amexCallTypId: "61",
          amexCustAddress: "default",
          amexCustBrowserTypDescTxt: "CryoWeb",
          amexCustEmailAddr: "default@gmail.com",
          amexCustFirstName: "default",
          amexCustHostServerNm: "www.criol.com.mx",
          amexCustIdPhoneNbr: "00000000",
          amexCustIPAddr: "192.168.0.1",
          amexCustLastName: "default",
          amexCustPostalCode: "123",
          amexMerSKUNbr: "CARGO",
          amexShipMthdCd: "02",
          amexShipToCtryCd: "484",
        },
        LAMBDA_CHARGE: "usrv-card-billpocket-ci-charge",
        LAMBDA_SUBS_CHARGE: "usrv-card-billpocket-ci-subsCharge",
        TABLE_TIMEOUTS: "ci-usrv-card-billpocket-timedOutTransactions",
        TIMEOUT: 15000,
      };
      setBillpocketVars(billpocket_vars);
      trx_reference = "111111111111111";
      charge_body_request = Mock.of<ChargeInput>({
        authorizerContext: {
          credentialId: "111",
          merchantId: "22222",
        },
        currentMerchant: {
          merchant_name: "merchant test",
          public_id: "1111",
          whiteList: true,
        },
        currentToken: {
          amount: 5555,
          bin: "481216",
          binInfo: {
            bank: "bank test",
            bin: "12312312",
            brand: "Visa",
            info: {},
            processor: "processor test 233",
          },
          created: 2465446455,
          currency: "USD",
          id: "435122sfdsad4224",
          ip: "192.168.1.165",
          lastFourDigits: "5689",
          maskedCardNumber: "23424XXXXXXXX5689",
          merchantId: "9787954631",
          transactionReference: trx_reference,
        },
        event: {
          amount: {
            iva: 0,
            subtotalIva: 0,
            subtotalIva0: 5555,
          },
          contactDetails: {
            email: "test@test.com",
          },
          tokenId: "sadf4654fas45f4sdfas46",
        },
        plccInfo: { flag: "" },
        processor: {
          private_id: "1412321312",
          processor_name: "processor test name",
          public_id: "121322",
        },
        transactionType: "charge",
      });
      charge_body_response = Mock.of<AurusResponse>({
        response_code: "00",
        transaction_reference: trx_reference,
      });
      put_stub = sandbox.stub().returns(of(true));
      CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
        Mock.of<IDynamoGateway>({
          put: put_stub,
        })
      );
    });

    it("should make a charge successfully.", (done: Mocha.Done) => {
      invoke_response_stub = sandbox.stub().returns(of(charge_body_response));

      mockLambdaGateway(invoke_response_stub);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[5].charge(charge_body_request).subscribe({
        next: (response: AurusResponse): void => {
          expect(invoke_response_stub).to.calledOnce;
          expect(response.response_code).to.be.eqls(
            charge_body_response.response_code
          );
          expect(response.transaction_reference).to.be.eqls(trx_reference);
          done();
        },
      });
    });

    it("should should make a charge successfully, when card brand is AMEX and subs", (done: Mocha.Done) => {
      charge_body_request.currentToken.binInfo = {
        bank: "bank test",
        bin: "12312312",
        brand: "AMERICAN EXPRESS",
        info: {},
        processor: "processor test",
      };
      charge_body_request.currentToken["3ds"] = {
        authentication: true,
        detail: {
          eci: "05",
        },
      };
      charge_body_request.currentToken.vaultToken = "1244";
      charge_body_request.event.usrvOrigin = "usrv-subscriptions";
      charge_body_request.event.processorToken = "444";
      invoke_response_stub = sandbox.stub().returns(of(charge_body_response));

      mockLambdaGateway(invoke_response_stub);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[5].charge(charge_body_request).subscribe({
        next: (): void => {
          const processor_token: string =
            invoke_response_stub.args[0][1].processorToken;

          expect(invoke_response_stub).to.calledOnce;
          expect(invoke_response_stub.args[0][1].amexInfo).not.to.be.undefined;
          expect(processor_token).to.be.eqls(
            charge_body_request.event.processorToken
          );
          done();
        },
      });
    });

    it("should should make a charge successfully, when card brand is AMEX", (done: Mocha.Done) => {
      charge_body_request.currentToken.binInfo = {
        bank: "bank test",
        bin: "12312312",
        brand: "AMERICAN EXPRESS",
        info: {},
        processor: "processor test",
      };
      invoke_response_stub = sandbox.stub().returns(of(charge_body_response));

      mockLambdaGateway(invoke_response_stub);

      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[5].charge(charge_body_request).subscribe({
        next: (response: AurusResponse): void => {
          const amex_info: AmexInfo = invoke_response_stub.args[0][1].amexInfo;

          expect(invoke_response_stub).to.calledOnce;
          expect(invoke_response_stub.args[0][1].amexInfo).not.to.be.undefined;
          expect(amex_info.amexCallTypId).to.be.eqls(
            billpocket_vars.AMEX_DEFAULT_INFO.amexCallTypId
          );
          expect(amex_info.amexCustBrowserTypDescTxt).to.be.eqls(
            billpocket_vars.AMEX_DEFAULT_INFO.amexCustBrowserTypDescTxt
          );
          expect(amex_info.amexCustHostServerNm).to.be.eqls(
            billpocket_vars.AMEX_DEFAULT_INFO.amexCustHostServerNm
          );
          expect(amex_info.amexCustIPAddr).to.be.eqls(
            billpocket_vars.AMEX_DEFAULT_INFO.amexCustIPAddr
          );
          expect(amex_info.amexMerSKUNbr).to.be.eqls(
            billpocket_vars.AMEX_DEFAULT_INFO.amexMerSKUNbr
          );
          expect(amex_info.amexShipMthdCd).to.be.eqls(
            billpocket_vars.AMEX_DEFAULT_INFO.amexShipMthdCd
          );
          expect(amex_info.amexShipToCtryCd).to.be.eqls(
            billpocket_vars.AMEX_DEFAULT_INFO.amexShipToCtryCd
          );
          expect(response.response_code).to.be.eqls(
            charge_body_response.response_code
          );
          expect(response.transaction_reference).to.be.eqls(trx_reference);
          done();
        },
      });
    });

    it("should return error 228 on timeout.", (done: Mocha.Done) => {
      billpocket_vars.TIMEOUT = 30;
      setBillpocketVars(billpocket_vars);

      invoke_response_stub = sandbox
        .stub()
        .returns(of(charge_body_response).pipe(delay(400)));

      mockLambdaGateway(invoke_response_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[5].charge(charge_body_request).subscribe({
        error: (err: AurusError): void => {
          expect(invoke_response_stub).to.calledOnce;
          expect(err.code).to.be.eqls("228");
          expect(err.getMessage()).to.be.eqls("Procesador inalcanzable");
          expect(put_stub).to.calledOnce;
          expect(put_stub.args[0][1]).to.be.eqls(
            billpocket_vars.TABLE_TIMEOUTS
          );
          done();
        },
      });
    });

    it("should make a charge, with unhandled error", (done: Done) => {
      invoke_response_stub = sandbox
        .stub()
        .throws(new Error("Unhandled Error"));

      mockLambdaGateway(invoke_response_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[5].charge(charge_body_request).subscribe({
        error: (error: Error): void => {
          expect(invoke_response_stub).to.calledOnce;
          expect(error.message).to.be.eqls("Unhandled Error");
          expect(put_stub).to.be.callCount(0);
          done();
        },
      });
    });

    it("should make a charge, with 600 kushki error and response AURUS006", (done: Done) => {
      mockError600("006", "Transacción rechazada.", done);
    });

    it("should make a charge, with 600 kushki error and response AURUS211", (done: Done) => {
      mockError600("211", "Solicitud no válida.", done);
    });

    it("should make a charge, with 500 kushki error and response AURUS228", (done: Done) => {
      const response_text: string = "Procesador inalcanzable.";

      const kushki_error: KushkiError = new KushkiError(
        ERRORS.E500,
        ERRORS.E500.message,
        {
          response_text,
          response_code: "228",
        }
      );

      expectErrorResponse(response_text, kushki_error, done);
    });

    it("should make a charge, with no registered kushki error", (done: Done) => {
      invoke_response_stub = sandbox
        .stub()
        .throws(new KushkiError(ERRORS.E002, ERRORS.E002.message));

      mockLambdaGateway(invoke_response_stub);
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[5].charge(charge_body_request).subscribe({
        error: (error: KushkiError): void => {
          expect(error).to.be.instanceOf(KushkiError);
          expect(error.code).eq("K002");
          expect(error.getMessage()).eq(ERRORS.E002.message);
          done();
        },
      });
    });
  });

  describe("capture and preAuth", () => {
    let services: IProviderService[];

    beforeEach(() => {
      invoke_stub = sandbox.stub().returns(of(true));
      mockLambdaGateway(invoke_stub);
    });

    it("capture should throw K041 error, method is not supported by the processor", (done: Mocha.Done) => {
      services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      services[5].capture(undefined).subscribe({
        error: (err: KushkiError): void => {
          expect(err).to.be.instanceOf(KushkiError);
          expect(err.code).to.be.eq("K041");
          expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
          done();
        },
      });
    });

    it("preAuth should throw K041 error, method is not supported by the processor", (done: Mocha.Done) => {
      services = CONTAINER.getAll<IProviderService>(
        IDENTIFIERS.ProviderService
      );
      services[5].preAuthorization(undefined).subscribe({
        error: (err: KushkiError): void => {
          expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
          expect(err).to.be.instanceOf(KushkiError);
          expect(err.code).to.be.eq("K041");
          done();
        },
      });
    });

    function testMethondError(err: KushkiError, done: Mocha.Done): void {
      expect(err.code).to.be.eq("K041");
      expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
      expect(err).to.be.instanceOf(KushkiError);
      done();
    }

    it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.BillPocket]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });

    it("should throw K041 error when the method validateAccount is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);

      service[CardProviderIndexEnum.BillPocket]
        .validateAccount(undefined, undefined)
        .subscribe({
          error: (err: KushkiError): void => {
            testMethondError(err, done);
          },
        });
    });
  });
});
