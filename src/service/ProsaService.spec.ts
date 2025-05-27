/**
 * ProsaService Unit Tests
 */
import { AurusError } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CardProviderIndexEnum } from "infrastructure/CardProviderEnum";
import { CONTAINER } from "infrastructure/Container";
import { ERRORS } from "infrastructure/ErrorEnum";
import { Done } from "mocha";
import { ICardGateway } from "repository/ICardGateway";
import { IProviderService } from "repository/IProviderService";
import rollbar = require("rollbar");
import { of } from "rxjs";
import { CaptureInput, ChargeInput } from "service/CardService";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { TokensCardResponse } from "types/tokens_card_response";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";

use(sinonChai);
describe("ProsaService", () => {
  let sandbox: SinonSandbox;
  let service: IProviderService[];
  let token_stub: SinonStub;
  let token_response_mock: TokensCardResponse;
  let mockChargeRequest: ChargeInput;
  let mockCaptureRequest: CaptureInput;

  function validateK041Error(err: AurusError, done: Done): void {
    expect(err.code).to.be.eq("K041");
    expect(err.getMessage()).to.be.eq(ERRORS.E041.message);
    done();
  }

  function mockAurus() {
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        getAurusToken: token_stub,
      })
    );
  }

  beforeEach(() => {
    sandbox = createSandbox();
    token_response_mock = Mock.of<TokensCardResponse>({
      token: "token",
    });
    token_stub = sandbox.stub().returns(of(token_response_mock));
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(Mock.of());
    CONTAINER.unbind(CORE.RollbarInstance);
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        critical: sandbox.stub(),
        warn: sandbox.stub(),
        warning: sandbox.stub(),
      })
    );
    mockAurus();
    mockChargeRequest = Mock.of<ChargeInput>({});
    mockCaptureRequest = Mock.of<CaptureInput>({});
  });

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<rollbar>({
        warn: sandbox.stub(),
      })
    );
  });

  describe("tokens Method", () => {
    it("should make a tokens", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Prosa].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs).not.to.be.undefined;
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
    it("should make a tokens - on Aurus Error", (done: Done) => {
      token_stub = sandbox.stub().throws(new Error("Aurus Error"));
      mockAurus();
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Prosa].tokens(undefined).subscribe({
        next: (rs: TokensCardResponse): void => {
          expect(rs.token).not.to.be.undefined;
          done();
        },
      });
    });
  });

  describe("preAuthorization method", () => {
    it("should throw K041 error when the method preAuthorization is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Prosa]
        .preAuthorization(mockChargeRequest)
        .subscribe({
          error: (err: AurusError): void => {
            validateK041Error(err, done);
          },
        });
    });
  });

  describe("reAuthorization method", () => {
    it("should throw K041 error when the method reAuthorization is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Prosa]
        .reAuthorization(undefined, undefined, undefined)
        .subscribe({
          error: (err: AurusError): void => {
            validateK041Error(err, done);
          },
        });
    });
  });

  describe("validateAccount method", () => {
    it("should throw K041 error when the method validateAccount is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Prosa]
        .validateAccount(undefined, undefined)
        .subscribe({
          error: (err: AurusError): void => {
            validateK041Error(err, done);
          },
        });
    });
  });

  describe("charge Method", () => {
    it("should throw K041 error when the method charge is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Prosa].charge(mockChargeRequest).subscribe({
        error: (err: AurusError): void => {
          validateK041Error(err, done);
        },
      });
    });
  });

  describe("capture Method", () => {
    it("should throw K041 error when the method capture is not supported by the processor", (done: Done) => {
      service = CONTAINER.getAll(IDENTIFIERS.ProviderService);
      service[CardProviderIndexEnum.Prosa]
        .capture(mockCaptureRequest)
        .subscribe({
          error: (err: AurusError): void => {
            validateK041Error(err, done);
          },
        });
    });
  });
});
