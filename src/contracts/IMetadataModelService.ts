import { Profile } from "./types";
import { Csdl, SchemaSummary } from "../schema";

export interface IMetadataModelService {
    getCsdl(profile: Profile): Csdl | undefined;
    getSchemaSummary(text: string, root: string): SchemaSummary;
    isMetadataXml(text: string): boolean;
    clearCache(): void;
}
