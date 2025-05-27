import { AurusError, KushkiError, KushkiErrorAttr } from "@kushki/core";
import {
  EcommerceErrors,
  ErrorAcqCode,
  ERRORS_ACQ,
} from "infrastructure/ErrorAcqEnum";
import { ErrorCode, ERRORS } from "infrastructure/ErrorEnum";
import {
  ERROR_ACQ_RESPONSE_RECORD,
  ErrorMapAcqEnum,
} from "infrastructure/ErrorMapAcqEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { defaultTo, get, isEmpty, isNil, unset } from "lodash";
import { Microtime } from "microtime-node";
import nanoSeconds = require("nano-seconds");
import { Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { mergeMap } from "rxjs/operators";
import { AcqCaptureError } from "types/acq_capture_error";
import { AcqChargeRequest } from "types/acq_charge_request";
import { AcqError } from "types/acq_error";
import { AcqSubscriptionChargeRequest } from "types/acq_subscription_charge_request";
import { AcqValidateAccountRequest } from "types/acq_validate_account_request";
import { AurusResponse, TransactionDetails } from "types/aurus_response";
import { BillpocketChargeRequest } from "types/billpocket_charge_request";
import { ChargeCredibankRequest } from "types/charge_credibank_request";
import { ChargeKushkiAcqRequest } from "types/charge_kushki_request";
import { CredomaticCaptureRequest } from "types/credomatic_capture_request";
import { CredomaticChargeRequest } from "types/credomatic_charge_request";
import { CredomaticPreAuthRequest } from "types/credomatic_pre_auth_request";
import { FisChargeRequest } from "types/fis_charge_request";
import { FisFullCaptureRequest } from "types/fis_full_capture_request";
import { CaptureKushkiAcqRequest } from "types/kushki_acq_capture_request";
import { PreAuthKushkiAcqRequest } from "types/preauth_kushki_request";
import { PreAuthRequest } from "types/preauth_request";
import { ReAuthKushkiAcqRequest } from "types/reauth_kushki_request";
import { RedebanChargeRequest } from "types/redeban_charge_request";

const RESPONSE_TEXT: string = "Procesador inalcanzable";

type AcqRequest =
  | PreAuthRequest
  | AcqChargeRequest
  | AcqValidateAccountRequest
  | AcqCaptureError;

export class MapperService {
  public static mapperInternalServerErrorResponse(
    request: // tslint:disable-next-line:max-union-size
    | RedebanChargeRequest
      | ChargeCredibankRequest
      | BillpocketChargeRequest
      | CredomaticChargeRequest
      | CredomaticPreAuthRequest
      | CredomaticCaptureRequest
      | CaptureKushkiAcqRequest
      | FisChargeRequest
      | FisFullCaptureRequest,
    processor: ProcessorEnum
  ): AurusResponse {
    return {
      approved_amount: "",
      processor_code: "228",
      recap: "",
      response_code: "228",
      response_text: RESPONSE_TEXT,
      response_time: "",
      ticket_number: "",
      transaction_details: MapperService._buildTransactionDetails(
        request,
        processor
      ),
      transaction_id: `77${Microtime.now()}`,
      transaction_reference: get(request, "transactionReference"),
    };
  }

  public static mapperInternalKushkiAcqServerErrorResponse(
    request:
      | ChargeKushkiAcqRequest
      | PreAuthKushkiAcqRequest
      | ReAuthKushkiAcqRequest
  ): AurusResponse {
    return {
      approved_amount: "",
      processor_code: "228",
      recap: "",
      response_code: "228",
      response_text: RESPONSE_TEXT,
      response_time: "",
      ticket_number: "",
      transaction_details:
        MapperService._buildKushkiAcqTransactionDetails(request),
      transaction_id: `77${Microtime.now()}`,
      transaction_reference: "",
    };
  }

  public static buildAurusError(
    err: KushkiError,
    processorName: ProcessorEnum
  ): AurusError {
    const metadata: object = defaultTo(err.getMetadata(), {});
    const response_code: string = get(metadata, "response_code", "");
    const processor_code: string = MapperService._getProcessorCodeByProcessor(
      metadata,
      processorName,
      response_code
    );

    return new AurusError(response_code, get(metadata, "response_text", ""), {
      ...metadata,
      processorName,
      processorCode: processor_code,
    });
  }

  public static buildUnreachableAurusError(
    processorName: ProcessorEnum
  ): AurusError {
    return new AurusError("504", "Procesador inalcanzable", {
      processorName,
    });
  }

  private static _getProcessorCodeByProcessor(
    metadata: object,
    processorName: ProcessorEnum,
    responseCode: string
  ): string {
    if (
      processorName === ProcessorEnum.KUSHKI ||
      processorName === ProcessorEnum.CREDIMATIC
    )
      return get(metadata, "processor_code", "");

    return responseCode;
  }

  private static _buildTransactionDetails(
    request: // tslint:disable-next-line:max-union-size
    | RedebanChargeRequest
      | ChargeCredibankRequest
      | BillpocketChargeRequest
      | CredomaticPreAuthRequest
      | CredomaticChargeRequest
      | CredomaticCaptureRequest
      | CaptureKushkiAcqRequest
      | FisChargeRequest
      | FisFullCaptureRequest,
    processor: ProcessorEnum
  ): TransactionDetails {
    return {
      approvalCode: "000000",
      binCard: get(request, "card.bin", ""),
      cardHolderName: get(request, "card.holderName", ""),
      cardType: get(request, "card.brand", ""),
      isDeferred: !isNil(get(request, "card.months")) ? "Y" : "N",
      lastFourDigitsOfCard: get(request, "card.lastFourDigits", ""),
      merchantName: get(request, "merchantName", ""),
      processorBankName: get(request, "processorBankName", ""),
      processorName: processor,
    };
  }

  public static buildFisError(
    err: KushkiError,
    processorName: ProcessorEnum
  ): AurusError {
    const metadata: object = defaultTo(err.getMetadata(), {});
    const response_code: string = ERRORS[ErrorCode.K006].code;
    const processor_code_fis: string = get(metadata, "processorCode", "");

    unset(metadata, "lastEvent");

    return new AurusError(response_code, get(metadata, "response_text", ""), {
      ...metadata,
      processorName,
      response_code,
      processorCode: processor_code_fis,
    });
  }

  private static _buildKushkiAcqTransactionDetails(
    request:
      | ChargeKushkiAcqRequest
      | PreAuthKushkiAcqRequest
      | ReAuthKushkiAcqRequest
  ): TransactionDetails {
    return {
      approvalCode: "000000",
      binCard: get(request, "card.bin", ""),
      cardHolderName: get(request, "card.holderName", ""),
      cardType: get(request, "card.brand", ""),
      isDeferred: request.isDeferred ? "Y" : "N",
      lastFourDigitsOfCard: get(request, "card.lastFourDigits", ""),
      merchantName: get(request, "merchantName", ""),
      processorBankName: get(request, "processorBankName", ""),
      processorName: ProcessorEnum.KUSHKI,
    };
  }

  public static buildAcqContactDetails(
    request:
      | AcqSubscriptionChargeRequest
      | AcqChargeRequest
      | PreAuthRequest
      | AcqValidateAccountRequest
  ): object {
    return {
      document_number: get(request, "contactDetails.documentNumber"),
      document_type: get(request, "contactDetails.documentType"),
      email: get(request, "contactDetails.email"),
      first_name: get(request, "contactDetails.firstName"),
      last_name: get(request, "contactDetails.lastName"),
      phone_number: get(request, "contactDetails.phoneNumber"),
      secondLast_name: get(request, "contactDetails.secondLastName"),
    };
  }

  public static handleRequestError(error: KushkiError): Observable<never> {
    return of(1).pipe(
      mergeMap(() => {
        let custom_error: KushkiErrorAttr<ErrorAcqCode>;
        const status_code: number = defaultTo(
          get(error, "statusCode"),
          error.getStatusCode()
        );

        switch (true) {
          case `${status_code}`.startsWith("4"):
            custom_error = MapperService._getCustomError(error.getMessage());
            break;
          case `${status_code}`.startsWith("5"):
            custom_error = ERRORS_ACQ.E500;
            break;
          default:
            custom_error = ERRORS_ACQ.E002;
            break;
        }

        return throwError(() => new KushkiError(custom_error));
      }),
      tag("MapperService | handleRequestError")
    );
  }

  private static _getCustomError(
    message: string
  ): KushkiErrorAttr<ErrorAcqCode> {
    switch (true) {
      case message.includes(EcommerceErrors.EA120):
        return ERRORS_ACQ.E003;
      case message.includes(EcommerceErrors.EA121):
        return ERRORS_ACQ.E004;
      case message.includes(EcommerceErrors.EA122):
        return ERRORS_ACQ.E005;
      case message.includes(EcommerceErrors.EA124):
        return ERRORS_ACQ.E505;
      case message.includes(EcommerceErrors.EA125):
        return ERRORS_ACQ.E506;
      case message.includes(ERRORS_ACQ.E601.message):
        return ERRORS_ACQ.E601;
      default:
        return ERRORS_ACQ.E600;
    }
  }

  public static mapperInternalAcqServerErrorResponse(
    request: AcqRequest,
    responseText: string,
    authorizer: string,
    indicator3ds?: string
  ): AcqError {
    return {
      authorizer,
      approved_amount: "",
      indicator_3ds: indicator3ds,
      processor_code: "228",
      response_code: "228",
      response_text: responseText,
      response_time: "",
      ticket_number: "",
      transaction_details: MapperService._getTransactionDetails(request),
      transaction_id: `88${nanoSeconds.now().toString().replace(",", "")}`,
      transaction_reference: request.transactionReference,
    };
  }

  public static mapperErrorResponse(
    request: AcqRequest,
    err: KushkiError
  ): AcqError {
    const { code, text } = MapperService._getResponseFromError(err);

    return {
      approved_amount: "",
      authorizer: err.getMetadata && get(err.getMetadata(), "authorizer", ""),
      indicator_3ds:
        err.getMetadata &&
        get(err.getMetadata(), "relevant_fields.indicator_3ds"),
      processor_code: code,
      response_code: "006",
      response_text: text,
      response_time: "",
      ticket_number: "",
      transaction_details: MapperService._getTransactionDetails(request, err),
      transaction_id: `88${Microtime.now()}`,
      transaction_reference: request.transactionReference,
    };
  }

  private static _getResponseFromError(error: KushkiError): {
    code: string;
    text: string;
  } {
    const aux_code: string = ERROR_ACQ_RESPONSE_RECORD[error.code];
    let code: string = aux_code;
    let text: string = MapperService._getErrorResponse(error).message;

    if (code === "006") {
      code = get(error.getMetadata(), "kushki_response.code", aux_code);
      text = get(error.getMetadata(), "kushki_response.message", aux_code);
    }

    return {
      code,
      text,
    };
  }

  private static _getErrorResponse(
    err: KushkiError
  ): KushkiErrorAttr<ErrorAcqCode> {
    const code: string = get(err, "code");

    switch (code) {
      case ErrorMapAcqEnum.E012:
        return ERRORS_ACQ.E012;
      case ErrorMapAcqEnum.E500:
        return ERRORS_ACQ.E500;
      case ErrorMapAcqEnum.E228:
        return ERRORS_ACQ.E228;
      case ErrorMapAcqEnum.E211:
        return ERRORS_ACQ.E211;
      case ErrorMapAcqEnum.E006:
        return ERRORS_ACQ.E006;
      default:
        return ERRORS_ACQ.E002;
    }
  }

  private static _getTransactionDetails(
    request: AcqRequest,
    err?: KushkiError
  ): TransactionDetails {
    const transaction_details: TransactionDetails = {
      approvalCode: "000000",
      binCard: get(request.card, "bin", ""),
      cardHolderName: get(request.card, "holderName", ""),
      cardType: get(request.card, "brand", ""),
      isDeferred: get(request, "isDeferred", false) ? "Y" : "N",
      lastFourDigitsOfCard: get(request.card, "lastFourDigits", ""),
      merchantName: get(request, "merchantName", ""),
      processorBankName: get(request, "processorBankName", ""),
      processorName: ProcessorEnum.KUSHKI,
    };

    if (!isEmpty(err))
      transaction_details.messageFields = get(
        err.getMetadata(),
        "message_fields"
      );

    return transaction_details;
  }
}
