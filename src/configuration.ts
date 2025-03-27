import * as vscode from "vscode";

export type ODataFormat = "json" | "xml";

export interface IODataMetadataConfigurationMapEntry {
    url: string;
    path: string;
}

export interface IODataMetadataConfiguration {
    filterNs: string[];

    removeAnnotations: boolean;
}

interface IODataHttpClientConfiguration {
    customHeaders: { [key: string]: string };
}

export interface IODataConfiguration {
    metadata: IODataMetadataConfiguration;
    defaultFormat: ODataFormat;
}

const extensionSettings = vscode.workspace.getConfiguration("odata");

const config: IODataConfiguration = {
    metadata: extensionSettings.get("metadata") as IODataMetadataConfiguration,
    defaultFormat: extensionSettings.get("defaultFormat") as ODataFormat,
};

export { config };
