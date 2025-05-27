/**
 *  Merchant Service
 */
import {
  IAPIGatewayEvent,
  IDENTIFIERS as CORE,
  IDynamoRecord,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { IDENTIFIERS as Identifiers } from "constant/Identifiers";
import {
  BUCKET_BRANDS_PREFIX_S3,
  DEV_BUCKET_BRANDS_PREFIX_S3,
  PAYLOAD,
} from "constant/Resources";
import { TABLES } from "constant/Tables";
import { EnvironmentEnum } from "infrastructure/EnvironmentEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { HierarchyPathEnum } from "infrastructure/HierarchyPathEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, set, unset } from "lodash";
import moment = require("moment");
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IEventBusDetail, IMerchantService } from "repository/IMerchantService";
import { forkJoin, iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  concatMap,
  last,
  map,
  mapTo,
  mergeMap,
  timeoutWith,
} from "rxjs/operators";
import { AuthorizerContext } from "types/authorizer_context";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { EventBusMerchant } from "types/event_bus_merchant";
import { GetBrandsLogosByMerchantResponse } from "types/get_brands_logos_by_merchant_response";
import { GetInfoSiftScienceResponse } from "types/getinfo_siftscience_response";
import { HierarchyConfig } from "types/hierarchy_config";
import { MerchantIdPathParameter } from "types/merchant_id_path_parameter";
import { ProcessorDeleteRequest } from "types/processor_delete_request";
import { ProcessorPathParameter } from "types/processor_id_path_parameter";
import { MerchantFetch } from "types/remote/merchant_fetch";
import { UpdateMerchantFromBus } from "types/update_merchant_from_bus";
import { UpdateMerchantRequest } from "types/update_merchant_request";

/**
 *  Implementation
 */
@injectable()
export class MerchantService implements IMerchantService {
  private readonly _storage: IDynamoGateway;
  private readonly _lambdaGateway: ILambdaGateway;

  constructor(
    @inject(Identifiers.DynamoGateway) dynamoGateway: IDynamoGateway,
    @inject(CORE.LambdaGateway) lambdaGateway: ILambdaGateway
  ) {
    this._storage = dynamoGateway;
    this._lambdaGateway = lambdaGateway;
  }

  public update(
    event: IAPIGatewayEvent<
      UpdateMerchantRequest,
      MerchantIdPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<object> {
    return this._getDynamoMerchant(
      event.requestContext.authorizer.merchantId
    ).pipe(
      concatMap((merchant: DynamoMerchantFetch) =>
        this._storage.put(
          {
            ...merchant,
            ...event.body,
          },
          TABLES.merchants
        )
      ),
      map(() => ({
        status: "OK",
      })),
      tag("Merchant Service | update")
    );
  }

  public getBrandsByMerchant(
    event: IAPIGatewayEvent<null, null, null, AuthorizerContext>
  ): Observable<string[]> {
    return of(1).pipe(
      mergeMap(() => {
        const hierarchy_config: HierarchyConfig = JSON.parse(
          <string>get(event, HierarchyPathEnum.HIERARCHY_CONFIG_PATH, "{}")
        );

        const merchant_id_from_hierarchy: string = <string>(
          get(hierarchy_config, HierarchyPathEnum.CN011_SERVICE_PATH)
        );

        const merchant_id = !isEmpty(merchant_id_from_hierarchy)
          ? merchant_id_from_hierarchy
          : event.requestContext.authorizer.merchantId;

        return this._getDynamoMerchant(merchant_id);
      }),
      map((merchant: DynamoMerchantFetch) =>
        defaultTo(get(merchant, "acceptCreditCards"), [])
      ),
      tag("Merchant Service | getBrandsByMerchant")
    );
  }

  public getBrandsLogosByMerchant(
    event: IAPIGatewayEvent<null, null, null, AuthorizerContext>
  ): Observable<GetBrandsLogosByMerchantResponse[]> {
    return this.getBrandsByMerchant(event).pipe(
      map((brands: string[]) =>
        brands.map((brand: string) => ({
          brand,
          url: `${this._buildS3Prefix()}/${brand}.svg`,
        }))
      ),
      tag("Merchant Service | getBrandsLogosByMerchant")
    );
  }

  public getDeferred(
    event: IAPIGatewayEvent<
      null,
      MerchantIdPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<object> {
    return this._getDynamoMerchant(
      event.requestContext.authorizer.merchantId
    ).pipe(
      map((merchant: DynamoMerchantFetch) => {
        if (merchant.deferredOptions === undefined) return {};

        return { deferredOptions: merchant.deferredOptions };
      }),
      tag("Merchant Service | getDeferred")
    );
  }

  public getOptions(
    event: IAPIGatewayEvent<
      null,
      MerchantIdPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<object> {
    return this._getDynamoMerchant(
      event.requestContext.authorizer.merchantId
    ).pipe(
      mergeMap((merchant: DynamoMerchantFetch) =>
        iif(
          () => this._validateSiftScienceProperties(merchant),
          of(merchant),
          this._invokeMerchantTrxRuleAndBuildMerchant(merchant)
        )
      ),
      map((merchant: DynamoMerchantFetch) => {
        delete merchant.deferredOptions;
        unset(merchant, "public_id");
        unset(merchant, "merchant_name");

        return { ...merchant };
      }),
      tag("Merchant Service | getDeferred")
    );
  }

  public getProcessorById(
    _event: IAPIGatewayEvent<
      null,
      ProcessorPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<boolean> {
    return of(true);
  }

  public deleteProcessor(
    _event: IAPIGatewayEvent<
      ProcessorDeleteRequest,
      ProcessorPathParameter,
      null,
      AuthorizerContext
    >
  ): Observable<boolean> {
    return of(true);
  }

  public updateMerchantFromBus(
    event: IEventBusDetail<IDynamoRecord<EventBusMerchant>>
  ): Observable<boolean> {
    return of(event.payload).pipe(
      mergeMap((dynamoRecord: IDynamoRecord<MerchantFetch>) => {
        if (
          dynamoRecord.dynamodb === undefined ||
          dynamoRecord.dynamodb.NewImage === undefined
        )
          throw new KushkiError(ERRORS.E020);

        return forkJoin([
          of(dynamoRecord),
          this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: dynamoRecord.dynamodb.NewImage.publicMerchantId,
          }),
        ]);
      }),
      mergeMap(
        ([dynamo_record, merchant]: [
          IDynamoRecord<MerchantFetch>,
          DynamoMerchantFetch | undefined
        ]) => {
          const merchant_dynamo_record: EventBusMerchant = get(
            dynamo_record,
            PAYLOAD.DYNAMO_IMAGE
          );
          const merchant_info: UpdateMerchantFromBus =
            this._createUpdateMerchantRequest(merchant_dynamo_record);

          if (merchant === undefined)
            return this._storage.put(
              this._createPutMerchantRequest(dynamo_record),
              TABLES.merchants
            );

          return this._storage.updateValues(
            TABLES.merchants,
            {
              public_id: get(
                dynamo_record,
                "dynamodb.NewImage.publicMerchantId",
                ""
              ),
            },
            merchant_info
          );
        }
      ),
      last(),
      mapTo(true),
      tag("Merchant Service | updateProcessorFromBus")
    );
  }

  private _getDynamoMerchant(
    merchantId: string
  ): Observable<DynamoMerchantFetch> {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
          public_id: merchantId,
        })
      ),
      timeoutWith(
        Number(`${process.env.EXTERNAL_TIMEOUT}`),
        throwError(() => new KushkiError(ERRORS.E027))
      ),
      map((merchant: DynamoMerchantFetch | undefined) => {
        if (merchant === undefined) throw new KushkiError(ERRORS.E004);

        return merchant;
      }),
      tag("Merchant Service | _getDynamoMerchant")
    );
  }

  private _createUpdateMerchantRequest(
    merchantData: EventBusMerchant
  ): UpdateMerchantFromBus {
    const current_timestamp: number = moment().valueOf();

    return {
      address: get(merchantData, "address", ""),
      city: get(merchantData, "city", ""),
      cityDescription: get(merchantData, "cityDescription", ""),
      clientType: get(merchantData, "clientType", ""),
      constitutionalCountry: get(merchantData, "constitutionalCountry", ""),
      country: get(merchantData, "country", ""),
      mcc: get(merchantData, "mcc", ""),
      merchant_name: get(merchantData, "name", ""),
      merchantCategory: get(merchantData, "categoryMerchant", ""),
      phoneNumber: get(merchantData, "phoneNumber", ""),
      province: get(merchantData, "province", ""),
      provinceDescription: get(merchantData, "provinceDescription", ""),
      socialReason: get(merchantData, "socialReason", ""),
      taxId: get(merchantData, "taxId", ""),
      updatedAt: current_timestamp,
      webSite: get(merchantData, "webSite", ""),
      zipCode: get(merchantData, "zipCode", ""),
    };
  }

  private _createPutMerchantRequest(
    dynamoRecord: IDynamoRecord<MerchantFetch>
  ): DynamoMerchantFetch {
    const current_timestamp: number = moment().valueOf();

    return {
      acceptCreditCards: [],
      address: get(dynamoRecord, "dynamodb.NewImage.address", ""),
      city: get(dynamoRecord, "dynamodb.NewImage.city", ""),
      cityDescription: get(
        dynamoRecord,
        "dynamodb.NewImage.cityDescription",
        ""
      ),
      clientType: get(dynamoRecord, "dynamodb.NewImage.clientType", ""),
      constitutionalCountry: get(
        dynamoRecord,
        "dynamodb.NewImage.constitutionalCountry",
        ""
      ),
      country: get(dynamoRecord, "dynamodb.NewImage.country", ""),
      createdAt: current_timestamp,
      mcc: get(dynamoRecord, "dynamodb.NewImage.mcc", ""),
      merchant_name: get(dynamoRecord, "dynamodb.NewImage.name", ""),
      merchantCategory: get(
        dynamoRecord,
        "dynamodb.NewImage.categoryMerchant",
        ""
      ),
      phoneNumber: get(dynamoRecord, "dynamodb.NewImage.phoneNumber", ""),
      province: get(dynamoRecord, "dynamodb.NewImage.province", ""),
      provinceDescription: get(
        dynamoRecord,
        "dynamodb.NewImage.provinceDescription",
        ""
      ),
      public_id: get(dynamoRecord, "dynamodb.NewImage.publicMerchantId", ""),
      sift_science: {},
      socialReason: get(dynamoRecord, "dynamodb.NewImage.socialReason", ""),
      taxId: get(dynamoRecord, "dynamodb.NewImage.taxId", ""),
      webSite: get(dynamoRecord, "dynamodb.NewImage.webSite", ""),
      zipCode: get(dynamoRecord, "dynamodb.NewImage.zipCode", ""),
    };
  }

  private _validateSiftScienceProperties(
    merchant: DynamoMerchantFetch
  ): boolean {
    return !(
      isEmpty(merchant.sift_science) ||
      isEmpty(merchant.sift_science.SandboxApiKey) ||
      isEmpty(merchant.sift_science.ProdApiKey)
    );
  }

  private _invokeMerchantTrxRuleAndBuildMerchant(
    merchant: DynamoMerchantFetch
  ): Observable<DynamoMerchantFetch> {
    return of(1).pipe(
      mergeMap(() =>
        this._lambdaGateway.invokeFunction<{
          body: GetInfoSiftScienceResponse;
        }>(
          `usrv-transaction-rule-${process.env.USRV_STAGE}-getSiftCredentials`,
          {
            pathParameters: {
              merchantId: merchant.public_id,
            },
            requestContext: {
              authorizer: {
                merchantId: merchant.public_id,
              },
            },
          }
        )
      ),
      map(
        (trxRuleSiftScienceResponse: { body: GetInfoSiftScienceResponse }) => {
          if (trxRuleSiftScienceResponse.body.siftCredentials.migrated) {
            set(
              merchant,
              "sift_science.SandboxApiKey",
              trxRuleSiftScienceResponse.body.siftCredentials.sandboxApiKey
            );
            set(
              merchant,
              "sift_science.ProdApiKey",
              trxRuleSiftScienceResponse.body.siftCredentials.prodApiKey
            );
            set(
              merchant,
              "sift_science.SandboxAccountId",
              trxRuleSiftScienceResponse.body.siftCredentials.sandboxAccountId
            );
            set(
              merchant,
              "sift_science.ProdAccountId",
              trxRuleSiftScienceResponse.body.siftCredentials.prodAccountId
            );
            set(
              merchant,
              "sift_science.BaconProdApiKey",
              trxRuleSiftScienceResponse.body.siftCredentials.baconProdApiKey
            );
            set(
              merchant,
              "sift_science.BaconSandboxApiKey",
              trxRuleSiftScienceResponse.body.siftCredentials.baconSandboxApiKey
            );
          }

          return merchant;
        }
      ),
      catchError(() => of(merchant)),
      tag("MerchantService | _invokeMerchantTrxRuleAndBuildMerchant")
    );
  }

  private _buildS3Prefix(): string {
    if (process.env.USRV_STAGE === EnvironmentEnum.PRIMARY)
      return BUCKET_BRANDS_PREFIX_S3;

    return DEV_BUCKET_BRANDS_PREFIX_S3;
  }
}
