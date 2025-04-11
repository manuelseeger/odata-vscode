import { IODataConfiguration, Profile } from "./types";
import { DataModel } from "../odata2ts/data-model/DataModel";

export interface IMetadataModelService {
    isMetadataXml(text: string): boolean;
    getModel(profile: Profile): Promise<DataModel>;
    refreshModel(profile: Profile): Promise<DataModel>;
    clearCache(profile?: Profile): void;
    getFilteredMetadataXml(text: string, config: IODataConfiguration): string;
    hasModel(profile: Profile): Promise<boolean>;
}
