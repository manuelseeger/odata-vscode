import * as vscode from "vscode";
import { IODataConfiguration, ODataFormat, PublicProfile } from "./contracts/types";

import { parseProfileDraft, publicProfile } from "./profileData";
import { DEFAULT_SCHEMA_MAX_TOKENS } from "./schema";

export function getSelectedPublicProfile(
    context: vscode.ExtensionContext,
): PublicProfile | undefined {
    const selected = context.globalState.get<unknown>(globalStates.selectedProfile);
    if (selected === undefined) {
        return undefined;
    }
    try {
        return publicProfile(parseProfileDraft(selected));
    } catch {
        return undefined;
    }
}

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
    getSelectedProfile: `${APP_NAME}.getSelectedProfile`,
};

export const globalStates = {
    selectedProfile: `${APP_NAME}.selectedProfile`,
    profiles: `${APP_NAME}.profiles`,
};

export function getConfig(): IODataConfiguration {
    const extensionSettings = vscode.workspace.getConfiguration(APP_NAME);

    const config: IODataConfiguration = {
        chat: {
            schema: {
                maxTokens: extensionSettings.get(
                    "chat.schema.maxTokens",
                    DEFAULT_SCHEMA_MAX_TOKENS,
                ),
            },
        },
        defaultFormat: extensionSettings.get("defaultFormat") as ODataFormat,
        strictParser: extensionSettings.get("strictParser", true),
        disableRunner: extensionSettings.get("disableRunner", false),
        openResultInNewPane: extensionSettings.get("openResultInNewPane", true),
    };
    return config;
}

export const ODataMode: vscode.DocumentFilter = { language: "odata" };
