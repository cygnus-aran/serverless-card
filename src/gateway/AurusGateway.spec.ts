/**
 * AurusGateway Unit Tests
 */
import {
  AurusError,
  IAxiosGateway,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  ILogger,
  KushkiError,
} from "@kushki/core";
import { TokenTypeEnum } from "@kushki/core/lib/infrastructure/TokenTypeEnum";
import { Context } from "aws-lambda";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { AMEX_IDENTIFIER } from "constant/Resources";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import { UsrvOriginEnum } from "infrastructure/UsrvOriginEnum";
import * as lodash from "lodash";
import { parseFullName } from "parse-full-name";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import rollbar = require("rollbar");
import { of, throwError } from "rxjs";
import { delay } from "rxjs/operators";
import { ChargeInput } from "service/CardService";
import { createSandbox, match, SinonSandbox, SinonSpy, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { AurusCreateProcessorResponse } from "types/aurus_create_processor_response";
import { AurusResponse } from "types/aurus_response";
import { AurusTokenLambdaRequest } from "types/aurus_token_lambda_request";
import { AurusTokensResponse } from "types/aurus_tokens_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CaptureCardRequest } from "types/capture_card_request";
import { CaptureSubscriptionRequest } from "types/capture_subscription_request";
import { CreateProcessorRequest } from "types/create_processor_request";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { LambdaTransactionRuleBodyResponse } from "types/lambda_transaction_rule_response";
import { CardToken } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { UnifiedChargesPreauthRequest } from "types/unified_charges_preauth_request";
import { has, unset } from "lodash";
import { CardBrandEnum } from "infrastructure/CardBrandEnum";
import { SubscriptionTriggerEnum } from "infrastructure/SubscriptionEnum";

use(sinonChai);
const TOKEN: string = "token";
const MID: string = "1291219939131";
const TRX_REF = "1234-455559-tutu6";
let gCaptureRequest: CaptureCardRequest;
let gChargesAurusResponse: AurusResponse;
let gChargesRequest: UnifiedChargesPreauthRequest;
let gTokensRequest: CardToken;
let gTokensAurusResponse: AurusTokensResponse;
let gToken: DynamoTokenFetch;
let gAurusResponse: AurusResponse;
let gTransaction: Transaction;
let gChargeInput: object;
let gProcessor: DynamoProcessorFetch;
const G_PROCESSOR_NAME_PATH: string = "processor.processor_name";
const G_CURRENT_MERCHANT_COUNTRY_PATH: string = "currentMerchant.country";
const G_CURRENT_TOKEN_CARD_HOLDER_NAME: string = "currentToken.cardHolderName";
const G_MONTHS_PATH: string = "deferred.months";
const G_BIN_INFO_BRAND: string = "binInfo.brand";
const PROCESSORFETCH: DynamoProcessorFetch = {
  "3ds": {},
  created: 1111,
  merchant_id: "12345",
  private_id: "123331",
  processor_name: "Credimatic Processor",
  processor_type: "traditional",
  public_id: "23444",
  terminal_id: "K69",
};

function getToken(): DynamoTokenFetch {
  return { ...gToken };
}

// tslint:disable-next-line:max-func-body-length
function createSchemas(): void {
  gTokensRequest = Mock.of<CardToken>({
    accountType: "CR",
    card: {
      expiryMonth: "asdas",
      expiryYear: "xzvzc",
      name: "czxcz",
      number: "cxvxcv",
    },
    totalAmount: 333,
  });
  gTokensAurusResponse = Mock.of<AurusTokensResponse>({
    response_code: "bxcvxvx",
    response_text: "rtwerwe",
    transaction_token: "qwertyuiopasdfghjklzxcvbnmqwe456",
    transaction_token_validity: "cxvxv",
  });
  gCaptureRequest = Mock.of<CaptureCardRequest>({
    ticketNumber: "eadadas",
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
  gAurusResponse = gChargesAurusResponse;
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
  gProcessor = {
    "3ds": {},
    created: 1111,
    merchant_id: "123",
    private_id: "123",
    processor_name: ProcessorEnum.VISANET,
    processor_type: "123",
    public_id: "123",
    terminal_id: "123",
  };
}

function setBeforeEach(): {
  box: SinonSandbox;
  rps: SinonStub;
  gateway: ICardGateway;
} {
  const box: SinonSandbox = createSandbox();
  const rps: SinonStub = box.stub();

  CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
    Mock.of<rollbar>({
      critical: box.stub(),
      warn: box.stub(),
    })
  );

  const gateway: ICardGateway = CONTAINER.get(IDENTIFIERS.CardGateway);

  process.env.AURUS_URL = "https://aurusinc.com";

  return { box, rps, gateway };
}

type SinonSpySum = SinonSpy<[ArrayLike<number> | null | undefined]>;

function noDataVoidSuccess(
  gateway: ICardGateway,
  spyNext: SinonSpy,
  done: Mocha.Done,
  spyLodashSum: SinonSpySum
): void {
  gateway
    .voidTransaction(undefined, "1234567890", "95678343356756", TRX_REF)
    .subscribe({
      complete: (): void => {
        expect(spyLodashSum).to.not.be.called;
        expect(spyNext).to.be.calledOnce.and.calledWith(gAurusResponse);
        done();
      },
      error: done,
      next: spyNext,
    });
}

function successVoidWithAmountAndExtraTaxes(
  gateway: ICardGateway,
  amount: Amount,
  spyNext: SinonSpy,
  done: Mocha.Done,
  spyLodashSum: SinonSpySum
): void {
  gateway
    .voidTransaction(
      {
        amount,
      },
      "1234567890",
      "95678343356756",
      TRX_REF
    )
    .subscribe({
      complete: (): void => {
        expect(spyNext).to.be.calledOnce.and.calledWith(gAurusResponse);
        expect(spyLodashSum).to.be.calledTwice.and.calledWithExactly([
          (<Required<Amount>>amount).extraTaxes.agenciaDeViaje,
          (<Required<Amount>>amount).extraTaxes.tasaAeroportuaria,
        ]);
        done();
      },
      error: done,
      next: spyNext,
    });
}

function requestTokensSuccess(
  gateway: ICardGateway,
  context: Context,
  done: Mocha.Done
): void {
  gateway
    .tokensTransaction(
      gTokensRequest,
      "10000",
      "any",
      "lorem",
      "qwerty",
      context
    )
    .subscribe({
      next: (data: TokensCardResponse): void => {
        expect(data).to.be.a("object");
        expect(has(data, "token")).to.be.eql(true);
        expect(data[TOKEN]).to.have.lengthOf(32);
        done();
      },
    });
}

function chargesSuccess(
  gateway: ICardGateway,
  done: Mocha.Done,
  trxReference: string,
  tokenInfo: DynamoTokenFetch,
  isFailoverRetry: boolean = false
): void {
  gChargeInput = buildChargeInput(trxReference, tokenInfo);
  lodash.set(gChargeInput, "isFailoverRetry", isFailoverRetry);
  gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
    next: (data: AurusResponse): void => {
      expect(data).to.be.a("object");
      expect(has(data, "ticket_number")).to.be.eql(true);
      done();
    },
  });
}

function buildChargeInput(trxReference: string, tokenInfo: DynamoTokenFetch) {
  return {
    authorizerContext: {
      credentialId: "123",
      merchantId: "0000",
    },
    currentMerchant: {
      public_id: "1111",
      whiteList: "true",
    },
    currentToken: {
      ...tokenInfo,
      transactionReference: trxReference,
    },
    event: gChargesRequest,
    plccInfo: { flag: "" },
    processor: {
      private_id: MID,
      processor_name: "Try",
      public_id: "112",
    },
    transactionType: "charge",
  };
}

function getAmount(): Amount {
  return {
    currency: "USD",
    iva: 12,
    subtotalIva: 100,
    subtotalIva0: 0,
  };
}

function calculateIva(gCharges: UnifiedChargesPreauthRequest): string {
  gCharges.amount.currency = "USD";
  gCharges.amount.subtotalIva0 = 0;
  gCharges.amount.iva = 0;
  gCharges.amount.ice = 0;
  gCharges.amount.subtotalIva = 150;

  return (
    gCharges.amount.subtotalIva -
    gCharges.amount.subtotalIva / 1.12
  ).toFixed(2);
}

function mockLambdaGateway(invokeFunctionStub: SinonStub): void {
  CONTAINER.unbind(CORE.LambdaGateway);
  CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeFunction: invokeFunctionStub,
    })
  );
}

describe("Aurus Gateway - getAurusToken Method", () => {
  let gateway: ICardGateway;
  let sandbox: SinonSandbox;

  beforeEach(() => {
    CONTAINER.snapshot();
    sandbox = createSandbox();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        warn: sandbox.stub(),
      })
    );
  });

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
  });

  it("test success getAurusToken", (done: Mocha.Done) => {
    const request: AurusTokenLambdaRequest = Mock.of<AurusTokenLambdaRequest>({
      merchantId: "merchantId",
      totalAmount: 0,
      vaultToken: "vaultToken",
    });
    const response: TokensCardResponse = Mock.of<TokensCardResponse>({
      token: "token",
    });
    const lambda_stub: SinonStub = sandbox.stub().returns(
      of({
        body: response,
      })
    );

    mockLambdaGateway(lambda_stub);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);

    gateway.getAurusToken(request).subscribe({
      next: (data: TokensCardResponse): void => {
        expect(data.token).to.be.equal(response.token);
        expect(lambda_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("test subscription-charge request - error", (done: Mocha.Done) => {
    const request: AurusTokenLambdaRequest = Mock.of<AurusTokenLambdaRequest>({
      merchantId: "89329829832",
      totalAmount: 10,
      vaultToken: "tokencillo",
    });
    const lambda_stub: SinonStub = sandbox.stub().throws(
      new KushkiError(ERRORS.E010, "Error", {
        response_code: "018",
        response_text: "Tarjeta invalida.",
      })
    );

    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.getAurusToken(request).subscribe({
      error: (err: AurusError): void => {
        expect(err.code).to.be.eql("018");
        expect(lambda_stub).to.be.calledOnce;
        done();
      },
    });
  });

  it("test subscription-charge request - generic error", (done: Mocha.Done) => {
    const request: AurusTokenLambdaRequest = Mock.of<AurusTokenLambdaRequest>({
      merchantId: "89329829832",
      totalAmount: 10,
      vaultToken: "tokencillo",
    });
    const lambda_stub: SinonStub = sandbox
      .stub()
      .throws(new Error("generic error"));

    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.getAurusToken(request).subscribe({
      error: (err: AurusError): void => {
        expect(lambda_stub).to.be.calledOnce;
        expect(err.code).to.be.eql("020");
        done();
      },
    });
  });

  it("test fails getAurusToken | timeout error", (done: Mocha.Done) => {
    process.env.EXTERNAL_TIMEOUT = "100";
    const request: AurusTokenLambdaRequest = Mock.of<AurusTokenLambdaRequest>({
      merchantId: "merchantId",
      totalAmount: 0,
      vaultToken: "vaultToken",
    });
    const response: TokensCardResponse = Mock.of<TokensCardResponse>({
      token: "token",
    });
    const lambda_stub: SinonStub = sandbox.stub().returns(
      of({
        body: response,
      }).pipe(delay(110))
    );

    mockLambdaGateway(lambda_stub);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);

    gateway.getAurusToken(request).subscribe({
      error: (err: AurusError): void => {
        expect(err.getStatusCode()).to.be.equal(400);
        expect(err.getMessage()).to.be.equal("020");
        done();
      },
    });
    process.env.EXTERNAL_TIMEOUT = undefined;
  });
});

describe("Aurus Gateway - Void", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let rps: SinonStub;

  function prepareTest(): {
    spy_next: SinonSpy;
    spy_lodash_sum: SinonSpySum;
  } {
    rps.returns(of(gAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    const spy_next: SinonSpy = box.spy();
    const spy_lodash_sum: SinonSpy<[ArrayLike<number> | null | undefined]> =
      box.spy(lodash, "sum");

    return { spy_next, spy_lodash_sum };
  }

  function testWithAmount(
    amount: Amount,
    spyNext: SinonSpy,
    done: Mocha.Done,
    spyLodashSum: SinonSpySum,
    trxReference: string
  ): void {
    gateway
      .voidTransaction(
        {
          amount,
        },
        "1234567890",
        "95678343356756",
        trxReference
      )
      .subscribe({
        complete: (): void => {
          expect(spyNext).to.be.calledOnce.and.calledWith(gAurusResponse);
          expect(spyLodashSum).to.be.calledOnce.and.calledWithExactly([
            amount.iva,
            amount.subtotalIva,
            amount.subtotalIva0,
          ]);
          done();
        },
        error: done,
        next: spyNext,
      });
  }

  beforeEach(() => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    createSchemas();
    box = createSandbox();
    rps = box.stub();

    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        warn: box.stub(),
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    process.env.IVA_VALUES = `{ "USD": 0.12, "COP": 0.19, "CLP": 0.19, "UF": 0.19, "PEN": 0.18, "MXN": 0.16 }`;
    process.env.AURUS_URL = "https://aurusinc.com";
    process.env.IVA_EC = "0.12";
    process.env.IVA_CO = "0.19";
    process.env.IVA_PE = "0.18";
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("test success void with null or undefined data", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    noDataVoidSuccess(gateway, spy_next, done, spy_lodash_sum);
  });
  it("test success void with amount", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = getAmount();

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    testWithAmount(amount, spy_next, done, spy_lodash_sum, TRX_REF);
  });
  it("test success void with amount and transaction reference", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = getAmount();

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    testWithAmount(amount, spy_next, done, spy_lodash_sum, "132424");
  });
  it("test success void with amount and extraTaxes", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = {
      ...getAmount(),
      extraTaxes: {
        agenciaDeViaje: 200,
        tasaAeroportuaria: 300,
      },
    };

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    successVoidWithAmountAndExtraTaxes(
      gateway,
      amount,
      spy_next,
      done,
      spy_lodash_sum
    );
  });
  it("test success void with amount without iva COP", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = {
      currency: "COP",
      iva: 0,
      subtotalIva: 3000,
      subtotalIva0: 0,
    };

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    testWithAmount(amount, spy_next, done, spy_lodash_sum, TRX_REF);
  });
  it("test success void with amount without iva USD", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = {
      iva: 0,
      subtotalIva: 112,
      subtotalIva0: 0,
    };

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    testWithAmount(amount, spy_next, done, spy_lodash_sum, TRX_REF);
  });
});

describe("Aurus Gateway - Token , Charge , PreAuthorization ", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let rps: SinonStub;
  let authorizer_context: AuthorizerContext;

  beforeEach(() => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    process.env.IVA_EC = "0.12";
    process.env.IVA_CO = "0.19";
    process.env.IVA_PE = "0.18";
    process.env.IVA_VALUES = `{ "USD": 0.12, "COP": 0.19, "CLP": 0.19, "UF": 0.19, "PEN": 0.18, "MXN": 0.16 }`;
    createSchemas();
    const ret: {
      box: SinonSandbox;
      rps: SinonStub;
      gateway: ICardGateway;
    } = setBeforeEach();

    gToken.cardHolderName = "Pepe Toro";
    box = ret.box;
    rps = ret.rps;

    authorizer_context = Mock.of<AuthorizerContext>({
      credentialId: "123",
      merchantId: "0000",
    });
    gChargeInput = buildChargeInput(TRX_REF, gToken);
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function buildChargeInputRequest(
    contextStub,
    processor: string,
    isSubsValidation?: boolean
  ): void {
    gChargeInput = {
      amount: {
        iva: 2,
        subtotalIva: 2,
        subtotalIva0: 2,
      },
      authorizerContext: authorizer_context,
      currentMerchant: Mock.of<DynamoMerchantFetch>({
        public_id: "1111",
        whiteList: true,
      }),
      currentToken: {
        ...gToken,
        amount: 18.78,
        transactionReference: TRX_REF,
      },
      event: {
        ...gChargesRequest,
        amount: {
          currency: "USD",
          ice: 2.15,
          iva: 2.02,
          subtotalIva: 16.61,
          subtotalIva0: 0,
        },
        metadata: {
          canal: "canal",
        },
        tokenId: "",
      },
      metadata: {
        ksh_subscriptionValidation: isSubsValidation,
      },
      isFailoverRetry: false,
      lambdaContext: contextStub,
      metadataId: "123123123",
      plccInfo: { flag: "0", brand: "0" },
      processor: PROCESSORFETCH,
      skipSecurityValidation: true,
      tokenType: TokenTypeEnum.TRANSACTION,
      transactionType: "charge",
      trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({
        body: {
          processor,
          failOverProcessor: {
            privateId: "123123123",
          },
        },
      }),
    };
  }

  function expectSuccessSubscriptionTransaction(
    done: Mocha.Done,
    processor: string,
    metadata: string | undefined,
    isError5XX: boolean,
    errorCode: string,
    isAurusError?: boolean,
    isUnknowError?: boolean,
    processorName?: string,
    countryMerchant?: string
  ): void {
    gChargesRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    if (isError5XX) {
      gChargesRequest.failOverSubscription = true;
      metadata = undefined;
    } else gChargesRequest.failOverSubscription = false;
    const invoke_lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: { plccMetadata: string } }>({
          body: {
            plccMetadata: metadata,
          },
        })
      )
    );

    mockLambdaGateway(invoke_lambda_stub);

    commonExpectedError(
      done,
      errorCode,
      true,
      processor,
      invoke_lambda_stub,
      isError5XX,
      isAurusError,
      isUnknowError,
      processorName,
      countryMerchant
    );
  }

  function expectCvvInMCSubscriptionTransaction(
    done: Mocha.Done,
    metadata: string | undefined,
    brand: string,
    countryMerchant?: string,
    isSubsValidation?: boolean,
    expectedCvv?: string
  ): void {
    gChargesRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    gChargesRequest.failOverSubscription = false;

    mockLambdaGateway(
      box.stub().returns(
        of(
          Mock.of<{ body: { plccMetadata: string } }>({
            body: {
              plccMetadata: metadata,
            },
          })
        )
      )
    );

    commonExpectCvv(
      done,
      ProcessorEnum.MCPROCESSOR,
      brand,
      countryMerchant,
      isSubsValidation,
      true,
      expectedCvv
    );
  }

  function commonExpectCvv(
    done: Mocha.Done,
    processor: string,
    brand?: string,
    countryMerchant?: string,
    isSubsValidation?: boolean,
    expectCvv?: boolean,
    expectedCvv?: string
  ): void {
    const stringify_spy: SinonSpy<
      [
        string,
        ((string | number)[] | null | undefined)?,
        (string | number | undefined)?
      ]
    > = box.spy(JSON, "stringify");
    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(5000),
    });

    buildChargeInputRequest(context_stub, processor, isSubsValidation);
    rps.rejects(throwError(new Error()));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    lodash.set(gChargeInput, "subtokenType", "transaction");
    lodash.set(gChargeInput, G_CURRENT_MERCHANT_COUNTRY_PATH, countryMerchant);
    lodash.set(gChargeInput, G_PROCESSOR_NAME_PATH, processor);
    lodash.set(gChargeInput, "currentToken.binInfo.brand", brand);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      error: (data: AurusError): void => {
        if (expectCvv) {
          expectedCvv
            ? expect(stringify_spy.args[1][0]).to.haveOwnProperty(
                "cvv",
                expectedCvv
              )
            : expect(stringify_spy.args[1][0]).not.to.haveOwnProperty("cvv");
        }
        done();
      },
    });
  }

  function commonExpectedError(
    done: Mocha.Done,
    errorCode: string,
    isPlcc: boolean,
    processor: string,
    invokeLambdaStub?: SinonStub,
    isError5XX?: boolean,
    isAurusError?: boolean,
    isUnknowError?: boolean,
    processorName?: string,
    countryMerchant?: string
  ): void {
    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(5000),
    });

    buildChargeInputRequest(context_stub, processor);
    if (isError5XX) {
      rps.throws({
        response: {
          config: {},
          data: {
            message: "Internal server error",
          },
          headers: {},
          status: 503,
          statusText: "",
        },
      });
      lodash.set(gChargeInput, "skipSecurityValidation", false);
    } else if (isAurusError)
      rps.throws({
        response: {
          config: {},
          data: {
            response_code: "597",
            response_text: "Procesador no disponible",
          },
          headers: {},
          status: 400,
          statusText: "",
        },
      });
    else if (isUnknowError)
      rps.throws({
        response: {
          data: {
            message: "Internal error",
          },
        },
      });
    else rps.rejects(throwError(new Error()));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    lodash.set(gChargeInput, G_CURRENT_MERCHANT_COUNTRY_PATH, countryMerchant);
    lodash.set(gChargeInput, G_PROCESSOR_NAME_PATH, processorName);
    lodash.set(gChargeInput, "subtokenType", "transaction");
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      error: (data: AurusError): void => {
        expect(data.code).to.be.equal(errorCode);
        if (isPlcc)
          expect(invokeLambdaStub?.args[0][1].body).to.be.eqls({
            token: "123123123",
            tokenType: "transaction",
          });

        done();
      },
    });
  }

  function commonPreauthExpectSuccess(done: Mocha.Done): void {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gChargesRequest.amount.currency = "USD";

    gateway
      .preAuthorization(
        gChargesRequest,
        gProcessor,
        gToken,
        "trxReference",
        context
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "transaction_id")).to.be.eql(true);
          done();
        },
      });
  }

  function commonExpectAurusCard(
    done: Mocha.Done,
    errorCode: string,
    isError228: boolean
  ): void {
    rps.throws({
      response: {
        config: {},
        data: {
          processorName: "3D",
          response_code: errorCode,
          response_text: "Error5",
          transaction_details: {},
          transaction_id: "12312323",
        },
        headers: {},
        status: 402,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
      })
    );

    gChargeInput = buildChargeInput(TRX_REF, gToken);
    if (isError228) {
      lodash.set(
        gChargeInput,
        "lambdaContext",
        Mock.of<Context>({
          getRemainingTimeInMillis: box.stub().returns(29000),
        })
      );

      lodash.set(
        gChargeInput,
        "trxRuleResponse",
        Mock.of<LambdaTransactionRuleBodyResponse>({
          body: {
            failOverProcessor: {
              privateId: "123123123",
            },
          },
        })
      );

      lodash.set(gChargeInput, "isFailoverRetry", false);
    }

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      complete: done,
      error: (error: AurusError): void => {
        expect(error.getMessage()).to.be.eql("Error5");
        done();
      },
    });
  }

  function commonExpectProcessor(
    done: Mocha.Done,
    processorName: string
  ): void {
    rps.returns(of(gChargesAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    lodash.set(gToken, "binInfo", {
      bank: "string",
      bin: "string",
      brand: "Mastercard",
      processor: "string",
    });

    lodash.set(gChargeInput, "processor.processor_code", "00002");

    lodash.set(gChargeInput, G_PROCESSOR_NAME_PATH, processorName);
    lodash.set(gChargeInput, "currentToken.binInfo.brand", "AMEX");
    lodash.set(gChargeInput, "currentMerchant.whiteList", "");

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      next: (data: AurusResponse): void => {
        expect(has(data, "ticket_number")).to.be.eql(true);
        done();
      },
    });
  }

  it("test charge request without iva in amount - USD request success", (done: Mocha.Done) => {
    const calculated_iva: string = calculateIva(gChargesRequest);

    rps.returns(of(gChargesAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      next: (data: AurusResponse): void => {
        expect(gChargesRequest.amount.iva).to.be.eql(Number(calculated_iva));
        expect(has(data, "ticket_number")).to.be.eql(true);
        done();
      },
    });
  });

  it("test charge request with CLARO EC CREDIMATIC merchant", (done: Mocha.Done) => {
    process.env.CLARO_EC_PROCESSOR = "1234";
    process.env.CLARO_EC_CHANNEL = "APPMOVIL";
    const token: DynamoTokenFetch = { ...gToken };

    unset(token, "amount");
    rps.returns(of(gChargesAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);

    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    gateway
      .chargesTransaction({
        amount: {
          iva: 2,
          subtotalIva: 2,
          subtotalIva0: 2,
        },
        authorizerContext: authorizer_context,
        currentMerchant: Mock.of<DynamoMerchantFetch>({
          public_id: "1111",
          whiteList: true,
        }),
        currentToken: getToken(),
        event: Mock.of<UnifiedChargesPreauthRequest>({
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "APPMOVIL",
          },
        }),
        isFailoverRetry: false,
        lambdaContext: context_stub,
        plccInfo: { flag: "0", brand: "0" },
        processor: PROCESSORFETCH,
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: TransactionRuleTypeEnum.CHARGE,
        trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({}),
      })
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("test charge request with DATAFAST Processor", (done: Mocha.Done) => {
    const token: DynamoTokenFetch = getToken();

    unset(token, "amount");
    rps.returns(of(gChargesAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);

    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    PROCESSORFETCH.processor_name = ProcessorEnum.DATAFAST;
    gChargesRequest.deferred = undefined;
    gChargesRequest.usrvOrigin = UsrvOriginEnum.CARD;

    gateway
      .chargesTransaction({
        amount: {
          iva: 2,
          subtotalIva: 2,
          subtotalIva0: 2,
        },
        authorizerContext: authorizer_context,
        currentMerchant: Mock.of<DynamoMerchantFetch>({
          public_id: "1111",
          whiteList: true,
        }),
        currentToken: token,
        event: Mock.of<UnifiedChargesPreauthRequest>({
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "APPMOVIL",
          },
        }),
        isFailoverRetry: false,
        lambdaContext: context_stub,
        plccInfo: { flag: "0", brand: "0" },
        processor: PROCESSORFETCH,
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: TransactionRuleTypeEnum.CHARGE,
        trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({}),
      })
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("test charge request with DATAFAST Processor and months is null", (done: Mocha.Done) => {
    const token: DynamoTokenFetch = getToken();

    rps.returns(of({ ...gChargesAurusResponse }));

    CONTAINER.rebind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);

    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    PROCESSORFETCH.processor_name = ProcessorEnum.DATAFAST;
    gChargesRequest.deferred = undefined;
    lodash.set(gChargesRequest, "months", null);

    gateway
      .chargesTransaction({
        amount: {
          iva: 2,
          subtotalIva: 2,
          subtotalIva0: 2,
        },
        authorizerContext: authorizer_context,
        currentMerchant: Mock.of<DynamoMerchantFetch>({
          public_id: "1111",
          whiteList: true,
        }),
        currentToken: token,
        event: Mock.of<UnifiedChargesPreauthRequest>({
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "KJSJKAkjasjka",
          },
        }),
        isFailoverRetry: false,
        lambdaContext: context_stub,
        plccInfo: { flag: "0", brand: "0" },
        processor: PROCESSORFETCH,
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: TransactionRuleTypeEnum.CHARGE,
        trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({}),
      })
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("test charge request with CLARO EC CREDIMATIC merchant - with different token amount", (done: Mocha.Done) => {
    process.env.CLARO_EC_PROCESSOR = "1234";
    process.env.CLARO_EC_PERCENTAGE = "10";
    process.env.CLARO_EC_CHANNEL = "APPMOVIL";

    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    PROCESSORFETCH.private_id = "1234";

    rps.returns(of(gChargesAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction({
        amount: {
          iva: 2,
          subtotalIva: 2,
          subtotalIva0: 2,
        },
        authorizerContext: authorizer_context,
        currentMerchant: Mock.of<DynamoMerchantFetch>({
          public_id: "1111",
          whiteList: true,
        }),
        currentToken: {
          ...gToken,
          amount: 19.78,
          transactionReference: TRX_REF,
        },
        event: Mock.of<UnifiedChargesPreauthRequest>({
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "APPMOVIL",
          },
        }),
        isFailoverRetry: false,
        lambdaContext: context_stub,
        plccInfo: { flag: "0", brand: "0" },
        processor: PROCESSORFETCH,
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: "charge",
        trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({}),
      })
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("test charge request with timeout", (done: Mocha.Done) => {
    rps.returns(of(gChargesAurusResponse).pipe(delay(7000)));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(5000),
    });

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction({
        amount: {
          iva: 2,
          subtotalIva: 2,
          subtotalIva0: 2,
        },
        authorizerContext: authorizer_context,
        currentMerchant: Mock.of<DynamoMerchantFetch>({
          public_id: "1111",
          whiteList: true,
        }),
        currentToken: {
          ...gToken,
          amount: 18.78,
          transactionReference: TRX_REF,
        },
        event: {
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "canal",
          },
          tokenId: "",
          usrvOrigin: UsrvOriginEnum.CARD,
        },
        isFailoverRetry: false,
        lambdaContext: context_stub,
        plccInfo: { flag: "0", brand: "0" },
        processor: PROCESSORFETCH,
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: "charge",
        trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({}),
      })
      .subscribe({
        error: (data: AurusError): void => {
          expect(data.code).to.be.equal("504");
          done();
        },
      });
  });

  it("test charge request with unknown error", (done: Mocha.Done) => {
    commonExpectedError(done, "504", false, ProcessorEnum.REDEBAN);
  });

  it("test charge request with 5XX error with usrvOrigin usrv-subscriptions", (done: Mocha.Done) => {
    lodash.set(gToken, G_BIN_INFO_BRAND, "amex");
    expectSuccessSubscriptionTransaction(
      done,
      ProcessorEnum.MCPROCESSOR,
      "test",
      true,
      "503"
    );
  });

  it("test charge request with Aurus error with usrvOrigin usrv-subscriptions", (done: Mocha.Done) => {
    lodash.set(gToken, G_BIN_INFO_BRAND, "amex");
    expectSuccessSubscriptionTransaction(
      done,
      ProcessorEnum.MCPROCESSOR,
      "test",
      false,
      "597",
      true
    );
  });

  it("test charge request with unknown 2XX with usrvOrigin usrv-subscriptions", (done: Mocha.Done) => {
    commonExpect(done, "test", "amex");
  });

  it("test charge request with unknown error when metadata is blank", (done: Mocha.Done) => {
    lodash.set(gToken, G_BIN_INFO_BRAND, "amex");
    expectSuccessSubscriptionTransaction(
      done,
      ProcessorEnum.MCPROCESSOR,
      "",
      false,
      "504",
      false,
      true
    );
  });

  it("test charge request with unknown error when brand is different to amex", (done: Mocha.Done) => {
    commonExpect(done, "", "visa");
  });

  function commonExpect(done: Mocha.Done, metadata: string, brand: string) {
    lodash.set(gToken, G_BIN_INFO_BRAND, brand);
    expectSuccessSubscriptionTransaction(
      done,
      ProcessorEnum.MCPROCESSOR,
      metadata,
      false,
      "228"
    );
  }

  it("test charge request with unknown error when processor is different to MC Processor", (done: Mocha.Done) => {
    expectSuccessSubscriptionTransaction(
      done,
      ProcessorEnum.REDEBAN,
      "metadata test",
      false,
      "228"
    );
  });

  it("test charge request with CLARO EC CREDIMATIC merchant - with more percentage", (done: Mocha.Done) => {
    process.env.CLARO_EC_PROCESSOR = "1111";
    process.env.CLARO_EC_PERCENTAGE = "1";
    process.env.CLARO_EC_CHANNEL = "APPMOVIL";

    PROCESSORFETCH.private_id = "1111";
    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    rps.returns(of(gChargesAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction({
        amount: {
          iva: 2,
          subtotalIva: 2,
          subtotalIva0: 2,
        },
        authorizerContext: authorizer_context,
        currentMerchant: Mock.of<DynamoMerchantFetch>({
          public_id: "1111",
          whiteList: true,
        }),
        currentToken: {
          ...gToken,
          amount: 18.78,
          transactionReference: TRX_REF,
        },
        event: Mock.of<UnifiedChargesPreauthRequest>({
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "APPMOVIL",
          },
        }),
        isFailoverRetry: false,
        lambdaContext: context_stub,
        plccInfo: { flag: "0", brand: "0" },
        processor: PROCESSORFETCH,
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: "charge",
        trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({}),
      })
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data).to.haveOwnProperty("ticket_number");
          done();
        },
      });
  });

  it("when chargesTransaction is called with credit type of datafast, it will response success", (done: Mocha.Done) => {
    rps.returns(of(gChargesAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    lodash.set(gChargesRequest, "deferred.creditType", "002");

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      next: (data: AurusResponse): void => {
        expect(has(data, "ticket_number")).to.be.eql(true);
        done();
      },
    });
  });

  describe("amex succes", () => {
    const generate_test_amex_transaction = (): ChargeInput => {
      const context_stub: Context = Mock.of<Context>({
        getRemainingTimeInMillis: box.stub().returns(29000),
      });

      return {
        amount: {
          iva: 2,
          subtotalIva: 2,
          subtotalIva0: 2,
        },
        authorizerContext: authorizer_context,
        currentMerchant: Mock.of<DynamoMerchantFetch>({
          public_id: "1111",
          whiteList: true,
        }),
        currentToken: {
          ...gToken,
          amount: 19.78,
          transactionReference: TRX_REF,
        },
        event: Mock.of<UnifiedChargesPreauthRequest>({
          ...gChargesRequest,
        }),
        isFailoverRetry: false,
        lambdaContext: context_stub,
        plccInfo: { flag: "0", brand: "0" },
        processor: PROCESSORFETCH,
        tokenType: TokenTypeEnum.TRANSACTION,
        transactionType: "charge",
        trxRuleResponse: Mock.of<LambdaTransactionRuleBodyResponse>({}),
      };
    };

    beforeEach(() => {
      rps.returns(of(gChargesAurusResponse));

      CONTAINER.unbind(CORE.AxiosGateway);
      CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
        Mock.of<IAxiosGateway>({
          request: rps,
        })
      );

      lodash.set(gToken, "binInfo", {
        bank: "string",
        bin: "string",
        brand: AMEX_IDENTIFIER,
        processor: "string",
      });

      PROCESSORFETCH.processor_name = ProcessorEnum.BILLPOCKET;
      PROCESSORFETCH.private_id = MID;

      gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    });

    it("when chargesTransaction is called with credit type of billpocket and brand is amex, it will response success", (done: Mocha.Done) => {
      const amex_transaction: ChargeInput = generate_test_amex_transaction();

      gateway.chargesTransaction(amex_transaction).subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
    });

    it("should process charge transaction successfully when brand is amex, last name contact details length is more than 15", (done: Mocha.Done) => {
      const amex_transaction: ChargeInput = generate_test_amex_transaction();

      lodash.set(
        amex_transaction,
        "event.contactDetails.lastName",
        "Fernandez Gutierrez"
      );

      gateway.chargesTransaction(amex_transaction).subscribe({
        next: (data: AurusResponse): void => {
          expect(rps).to.be.calledOnce;
          expect(
            Object.prototype.hasOwnProperty.call(data, "ticket_number")
          ).to.be.eql(true);
          done();
        },
      });
    });

    it("should reduce contact details first name length if it has mora than 15 characters", (done: Mocha.Done) => {
      const amex_transaction: ChargeInput = generate_test_amex_transaction();

      lodash.set(
        amex_transaction,
        "event.contactDetails.firstName",
        "More than 15 characters First Name"
      );
      gateway.chargesTransaction(amex_transaction).subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
    });

    it("should change especial characters for Amex in firstName and lastName", (done: Mocha.Done) => {
      const amex_transaction: ChargeInput = generate_test_amex_transaction();
      const info_logger_stub: SinonStub = box.stub();

      lodash.set(amex_transaction, "event.contactDetails.firstName", "Mónica");
      lodash.set(amex_transaction, "event.contactDetails.lastName", "Muñoz");
      CONTAINER.unbind(CORE.Logger);
      CONTAINER.bind(CORE.Logger).toConstantValue(
        Mock.of<ILogger>({
          error: box.stub(),
          info: info_logger_stub,
        })
      );

      gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
      gateway.chargesTransaction(amex_transaction).subscribe({
        next: (data: AurusResponse): void => {
          expect(info_logger_stub.args[0][1].params).to.contains({
            amexCustFirstName: "Monica",
            amexCustLastName: "Munoz",
          });
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
    });
  });

  it("when chargesTransaction is called with credit type of visanet with processor code, it will response success", (done: Mocha.Done) => {
    commonExpectProcessor(done, ProcessorEnum.VISANET);
  });

  it("when chargesTransaction is called with credit type of NIUBIZ with processor code, it will response success", (done: Mocha.Done) => {
    commonExpectProcessor(done, ProcessorEnum.NIUBIZ);
  });

  it("should called chargesTransaction with whiteList param and it will response success", (done: Mocha.Done) => {
    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    lodash.set(gChargesRequest, "deferred.creditType", "002");
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    lodash.set(gChargeInput, "currentMerchant.whiteList", "1");
    lodash.set(gChargeInput, "plccInfo.flag", "0");
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      next: (data: AurusResponse): void => {
        expect(has(data, "ticket_number")).to.be.eql(true);
        done();
      },
    });
  });

  it("should called chargesTransaction and should return error", (done: Mocha.Done) => {
    rps.throws({
      response: {
        config: {},
        data: {
          response_code: "11111",
          response_text: "Error",
          transaction_details: {},
          transaction_id: "",
        },
        headers: {},
        status: 402,
        statusText: "",
      },
    });
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
      })
    );

    gChargeInput = buildChargeInput(TRX_REF, gToken);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      error: (error: AurusError): void => {
        expect(error.getMessage()).to.be.eql("Error");
        done();
      },
    });
  });

  it("should call chargesTransaction with metadata included on input request and should return error", (done: Mocha.Done) => {
    rps.throws({
      response: {
        config: {},
        data: {
          response_code: "11111",
          response_text: "Error metadata",
          transaction_details: {
            amount: 12,
            approvalCode: "12",
            processorName: "2C",
          },
          transaction_id: "",
        },
        headers: {},
        status: 402,
        statusText: "",
      },
    });
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
      })
    );
    gChargesRequest.metadata = {
      test: "2134",
    };
    gChargeInput = buildChargeInput(TRX_REF, gToken);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      error: (error: AurusError): void => {
        expect(error.getMessage()).to.be.eql("Error metadata");
        expect(lodash.has(error.getMetadata(), "metadata")).to.be.eql(true);
        done();
      },
    });
  });

  it("should called chargesTransaction and should return error, AurusResponse with transactionId", (done: Mocha.Done) => {
    commonExpectAurusCard(done, "11211", false);
  });

  it("should called chargesTransaction and should return error, AurusResponse with transactionId and erro 228", (done: Mocha.Done) => {
    commonExpectAurusCard(done, "228", true);
  });

  it("test preAuthorization request without currency - success", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gToken.cardHolderName = "Card ";

    if (gChargesRequest.amount) delete gChargesRequest.amount.currency;

    gateway
      .preAuthorization(gChargesRequest, gProcessor, gToken, "refTrx", context)
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("test preAuthorization request with currency  - success", (done: Mocha.Done) => {
    commonPreauthExpectSuccess(done);
  });

  it("test preAuthorization when is subscription transaction  - success", (done: Mocha.Done) => {
    gChargesRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    lodash.set(gChargesRequest, "contactDetails.email", "test@test.com");
    lodash.set(gChargesRequest, "metadata", "test");
    gProcessor.processor_name = ProcessorEnum.ELAVON;
    gChargesRequest.merchantCountry = CountryEnum.USA;
    commonPreauthExpectSuccess(done);
  });

  it("test preAuthorization when is subscription transaction and processor name is different to USA  - success", (done: Mocha.Done) => {
    gChargesRequest.usrvOrigin = UsrvOriginEnum.SUBSCRIPTIONS;
    lodash.set(gChargesRequest, "contactDetails.email", "test@test.com");
    lodash.set(gChargesRequest, "metadata", "test");
    gProcessor.processor_name = ProcessorEnum.ELAVON;
    gChargesRequest.merchantCountry = CountryEnum.ECUADOR;
    commonPreauthExpectSuccess(done);
  });

  it("test preAuthorization with timeout", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(4000),
    });

    rps.returns(of(gChargesAurusResponse).pipe(delay(6000)));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gChargesRequest.amount.currency = "USD";

    gateway
      .preAuthorization(
        gChargesRequest,
        gProcessor,
        gToken,
        "trxReference",
        context
      )
      .subscribe({
        error: (data: AurusError): void => {
          expect(data.code).to.be.eql("504");
          done();
        },
      });
  });

  it("test charge request  without iva in amount - COP request success", (done: Mocha.Done) => {
    process.env.IVA_VALUES = `{"USD":0.12,"COP":0.19,"CLP":0.19,"UF":0.19,"PEN":0.18}`;
    gChargesRequest.amount.iva = 0;
    gChargesRequest.amount.subtotalIva = 30;
    gChargesRequest.amount.currency = "COP";
    gToken.cardHolderName = "Pepe Toro";

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("should process charge request when usrvOrigin is subscriptions, processor is Elavon and country is EEUU", (done: Mocha.Done) => {
    expectSuccessSubscriptionTransaction(
      done,
      ProcessorEnum.ELAVON,
      "metadata tes",
      false,
      "228",
      undefined,
      undefined,
      ProcessorEnum.ELAVON,
      CountryEnum.USA
    );
  });

  it("should process charge request when usrvOrigin is subscriptions, processor is MC and country is PERU", (done: Mocha.Done) => {
    expectSuccessSubscriptionTransaction(
      done,
      ProcessorEnum.MCPROCESSOR,
      "metadata tes",
      false,
      "228",
      undefined,
      undefined,
      ProcessorEnum.MCPROCESSOR,
      CountryEnum.PERU
    );
  });

  it("should process charge request without cvv for subscription charge on demand when processor is MC and property avoidCvvInSubsOnDemand.active in ENV_VARS is true", (done: Mocha.Done) => {
    process.env.ENV_VARS =
      '{"aurusVars": {"avoidCvvInSubsValidation":{"active":false},"avoidCvvInSubsOnDemand":{"active":true},"avoidCvvInSubsScheduled":{"active":false}}}';
    gChargesRequest.subscriptionTrigger = SubscriptionTriggerEnum.ON_DEMAND;
    expectCvvInMCSubscriptionTransaction(
      done,
      undefined,
      CardBrandEnum.AMEX,
      CountryEnum.PERU,
      false
    );
  });

  it("should process charge request without cvv for subscription charge scheduled when processor is MC, property avoidCvvInSubsScheduled.active in ENV_VARS is true and brand is Amex", (done: Mocha.Done) => {
    process.env.ENV_VARS =
      '{"aurusVars": {"avoidCvvInSubsValidation":{"active":false},"avoidCvvInSubsOnDemand":{"active":false},"avoidCvvInSubsScheduled":{"active":true, "brands":["amex", "american express"]}}}';
    gChargesRequest.subscriptionTrigger = SubscriptionTriggerEnum.SCHEDULED;
    expectCvvInMCSubscriptionTransaction(
      done,
      undefined,
      CardBrandEnum.AMEX,
      CountryEnum.PERU,
      false
    );
  });

  it("should process charge request without cvv for subscription validation when processor is MC, property avoidCvvInSubsValidation.active in ENV_VARS is true and it includes all brands", (done: Mocha.Done) => {
    process.env.ENV_VARS =
      '{"aurusVars": {"avoidCvvInSubsValidation":{"active":true, "brands": "all"},"avoidCvvInSubsOnDemand":{"active":false},"avoidCvvInSubsScheduled":{"active":false}}}';
    gChargesRequest.subscriptionTrigger = undefined;
    expectCvvInMCSubscriptionTransaction(
      done,
      undefined,
      CardBrandEnum.VISA,
      CountryEnum.PERU,
      true
    );
  });

  it("should process charge request with cvv for subscription charge scheduled when processor is MC, property avoidCvvInSubsScheduled.active in ENV_VARS is true but brand is not Amex", (done: Mocha.Done) => {
    process.env.ENV_VARS =
      '{"aurusVars": {"avoidCvvInSubsValidation":{"active":false},"avoidCvvInSubsOnDemand":{"active":false},"avoidCvvInSubsScheduled":{"active":true, "brands":["amex", "american express"]}}}';
    gChargesRequest.subscriptionTrigger = SubscriptionTriggerEnum.SCHEDULED;
    expectCvvInMCSubscriptionTransaction(
      done,
      undefined,
      CardBrandEnum.VISA,
      CountryEnum.PERU,
      false,
      "000"
    );
  });

  it("should process charge request with cvv for subscription charge on demand when processor is MC and property avoidCvvInSubsOnDemand.active in ENV_VARS is false", (done: Mocha.Done) => {
    process.env.ENV_VARS =
      '{"aurusVars": {"avoidCvvInSubsValidation":{"active":true},"avoidCvvInSubsOnDemand":{"active":false},"avoidCvvInSubsScheduled":{"active":true}}}';
    gChargesRequest.subscriptionTrigger = SubscriptionTriggerEnum.ON_DEMAND;
    expectCvvInMCSubscriptionTransaction(
      done,
      undefined,
      CardBrandEnum.AMEX,
      CountryEnum.PERU,
      false,
      "0000"
    );
  });

  it("should process charge request with cvv for subscription validation when processor is MC and property avoidCvvInSubsValidation.active in ENV_VARS is false", (done: Mocha.Done) => {
    process.env.ENV_VARS =
      '{"aurusVars": {"avoidCvvInSubsValidation":{"active":false},"avoidCvvInSubsOnDemand":{"active":true},"avoidCvvInSubsScheduled":{"active":true}}}';
    gChargesRequest.subscriptionTrigger = undefined;
    expectCvvInMCSubscriptionTransaction(
      done,
      undefined,
      CardBrandEnum.VISA,
      CountryEnum.PERU,
      true,
      "000"
    );
  });

  it("test charge request  without iva in amount  and transaction reference - COP request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.subtotalIva = 10;
    gChargesRequest.amount.currency = "COP";
    gToken.cardHolderName = "Pepe";

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, "23424", gToken);
  });

  it("test charge request  without transaction reference - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.ice = 1;
    gChargesRequest.amount.subtotalIva = 10;
    gChargesRequest.amount.currency = "PEN";
    gToken.cardHolderName = "Juan Test Topo";

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request  without cardHolderName - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.currency = "PEN";
    lodash.set(gChargesRequest, "metadata.ksh_subscriptionValidation", true);
    delete gToken.cardHolderName;

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request success with failoverToken on failover retry", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 100;
    gChargesRequest.amount.currency = "PEN";
    lodash.set(gChargesRequest, "metadata.ksh_subscriptionValidation", true);
    delete gToken.cardHolderName;

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    lodash.set(gToken, "failoverToken", "1278217128787asddas128721");
    chargesSuccess(gateway, done, TRX_REF, gToken, true);
  });

  it("test charge request  without cardHolderName complete name - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.currency = "PEN";
    gToken.cardHolderName = "Indigo Merced Smith Doe";

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request ec with metadata, ice and deferred - success", (done: Mocha.Done) => {
    gChargesRequest.metadata = { metadata: "metadata" };
    lodash.set(gChargesRequest, G_MONTHS_PATH, 1);
    gChargesRequest.amount.currency = "USD";
    gChargesRequest.amount.ice = 1.12;

    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request ec with grace months and credit type with 3 digits - success", (done: Mocha.Done) => {
    gChargesRequest.deferred = {
      creditType: "002",
      graceMonths: "01",
      months: 3,
    };
    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request ec with grace months and credit type with 2 digits - success", (done: Mocha.Done) => {
    gChargesRequest.deferred = {
      creditType: "02",
      graceMonths: "01",
      months: 3,
    };
    gChargesRequest.amount.currency = "USD";
    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test deferred when creditType and graceMonths are zeros - success", (done: Mocha.Done) => {
    gChargesRequest.tokenId = "1289891281298";
    gChargesRequest.deferred = {
      creditType: "000",
      graceMonths: "00",
      months: 3,
    };
    gChargesRequest.amount.currency = "USD";
    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request ec w/o metadata & w/o ice & w/o months - success", (done: Mocha.Done) => {
    gChargesRequest.metadata = undefined;
    lodash.set(gChargesRequest, G_MONTHS_PATH, undefined);
    gChargesRequest.amount.currency = "USD";
    gChargesRequest.amount.ice = undefined;
    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request undefined currency - success", (done: Mocha.Done) => {
    gChargesRequest.amount.currency = undefined;
    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request with PEN currency and names undefined - success", (done: Mocha.Done) => {
    lodash.set(gChargesRequest, G_MONTHS_PATH, 3);
    gChargesRequest.amount.currency = "PEN";
    gChargesRequest.amount.iva = 0;
    gChargesAurusResponse.transaction_reference = "2324";
    rps.returns(of(gChargesAurusResponse));
    gChargesRequest.amount.currency = "PEN";
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    lodash.set(gChargeInput, G_PROCESSOR_NAME_PATH, ProcessorEnum.MCPROCESSOR);
    lodash.set(gChargeInput, G_CURRENT_TOKEN_CARD_HOLDER_NAME, undefined);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      next: (data: AurusResponse): void => {
        expect(data).to.be.a("object");
        expect(has(data, "ticket_number")).to.be.eql(true);
        expect(has(data, "transaction_reference")).to.be.eql(true);
        done();
      },
    });
  });

  it("test charge request co w/o extraTaxes & w/o months & w/o metadata - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = undefined;
    gChargesRequest.metadata = undefined;
    gChargesRequest.amount.currency = "COP";
    rps.returns(of(gChargesAurusResponse));
    lodash.set(gChargesRequest, G_MONTHS_PATH, undefined);
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  function testChargeRequestWithExtraTaxesMonthsMetadata(
    stringifySpy: SinonSpy,
    done: Mocha.Done
  ) {
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      next: (data: AurusResponse): void => {
        expect(data).to.be.a("object");
        expect(has(data, "ticket_number")).to.be.eql(true);
        expect(has(data, "transaction_reference")).to.be.eql(true);
        expect(stringifySpy).calledWithMatch(match.has("months", 3));
        expect(stringifySpy).calledWithMatch(
          match.has("metadata", gChargesRequest.metadata)
        );
        done();
      },
    });
  }

  function setChargeRequestWithExtraTaxesMonthsMetadata() {
    gChargesRequest.metadata = { obj: { name: "name" } };
    lodash.set(gChargesRequest, G_MONTHS_PATH, 3);
    gChargesRequest.amount.currency = "PEN";
    gChargesAurusResponse.transaction_reference = "2324";
    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    lodash.set(gChargeInput, G_PROCESSOR_NAME_PATH, ProcessorEnum.MCPROCESSOR);
    lodash.set(
      gChargeInput,
      G_CURRENT_TOKEN_CARD_HOLDER_NAME,
      "Jose Pepe Toro Castillo"
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
  }

  it("test charge request pen with extraTaxes & with months & with metadata - success", (done: Mocha.Done) => {
    const stringify_spy: SinonSpy<
      [
        string,
        ((string | number)[] | null | undefined)?,
        (string | number | undefined)?
      ]
    > = box.spy(JSON, "stringify");

    gChargesRequest.amount.extraTaxes = {
      agenciaDeViaje: 5,
      iac: 10,
      propina: 9,
      tasaAeroportuaria: 3,
    };

    setChargeRequestWithExtraTaxesMonthsMetadata();

    testChargeRequestWithExtraTaxesMonthsMetadata(stringify_spy, done);
  });

  it("test charge request pen with extraTaxes (including puerto rico) & with months & with metadata - success ", (done: Mocha.Done) => {
    const stringify_spy: SinonSpy<
      [
        string,
        ((string | number)[] | null | undefined)?,
        (string | number | undefined)?
      ]
    > = box.spy(JSON, "stringify");

    gChargesRequest.amount.extraTaxes = {
      agenciaDeViaje: 5,
      iac: 10,
      municipalTax: 1,
      propina: 9,
      reducedStateTax: 1,
      stateTax: 1,
      tasaAeroportuaria: 3,
    };

    setChargeRequestWithExtraTaxesMonthsMetadata();
    gChargesRequest.amount.currency = "PEN";
    lodash.set(gChargeInput, G_PROCESSOR_NAME_PATH, ProcessorEnum.ELAVON);
    lodash.set(gChargeInput, G_CURRENT_MERCHANT_COUNTRY_PATH, CountryEnum.USA);

    testChargeRequestWithExtraTaxesMonthsMetadata(stringify_spy, done);
  });

  it("test charge request co with extraTaxes empty object - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = {};
    gChargesRequest.amount.currency = "COP";
    rps.returns(of(gChargesAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test tokens request - success", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    gTokensRequest.currency = undefined;
    gTokensRequest.isDeferred = true;
    gTokensRequest.card.cvv = "123";
    gTokensRequest.card.expiryMonth = "2";
    rps.returns(of(gTokensAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "qwerty",
        "ipsum",
        context
      )
      .subscribe({
        next: (data: TokensCardResponse): void => {
          expect(data[TOKEN]).to.have.lengthOf(32);
          expect(data).to.be.a("object");
          expect(has(data, "token")).to.be.eql(true);
          done();
        },
      });
  });

  it("test tokens request - fail E001", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    box.stub(String.prototype, "match").returns(null);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "qwerty",
        "lorem",
        context
      )
      .subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K001");
          done();
        },
        next: (): void => {
          done("next should not be called.");
        },
      });
  });

  it("When request Token Transaction to Aurus and the response does not have transaction info - Error ", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    rps.throws({
      response: {
        config: {},
        data: {
          response_code: "211",
          response_text: "Solicitud no válida",
          transaction_details: {
            processorName: "24C",
          },
        },
        headers: {},
        status: 402,
        statusText: "",
      },
    });
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "qwerty",
        "lorem",
        context
      )
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.eq("Solicitud no válida");
          expect(error.code).to.be.eq("211");
          done();
        },
        next: (): void => {
          done();
        },
      });
  });

  it("test tokens request - success without cvv and not transaction token type", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    gTokensRequest.currency = "USD";
    delete gTokensRequest.card.cvv;
    gTokensRequest.isDeferred = undefined;
    gTokensRequest.card.expiryMonth = "11";
    rps.returns(of(gTokensAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    requestTokensSuccess(gateway, context, done);
  });

  it("test tokens request with Transbank as processor CLP - success", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    const lambda: SinonStub = box.stub().returns(
      of({
        token: "ipsum",
      })
    );

    gTokensRequest.currency = "CLP";
    rps.returns(of(gTokensAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "Transbank Processor",
        "ipsum",
        context
      )
      .subscribe({
        next: (data: TokensCardResponse): void => {
          expect(data).to.be.a("object");
          expect(data).to.have.property("token");
          expect(lambda).to.be.calledOnce;
          done();
        },
      });
  });

  it("test tokens request with Transbank as processor UF - success", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    gTokensRequest.currency = "UF";
    rps.returns(of(gTokensAurusResponse));
    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );
    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            token: "ipsum",
          })
        ),
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "Transbank Processor",
        "ipsum",
        context
      )
      .subscribe({
        next: (data: TokensCardResponse): void => {
          expect(data).to.have.property("token");
          done();
        },
      });
  });

  it("request charge should throw an error if Aurus responds with response_code 500", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    rps.throws({
      response: {
        config: {},
        data: {
          message: "Internal server error",
        },
        headers: {},
        status: 500,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "9834989843",
        "transaction",
        "qwerty",
        "lorem",
        context
      )
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.eq("Procesador inalcanzable");
          expect(error.code).to.be.eq("500");
          expect(lodash.get(error.getMetadata(), "processorName")).to.be.eq("");
          done();
        },
        next: (): void => {
          done();
        },
      });
  });
});

describe("Aurus Gateway - capture", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let rps: SinonStub;
  const subscription: CaptureSubscriptionRequest = {
    merchantCountry: CountryEnum.USA,
    orderDetails: {
      shippingDetails: {
        address: "ECU test",
        zipCode: "12323",
      },
    },
    taxId: "3344",
    usrvOrigin: UsrvOriginEnum.SUBSCRIPTIONS,
  };

  function validateCaptureRequest(data: AurusResponse, done: Mocha.Done): void {
    expect(has(data, "ticket_number")).to.be.eql(true);
    expect(data.ticket_number).to.be.eql(gAurusResponse.ticket_number);
    done();
  }

  beforeEach(() => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    createSchemas();
    const ret: {
      box: SinonSandbox;
      rps: SinonStub;
      gateway: ICardGateway;
    } = setBeforeEach();

    box = ret.box;
    rps = ret.rps;
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test capture request without amount - success", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    rps.returns(of(gAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    if (gChargesRequest.amount) delete gCaptureRequest.amount;
    delete gTransaction.ice_value;

    gateway
      .captureTransaction(gCaptureRequest, gTransaction, gProcessor, context)
      .subscribe({
        next: (data: AurusResponse): void => validateCaptureRequest(data, done),
      });
  });

  it("should process capture request when usrvOrigin is usrv-subscriptions, processor is Elavon and country is EEUU", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    gProcessor.processorName = ProcessorEnum.ELAVON;

    rps.returns(of(gAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    if (gChargesRequest.amount) delete gCaptureRequest.amount;
    delete gTransaction.ice_value;

    gateway
      .captureTransaction(
        gCaptureRequest,
        gTransaction,
        gProcessor,
        context,
        "1223",
        subscription
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(has(data, "ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("should process capture request when usrvOrigin is usrv-subscriptions, processor is Elavon, taxId is empty and country is EEUU", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    gProcessor.processorName = ProcessorEnum.ELAVON;

    rps.returns(of(gAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    if (gChargesRequest.amount) delete gCaptureRequest.amount;
    delete gTransaction.ice_value;

    gateway
      .captureTransaction(
        gCaptureRequest,
        gTransaction,
        gProcessor,
        context,
        "",
        subscription
      )
      .subscribe({
        next: (data: AurusResponse): void => validateCaptureRequest(data, done),
      });
  });

  it("test capture request without amount with ice in transactions - success", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    gTransaction.ice_value = 0;
    if (gChargesRequest.amount) delete gCaptureRequest.amount;
    rps.returns(of(gAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);

    gateway
      .captureTransaction(gCaptureRequest, gTransaction, gProcessor, context)
      .subscribe({
        next: (data: AurusResponse): void => validateCaptureRequest(data, done),
      });
  });

  it("test capture request with amount - success", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    rps.returns(of(gAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gCaptureRequest.amount = {
      currency: "CLP",
      iva: 10,
      subtotalIva: 10,
      subtotalIva0: 10,
    };

    gateway
      .captureTransaction(gCaptureRequest, gTransaction, gProcessor, context)
      .subscribe({
        next: (data: AurusResponse): void => validateCaptureRequest(data, done),
      });
  });

  it("test capture request with partial amount - success", (done: Mocha.Done) => {
    const context: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    rps.returns(of(gAurusResponse));

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gCaptureRequest.amount = {
      currency: "CLP",
      iva: 10,
      subtotalIva: 10,
      subtotalIva0: 10,
    };

    gProcessor.processor_name = ProcessorEnum.NIUBIZ;
    gTransaction.request_amount = gTransaction.approved_transaction_amount / 2;
    process.env.PARTIAL_CAPTURE_NIUBIZ = "true";

    gateway
      .captureTransaction(gCaptureRequest, gTransaction, gProcessor, context)
      .subscribe({
        next: (data: AurusResponse): void => validateCaptureRequest(data, done),
      });
  });
});

describe("Aurus Gateway - error", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let rps: SinonStub;

  function mockLambdaContext(context: Context) {
    CONTAINER.bind(CORE.LambdaContext).toConstantValue(context);
  }

  beforeEach(() => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    process.env.IVA_VALUES = `{ "USD": 0.12, "COP": 0.19, "CLP": 0.19, "UF": 0.19, "PEN": 0.18, "MXN": 0.16 }`;
    createSchemas();
    const ret: {
      box: SinonSandbox;
      rps: SinonStub;
      gateway: ICardGateway;
    } = setBeforeEach();

    box = ret.box;
    rps = ret.rps;
    gateway = ret.gateway;
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test error no env tax", (done: Mocha.Done) => {
    process.env.IVA_VALUES = `{}`;

    const amount: Amount = {
      iva: 0,
      subtotalIva: 112,
      subtotalIva0: 0,
    };

    gateway
      .voidTransaction({ amount }, "1234567890", "95678343356756", TRX_REF)
      .subscribe({
        error: (err: Error): void => {
          expect(err.message).to.be.eq("IVA parameters are not set review SSM");
          done();
        },
        next: done,
      });
  });
  it("test error with AurusError", (done: Mocha.Done) => {
    rps.throws({
      response: {
        config: {},
        data: {
          response_code: "1033",
          response_text: "Error de Aurus",
          transaction_details: {
            processorName: "Test",
          },
          transaction_id: "12344",
        },
        headers: {},
        status: 400,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .voidTransaction(undefined, "1234567890", "95678343356756", TRX_REF)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.code).to.be.eq("1033");
          expect(error.getMessage()).to.be.eq("Error de Aurus");
          done();
        },
        next: done,
      });
  });

  it("test error with AurusError and go for Failover flow", (done: Mocha.Done) => {
    const context_stub: Context = Mock.of<Context>({
      getRemainingTimeInMillis: box.stub().returns(29000),
    });

    CONTAINER.unbind(CORE.LambdaContext);
    mockLambdaContext(context_stub);

    gChargeInput = buildChargeInput(TRX_REF, gToken);
    lodash.set(gChargeInput, "trxRuleResponse.body.failOverProcessor", {
      private_id: MID,
      public_id: "1",
    });
    lodash.set(gChargeInput, "lambdaContext", context_stub);

    rps.throws({
      response: {
        config: {},
        data: {
          response_code: "228",
          response_text: "Unreachable Processor",
          transaction_details: {
            processorName: "Test",
          },
          transaction_id: "000001",
        },
        headers: {},
        status: 400,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.chargesTransaction(<ChargeInput>gChargeInput).subscribe({
      next: (rs: object): void => {
        expect(lodash.get(rs, "code")).to.be.eqls("228");
        expect(context_stub.getRemainingTimeInMillis()).to.be.eqls(29000);
        expect(rps).to.be.callCount(1);
        done();
      },
    });
  });

  it("test empty response with AurusError - success", (done: Mocha.Done) => {
    rps.throws({
      response: {
        config: {},
        data: {
          response_code: "1032",
          response_text: "Error de suscripciones, significa respuesta vacia",
          transaction_details: {},
          transaction_id: "12121",
        },
        headers: {},
        status: 400,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.request("Ecuador", {}, "method", {}).subscribe({
      next: (data: object): void => {
        expect(data).to.be.empty;
        done();
      },
    });
  });

  it("test empty response with AurusError - empty data undefined", (done: Mocha.Done) => {
    rps.throws({
      response: {
        config: {},
        headers: {},
        status: 400,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.request("Ecuador", {}, "method", {}).subscribe({
      error: (error: AurusError): void => {
        expect(error).to.not.eq(undefined, "not Aurus error");
        done();
      },
      next: done,
    });
  });
  it("Should return country metadata on AurusError", (done: Mocha.Done) => {
    rps.throws({
      response: {
        config: {},
        data: {
          response_code: "500",
        },
        headers: {},
        status: 500,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway.request("Ecuador", {}, "method", {}).subscribe({
      error: (error: AurusError): void => {
        expect(lodash.get(error.getMetadata(), "country")).to.be.eq("Ecuador");
        done();
      },
      next: done,
    });
  });
  it("test error with 500 Error", (done: Mocha.Done) => {
    rps.throws({
      response: {
        config: {},
        data: {},
        headers: {},
        status: 500,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .voidTransaction(undefined, "1234567890", "95678343356756", TRX_REF)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error).to.not.eq(undefined, "not Aurus error");
          done();
        },
        next: done,
      });
  });
  it("test error with unhandled Error", (done: Mocha.Done) => {
    rps.throws({
      response: {
        config: {},
        data: {},
        headers: {},
        status: 400,
        statusText: "",
      },
    });

    CONTAINER.unbind(CORE.AxiosGateway);
    CONTAINER.bind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: rps,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .voidTransaction(undefined, "1234567890", "95678343356756", TRX_REF)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error).to.not.be.undefined;
          done();
        },
        next: done,
      });
  });
});

describe("Test fullName Splitter ", () => {
  function getdetailNames(fullName: string | undefined): object {
    if (fullName === undefined) return {};

    const details: object = parseFullName(String(fullName));

    const middlename: string[] = lodash.get(details, "middle", "").split(" ");

    if (middlename.length > 1) lodash.set(details, "last", middlename[1]);

    return {
      lastname: lodash.get(details, "last"),
      name: lodash.get(details, "first"),
    };
  }

  it("Test with name and lastname - success", () => {
    const fullname: string = "Test names";

    const result: object = getdetailNames(fullname);

    expect(lodash.get(result, "name")).to.equal(fullname.split(" ")[0]);
  });

  it("Test with two name and two lastname - success", () => {
    const fullname: string = "Test Dos lastname1 lastname2";

    const result: object = getdetailNames(fullname);

    expect(lodash.get(result, "name")).to.equal(fullname.split(" ")[0]);
    expect(lodash.get(result, "lastname")).to.equal(fullname.split(" ")[2]);
  });

  it("Test with undefined - success", () => {
    const result: object = getdetailNames(undefined);

    expect(lodash.get(result, "name")).to.equal(undefined);
    expect(lodash.get(result, "lastname")).to.equal(undefined);
  });

  it("Test with two name and one lastname - success", () => {
    const fullname: string = "Test Dos lastname1";
    const name_component = fullname.split(" ");

    const result: object = getdetailNames(fullname);

    expect(lodash.get(result, "name")).to.equal(name_component[0]);
    expect(lodash.get(result, "lastname")).to.equal(name_component[2]);
  });
});

describe("Aurus Gateway - processors", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let processor_body: CreateProcessorRequest;

  function mockBindings() {
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        warn: box.stub(),
      })
    );
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
  }

  function mockAxiosGatewaySuccess(response?: SinonStub) {
    const request_response: SinonStub = response
      ? response
      : box.stub().returns(of({ response_code: "200" }));

    CONTAINER.rebind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: request_response,
      })
    );
  }

  function mockAxiosGatewayError() {
    CONTAINER.rebind(CORE.AxiosGateway).toConstantValue(
      Mock.of<IAxiosGateway>({
        request: box.stub().returns(of({ error: "error" })),
      })
    );
  }

  beforeEach(() => {
    CONTAINER.snapshot();
    box = createSandbox();
    mockBindings();
    processor_body = Mock.of<CreateProcessorRequest>({
      acquirerBank: "Bank",
      categoryModel: "asd",
      merchantId: "1111111",
      omitCVV: false,
      plcc: "Y",
      processorAlias: "PC001",
      processorMerchantId: "123445",
      processorName: "Procesor 1",
      processorType: "Type 1",
      subTerminalId: "t001",
      uniqueCode: "4567",
    });
  });

  afterEach(() => {
    CONTAINER.restore();
    box.restore();
  });

  it("Test create processor success", (done: Mocha.Done) => {
    mockAxiosGatewaySuccess();
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .createProcessor(
        {
          ...processor_body,
          processorName: ProcessorEnum.REDEBAN,
        },
        CountryEnum.COLOMBIA,
        "test"
      )
      .subscribe({
        next: (data: AurusCreateProcessorResponse): void => {
          expect(data.response_code).to.equal("200");
          done();
        },
      });
  });

  it("Test create processor success but axios gets a timeout", (done: Mocha.Done) => {
    const axios_response: SinonStub = box
      .stub()
      .returns(of({ response_code: "200" }).pipe(delay(110)));

    process.env.EXTERNAL_TIMEOUT = "100";

    mockAxiosGatewaySuccess(axios_response);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .createProcessor(
        {
          ...processor_body,
          processorName: ProcessorEnum.REDEBAN,
        },
        CountryEnum.COLOMBIA,
        "test"
      )
      .subscribe({
        error: (err: KushkiError): void => {
          expect(err.getMessage()).to.be.equal(ERRORS.E027.message);
          expect(err.getStatusCode()).to.be.equal(400);
          done();
        },
      });
    process.env.EXTERNAL_TIMEOUT = undefined;
  });

  it("Test create processor error", (done: Mocha.Done) => {
    lodash.set(processor_body, "merchantCategoryCode", "5093");
    mockAxiosGatewayError();
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .createProcessor(processor_body, CountryEnum.PERU, "cccc")
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.equal("K006");
          done();
        },
      });
  });

  it("Test update processor success", (done: Mocha.Done) => {
    mockAxiosGatewaySuccess();
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .updateProcessor(
        {
          ...processor_body,
          processorType: "GATEWAY",
        },
        CountryEnum.ECUADOR,
        "aaa"
      )
      .subscribe({
        next: (data: boolean): void => {
          expect(data).to.equal(true);
          done();
        },
      });
  });

  it("Test update processor chile success with aggregator gateway", (done: Mocha.Done) => {
    process.env.USRV_STAGE = "primary";
    mockAxiosGatewaySuccess();
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .updateProcessor(
        {
          ...processor_body,
          categoryModel: "GATEWAY",
          plcc: "N",
          processorName: ProcessorEnum.FIRST_DATA,
          processorType: "AGGREGATOR",
        },
        CountryEnum.CHILE,
        "chile"
      )
      .subscribe({
        next: (data: boolean): void => {
          expect(data).to.be.true;
          done();
        },
      });
  });

  it("Test update processor chile success qa processor", (done: Mocha.Done) => {
    process.env.USRV_STAGE = "uat";
    mockAxiosGatewaySuccess();
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .updateProcessor(
        {
          ...processor_body,
          plcc: "N",
          processorName: ProcessorEnum.DATAFAST,
          processorType: "GATEWAY",
        },
        CountryEnum.CHILE,
        "chile"
      )
      .subscribe({
        next: (data: boolean): void => {
          expect(data).to.be.eqls(true);
          done();
        },
      });
  });

  it("Test update processor error", (done: Mocha.Done) => {
    mockAxiosGatewayError();
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .updateProcessor(processor_body, CountryEnum.MEXICO, "ccxzd")
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.code).to.equal("K006");
          done();
        },
      });
  });

  it("Test create processor USA success", (done: Mocha.Done) => {
    mockAxiosGatewaySuccess();
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .createProcessor(
        {
          ...processor_body,
          processorName: ProcessorEnum.ELAVON,
        },
        CountryEnum.USA,
        "test"
      )
      .subscribe({
        next: (data: AurusCreateProcessorResponse): void => {
          expect(data.response_code).to.equal("200");
          done();
        },
      });
  });
});
