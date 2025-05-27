/**
 * Cybersource Service file.
 */
import { IAPIGatewayEvent, KushkiError } from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { CountryEnum } from "infrastructure/CountryEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { inject, injectable } from "inversify";
import jsonwebtoken = require("jsonwebtoken");
import { get, isEmpty } from "lodash";
import { ICybersourceService } from "repository/ICybersourceService";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { forkJoin, Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { map, mergeMap, switchMap } from "rxjs/operators";
import { AuthorizerContext } from "types/authorizer_context";
import { CybersourceEnv } from "types/cybersource_env";
import { CybersourceJwtPayload } from "types/cybersource_jwt_payload";
import { CybersourceJwtRequest } from "types/cybersource_jwt_request";
import { JwtResponse } from "types/jwt_response";
import { SubscriptionDynamo } from "types/subscription_dynamo";
import { v4 } from "uuid";

@injectable()
export class CybersourceService implements ICybersourceService {
  private readonly _storage: IDynamoGateway;

  constructor(@inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway) {
    this._storage = storage;
  }

  public buildJwt(
    event: IAPIGatewayEvent<
      null,
      null,
      CybersourceJwtRequest,
      AuthorizerContext
    >
  ): Observable<JwtResponse> {
    return of(1).pipe(
      mergeMap(() => this._getCountry(event)),
      mergeMap((country: string) => this._getCybersourceInfo(country)),
      mergeMap((csEnv: CybersourceEnv) =>
        forkJoin([this._getJWTPayload(csEnv), of(csEnv)])
      ),
      map(([payload, cs_env]: [CybersourceJwtPayload, CybersourceEnv]) =>
        jsonwebtoken.sign(payload, cs_env.organizationApiKey, {
          algorithm: "HS256",
        })
      ),
      map((token: string) => ({ jwt: token })),
      mergeMap((response: JwtResponse) => {
        if (isEmpty(get(event, "queryStringParameters.subscriptionId", "")))
          return of(response);

        return this._addSubscriptionBin(
          event.queryStringParameters.subscriptionId!,
          event.requestContext.authorizer.merchantId,
          response
        );
      }),
      tag("CybersourceService | buildJwt")
    );
  }

  private _addSubscriptionBin(
    subscriptionId: string,
    merchantId: string,
    response: JwtResponse
  ): Observable<JwtResponse> {
    return of(1).pipe(
      mergeMap(() =>
        this._getSubscriptionDynamo(`${subscriptionId}${merchantId}`)
      ),
      mergeMap((subscription: SubscriptionDynamo | undefined) => {
        if (isEmpty(subscription)) throw new KushkiError(ERRORS.E054);
        const identifier: string = Buffer.from(
          get(subscription, "binInfo.bin", ""),
          "binary"
        ).toString("base64");

        return of({ ...response, identifier });
      }),
      tag("Cybersource Service | _addSubscriptionBin")
    );
  }

  private _getSubscriptionDynamo(
    id: string
  ): Observable<SubscriptionDynamo | undefined> {
    return of(1).pipe(
      switchMap(() =>
        this._storage.getItem<SubscriptionDynamo>(TABLES.subs_subscription, {
          id,
        })
      ),
      tag("Cybersource Service | _getSubscriptionDynamo")
    );
  }

  private _getCybersourceInfo(country: string): Observable<CybersourceEnv> {
    return of(1).pipe(
      map(() => JSON.parse(`${process.env.CYBERSOURCE_INFO}`)[country]),
      tag("CybersourceService | _getCybersourceInfo")
    );
  }

  private _getJWTPayload(
    csEnv: CybersourceEnv
  ): Observable<CybersourceJwtPayload> {
    return of(1).pipe(
      map(() => {
        const issued_at_time: number = Math.floor(new Date().getTime() / 1000);

        return {
          exp: issued_at_time + 2 * 60 * 60,
          iat: issued_at_time,
          iss: csEnv.apiIdentifier,
          jti: v4(),
          OrgUnitId: csEnv.organizationUnitId,
          ReferenceId: v4(),
        };
      }),
      tag("CybersourceService | _getJWTPayload")
    );
  }

  private _getCountry(
    event: IAPIGatewayEvent<
      null,
      null,
      CybersourceJwtRequest,
      AuthorizerContext
    >
  ): Observable<string> {
    return of(1).pipe(
      map(() => {
        let country: string = get(
          event,
          "requestContext.authorizer.merchantCountry",
          ""
        );

        if (isEmpty(country))
          country = get(
            event,
            "requestContext.authorizer.country",
            CountryEnum.COLOMBIA
          );

        return country;
      }),
      tag("CybersourceService | _getCountry")
    );
  }
}
