/**
 * Cybersource service interface
 */
import { IAPIGatewayEvent } from "@kushki/core";
import { Observable } from "rxjs";
import { AuthorizerContext } from "types/authorizer_context";
import { CybersourceJwtRequest } from "types/cybersource_jwt_request";
import { JwtResponse } from "types/jwt_response";

export interface ICybersourceService {
  /**
   *  Returns a jwt valid to make a cybersource 3ds validation
   */
  buildJwt(
    event: IAPIGatewayEvent<
      null,
      null,
      CybersourceJwtRequest,
      AuthorizerContext
    >
  ): Observable<JwtResponse>;
}
