/**
 * Sandbox Aurus Service Unit Tests
 */
import { AurusError, IDENTIFIERS as CORE, ILambdaGateway } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import { get, has, set } from "lodash";
import { ICardGateway } from "repository/ICardGateway";
import { ISandboxGateway } from "repository/ISandboxGateway";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusCaptureRequest } from "types/aurus_capture_request";
import { AurusResponse } from "types/aurus_response";
import { AurusTokensResponse } from "types/aurus_tokens_response";
import { CaptureCardRequest } from "types/capture_card_request";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SandboxAccountValidationRequest } from "types/sandbox_account_validation_lambda_request";
import { CardToken } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";

use(sinonChai);
const TOKEN: string = "token";
const MONTHS_PATH: string = "deferred.months";
const MID: string = "1291219939131";
const TRX_REF = "1234-455559-tutu6";
const REAUTHORIZATION_REQUEST: AurusCaptureRequest = {
  currency_code: "USD",
  language_indicator: "es",
  merchant_identifier: "345545",
  ticket_number: "324234",
  transaction_amount: {
    ICE: "0.00",
    IVA: "330.00",
    Subtotal_IVA: "10.00",
    Subtotal_IVA0: "11.00",
    Total_amount: "351.00",
  },
};
let gChargesAurusResponse: AurusResponse;
let gChargesRequest: UnifiedChargesPreauthRequest;
let gTokensRequest: CardToken;
let gTokensAurusResponse: AurusTokensResponse;
let gToken: DynamoTokenFetch;
let gCaptureCardRequest: CaptureCardRequest;
let gTransaction: Transaction;
let gProcessorName: string = ProcessorEnum.REDEBAN;
let gInvokeLambdaStub: SinonStub;
let gValidateAccountRequest: SandboxAccountValidationRequest;

// tslint:disable-next-line:max-func-body-length
async function createSchemasRequest(): Promise<void> {
  gTokensRequest = Mock.of<CardToken>({
    accountType: "CA",
    card: {
      expiryMonth: "asdas",
      expiryYear: "xzvzc",
      name: "czxcz",
      number: "4242424242424242",
    },
    totalAmount: 333,
  });
  gTokensAurusResponse = Mock.of<AurusTokensResponse>({
    response_code: "bxcvxvx",
    response_text: "rtwerwe",
    transaction_token: "qwertyuiopasdfghjklzxcvbnmqwe456",
    transaction_token_validity: "cxvxv",
  });
  gChargesAurusResponse = Mock.of<AurusResponse>({
    approved_amount: "czxczx",
    recap: "sadads",
    response_code: "asdcxva",
    response_text: "sadbcvbs",
    ticket_number: "asasdass",
    transaction_details: {
      approvalCode: "q2eqeq",
      binCard: "bxbcv",
      cardHolderName: "sxzczc",
      cardType: "asgdfgs",
      isDeferred: "mvmbvcb",
      lastFourDigitsOfCard: "2432423",
      merchantName: "tryryt",
      processorBankName: "yryrty",
      processorName: "nvnvb",
    },
    transaction_id: "vxcvx",
    transaction_reference: "gfjgh",
  });
  gChargesRequest = Mock.of<UnifiedChargesPreauthRequest>({
    amount: {
      iva: 342423,
      subtotalIva: 42432,
      subtotalIva0: 4234,
    },
    tokenId: "asdad",
    usrvOrigin: UsrvOriginEnum.CARD,
  });
  gCaptureCardRequest = Mock.of<CaptureCardRequest>({
    amount: {
      iva: 342423,
      subtotalIva: 42432,
      subtotalIva0: 4234,
    },
    ticketNumber: "asdad",
  });
  gTransaction = Mock.of<Transaction>({
    approval_code: "21321",
    approved_transaction_amount: 344,
    bin_card: "333333",
    card_holder_name: "name",
    created: 123242342,
    currency_code: "COP",
    iva_value: 5,
    last_four_digits: "1234",
    merchant_id: "mid",
    merchant_name: "asfsf",
    payment_brand: "visa",
    processor_bank_name: "gdgfd",
    processor_id: "id",
    processor_name: "zxvzv",
    recap: "adas",
    request_amount: 344,
    subtotal_iva: 5,
    subtotal_iva0: 2,
    sync_mode: "api",
    ticket_number: "11111",
    transaction_id: "2333333",
    transaction_status: "status",
    transaction_type: "type",
  });
  gToken = Mock.of<DynamoTokenFetch>({
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
  });
  gValidateAccountRequest = Mock.of<SandboxAccountValidationRequest>({
    body: {
      country: "Colombia",
      currency_code: "USD",
      language_indicator: "es",
      merchant_identifier: "1000000745161276291315923550630777",
      plcc: "0",
      transaction_amount: {
        ICE: "0.00",
        IVA: "0.00",
        Subtotal_IVA: "0.00",
        Subtotal_IVA0: "0.00",
        Total_amount: "0.00",
      },
      transaction_reference: "b8c6bf2e-88aa-4a60-be60-68b59bfc2dfe",
      transaction_token: "d28194b4c6a34e17b2c3ae2a3a9240d3",
    },
  });
}

async function createSchemasResponse(): Promise<void> {
  gTokensAurusResponse = Mock.of<AurusTokensResponse>({
    response_code: "bxcvxvx",
    response_text: "rtwerwe",
    transaction_token: "qwertyuiopasdfghjklzxcvbnmqwe456",
    transaction_token_validity: "cxvxv",
  });
  gChargesAurusResponse = Mock.of<AurusResponse>({
    approved_amount: "czxczx",
    recap: "sadads",
    response_code: "asdcxva",
    response_text: "sadbcvbs",
    ticket_number: "asasdass",
    transaction_details: {
      approvalCode: "q2eqeq",
      binCard: "bxbcv",
      cardHolderName: "sxzczc",
      cardType: "asgdfgs",
      isDeferred: "mvmbvcb",
      lastFourDigitsOfCard: "2432423",
      merchantName: "tryryt",
      processorBankName: "yryrty",
      processorName: "nvnvb",
    },
    transaction_id: "vxcvx",
    transaction_reference: "gfjgh",
  });
}

function mockGateways(response: object, box: SinonSandbox): void {
  gInvokeLambdaStub = box.stub().returns(
    of({
      body: {
        ...response,
      },
    })
  );
  CONTAINER.unbind(CORE.LambdaGateway);
  CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeFunction: gInvokeLambdaStub,
    })
  );
  CONTAINER.unbind(IDENTIFIERS.CardGateway);
  CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
    Mock.of<ICardGateway>({
      buildAurusAmount: box.stub().returns(
        of({
          IVA: 0.19,
          Subtotal_IVA: 1.1,
          Subtotal_IVA0: 2.2,
          Total_amount: 3.4,
        })
      ),
    })
  );
}

function setBeforeEach(): {
  box: SinonSandbox;
  gateway: ISandboxGateway;
} {
  const box: SinonSandbox = createSandbox();

  CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
    Mock.of<rollbar>({
      warn: box.stub(),
    })
  );

  const gateway: ISandboxGateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);

  process.env.AURUS_URL = "https://aurusinc.com";

  return { box, gateway };
}

function requestTokensSuccess(
  gateway: ISandboxGateway,
  done: Mocha.Done
): void {
  gateway.tokensTransaction(gTokensRequest, "10000", "any", "lorem").subscribe({
    next: (data: TokensCardResponse): void => {
      expect(data).to.be.a("object");
      expect(has(data, "token")).to.be.eql(true);
      expect(data[TOKEN]).to.have.lengthOf(32);
      done();
    },
  });
}

function chargesSuccess(
  gateway: ISandboxGateway,
  done: Mocha.Done,
  trxReference: string,
  tokenInfo: DynamoTokenFetch,
  country: string = "",
  isCommission?: boolean,
  isMCProcessor?: boolean
): void {
  gateway
    .chargesTransaction(
      gChargesRequest,
      MID,
      trxReference,
      "",
      tokenInfo,
      country,
      gProcessorName
    )
    .subscribe({
      next: (data: AurusResponse): void => {
        expect(data).to.be.a("object");
        expect(has(data, "ticket_number")).to.be.eql(true);
        if (isCommission && isMCProcessor) {
          expect(gInvokeLambdaStub.args[0][1].body.name).to.be.eqls(
            gChargesRequest.contactDetails?.firstName
          );
          expect(gInvokeLambdaStub.args[0][1].body.lastname).to.be.eqls(
            gChargesRequest.contactDetails?.lastName
          );
          expect(gInvokeLambdaStub.args[0][1].body.email).to.be.eqls(
            gChargesRequest.contactDetails?.email
          );
        }
        done();
      },
    });
}

function validateAccountSuccess(
  gateway: ISandboxGateway,
  done: Mocha.Done
): void {
  gateway.validateAccountTransaction(gValidateAccountRequest).subscribe({
    next: (data: AurusResponse): void => {
      expect(data).to.have.property("ticket_number");
      expect(data).to.have.property("approved_amount");
      expect(data).to.have.property("response_code");
      done();
    },
  });
}

describe("Sandbox Gateway - Token , Charge , PreAuthorization ", () => {
  let gateway: ISandboxGateway;
  let box: SinonSandbox;

  beforeEach(async () => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    process.env.SANDBOX_VALUES =
      '{"CHARGE":"usrv-sandbox-ci-cardCharges",' +
      '"CAPTURE":"usrv-sandbox-ci-cardCapture",' +
      '"TOKEN":"usrv-sandbox-ci-cardTokens",' +
      '"VALIDATE_ACCOUNT":"usrv-sandbox-ci-cardValidateAccount",' +
      '"REAUTHORIZATION":"usrv-sandbox-ci-cardReauth"}';
    process.env.IVA_EC = "0.12";
    process.env.IVA_CO = "0.19";
    process.env.IVA_PE = "0.18";
    await createSchemasRequest();
    await createSchemasResponse();
    const ret: {
      box: SinonSandbox;
      gateway: ISandboxGateway;
    } = setBeforeEach();

    gToken.cardHolderName = "Pepe Toro";
    box = ret.box;
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function commonExpectSuccess(
    done: Mocha.Done,
    processorName: string,
    isMCProcessor: boolean
  ): void {
    gChargesRequest.amount.iva = 0;
    gChargesRequest.amount.subtotalIva = 30;
    gChargesRequest.amount.currency = "COP";
    gChargesRequest.usrvOrigin = UsrvOriginEnum.COMMISSION;
    gProcessorName = processorName;
    gChargesRequest.contactDetails = {
      email: "test email",
      firstName: "test first name",
      lastName: "test last name",
    };
    gToken.cardHolderName = "Pepe Toro";
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken, "", true, isMCProcessor);
  }

  it("test charge request  without iva in amount - COP request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 0;
    gChargesRequest.amount.subtotalIva = 30;
    gChargesRequest.amount.currency = "COP";
    gToken.cardHolderName = "Pepe Toro";
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request with usrvOrigin usrv-commission - request success", (done: Mocha.Done) => {
    commonExpectSuccess(done, ProcessorEnum.MCPROCESSOR, true);
  });

  it("test charge request with usrvOrigin usrv-commission and processor name is different to MC Processor - request success", (done: Mocha.Done) => {
    commonExpectSuccess(done, ProcessorEnum.REDEBAN, false);
  });

  it("test validateAccount request success", (done: Mocha.Done) => {
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    validateAccountSuccess(gateway, done);
  });

  it("test charge request country Ecuador should success with recap", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 0;
    gChargesRequest.amount.subtotalIva = 30;
    gChargesRequest.amount.currency = "USD";
    gToken.cardHolderName = "Pepe Toro";
    gChargesAurusResponse.recap = "234576";
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken, "Ecuador");
  });

  it("test charge request  without iva in amount  and transaction reference - COP request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.subtotalIva = 10;
    gChargesRequest.amount.currency = "COP";
    gToken.cardHolderName = "Pepe";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, "23424", gToken);
  });

  it("test charge request  without transaction reference - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.ice = 1;
    gChargesRequest.amount.subtotalIva = 10;
    gChargesRequest.amount.currency = "PEN";
    gToken.cardHolderName = "Juan Test Topo";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request  without cardHolderName - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.currency = "PEN";
    delete gToken.cardHolderName;

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request  without cardHolderName complete name - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.currency = "PEN";
    gToken.cardHolderName = "Indigo Merced Smith Doe";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request ec with metadata, ice and deferred - success", (done: Mocha.Done) => {
    gChargesRequest.metadata = { metadata: "metadata" };
    set(gChargesRequest, MONTHS_PATH, 1);
    gChargesRequest.amount.currency = "USD";
    gChargesRequest.amount.ice = 1.12;

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec with grace months and credit type with 3 digits - success", (done: Mocha.Done) => {
    gChargesRequest.deferred = {
      creditType: "002",
      graceMonths: "01",
      months: 3,
    };

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec with grace months and credit type with 2 digits - success", (done: Mocha.Done) => {
    gChargesRequest.deferred = {
      creditType: "02",
      graceMonths: "01",
      months: 3,
    };
    gChargesRequest.amount.currency = "USD";
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec w/o metadata & w/o ice & w/o months - success", (done: Mocha.Done) => {
    gChargesRequest.metadata = undefined;
    set(gChargesRequest, MONTHS_PATH, undefined);
    gChargesRequest.amount.currency = "USD";
    gChargesRequest.amount.ice = undefined;
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request undefined currency - success", (done: Mocha.Done) => {
    gChargesRequest.amount.currency = undefined;
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request with PEN currency - success", (done: Mocha.Done) => {
    gChargesRequest.amount.currency = "PEN";
    gChargesRequest.amount.iva = 0;

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request co w/o extraTaxes & w/o months & w/o metadata - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = undefined;
    gChargesRequest.metadata = undefined;
    set(gChargesRequest, MONTHS_PATH, undefined);
    gChargesRequest.amount.currency = "COP";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request co with extraTaxes & with months & with metadata - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = {
      agenciaDeViaje: 5,
      iac: 10,
      propina: 9,
      tasaAeroportuaria: 3,
    };
    gChargesRequest.metadata = { obj: { name: "name" } };
    set(gChargesRequest, MONTHS_PATH, 3);
    gChargesRequest.amount.currency = "COP";
    gChargesAurusResponse.transaction_reference = "2324";
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "",
        gToken,
        "",
        ProcessorEnum.MCPROCESSOR
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data).to.be.a("object");
          expect(has(data, "ticket_number")).to.be.eql(true);
          expect(has(data, "transaction_reference")).to.be.eql(true);
          done();
        },
      });
  });
  it("test charge request co with extraTaxes empty object - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = {};
    gChargesRequest.amount.currency = "COP";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test capture request - success", (done: Mocha.Done) => {
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .captureTransaction(gCaptureCardRequest, gTransaction, MID)
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          expect(data).to.be.a("object");
          done();
        },
      });
  });
  it("test capture request - error", (done: Mocha.Done) => {
    mockGateways(gChargesAurusResponse, box);

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              ...gChargesAurusResponse,
              ticket_number: "",
            },
          })
        ),
      })
    );

    gCaptureCardRequest = {
      ...gCaptureCardRequest,
      amount: {
        currency: "USD",
        iva: 342423,
        subtotalIva: 42432,
        subtotalIva0: 4234,
      },
    };

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .captureTransaction(gCaptureCardRequest, gTransaction, MID)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error).not.to.be.undefined;
          expect(error.getMetadata()).not.to.haveOwnProperty("metadata");
          done();
        },
      });
  });

  it("test charge request with metadata - error", (done: Mocha.Done) => {
    mockGateways(gChargesAurusResponse, box);

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              ...gChargesAurusResponse,
              ticket_number: "",
            },
          })
        ),
      })
    );

    gChargesRequest = {
      ...gChargesRequest,
      amount: {
        currency: "USD",
        iva: 12,
        subtotalIva: 32,
        subtotalIva0: 0,
      },
      metadata: {
        name: "rockandrolll",
      },
    };

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "",
        gToken,
        "",
        ProcessorEnum.NIUBIZ
      )
      .subscribe({
        error: (error: AurusError): void => {
          expect(error).not.to.be.undefined;
          expect(error.getMetadata()).to.haveOwnProperty("metadata");
          expect(get(error.getMetadata(), "metadata")).to.be.eqls(
            gChargesRequest.metadata
          );
          done();
        },
      });
  });

  it("test tokens request - success", (done: Mocha.Done) => {
    gTokensRequest.currency = undefined;
    gTokensRequest.isDeferred = true;
    gTokensRequest.card.cvv = "123";
    gTokensRequest.card.expiryMonth = "2";

    mockGateways(gTokensAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .tokensTransaction(gTokensRequest, "10000", "transaction", "qwerty")
      .subscribe({
        next: (data: TokensCardResponse): void => {
          expect(data[TOKEN]).to.have.lengthOf(32);
          expect(data).to.be.a("object");
          expect(has(data, "token")).to.be.eql(true);
          done();
        },
      });
  });
  it("test tokens request - success without cvv and not transaction token type", (done: Mocha.Done) => {
    gTokensRequest.currency = "USD";
    delete gTokensRequest.card.cvv;
    gTokensRequest.isDeferred = undefined;
    gTokensRequest.card.expiryMonth = "11";

    mockGateways(gTokensAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    requestTokensSuccess(gateway, done);
  });
  it("test tokens request with Transbank as processor UF - success", (done: Mocha.Done) => {
    gTokensRequest.currency = "UF";

    gTokensRequest.isDeferred = false;

    mockGateways(gTokensAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "Transbank Processor"
      )
      .subscribe({
        next: (data: TokensCardResponse): void => {
          expect(data).to.have.property("token");
          done();
        },
      });
  });

  it("test error in token", (done: Mocha.Done) => {
    gTokensRequest.currency = "UF";

    mockGateways(gTokensAurusResponse, box);

    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              response_code: "017",
              response_text: "Tarjeta no válida",
              transaction_token: "",
              transaction_token_validity: "1800000",
            },
          })
        ),
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "Transbank Processor"
      )
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.message).to.be.eq("AURUS017 - Tarjeta no válida");
          expect(error.code).to.be.eq("017");
          done();
        },
      });
  });

  it("should process a reauthorization sandbox transaction successfully", (done: Mocha.Done) => {
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway.reauthTransaction(REAUTHORIZATION_REQUEST).subscribe({
      next: (data: AurusResponse): void => {
        expect(data).to.have.property("ticket_number");
        expect(data).to.have.property("transaction_details");
        done();
      },
    });
  });

  it("should throw an error if the ticket number was empty", (done: Mocha.Done) => {
    mockGateways(gChargesAurusResponse, box);
    const processor_error: string = "transaccion declinada";

    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              ...gChargesAurusResponse,
              response_text: processor_error,
              ticket_number: "",
            },
          })
        ),
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway.reauthTransaction(REAUTHORIZATION_REQUEST).subscribe({
      error: (error: AurusError): void => {
        expect(error).not.to.be.undefined;
        expect(error.getStatusCode()).to.be.eql(400);
        expect(error.getMessage()).to.be.eql(processor_error);
        done();
      },
    });
  });
});
