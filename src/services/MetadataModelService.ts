import { Profile } from "../profiles";
import { DataModel } from "../odata2ts/data-model/DataModel";
import { digestMetadata } from "../metadata";
import { Document, DOMParser, Element, XMLSerializer } from "@xmldom/xmldom";
import { getConfig } from "../configuration";

export class MetadataModelService {
    private cache: { [profileKey: string]: DataModel } = {};

    constructor() {}

    public async getModel(profile: Profile): Promise<DataModel> {
        if (this.cache[profile.baseUrl]) {
            return this.cache[profile.baseUrl];
        }

        const metadata = profile.metadata;
        if (!metadata) {
            throw new Error("No metadata document found.");
        }
        const model = await this.digestMetadata(metadata);
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
        const cleanedXml = this.getFilteredMetadataXml(metadataXml);
        const model = await digestMetadata(cleanedXml);
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

    public getFilteredMetadataXml(text: string): string {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const root = xmlDoc.documentElement;

        if (!root || !this.isMetadata(xmlDoc)) {
            throw new Error("The provided XML is not valid OData metadata.");
        }

        this.cleanNamespacesFromXmlTree(root, getConfig().metadata.filterNs);

        const serializer = new XMLSerializer();
        const cleanedXml = serializer.serializeToString(xmlDoc);

        return cleanedXml;
    }

    private cleanNamespacesFromXmlTree(node: Element, namespacesToRemove: string[]) {
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
            if (child.nodeType === 1) {
                // Element node
                if (getConfig().metadata.removeAnnotations && child.tagName === "Annotation") {
                    node.removeChild(child); // Remove Annotation elements
                } else if (namespacesToRemove.includes(child.namespaceURI || "")) {
                    node.removeChild(child); // Remove element in unwanted namespace
                } else {
                    this.cleanNamespacesFromXmlTree(child, namespacesToRemove); // Recurse
                }
            }
        }
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
}
