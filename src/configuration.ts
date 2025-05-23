import * as vscode from "vscode";
import { IODataConfiguration, IODataMetadataConfiguration, ODataFormat } from "./contracts/types";

export const APP_NAME = "odata";

export const commands = {
    getMetadata: `${APP_NAME}.getMetadata`,
    selectProfile: `${APP_NAME}.selectProfile`,
    addProfile: `${APP_NAME}.addProfile`,
    run: `${APP_NAME}.run`,
    copyQuery: `${APP_NAME}.copy`,
};

export const internalCommands = {
    openAndRunQuery: `${APP_NAME}.openAndRunQuery`,
    requestMetadata: `${APP_NAME}.requestMetadata`,
    getSelectedProfileWithSecrets: `${APP_NAME}.getSelectedProfileWithSecrets`,
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
        disableRunner: extensionSettings.get("disableRunner", false),
        openResultInNewPane: extensionSettings.get("openResultInNewPane", true),
    };
    return config;
}

export const ODataMode: vscode.DocumentFilter = { language: "odata" };
