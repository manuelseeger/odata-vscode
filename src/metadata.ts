import * as vscode from "vscode";
import { DataModel } from "./odata2ts/data-model/DataModel";
import { parseStringPromise } from "xml2js";
import { getMinimalConfig } from "./odata2ts/defaultConfig";
import { ODataEdmxModelBase } from "./odata2ts/data-model/edmx/ODataEdmxModelBase";
import { SchemaV3 } from "./odata2ts/data-model/edmx/ODataEdmxModelV3";
import { SchemaV4 } from "./odata2ts/data-model/edmx/ODataEdmxModelV4";
import { Modes, RunOptions } from "./odata2ts/OptionModel";
import { NamespaceWithAlias } from "./odata2ts/data-model/DataModel";

import { digest as digestV2 } from "./odata2ts/data-model/DataModelDigestionV2";
import { digest as digestV4 } from "./odata2ts/data-model/DataModelDigestionV4";
import { NamingHelper } from "./odata2ts/data-model/NamingHelper";

import { ODataVersions } from "@odata2ts/odata-core";

import {
    ActionImportType,
    EntitySetType,
    EntityType,
    FunctionImportType,
    PropertyModel,
    SingletonType,
} from "./odata2ts/data-model/DataTypeModel";

export type ResourceType = EntitySetType | SingletonType | FunctionImportType | ActionImportType;

export function entityTypeFromResource(
    resource: ResourceType,
    metadata: DataModel,
): EntityType | undefined {
    if ("entityType" in resource) {
        const entity = metadata.getEntityTypes().find((e) => e.name === resource.entityType.name);
        return entity;
    } else if ("entitySet" in resource) {
        const entitySet = Object.values(metadata.getEntityContainer().entitySets).find(
            (e) => e.name === resource.entitySet,
        );
        if (entitySet) {
            const entity = metadata
                .getEntityTypes()
                .find((e) => e.name === entitySet.entityType.name);
            return entity;
        }
    }

    return undefined;
}

export function getPropertyDoc(property: PropertyModel): vscode.MarkdownString {
    return new vscode.MarkdownString(
        `**Name**: ${property.odataName}\n\n**Type**: ${property.odataType}`,
    );
}

function getServiceName(schemas: Array<SchemaV3 | SchemaV4>) {
    // auto-detection of first namespace with defined EntityTypes
    const detectedSchema =
        schemas.find((schema) => schema.$.Namespace && schema.EntityType?.length) || schemas[0];
    const serviceName = detectedSchema.$.Namespace;
    return serviceName;
}

export async function digestMetadata(metadataXml: string): Promise<DataModel> {
    const optionsDefault = getMinimalConfig();

    const options: RunOptions = {
        ...optionsDefault,
        source: "",
        output: "",
    };

    const metadataJson = (await parseStringPromise(metadataXml)) as ODataEdmxModelBase<any>;

    // determine edmx edmxVersion attribute
    const edmxVersion = metadataJson["edmx:Edmx"].$.Version;
    const version = edmxVersion === "1.0" ? ODataVersions.V2 : ODataVersions.V4;

    const dataService = metadataJson["edmx:Edmx"]["edmx:DataServices"][0];
    const schemas = dataService.Schema as Array<SchemaV3 | SchemaV4>;

    const serviceName = getServiceName(schemas);

    const namespaces = schemas.map<NamespaceWithAlias>((schema) => [
        schema.$.Namespace,
        schema.$.Alias,
    ]);

    // encapsulate the whole naming logic
    const namingHelper = new NamingHelper(options, serviceName, namespaces);

    const dataModel =
        version === ODataVersions.V2
            ? await digestV2(dataService.Schema as Array<SchemaV3>, options, namingHelper)
            : await digestV4(dataService.Schema as Array<SchemaV4>, options, namingHelper);

    // Validation of entity names: the same name might be used across different namespaces
    const validationErrors = dataModel.getNameValidation();

    return dataModel;
}
