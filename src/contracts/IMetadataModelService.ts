import { Profile } from "./types";
import { SchemaSummary } from "../schema";
import { DataModel } from "../odata2ts/data-model/DataModel";

export interface IMetadataModelService {
    /**
     * Checks if the provided text is a valid OData metadata XML document.
     *
     * @param text - The text to validate as OData metadata XML.
     * @returns True if the text is valid OData metadata XML, otherwise false.
     */
    isMetadataXml(text: string): boolean;

    /**
     * Retrieves the data model for the given profile. If the model is cached, it returns the cached version.
     * Otherwise, it processes the metadata to generate the model and caches it.
     *
     * @param profile - The profile containing metadata and base URL.
     * @returns A promise that resolves to the data model.
     * @throws An error if no metadata document is found.
     */
    getModel(profile: Profile): Promise<DataModel>;

    /**
     * Refreshes the cached data model for the given profile by clearing the cache and regenerating the model.
     *
     * @param profile - The profile containing metadata and base URL.
     * @returns A promise that resolves to the refreshed data model.
     */
    refreshModel(profile: Profile): Promise<DataModel>;

    /**
     * Clears all cached data, including models, XML documents, and schema summaries.
     */
    clearCache(): void;

    getSchemaSummary(text: string, root: string): SchemaSummary;

    /**
     * Checks if a data model exists for the given profile in the cache. If not, it processes the metadata
     * to generate and cache the model.
     *
     * @param profile - The profile containing metadata and base URL.
     * @returns A promise that resolves to true if the model exists, otherwise false.
     */
    hasModel(profile: Profile): Promise<boolean>;
}
