import { Profile } from "../profiles";
import { DataModel } from "../odata2ts/data-model/DataModel";
import { getFilteredMetadataXml, digestMetadata } from "../metadata";

export class MetadataModelService {
    private static instance: MetadataModelService;
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
        const cleanedXml = getFilteredMetadataXml(metadataXml);
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
}
