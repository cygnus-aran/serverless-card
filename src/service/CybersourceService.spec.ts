/**
 * CybersourceService Unit test
 */
import { IAPIGatewayEvent } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { DynamoGateway } from "gateway/DynamoGateway";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import * as jwt from "jsonwebtoken";
import { get } from "lodash";
import { ICybersourceService } from "repository/ICybersourceService";
import { of } from "rxjs";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AuthorizerContext } from "types/authorizer_context";
import { CybersourceJwtRequest } from "types/cybersource_jwt_request";
import { SubscriptionDynamo } from "types/subscription_dynamo";

use(sinonChai);
const HEADER: string = "PUBLIC-MERCHANT-ID";
const X_FORWARDED_FOR: string = "X-FORWARDED-FOR";
const API_IDENTIFIER_CO: string = "60b5193a44ef065b6c90f4ff";
const API_IDENTIFIER_PE: string = "60b5193a44ef065b6c90f4gg";
const API_IDENTIFIER_MX: string = "60b5193a44ef065b6c90f4hh";
const ORGANIZATION_API_KEY_CO: string = "5bab51a0-ee77-4a5b-a052-0c7f93a0d094";
const ORGANIZATION_API_KEY_PE: string = "5bab51a0-ee77-4a5b-a052-0c7f93a0d095";
const ORGANIZATION_API_KEY_MX: string = "5bab51a0-ee77-4a5b-a052-0c7f93a0d096";
const ORGANIZATION_UNIT_ID_CO: string = "60b5193b3c2662046c1d030f";
const ORGANIZATION_UNIT_ID_PE: string = "60b5193b3c2662046c1d030g";
const ORGANIZATION_UNIT_ID_MX: string = "60b5193b3c2662046c1d030h";

describe("CybersourceService", () => {
  let authorizer_mock: AuthorizerContext;
  let cybersource_event_mock: IAPIGatewayEvent<
    null,
    null,
    CybersourceJwtRequest,
    AuthorizerContext
  >;
  let get_subscription_stub: SinonStub;

  function mockSubscrptionResponse(getSubscription: SinonStub): void {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<DynamoGateway>({
        getItem: getSubscription,
      })
    );
  }

  beforeEach(() => {
    authorizer_mock = Mock.of<AuthorizerContext>({
      merchantId: "123455799754313",
      merchantName: "merchantName",
      sandboxEnable: false,
    });

    cybersource_event_mock = Mock.of<
      IAPIGatewayEvent<null, null, CybersourceJwtRequest, AuthorizerContext>
    >({
      headers: {
        [HEADER]: "98765432134",
        [X_FORWARDED_FOR]: "127.0.0.1, 2.2.2.2",
        ["USER-AGENT"]: "PostmanRuntime",
      },
      queryStringParameters: {},
      requestContext: {
        authorizer: authorizer_mock,
      },
    });

    process.env.CYBERSOURCE_INFO = JSON.stringify({
      Colombia: {
        apiIdentifier: API_IDENTIFIER_CO,
        organizationApiKey: ORGANIZATION_API_KEY_CO,
        organizationUnitId: ORGANIZATION_UNIT_ID_CO,
      },
      Mexico: {
        apiIdentifier: API_IDENTIFIER_MX,
        organizationApiKey: ORGANIZATION_API_KEY_MX,
        organizationUnitId: ORGANIZATION_UNIT_ID_MX,
      },
      Peru: {
        apiIdentifier: API_IDENTIFIER_PE,
        organizationApiKey: ORGANIZATION_API_KEY_PE,
        organizationUnitId: ORGANIZATION_UNIT_ID_PE,
      },
    });
  });

  describe("When buildJwt is called", () => {
    let service: ICybersourceService;
    let sandbox: SinonSandbox;

    beforeEach(() => {
      sandbox = createSandbox();
      CONTAINER.snapshot();
    });

    afterEach(() => {
      CONTAINER.restore();
      sandbox.restore();
    });

    it("buildJwt should return a valid json web token when country is empty", (done: Mocha.Done) => {
      service = CONTAINER.get(IDENTIFIERS.CybersourceService);
      service.buildJwt(cybersource_event_mock).subscribe({
        next: (rs: object): void => {
          expect(get(rs, "jwt")).to.not.be.undefined;
          done();
        },
      });
    });

    it("buildJwt should return a valid json web token when country is peru", (done: Mocha.Done) => {
      authorizer_mock = {
        ...authorizer_mock,
        country: CountryEnum.PERU,
      };

      cybersource_event_mock = {
        ...cybersource_event_mock,
        requestContext: {
          authorizer: authorizer_mock,
        },
      };

      service = CONTAINER.get(IDENTIFIERS.CybersourceService);
      service.buildJwt(cybersource_event_mock).subscribe({
        next: (rs: object): void => {
          const token = get(rs, "jwt");
          const decoded = jwt.verify(token, ORGANIZATION_API_KEY_PE);

          expect(get(decoded, "iss")).to.be.eql(API_IDENTIFIER_PE);
          expect(get(decoded, "OrgUnitId")).to.be.eql(ORGANIZATION_UNIT_ID_PE);
          expect(token).to.not.be.undefined;
          done();
        },
      });
    });

    it("buildJwt should return a valid json web token when merchantCountry is Mexico", (done: Mocha.Done) => {
      authorizer_mock = {
        ...authorizer_mock,
        country: "",
        merchantCountry: CountryEnum.MEXICO,
      };

      cybersource_event_mock = {
        ...cybersource_event_mock,
        requestContext: {
          authorizer: authorizer_mock,
        },
      };

      service = CONTAINER.get(IDENTIFIERS.CybersourceService);
      service.buildJwt(cybersource_event_mock).subscribe({
        next: (rs: object): void => {
          const token = get(rs, "jwt");
          const decoded = jwt.verify(token, ORGANIZATION_API_KEY_MX);

          expect(get(decoded, "iss")).to.be.eql(API_IDENTIFIER_MX);
          expect(get(decoded, "OrgUnitId")).to.be.eql(ORGANIZATION_UNIT_ID_MX);
          expect(token).to.not.be.undefined;
          done();
        },
      });
    });

    describe("get country is ok", () => {
      const id = "abcd-123";
      const base64_id = "YWJjZC0xMjM=";

      beforeEach(() => {
        authorizer_mock = {
          ...authorizer_mock,
          country: "",
          merchantCountry: CountryEnum.MEXICO,
        };

        cybersource_event_mock = {
          ...cybersource_event_mock,
          queryStringParameters: {
            subscriptionId: id,
          },
          requestContext: {
            authorizer: authorizer_mock,
          },
        };
      });

      it("buildJwt should return a valid json web token with an identifier when subscriptionId is not empty", (done: Mocha.Done) => {
        get_subscription_stub = sandbox.stub().returns(
          of(
            Mock.of<SubscriptionDynamo>({
              binInfo: {
                bin: id,
              },
            })
          )
        );

        mockSubscrptionResponse(get_subscription_stub);

        service = CONTAINER.get(IDENTIFIERS.CybersourceService);
        service.buildJwt(cybersource_event_mock).subscribe({
          next: (rs: object): void => {
            const token = get(rs, "jwt");
            const bin = get(rs, "identifier");
            const decoded = jwt.verify(token, ORGANIZATION_API_KEY_MX);

            expect(get(decoded, "iss")).to.be.eql(API_IDENTIFIER_MX);
            expect(get(decoded, "OrgUnitId")).to.be.eql(
              ORGANIZATION_UNIT_ID_MX
            );
            expect(token).to.not.be.undefined;
            expect(bin).to.not.be.undefined;
            expect(bin).to.equal(base64_id);
            done();
          },
        });
      });

      it("buildJwt should return an error not found when subscriptionId is not empty but it cannot find its subsciption", (done: Mocha.Done) => {
        get_subscription_stub = sandbox.stub().returns(of(undefined));

        mockSubscrptionResponse(get_subscription_stub);

        service = CONTAINER.get(IDENTIFIERS.CybersourceService);
        service.buildJwt(cybersource_event_mock).subscribe({
          error: (err): void => {
            expect(err.message).to.contain("No se encontró la suscripción");
            done();
          },
        });
      });
    });
  });
});
