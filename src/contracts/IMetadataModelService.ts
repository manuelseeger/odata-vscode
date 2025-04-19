import { IODataConfiguration, Profile } from "./types";
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
     * Clears all cached data, including models, XML documents, and filtered metadata.
     */
    clearCache(): void;

    /**
     * Filters the provided metadata XML based on the given configuration and returns the filtered XML.
     *
     * @param text - The metadata XML to filter.
     * @param config - The configuration specifying filtering rules and namespaces.
     * @returns The filtered metadata XML as a string.
     * @throws An error if the provided XML is not valid OData metadata.
     */
    getFilteredMetadataXml(text: string, config: IODataConfiguration): string;

    /**
     * Checks if a data model exists for the given profile in the cache. If not, it processes the metadata
     * to generate and cache the model.
     *
     * @param profile - The profile containing metadata and base URL.
     * @returns A promise that resolves to true if the model exists, otherwise false.
     */
    hasModel(profile: Profile): Promise<boolean>;
}
