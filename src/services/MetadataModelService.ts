import { Document, DOMParser, Node, XMLSerializer } from "@xmldom/xmldom";
import { createHash } from "crypto";
import * as xpath from "xpath";
import { IMetadataModelService } from "../contracts/IMetadataModelService";
import { IODataConfiguration, Profile } from "../contracts/types";
import { digestMetadata } from "../metadata";
import { DataModel } from "../odata2ts/data-model/DataModel";

export class MetadataModelService implements IMetadataModelService {
    private modelCache: { [profileKey: string]: DataModel } = {};
    private domCache: { [hash: string]: Document } = {};
    private filteredXmlCache: { [key: string]: string } = {};

    constructor() {}

    public async getModel(profile: Profile): Promise<DataModel> {
        if (this.modelCache[profile.baseUrl]) {
            return this.modelCache[profile.baseUrl];
        }

        if (!profile.metadata || profile.metadata.length === 0) {
            throw new Error("No metadata document found.");
        }
        const model = await this.digestMetadata(profile.metadata);
        // cache digested model
        this.modelCache[profile.baseUrl] = model;
        return model;
    }

    public async hasModel(profile: Profile): Promise<boolean> {
        if (this.modelCache[profile.baseUrl]) {
            return true;
        }
        const metadata = profile.metadata;
        if (!metadata) {
            return false;
        }
        const model = await this.digestMetadata(metadata);
        // cache digested model
        this.modelCache[profile.baseUrl] = model;
        return true;
    }

    public async refreshModel(profile: Profile): Promise<DataModel> {
        delete this.modelCache[profile.baseUrl];
        return this.getModel(profile);
    }

    public clearCache(): void {
        // Clear all caches
        this.modelCache = {};
        this.domCache = {};
        this.filteredXmlCache = {};
    }

    public isMetadataXml(text: string): boolean {
        try {
            // Use cached XML parsing
            const xmlDoc = this.getCachedXml(text);
            return this.isMetadata(xmlDoc);
        } catch (error) {
            return false;
        }
    }

    public getFilteredMetadataXml(text: string, config: IODataConfiguration): string {
        const textHash = this.hash(text);
        // don't use content from cache if config changed
        const configHash = this.hash(JSON.stringify(config.metadata));
        const cacheKey = `${textHash}_${configHash}`;
        if (this.filteredXmlCache[cacheKey]) {
            return this.filteredXmlCache[cacheKey];
        }

        // Use cached XML parsing
        const xmlDoc = this.getCachedXml(text);
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
            // @ts-ignore
            adaptedFilter,
        );

        // Save filtered result in cache
        this.filteredXmlCache[cacheKey] = cleanedXml;
        return cleanedXml;
    }

    private async digestMetadata(metadata: string): Promise<DataModel> {
        const model = await digestMetadata(metadata);
        return model;
    }

    private hash(text: string): string {
        return createHash("sha256").update(text).digest("hex");
    }

    private getCachedXml(text: string): Document {
        const key = this.hash(text);
        if (this.domCache[key]) {
            return this.domCache[key];
        }
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        this.domCache[key] = xmlDoc;
        return xmlDoc;
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
