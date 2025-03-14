import * as vscode from 'vscode';
import { DataModel } from "./odata2ts/data-model/DataModel";
import { parseStringPromise } from "xml2js";
import { getMinimalConfig } from './odata2ts/defaultConfig';
import { ODataEdmxModelBase } from "./odata2ts/data-model/edmx/ODataEdmxModelBase";
import { SchemaV3 } from "./odata2ts/data-model/edmx/ODataEdmxModelV3";
import { SchemaV4 } from "./odata2ts/data-model/edmx/ODataEdmxModelV4";
import { Modes, RunOptions } from "./odata2ts/OptionModel";
import { NamespaceWithAlias } from "./odata2ts/data-model/DataModel";

import { digest as digestV2 } from "./odata2ts/data-model/DataModelDigestionV2";
import { digest as digestV4 } from "./odata2ts/data-model/DataModelDigestionV4";
import { NamingHelper } from "./odata2ts/data-model/NamingHelper";

import { ODataVersions } from "@odata2ts/odata-core";

import { DOMParser, XMLSerializer, Element, Document } from "@xmldom/xmldom";

import { config } from "./configuration";

function getServiceName(schemas: Array<SchemaV3 | SchemaV4>) {
    // auto-detection of first namespace with defined EntityTypes
    // NOTE: we make use of PascalCase here to enforce valid class names
    const detectedSchema = schemas.find((schema) => schema.$.Namespace && schema.EntityType?.length) || schemas[0];
    const serviceName = detectedSchema.$.Namespace;
    return serviceName;
}


export async function digestMetadata(metadataXml: string): Promise<DataModel> {
    const optionsDefault = getMinimalConfig();

    const options: RunOptions = {
        ...optionsDefault,
        source: "",
        output: ""
    };

    const metadataJson = (await parseStringPromise(metadataXml)) as ODataEdmxModelBase<any>;

    // determine edmx edmxVersion attribute
    const edmxVersion = metadataJson["edmx:Edmx"].$.Version;
    const version = edmxVersion === "1.0" ? ODataVersions.V2 : ODataVersions.V4;

    const dataService = metadataJson["edmx:Edmx"]["edmx:DataServices"][0];
    const schemas = dataService.Schema as Array<SchemaV3 | SchemaV4>;

    const serviceName = getServiceName(schemas);

    const namespaces = schemas.map<NamespaceWithAlias>((schema) => [schema.$.Namespace, schema.$.Alias]);

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

export function isMetadataXml(text: string): boolean {
    const parser = new DOMParser();
    try {
        const xmlDoc = parser.parseFromString(text, "text/xml");
        return isMetadata(xmlDoc);
    }
    catch (error) {
        return false;
    }
}

export function isMetadata(xmlDoc: Document): boolean {
    const root = xmlDoc.documentElement;
    if (!root || root.namespaceURI !== "http://schemas.microsoft.com/ado/2007/06/edmx") {
        return false;
    }
    return true;
}


export function getFilteredMetadataXml(text: string): string {

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");

    const root = xmlDoc.documentElement;

    if (!root || !isMetadata(xmlDoc)) {
        throw new Error("The provided XML is not valid OData metadata.");
    }

    cleanNamespacesFromXmlTree(root, config.metadata.filterNs);

    const serializer = new XMLSerializer();
    const cleanedXml = serializer.serializeToString(xmlDoc);

    return cleanedXml;
}


function cleanNamespacesFromXmlTree(node: Element, namespacesToRemove: string[]) {
    // Remove attributes in unwanted namespaces
    for (let i = node.attributes.length - 1; i >= 0; i--) {
        const attr = node.attributes.item(i);
        if (attr && namespacesToRemove.includes(attr.namespaceURI || "")) {
            node.removeAttributeNode(attr);
        }
    }

    // Recursively clean child elements
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes.item(i) as Element;
        if (child.nodeType === 1) { // Element node
            if (namespacesToRemove.includes(child.namespaceURI || "")) {
                node.removeChild(child); // Remove element in unwanted namespace
            } else {
                cleanNamespacesFromXmlTree(child, namespacesToRemove); // Recurse
            }
        }
    }
}