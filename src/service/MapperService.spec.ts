/**
 * Mapper service unit test file
 */
import { KushkiError, StatusCodeEnum } from "@kushki/core";
import { expect } from "chai";
import {
  EcommerceErrors,
  ErrorAcqCode,
  ERRORS_ACQ,
} from "infrastructure/ErrorAcqEnum";
import { ErrorCode } from "infrastructure/ErrorEnum";
import { ErrorMapAcqEnum } from "infrastructure/ErrorMapAcqEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { set } from "lodash";
import { MapperService } from "service/MapperService";
import { Mock } from "ts-mockery";
import { AcqChargeRequest } from "types/acq_charge_request";
import { AcqError } from "types/acq_error";
import { AurusResponse } from "types/aurus_response";
import { ChargeKushkiAcqRequest } from "types/charge_kushki_request";
import { RedebanChargeRequest } from "types/redeban_charge_request";

function buildBaseRequest(): AcqChargeRequest {
  const acq_request: AcqChargeRequest = {
    authorizerContext: {
      credentialAlias: "test",
      credentialId: "test",
      hierarchyConfig: {
        processing: { basicInfo: "test" },
      },
      merchantId: "test",
      privateMerchantId: "test",
      publicMerchantId: "test",
    },
    binInfo: {
      bank: "CITIBANAMEX",
      bin: "405306",
      brand: "VISA",
      brandProductCode: "fake_brand_product_code",
      country: "MEX",
      type: "credit",
    },
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
    vaultToken: "vault_token",
  };

  set(acq_request, "binInfo", {
    bank: "Nexi Payments U1",
    bin: "5552819200",
    brand: "MASTERCARD",
    brandProductCode: "fake_brand_product_code",
    country: "PER",
    type: "debit",
  });

  return acq_request;
}

describe("mapper service", () => {
  describe("when mapperInternalServerErrorResponse with Redeban Processor is called", () => {
    it("should return an aurus mapped object - Redeban", () => {
      const request: RedebanChargeRequest = Mock.of<RedebanChargeRequest>({
        card: {
          months: 3,
        },
        transactionReference: "trxRef",
      });

      const response: AurusResponse =
        MapperService.mapperInternalServerErrorResponse(
          request,
          ProcessorEnum.REDEBAN
        );

      expect(response.ticket_number).to.be.eqls("");
      expect(response.transaction_details.approvalCode).to.be.eqls("000000");
      expect(response.transaction_details.isDeferred).to.be.eqls("Y");
    });
  });

  describe("when mapperInternalServerErrorResponse with Credomatic Processor is called", () => {
    it("should return an aurus mapped object - Credomatic", () => {
      const request: RedebanChargeRequest = Mock.of<RedebanChargeRequest>({
        card: {
          months: 3,
        },
        transactionReference: "trxRef",
      });

      const response: AurusResponse =
        MapperService.mapperInternalServerErrorResponse(
          request,
          ProcessorEnum.CREDOMATIC
        );

      expect(response.ticket_number).to.be.eqls("");
      expect(response.transaction_details.approvalCode).to.be.eqls("000000");
      expect(response.transaction_details.isDeferred).to.be.eqls("Y");
    });
  });

  describe("when mapperInternalKushkiAcqServerErrorResponse is called", () => {
    it("should return an aurus mapped object - Acq", () => {
      const request: ChargeKushkiAcqRequest = Mock.of<ChargeKushkiAcqRequest>({
        card: {
          brand: "VISA",
        },
        isDeferred: false,
        transactionReference: "trxRef",
      });

      const response: AurusResponse =
        MapperService.mapperInternalKushkiAcqServerErrorResponse(request);

      expect(response.ticket_number).to.be.eqls("");
      expect(response.transaction_details.approvalCode).to.be.eqls("000000");
      expect(response.transaction_details.isDeferred).to.be.eqls("N");
    });

    it("should return an aurus mapped object when deferred is true", () => {
      const request: ChargeKushkiAcqRequest = Mock.of<ChargeKushkiAcqRequest>({
        card: {
          brand: "VISA",
        },
        isDeferred: true,
        transactionReference: "trxRef",
      });

      const response: AurusResponse =
        MapperService.mapperInternalKushkiAcqServerErrorResponse(request);

      expect(response.ticket_number).to.be.eqls("");
      expect(response.transaction_details.approvalCode).to.be.eqls("000000");
      expect(response.transaction_details.isDeferred).to.be.eqls("Y");
    });

    it("get aurusResponse object with internal server error", () => {
      const indicator_3ds: string = "F";
      const acq_transaction: AcqChargeRequest = buildBaseRequest();
      const rs: AcqError = MapperService.mapperInternalAcqServerErrorResponse(
        acq_transaction,
        ERRORS_ACQ.E003.message,
        "",
        indicator_3ds
      );

      expect(rs.ticket_number).to.be.eqls("");
      expect(rs.transaction_details.approvalCode).to.be.eqls("000000");
      expect(rs.transaction_details.isDeferred).to.be.eqls("N");
      expect(rs.response_text).to.be.eqls(ERRORS_ACQ.E003.message);
      expect(rs.indicator_3ds).to.be.eqls(indicator_3ds);
    });

    it("get aurusResponse object with deferred", () => {
      const acq_transaction: AcqChargeRequest = buildBaseRequest();

      acq_transaction.isDeferred = true;

      const error: KushkiError = new KushkiError(ERRORS_ACQ.E002);
      error.setMetadata({ message_fields: {} });

      const rs: AcqError = MapperService.mapperErrorResponse(
        acq_transaction,
        error
      );

      expect(rs.ticket_number).to.be.eqls("");
      expect(rs.processor_code).to.be.equal("002");
      expect(rs.transaction_details.approvalCode).to.be.eqls("000000");
      expect(rs.transaction_details.isDeferred).to.be.eqls("Y");
    });

    it("get aurusResponse object without deferred ERROR 006", () => {
      valideteAurusResponse("006", new KushkiError(ERRORS_ACQ.E006));
    });

    it("get aurusResponse object without deferred ERROR 012", () => {
      valideteAurusResponse("012", new KushkiError(ERRORS_ACQ.E012));
    });

    it("get aurusResponse object without deferred ERROR 500", () => {
      valideteAurusResponse("500", new KushkiError(ERRORS_ACQ.E500));
    });

    it("get aurusResponse object without deferred ERROR 228", () => {
      valideteAurusResponse("228", new KushkiError(ERRORS_ACQ.E228));
    });

    it("get aurusResponse object without deferred ERROR 211", () => {
      valideteAurusResponse("211", new KushkiError(ERRORS_ACQ.E211));
    });

    function valideteAurusResponse(code: string, error: KushkiError) {
      const acq_transaction: AcqChargeRequest = buildBaseRequest();
      const rs: AcqError = MapperService.mapperErrorResponse(
        acq_transaction,
        error
      );

      expect(rs.ticket_number).to.be.eqls("");
      expect(rs.processor_code).to.be.equal(code);
      expect(rs.transaction_details.approvalCode).to.be.eqls("000000");
      expect(rs.transaction_details.isDeferred).to.be.eqls("N");
    }
  });

  describe("handleRequestError", () => {
    let kushki_error: KushkiError;
    let expected_error_code: string;

    it("when status_code of error is 400, return an error with code K600", () => {
      kushki_error = new KushkiError(
        {
          code: ErrorAcqCode.E001,
          message: ERRORS_ACQ.E001.message,
          statusCode: StatusCodeEnum.BadRequest,
        },
        ""
      );
      expected_error_code = "K600";
    });

    it("should return error K003 when status_code of error is 400 and code is EA120", () => {
      kushki_error = new KushkiError(
        ERRORS_ACQ.E003,
        `${EcommerceErrors.EA120} - lermipsu`
      );
      expected_error_code = ErrorMapAcqEnum.E003;
    });

    it("should return error K004 when status_code of error is 400 and code is EA121", () => {
      kushki_error = new KushkiError(ERRORS_ACQ.E004, EcommerceErrors.EA121);
      expected_error_code = ErrorMapAcqEnum.E004;
    });

    it("should return error K005 when status_code of error is 400 and code is EA122", () => {
      kushki_error = new KushkiError(ERRORS_ACQ.E005, EcommerceErrors.EA122);
      expected_error_code = ErrorMapAcqEnum.E005;
    });

    it("should return error K005 when status_code of error is 400 and code is EA123", () => {
      kushki_error = new KushkiError(ERRORS_ACQ.E505, EcommerceErrors.EA124);
      expected_error_code = ErrorMapAcqEnum.E505;
    });

    it("should return error K506 when status_code of error is 400 and code is EA125", () => {
      kushki_error = new KushkiError(ERRORS_ACQ.E506, EcommerceErrors.EA125);
      expected_error_code = ErrorMapAcqEnum.E506;
    });

    it("should return error K601 when status_code of error is 400 and code is E601", () => {
      kushki_error = new KushkiError(ERRORS_ACQ.E601);
      expected_error_code = ErrorMapAcqEnum.K601;
    });

    it("when status_code of error is 500, return an error with code K500", () => {
      kushki_error = new KushkiError(
        {
          code: ErrorAcqCode.E001,
          message: ERRORS_ACQ.E001.message,
          statusCode: StatusCodeEnum.InternalServerError,
        },
        ""
      );
      expected_error_code = "K500";
    });

    it("when status_code don't exist, return an error with code K002", () => {
      kushki_error = new KushkiError(
        {
          code: ErrorCode.E001,
          message: "Error",
          statusCode: StatusCodeEnum.Found,
        },
        ""
      );
      expected_error_code = "K002";
    });

    afterEach((done: Mocha.Done) => {
      MapperService.handleRequestError(kushki_error).subscribe({
        error: (err: KushkiError) => {
          expect(err.code).to.eqls(expected_error_code);
          done();
        },
      });
    });
  });
});
