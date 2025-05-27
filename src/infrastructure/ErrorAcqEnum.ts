/**
 * ErrorEnum
 */
import { KushkiErrors, StatusCodeEnum } from "@kushki/core";
import { ErrorCode } from "infrastructure/ErrorEnum";

export enum EcommerceErrors {
  EA120 = "EA120",
  EA121 = "EA121",
  EA122 = "EA122",
  EA124 = "EA124",
  EA125 = "EA125",
}

export enum ErrorAcqCode {
  E001 = "E001",
  E002 = "E002",
  E003 = "E003",
  E004 = "E004",
  E005 = "E005",
  E006 = "E006",
  E009 = "E009",
  E010 = "E010",
  E011 = "E011",
  E012 = "E012",
  E013 = "E013",
  E211 = "E211",
  E228 = "E228",
  E500 = "E500",
  E505 = "E505",
  E506 = "E506",
  E600 = "E600",
  E601 = "E601",
  E028 = "E028",
}

export const ERRORS_ACQ: KushkiErrors<ErrorAcqCode> = {
  [ErrorAcqCode.E009]: {
    code: ErrorAcqCode.E009,
    message: "Error en la actualización.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E001]: {
    code: ErrorAcqCode.E001,
    message: "Transacción no encontrada.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E002]: {
    code: ErrorAcqCode.E002,
    message: "Ha ocurrido un error inesperado.",
    statusCode: StatusCodeEnum.InternalServerError,
  },
  [ErrorAcqCode.E003]: {
    code: ErrorAcqCode.E003,
    message: "Bin internacional no permitido para diferidos.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E004]: {
    code: ErrorAcqCode.E004,
    message: "Tarjeta no soportada.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E005]: {
    code: ErrorAcqCode.E005,
    message: "Transacción no permitida para crypto.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E010]: {
    code: ErrorAcqCode.E010,
    message: "Reverso declinado",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E228]: {
    code: ErrorAcqCode.E228,
    message: "Procesador inalcanzable.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E211]: {
    code: ErrorAcqCode.E211,
    message: "Solicitud no valida.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E006]: {
    code: ErrorAcqCode.E006,
    message: "Error de Integración",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E011]: {
    code: ErrorAcqCode.E011,
    message: "Bin no válido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E012]: {
    code: ErrorAcqCode.E012,
    message: "La operación cayó en timeout",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E013]: {
    code: ErrorAcqCode.E013,
    message: "La transacción no es una Subscripción",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E500]: {
    code: ErrorAcqCode.E500,
    message: "Procesador Inalcanzable",
    statusCode: StatusCodeEnum.InternalServerError,
  },
  [ErrorAcqCode.E505]: {
    code: ErrorAcqCode.E505,
    message: "La transacción fue declinada por el procesador o emisor.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E506]: {
    code: ErrorAcqCode.E506,
    message:
      "La transacción fue declinada temporalmente por el procesador o emisor.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E600]: {
    code: ErrorAcqCode.E600,
    message: "Operación Rechazada",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorAcqCode.E601]: {
    code: ErrorAcqCode.E601,
    message: "Faltan parámetros para completar transacciones del subcomercio.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E028]: {
    code: ErrorAcqCode.E028,
    message: "El comercio no tiene habilitado la opción de diferidos",
    statusCode: StatusCodeEnum.BadRequest,
  },
};
