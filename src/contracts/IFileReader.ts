export interface IFileReader {
    readFile(path: string): Promise<Uint8Array>;
}
