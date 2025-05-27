/**
 *
 */
import { KushkiErrors, StatusCodeEnum } from "@kushki/core";
import { KushkiErrorEnum } from "infrastructure/KushkiErrorEnum";

const CRYPTO_ERROR_MSG = "Error al procesar la información del pago";

export enum ErrorCode {
  E001 = "E001",
  E002 = "E002",
  E003 = "E003",
  E004 = "E004",
  E005 = "E005",
  E006 = "E006",
  E007 = "E007",
  E008 = "E008",
  E009 = "E009",
  E010 = "E010",
  E011 = "E011",
  E012 = "E012",
  E013 = "E013",
  E014 = "E014",
  E015 = "E015",
  E016 = "E016",
  E017 = "E017",
  E020 = "E020",
  E021 = "E021",
  E023 = "E023",
  E025 = "E025",
  E026 = "E026",
  E027 = "E027",
  E028 = "E028",
  E029 = "E029",
  E030 = "E030",
  E031 = "E031",
  E038 = "E038",
  E039 = "E039",
  E040 = "E040",
  E041 = "E041",
  E042 = "E042",
  E043 = "E043",
  E047 = "E047",
  E048 = "E048",
  E049 = "E049",
  E050 = "E050",
  E051 = "E051",
  E052 = "E052",
  E053 = "E053",
  E054 = "E054",
  E055 = "E055",
  E066 = "E066",
  E067 = "E067",
  // Vault Errors
  E104 = "E104",
  E105 = "E105",
  E106 = "E106",
  E107 = "E107",
  E108 = "E108",
  E109 = "E109",
  E110 = "E110",
  E111 = "E111",
  E150 = "E150",
  E200 = "E200",
  E205 = "E205",
  E211 = "E211",
  E220 = "E220",
  E228 = "E228",
  E322 = "E322",
  E323 = "E323",
  E500 = "E500",
  E501 = "E501",
  E502 = "E502",
  E503 = "E503",
  E504 = "E504",
  E555 = "E555",
  E600 = "E600",
  // Niubiz Errors
  E800 = "E800",
  E801 = "E801",
  // Prosa Errors
  E901 = "E901",
  K006 = "006",
}
export enum ErrorResponseTextEnum {
  ERROR_TIMEOUT_ANTIFRAUD_TRANSACTION = "Timeout Antifraud",
}
export enum AntiFraudErrorEnum {
  K021 = "K021",
}
export enum RejectedTransactionEnum {
  K322 = "K322",
}
export enum WarningSecurityEnum {
  K327 = "K327",
}

export enum RejectedSecureServiceCodes {
  K325 = "K325",
  K326 = "K326",
  K328 = "K328",
}

export const SECURE_SERVICE_ERROR_CODES: string[] = [
  RejectedSecureServiceCodes.K325,
  RejectedSecureServiceCodes.K326,
  RejectedSecureServiceCodes.K328,
];

export const KUSHKI_HANDLED_ERRORS: string[] = [
  KushkiErrorEnum.K322,
  KushkiErrorEnum.K220,
  KushkiErrorEnum.K205,
  KushkiErrorEnum.K066,
  KushkiErrorEnum.K055,
];
export const ERROR_REJECTED_TRANSACTION: string = "Transacción rechazada.";
const CVV2_REJECTED_TRANSACTION: string = "Transacción no permitida sin ccv2.";

export const ERRORS: KushkiErrors<ErrorCode> = {
  [ErrorCode.E001]: {
    code: ErrorCode.E001,
    message: "Cuerpo de la petición inválido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E002]: {
    code: ErrorCode.E002,
    message: "Ha ocurrido un error inesperado.",
    statusCode: StatusCodeEnum.InternalServerError,
  },
  [ErrorCode.E003]: {
    code: ErrorCode.E003,
    message: "Procesador no existe.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E004]: {
    code: ErrorCode.E004,
    message: "Id de comercio no válido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E005]: {
    code: ErrorCode.E005,
    message: "Id de procesador no válido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E006]: {
    code: ErrorCode.E006,
    message: "Aurus Error.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E007]: {
    code: ErrorCode.E007,
    message: "Tarjeta bloqueada por el emisor.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E008]: {
    code: ErrorCode.E008,
    message: "Token incorrecto.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E009]: {
    code: ErrorCode.E009,
    message: "Review SSM variables.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E010]: {
    code: ErrorCode.E010,
    message: "Error al destokenizar el token enviado.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E011]: {
    code: ErrorCode.E011,
    message: "Bin no válido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E012]: {
    code: ErrorCode.E012,
    message: "Monto de captura inválido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E013]: {
    code: ErrorCode.E013,
    message: "Transacción tokenizada como diferido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E014]: {
    code: ErrorCode.E014,
    message: "No es un archivo de carga de diferidos válido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E015]: {
    code: ErrorCode.E015,
    message: CVV2_REJECTED_TRANSACTION,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E016]: {
    code: ErrorCode.E016,
    message: "Método no implementado",
    statusCode: StatusCodeEnum.BadGateway,
  },
  [ErrorCode.E017]: {
    code: ErrorCode.E017,
    message: "Tarjeta expirada",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E020]: {
    code: ErrorCode.E020,
    message: ERROR_REJECTED_TRANSACTION,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E021]: {
    code: ErrorCode.E021,
    message: ERROR_REJECTED_TRANSACTION,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E023]: {
    code: ErrorCode.E023,
    message: "Monto del void superior al del sale",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E025]: {
    code: ErrorCode.E025,
    message: "Tarjeta inválida",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E026]: {
    code: ErrorCode.E026,
    message: "Processor Declined",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E027]: {
    code: ErrorCode.E027,
    message: "La operación cayó en timeout, por favor inténtelo de nuevo",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E028]: {
    code: ErrorCode.E028,
    message: "El comercio no tiene habilitado la opción de diferidos",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E029]: {
    code: ErrorCode.E029,
    message: "Bin de tarjeta inválido",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E030]: {
    code: ErrorCode.E030,
    message: "Procesador inalcanzable",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E031]: {
    code: ErrorCode.E031,
    message: "Prosa Error",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E038]: {
    code: ErrorCode.E038,
    message:
      "No se puede realizar un void parcial sin especificar el valor a sustraer",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E039]: {
    code: ErrorCode.E039,
    message: "La suma de los valores de la propiedad amount debe ser mayor a 0",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E040]: {
    code: ErrorCode.E040,
    message: "El ID de comercio no corresponde a la credencial enviada",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E041]: {
    code: ErrorCode.E041,
    message: "Operación no permitida",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E042]: {
    code: ErrorCode.E042,
    message: "El código de moneda es diferente al de la transacción inicial.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E043]: {
    code: ErrorCode.E043,
    message: "Jwt inválido o expirado.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E047]: {
    code: ErrorCode.E047,
    message: "Ha ocurrido un error inesperado",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E048]: {
    code: ErrorCode.E048,
    message: "Token expirado",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E049]: {
    code: ErrorCode.E049,
    message: "Token utilizado anteriormente",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E050]: {
    code: ErrorCode.E050,
    message: "No existe una subscripción asociada a esta captura",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E051]: {
    code: ErrorCode.E051,
    message: "Transacción de captura realizada anteriormente",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E052]: {
    code: ErrorCode.E052,
    message:
      "Ha superado el tiempo máximo permitido para realizar el reembolso de esta transacción",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E053]: {
    code: ErrorCode.E053,
    message: "Transacción recurrente sin referencia inicial",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E054]: {
    code: ErrorCode.E054,
    message: "No se encontró la suscripción",
    statusCode: StatusCodeEnum.NotFound,
  },
  [ErrorCode.E055]: {
    code: ErrorCode.E055,
    message: "Tipo de moneda no permitido",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E067]: {
    code: ErrorCode.E067,
    message: "Transacción no existe",
    statusCode: StatusCodeEnum.BadRequest,
  },
  // Vault Errors
  [ErrorCode.E104]: {
    code: ErrorCode.E104,
    message: CRYPTO_ERROR_MSG,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E105]: {
    code: ErrorCode.E105,
    message: CRYPTO_ERROR_MSG,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E106]: {
    code: ErrorCode.E106,
    message: CRYPTO_ERROR_MSG,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E107]: {
    code: ErrorCode.E107,
    message: CRYPTO_ERROR_MSG,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E108]: {
    code: ErrorCode.E108,
    message: CRYPTO_ERROR_MSG,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E109]: {
    code: ErrorCode.E109,
    message: CRYPTO_ERROR_MSG,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E110]: {
    code: ErrorCode.E110,
    message: CRYPTO_ERROR_MSG,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E111]: {
    code: ErrorCode.E111,
    message: CRYPTO_ERROR_MSG,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E150]: {
    code: ErrorCode.E150,
    message:
      "La solicitud de devolución no se pudo realizar porque tienes valores pendientes con Kushki y debes esperar a tu próximo ciclo de liquidación.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E200]: {
    code: ErrorCode.E200,
    message: "Servicios default configurados correctamente",
    statusCode: StatusCodeEnum.OK,
  },
  [ErrorCode.E205]: {
    code: ErrorCode.E205,
    message: "Tipo de moneda no válido",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E220]: {
    code: ErrorCode.E220,
    message:
      "Monto de la transacción es diferente al monto de la venta inicial",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E211]: {
    code: ErrorCode.E211,
    message: "Solicitud no valida.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E228]: {
    code: ErrorCode.E228,
    message: "Procesador inalcanzable.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E322]: {
    code: ErrorCode.E322,
    message: ERROR_REJECTED_TRANSACTION,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E323]: {
    code: ErrorCode.E323,
    message: "Código de seguridad incorrecto.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E600]: {
    code: ErrorCode.E600,
    message: "Processor Error",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E500]: {
    code: ErrorCode.E500,
    message: "Procesador inalcanzable",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E501]: {
    code: ErrorCode.E501,
    message: "Error al configurar cards por defecto",
    statusCode: StatusCodeEnum.InternalServerError,
  },
  [ErrorCode.E502]: {
    code: ErrorCode.E502,
    message: "Error al al obtener webhook signature",
    statusCode: StatusCodeEnum.InternalServerError,
  },
  [ErrorCode.E503]: {
    code: ErrorCode.E503,
    message: "Error al configurar smartlinks",
    statusCode: StatusCodeEnum.InternalServerError,
  },
  [ErrorCode.E504]: {
    code: ErrorCode.E504,
    message: "Error al obtener merchant",
    statusCode: StatusCodeEnum.InternalServerError,
  },
  [ErrorCode.E555]: {
    code: ErrorCode.E555,
    message: "Solicitud enviada no es válida",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E066]: {
    code: ErrorCode.E066,
    message: "Las credenciales no son correctas o no coinciden.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E800]: {
    code: ErrorCode.E800,
    message: "Se encontro DNI en Lista Negra",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E801]: {
    code: ErrorCode.E801,
    message: "Se encontro RUC en Lista Negra",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E901]: {
    code: ErrorCode.E901,
    message: "No es posible realizar diferido",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.K006]: {
    code: ErrorCode.K006,
    message: "Transacción declinada.",
    statusCode: StatusCodeEnum.BadRequest,
  },
};
