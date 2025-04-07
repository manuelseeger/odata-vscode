import * as vscode from "vscode";
import { IODataConfiguration, IODataMetadataConfiguration, ODataFormat } from "./contracts";

export const APP_NAME = "odata";

export const commands = {
    getMetadata: `${APP_NAME}.getMetadata`,
    selectProfile: `${APP_NAME}.selectProfile`,
    addProfile: `${APP_NAME}.addProfile`,
    run: `${APP_NAME}.run`,
};

export const internalCommands = {
    openAndRunQuery: `${APP_NAME}.openAndRunQuery`,
    requestMetadata: `${APP_NAME}.requestMetadata`,
};

export const globalStates = {
    selectedProfile: `${APP_NAME}.selectedProfile`,
    profiles: `${APP_NAME}.profiles`,
};

export function getConfig(): IODataConfiguration {
    const extensionSettings = vscode.workspace.getConfiguration(APP_NAME);

    const config: IODataConfiguration = {
        metadata: extensionSettings.get("metadata") as IODataMetadataConfiguration,
        defaultFormat: extensionSettings.get("defaultFormat") as ODataFormat,
        strictParser: extensionSettings.get("strictParser", true),
    };
    return config;
}

export const ODataMode: vscode.DocumentFilter = { language: "odata" };
