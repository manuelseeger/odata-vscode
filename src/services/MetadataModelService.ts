import { Document, DOMParser } from "@xmldom/xmldom";
import { createHash } from "crypto";
import { IMetadataModelService } from "../contracts/IMetadataModelService";
import { Profile } from "../contracts/types";
import { SchemaSummary, summarizeSchema } from "../schema";
import { digestMetadata } from "../metadata";
import { DataModel } from "../odata2ts/data-model/DataModel";

export class MetadataModelService implements IMetadataModelService {
    private modelCache: { [profileKey: string]: DataModel } = {};
    private domCache: { [hash: string]: Document } = {};
    private schemaCache = new Map<string, Map<string, SchemaSummary>>();

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
        this.schemaCache.clear();
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

    public getSchemaSummary(text: string, root: string): SchemaSummary {
        const hash = this.hash(text);
        let summaries = this.schemaCache.get(hash);
        if (!summaries) {
            summaries = new Map();
            this.schemaCache.set(hash, summaries);
        }
        let summary = summaries.get(root);
        if (!summary) {
            summary = summarizeSchema(text, root);
            summaries.set(root, summary);
        }
        return summary;
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
}
