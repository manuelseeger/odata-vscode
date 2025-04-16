import { IODataConfiguration, Profile } from "../contracts/types";
import { DataModel } from "../odata2ts/data-model/DataModel";
import { digestMetadata } from "../metadata";
import { Document, DOMParser, Element, XMLSerializer, Node } from "@xmldom/xmldom";
import { IMetadataModelService } from "../contracts/IMetadataModelService";
import * as xpath from "xpath";

export class MetadataModelService implements IMetadataModelService {
    private cache: { [profileKey: string]: DataModel } = {};

    constructor() {}

    public async getModel(profile: Profile): Promise<DataModel> {
        if (this.cache[profile.baseUrl]) {
            return this.cache[profile.baseUrl];
        }

        if (!profile.metadata || profile.metadata.length === 0) {
            throw new Error("No metadata document found.");
        }
        const model = await this.digestMetadata(profile.metadata);
        // cache digested model
        this.cache[profile.baseUrl] = model;
        return model;
    }

    public async hasModel(profile: Profile): Promise<boolean> {
        if (this.cache[profile.baseUrl]) {
            return true;
        }
        const metadata = profile.metadata;
        if (!metadata) {
            return false;
        }
        const model = await this.digestMetadata(metadata);
        // cache digested model
        this.cache[profile.baseUrl] = model;
        return true;
    }

    private async digestMetadata(metadataXml: string): Promise<DataModel> {
        const model = await digestMetadata(metadataXml);
        return model;
    }

    public async refreshModel(profile: Profile): Promise<DataModel> {
        delete this.cache[profile.baseUrl];
        return this.getModel(profile);
    }

    public clearCache(profile?: Profile): void {
        if (profile) {
            delete this.cache[profile.baseUrl];
        } else {
            this.cache = {};
        }
    }

    public getFilteredMetadataXml(text: string, config: IODataConfiguration): string {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const root = xmlDoc.documentElement;

        if (!root || !this.isMetadata(xmlDoc)) {
            throw new Error("The provided XML is not valid OData metadata.");
        }

        // build a list of nodes to be filtered out from the document
        const select = xpath.useNamespaces({
            [config.metadata.xpathDefaultNsPrefix]: this.getFirstSchemaNamespace(xmlDoc) || "",
        });

        const filtered: Node[] = [];
        for (const xpathExpression of config.metadata.filterXPath) {
            const matches = select(xpathExpression, root as unknown as globalThis.Node);

            if (xpath.isArrayOfNodes(matches)) {
                for (const node of matches) {
                    if (xpath.isElement(node)) {
                        filtered.push(node as unknown as Node);
                    } else if (xpath.isAttribute(node)) {
                        filtered.push(node as unknown as Node);
                    }
                }
            } else {
                if (xpath.isElement(matches)) {
                    filtered.push(matches as unknown as Node);
                } else if (xpath.isAttribute(matches)) {
                    filtered.push(matches as unknown as Node);
                }
            }
        }

        // serialized while applying the filter
        const nodeFilter = (node: Node): boolean => {
            return !(
                filtered.some((a) => a.isSameNode(node)) ||
                config.metadata.filterNs.includes(node.namespaceURI || "")
            );
        };

        const adaptedFilter = (node: Node): Node | null => {
            return nodeFilter(node) ? node : null;
        };

        const serializer = new XMLSerializer();
        const cleanedXml = serializer.serializeToString(
            xmlDoc,
            // @ts-ignore @xmldom/xmldom implementation expected filter to return node, but XMLSerializer interface expects boolean
            adaptedFilter,
        );

        return cleanedXml;
    }

    public isMetadataXml(text: string): boolean {
        const parser = new DOMParser();
        try {
            const xmlDoc = parser.parseFromString(text, "text/xml");
            return this.isMetadata(xmlDoc);
        } catch (error) {
            return false;
        }
    }

    private isMetadata(xmlDoc: Document): boolean {
        const namespaces = [
            "http://docs.oasis-open.org/odata/ns/edmx", // OData 4.0 EDMX
            "http://schemas.microsoft.com/ado/2007/06/edmx", // OData 1.0/2.0 EDMX
        ];
        const root = xmlDoc.documentElement;
        if (!root || !namespaces.includes(root.namespaceURI || "")) {
            return false;
        }
        return true;
    }

    /**
     * Get the namespace URI of the first <Schema> element in the XML document.
     *
     * There are multiple versions of the EDM namespace out there, fetch the one used in this
     * document.
     *
     * @param xmlDoc - The XML document to search in.
     * @returns The namespace URI of the first <Schema> element, or null if not found.
     */
    private getFirstSchemaNamespace(xmlDoc: Document): string | null {
        const schemaElement = xmlDoc.getElementsByTagName("Schema")[0];
        return schemaElement ? schemaElement.namespaceURI : null;
    }
}
