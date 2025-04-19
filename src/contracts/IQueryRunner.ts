import { Profile } from "./types";

/**
 * Interface representing a query runner capable of executing queries and fetching data.
 *
 * This is wrapper around undici fetch and returns fetch compatible Response objects.
 */
export interface IQueryRunner {
    /**
     * Executes a query against a specified profile.
     * @param query - The query string to execute.
     * @param profile - The profile context in which the query is executed.
     * @returns A promise that resolves to the response of the query execution.
     */
    run(query: string, profile: Profile): Promise<Response>;

    /**
     * Fetches data from a specified URL with the given profile and request options.
     * @param url - The URL to fetch data from.
     * @param profile - The profile context for the fetch operation.
     * @param options - Additional options for the fetch request.
     * @returns A promise that resolves to the response of the fetch operation.
     */
    fetch(url: string, profile: Profile, options: RequestInit): Promise<Response>;
}
