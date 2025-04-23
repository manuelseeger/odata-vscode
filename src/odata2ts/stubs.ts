// Local stubs to replace @odata2ts/converter-runtime

/**
 * Converter chains stub: maps data type keys to converter configurations.
 */
export type MappedConverterChains = Map<string, any>;

/**
 * Stub for individual value converter imports.
 */
export interface ValueConverterImport {
    [key: string]: any;
}

/**
 * Stub for converter configuration types.
 */
export type TypeConverterConfig = any;

/**
 * Stub implementation for loadConverters: returns empty converter chains.
 */
export async function loadConverters(
    version: any,
    converters?: Array<string | TypeConverterConfig>,
): Promise<MappedConverterChains> {
    return new Map<string, any>();
}

export interface AxiosRequestConfig {
    url: string;
}
