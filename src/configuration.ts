import * as vscode from "vscode";

export type ODataFormat = "json" | "xml";

export const APP_NAME = "odata";

export const commands = {
    getMetadata: `${APP_NAME}.getMetadata`,
    selectProfile: `${APP_NAME}.selectProfile`,
    addProfile: `${APP_NAME}.addProfile`,
    runQuery: `${APP_NAME}.runQuery`,
};

export const internalCommands = {
    openAndRunQuery: `${APP_NAME}.openAndRunQuery`,
    requestMetadata: `${APP_NAME}.requestMetadata`,
};

export interface IODataMetadataConfigurationMapEntry {
    url: string;
    path: string;
}

export interface IODataMetadataConfiguration {
    filterNs: string[];
    removeAnnotations: boolean;
}

export interface IODataConfiguration {
    metadata: IODataMetadataConfiguration;
    defaultFormat: ODataFormat;
}

export function getConfig() {
    const extensionSettings = vscode.workspace.getConfiguration(APP_NAME);

    const config: IODataConfiguration = {
        metadata: extensionSettings.get("metadata") as IODataMetadataConfiguration,
        defaultFormat: extensionSettings.get("defaultFormat") as ODataFormat,
    };
    return config;
}

export const ODataMode: vscode.DocumentFilter = { language: "odata" };
