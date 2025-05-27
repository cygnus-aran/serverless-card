/**
 * Processor Service file
 */
import { IAPIGatewayEvent, ILambdaGateway, KushkiError } from "@kushki/core";
import { IDENTIFIERS as CORE } from "@kushki/core/lib/constant/Identifiers";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { EnvironmentEnum } from "infrastructure/EnvironmentEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { MINOR_TEST_STAGES } from "infrastructure/MinorTestStages";
import { NiubizCommerceActionEnum } from "infrastructure/NiubizCommerceActionEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { inject, injectable } from "inversify";
import { get, isEmpty, set } from "lodash";
import "reflect-metadata";
import { ICardGateway } from "repository/ICardGateway";
import { DynamoQueryResponse, IDynamoGateway } from "repository/IDynamoGateway";
import { IProcessorService } from "repository/IProcessorService";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { map, mapTo, mergeMap, timeoutWith } from "rxjs/operators";
import { AurusCreateProcessorResponse } from "types/aurus_create_processor_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CreateProcessorRequest } from "types/create_processor_request";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { ProcessorMetadata } from "types/processor_metadata";
import { ProcessorMetadataQuery } from "types/processor_metadata_query";
import { QueryCommandInput } from "@aws-sdk/lib-dynamodb";
/**
 * Implementation
 */
@injectable()
export class ProcessorService implements IProcessorService {
  private readonly _storage: IDynamoGateway;
  private readonly _aurus: ICardGateway;
  private readonly _lambda: ILambdaGateway;
  private readonly _publicIdPath: string = "publicId";

  constructor(
    @inject(IDENTIFIERS.DynamoGateway) dynamo: IDynamoGateway,
    @inject(IDENTIFIERS.CardGateway) aurus: ICardGateway,
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway
  ) {
    this._storage = dynamo;
    this._aurus = aurus;
    this._lambda = lambda;
  }

  public createProcessors(event: CreateProcessorRequest): Observable<object> {
    return of(1).pipe(
      mergeMap(() => this._storage.getDynamoMerchant(event.merchantId)),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(new KushkiError(ERRORS.E027))
      ),
      mergeMap((merchant: DynamoMerchantFetch) =>
        iif(
          () =>
            MINOR_TEST_STAGES.includes(`${process.env.USRV_STAGE}`) ||
            this._validateSandboxProcessors(event.processorName),
          this._createSandboxProcessor(),
          this._aurus.createProcessor(
            event,
            merchant.country,
            merchant.merchant_name
          )
        )
      ),
      mergeMap((response: AurusCreateProcessorResponse) => {
        set(event, "privateMerchantId", response.transaction_merchantId);
        set(event, "publicMerchantId", response.token_merchantId);
        set(event, this._publicIdPath, response.token_merchantId);
        set(event, "privateId", response.transaction_merchantId);

        return of(event);
      }),
      mergeMap((currentProcessorBody: CreateProcessorRequest) =>
        iif(
          () => event.processorName === ProcessorEnum.VISANET,
          this._createNiubizProcessor(currentProcessorBody),
          of(currentProcessorBody)
        )
      ),
      map((body: CreateProcessorRequest) => body),
      tag("ProcessorService | createProcessors")
    );
  }

  public updateProcessors(event: CreateProcessorRequest): Observable<object> {
    return of(1).pipe(
      mergeMap(() => this._storage.getDynamoMerchant(event.merchantId)),
      mergeMap((merchant: DynamoMerchantFetch) => {
        set(event, "publicMerchantId", get(event, this._publicIdPath));

        return iif(
          () =>
            get(event, this._publicIdPath, "").startsWith("600000") ||
            MINOR_TEST_STAGES.includes(`${process.env.USRV_STAGE}`) ||
            this._validateSandboxProcessors(event.processorName),
          of(true),
          this._aurus.updateProcessor(
            event,
            merchant.country,
            merchant.merchant_name
          )
        );
      }),
      mergeMap(() =>
        iif(
          () =>
            event.processorName === ProcessorEnum.VISANET ||
            event.processorName === ProcessorEnum.NIUBIZ,
          this._validateFlagNiubizProcessor(event),
          of(true)
        )
      ),
      map(() => ({
        status: "OK",
      })),
      tag("ProcessorService | updateProcessors")
    );
  }

  public processorMetadata(
    event: IAPIGatewayEvent<
      null,
      null,
      ProcessorMetadataQuery,
      AuthorizerContext
    >
  ): Observable<ProcessorMetadata[]> {
    return of(1).pipe(
      mergeMap(() =>
        this._getMerchant(event.requestContext.authorizer.merchantId)
      ),
      mergeMap(() => this._getProcessorMetadata(event.queryStringParameters)),
      map(
        (dynamoResponse: DynamoQueryResponse<ProcessorMetadata>) =>
          dynamoResponse.items
      ),
      tag("ProcessorService | processorMetadata")
    );
  }

  private _getProcessorMetadata(
    queryParam: ProcessorMetadataQuery
  ): Observable<DynamoQueryResponse<ProcessorMetadata>> {
    return of(1).pipe(
      mergeMap(() => {
        if (isEmpty(queryParam.mcc) && isEmpty(queryParam.id))
          return throwError(() => new KushkiError(ERRORS.E001));
        const id_query: QueryCommandInput = {
          ExpressionAttributeNames: {
            "#id": "id",
            "#type": "type",
          },
          ExpressionAttributeValues: {
            ":id": queryParam.id,
            ":type": queryParam.type,
          },
          IndexName: IndexEnum.id_type_index,
          KeyConditionExpression: "#type = :type and #id = :id",
          TableName: TABLES.processor_metadata,
        };

        const mcc_query: QueryCommandInput = {
          ExpressionAttributeNames: {
            "#mcc": "mcc",
            "#type": "type",
          },
          ExpressionAttributeValues: {
            ":mcc": queryParam.mcc,
            ":type": queryParam.type,
          },
          IndexName: IndexEnum.mcc_type_index,
          KeyConditionExpression: "#type = :type and #mcc = :mcc",
          TableName: TABLES.processor_metadata,
        };

        return this._storage.querySimple<ProcessorMetadata>(
          isEmpty(queryParam.mcc) ? id_query : mcc_query
        );
      }),
      tag("Processor Service | _getProcessorMetadata")
    );
  }

  private _getMerchant(merchantId: string): Observable<DynamoMerchantFetch> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
          public_id: merchantId,
        })
      ),
      map((merchant: DynamoMerchantFetch | undefined) => {
        if (merchant === undefined) throw new KushkiError(ERRORS.E004);

        return merchant;
      }),
      tag("Processor Service | _getMerchant")
    );
  }

  private _createNiubizProcessor(
    processor: CreateProcessorRequest
  ): Observable<CreateProcessorRequest> {
    return of(1).pipe(
      mergeMap(() => this._getProcessorCode(processor)),
      mergeMap((newProcessor: CreateProcessorRequest) =>
        this._createNiubizCommerceAffiliation(newProcessor)
      ),
      tag("ProcessorService | _createNiubizProcessor")
    );
  }

  private _getCommerceAffiliationBody(
    action: NiubizCommerceActionEnum,
    processor: CreateProcessorRequest,
    oldProcessorMerchantId?: string
  ): object {
    const body: object = {
      merchantCategoryCode: processor.merchantCategoryCode,
      merchantId: processor.merchantId,
      processorCode: processor.processorCode,
      processorMerchantId: processor.processorMerchantId,
      publicId: processor.publicId,
    };

    if (
      action === NiubizCommerceActionEnum.DELETE ||
      action === NiubizCommerceActionEnum.UPDATE
    ) {
      set(body, "action", action);
      set(body, "processorName", processor.processorName);
    }

    if (get(processor, "isBusinessPartner"))
      set(body, "isBusinessPartner", get(processor, "isBusinessPartner"));

    if (oldProcessorMerchantId)
      set(body, "oldProcessorMerchantId", oldProcessorMerchantId);

    return body;
  }

  private _createNiubizCommerceAffiliation(
    processor: CreateProcessorRequest
  ): Observable<CreateProcessorRequest> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeAsyncFunction(
          `usrv-card-niubiz-${process.env.USRV_STAGE}-createCommerceAffiliation`,
          this._getCommerceAffiliationBody(
            NiubizCommerceActionEnum.CREATE,
            processor
          )
        )
      ),
      mapTo(processor),
      tag("ProcessorService | _createNiubizCommerceAffiliation")
    );
  }

  private _updateNiubizCommerceAffiliation(
    processor: CreateProcessorRequest,
    action: NiubizCommerceActionEnum
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeAsyncFunction(
          `usrv-card-niubiz-${process.env.USRV_STAGE}-updateCommerceAffiliation`,
          this._getCommerceAffiliationBody(action, processor)
        )
      ),
      mapTo(true),
      tag("ProcessorService | _updateNiubizCommerceAffiliation")
    );
  }

  private _deleteCreateNiubizCommerceAffiliation(
    request: CreateProcessorRequest,
    oldPorcessorMerchantId: string
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambda.invokeAsyncFunction(
          `usrv-card-niubiz-${process.env.USRV_STAGE}-deleteCreateCommerceAffiliation`,
          this._getCommerceAffiliationBody(
            NiubizCommerceActionEnum.UPDATE,
            request,
            oldPorcessorMerchantId
          )
        )
      ),
      mapTo(true),
      tag("ProcessorService | _deleteCreateNiubizCommerceAffiliation")
    );
  }

  private _validateFlagNiubizProcessor(
    event: CreateProcessorRequest
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() => {
        const old_processor_merchant_id: string = get(
          event,
          "oldProcessorMerchantId",
          ""
        );

        return iif(
          () => !isEmpty(old_processor_merchant_id),
          this._deleteCreateNiubizCommerceAffiliation(
            event,
            old_processor_merchant_id
          ),
          this._updateNiubizCommerceAffiliation(
            event,
            NiubizCommerceActionEnum.UPDATE
          )
        );
      }),
      tag("ProcessorService | _validateFlagNiubizProcessor")
    );
  }

  private _getProcessorCode(
    processorBody: CreateProcessorRequest
  ): Observable<CreateProcessorRequest> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.getSequential(
          `${process.env.USRV_STAGE}-${process.env.USRV_NAME}`
        )
      ),
      map((sequence: object) => {
        const current_count: string = get(sequence, "quantity", 1).toString();

        return `${ProcessorService._generateZeroArray(current_count).join(
          ""
        )}${current_count}`;
      }),
      map((processorCode: string) => {
        const current_processor_body: CreateProcessorRequest = {
          ...processorBody,
        };

        set(current_processor_body, "processorCode", processorCode);

        return current_processor_body;
      }),
      tag("ProcessorService | _getProcessorCode")
    );
  }

  private static _generateZeroArray(currentCount: string): number[] {
    return Array.from({ length: 9 - currentCount.length }, () => 0);
  }

  /* tslint:disable:insecure-random*/
  private _createSandboxProcessor(): Observable<AurusCreateProcessorResponse> {
    return of(1).pipe(
      map(() => {
        const base: number = Number(process.env.MERCHANT_BASE_VALUE);
        const terminal_id: number =
          Math.floor(Math.random() * (99999999 - 10000000 + 1)) + 10000000;
        const terminal_id2: number =
          Math.floor(Math.random() * (99999999 - 10000000 + 1)) + 10000000;

        const store_id: string = new Date().getTime().toString();
        const public_merchant_id: string = `${base}${store_id}${terminal_id}`;
        const private_merchant_id: string = `${base}${store_id}${terminal_id2}`;

        return {
          response_code: "000",
          response_text: "success",
          token_merchantId: public_merchant_id,
          transaction_merchantId: private_merchant_id,
        };
      })
    );
  }

  private _validateSandboxProcessors(processorName: string): boolean {
    const sandbox_processors: string[] = (
      process.env.SANDBOX_PROCESSORS || ""
    ).split(",");

    return (
      sandbox_processors.includes(processorName) &&
      process.env.USRV_STAGE !== EnvironmentEnum.PRIMARY
    );
  }
}
