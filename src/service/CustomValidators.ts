import ajv = require("ajv");
import { clone, get, isNil, set } from "lodash";
import { VoidBody } from "repository/ITransactionService";
import { ThreeDomainSecure } from "types/charges_card_request";

export class CustomValidators {
  public static validateVoidCardRequest(voidRequest: VoidBody): boolean {
    if (isNil(voidRequest)) return true;

    const ajv_validation: ajv.Ajv = new ajv({
      meta: false,
      schemaId: "id",
    });
    const meta_schema: NodeRequire = require("../schema/json-schema-draft-04.json");
    const void_request_schema: NodeRequire = require("../schema/void_card_request.json");

    ajv_validation.addMetaSchema(meta_schema);
    return Boolean(ajv_validation.validate(void_request_schema, voidRequest));
  }

  public static validateThreeDSExternalDataByVisa(
    threeDSData: ThreeDomainSecure
  ): boolean {
    const three_ds_visa_schema: object = clone(
      require("../schema/validate_3ds_visa_request.json")
    );

    return CustomValidators._validateSchema(three_ds_visa_schema, threeDSData);
  }

  public static validateThreeDSExternalDataByMC(
    threeDSData: ThreeDomainSecure
  ): boolean {
    const three_ds_mc_schema: object = clone(
      require("../schema/validate_3ds_mc_request.json")
    );

    if (get(threeDSData, "specificationVersion", "").startsWith("2"))
      set(three_ds_mc_schema, "required", [
        ...get(three_ds_mc_schema, "required", ""),
        "directoryServerTransactionID",
      ]);

    return CustomValidators._validateSchema(three_ds_mc_schema, threeDSData);
  }

  private static _validateSchema(schema: object, data: object): boolean {
    const ajv_validation: ajv.Ajv = new ajv({
      meta: false,
      schemaId: "id",
    });
    const meta_schema: NodeRequire = require("../schema/json-schema-draft-04.json");

    ajv_validation.addMetaSchema(meta_schema);

    return Boolean(ajv_validation.validate(schema, data));
  }
}
