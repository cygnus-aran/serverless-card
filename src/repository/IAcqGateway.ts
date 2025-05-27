/**
 * IAcqGateway interface file.
 */
import { Observable } from "rxjs";
import { AcqCaptureRequest } from "types/acq_capture_request";
import { AcqChargeRequest } from "types/acq_charge_request";
import { AcqInvokeResponse } from "types/acq_invoke_response";
import { AcqResponse } from "types/acq_response";
import { AcqSubscriptionChargeRequest } from "types/acq_subscription_charge_request";
import { AcqValidateAccountRequest } from "types/acq_validate_account_request";
import { PreAuthRequest } from "types/preauth_request";

export interface IAcqGateway {
  /**
   * subscriptionCharge - will connect with acquirer to make a charge subscription
   * @param request - contains body request to invoke acquirer
   */
  subscriptionCharge(
    request: AcqSubscriptionChargeRequest
  ): Observable<AcqInvokeResponse>;

  /**
   * Request capture
   * @param request - DynamoTransaction
   */
  capture(request: AcqCaptureRequest): Observable<AcqResponse>;

  /**
   * @request request data
   * @DecryptCreditInfoResponse request data
   * Get an authentication token from Acq
   */
  charge(request: AcqChargeRequest): Observable<AcqInvokeResponse>;
  /**
   * @data preAuthRequest
   * @dataCard DecryptCreditInfoResponse
   * Get a pre-authorization from acquirer
   */
  preAuthorization(data: PreAuthRequest): Observable<AcqResponse>;

  /**
   * @data reAuthRequest
   * @dataCard DecryptCreditInfoResponse
   * Get a re-authorization from acquirer
   */
  reAuthorization(
    data: PreAuthRequest,
    referenceNumber: string
  ): Observable<AcqResponse>;

  /**
   * @request request data
   * @DecryptCreditInfoResponse request data
   * Get an authentication token from Acq
   */
  validateAccount(
    request: AcqValidateAccountRequest
  ): Observable<AcqInvokeResponse>;
}
