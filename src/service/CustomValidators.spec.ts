import { expect } from "chai";
import { CustomValidators } from "service/CustomValidators";

describe("CustomValidators", () => {
  function assertValidation(voidRequest: object, expected: boolean) {
    const rs: boolean = CustomValidators.validateVoidCardRequest(voidRequest);

    expect(rs).to.be.eql(expected);
  }

  it("validateVoidCardRequest must return true if amount object has numbers values greaters than 0", () => {
    assertValidation(
      {
        amount: {
          currency: "USD",
          extraTaxes: {
            agenciaDeViaje: 0.4,
            iac: 3.3,
            propina: 1.2,
            tasaAeroportuaria: 3.99,
          },
          ice: 4,
          iva: 2,
          subtotalIva: 3,
          subtotalIva0: 1,
        },
      },
      true
    );
  });

  it("validateVoidCardRequest must return false if amount object has negative numbers", () => {
    assertValidation(
      {
        amount: {
          currency: "USD",
          extraTaxes: {
            agenciaDeViaje: -0.4,
            iac: -3.3,
            propina: 1.2,
            tasaAeroportuaria: -3.99,
          },
          ice: 4,
          iva: -2,
          subtotalIva: 3,
          subtotalIva0: 1,
        },
      },
      false
    );
  });

  it("validateVoidCardRequest must return true if amount object has only required props with numbers values greaters than 0", () => {
    assertValidation(
      {
        amount: {
          currency: "USD",
          iva: 0.1,
          subtotalIva: 3.4,
          subtotalIva0: 1.1,
        },
      },
      true
    );
  });

  it("validateVoidCardRequest must return false if amount object has string values on props which should be numbers", () => {
    assertValidation(
      {
        amount: {
          currency: "USD",
          iva: "2",
          subtotalIva: "3",
          subtotalIva0: "1",
        },
      },
      false
    );
  });

  it("validateVoidCardRequest must return false if request has additional properties", () => {
    assertValidation(
      {
        additionalProperty: "additionalProperty",
        amount: {
          currency: "USD",
          iva: "2",
          subtotalIva: "3",
          subtotalIva0: "1",
        },
        fullResponse: true,
      },
      false
    );
  });

  it("validateVoidCardRequest must return true if amount object is empty", () => {
    assertValidation({}, true);
  });

  it("validateVoidCardRequest must return true if request is null", () => {
    const rs: boolean = CustomValidators.validateVoidCardRequest(null);

    expect(rs).to.be.eql(true);
  });

  it("validateVoidCardRequest must return true if request is undefined", () => {
    const rs: boolean = CustomValidators.validateVoidCardRequest(undefined);

    expect(rs).to.be.eql(true);
  });

  it("should validate 3ds data for visa and return a valid schema", () => {
    const rs: boolean = CustomValidators.validateThreeDSExternalDataByVisa({
      cavv: "1234567890123456789012345678",
      eci: "05",
      specificationVersion: "1.0.2",
    });

    expect(rs).to.be.true;
  });

  it("should validate xid field in 3ds data for visa and return a valid schema when specificationVersion is version 2", () => {
    const rs: boolean = CustomValidators.validateThreeDSExternalDataByVisa({
      cavv: "1234567890123456789012345678",
      eci: "05",
      specificationVersion: "2.2.0",
      xid: "1234567890123456789012345678",
    });

    expect(rs).to.be.true;
  });

  it("should validate 3ds data for visa and return a valid schema when specificationVersion is version 2 and xid is undefined", () => {
    const rs: boolean = CustomValidators.validateThreeDSExternalDataByVisa({
      cavv: "1234567890123456789012345678",
      eci: "05",
      specificationVersion: "2.2.0",
      xid: undefined,
    });

    expect(rs).to.be.true;
  });

  it("should validate 3ds data for visa and return an invalid schema when data isn't correct", () => {
    const rs: boolean = CustomValidators.validateThreeDSExternalDataByVisa({
      cavv: "1234",
      eci: "05",
      specificationVersion: "2.2.0",
      xid: "123456",
    });

    expect(rs).to.be.false;
  });

  it("should validate 3ds data for MC and return a valid schema", () => {
    const rs: boolean = CustomValidators.validateThreeDSExternalDataByMC({
      collectionIndicator: "0",
      eci: "01",
      specificationVersion: "1.0.2",
      ucaf: "12345678901234567890123456789012",
    });

    expect(rs).to.be.true;
  });

  it("should validate xid field in 3ds data for MC and return a valid schema when specificationVersion is version 2", () => {
    const rs: boolean = CustomValidators.validateThreeDSExternalDataByMC({
      collectionIndicator: "0",
      directoryServerTransactionID: "123456789012345678901234567890123456",
      eci: "01",
      specificationVersion: "2.2.0",
      ucaf: "123456789012345678901234567890",
    });

    expect(rs).to.be.true;
  });

  it("should validate 3ds data for MC and return an invalid schema when data isn't correct", () => {
    const rs: boolean = CustomValidators.validateThreeDSExternalDataByMC({
      collectionIndicator: "0",
      directoryServerTransactionID: "",
      eci: "01",
      specificationVersion: "2.2.0",
      ucaf: "123456789012345678901234567890",
    });

    expect(rs).to.be.false;
  });
});
