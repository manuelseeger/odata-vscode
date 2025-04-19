/**
 * Interface representing a file reader.
 * Provides a method to read the contents of a file asynchronously.
 */
export interface IFileReader {
    /**
     * Reads the contents of a file at the specified path.
     * @param path - The path to the file to be read.
     * @returns A promise that resolves to the contents of the file as a Uint8Array.
     */
    readFile(path: string): Promise<Uint8Array>;
}
