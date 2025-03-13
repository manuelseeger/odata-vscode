import * as vscode from "vscode";

interface IODataMetadataConfigurationMapEntry {
    url: string;
    path: string;
}

interface IODataMetadataConfiguration {
    filterNs: string[];
    map: IODataMetadataConfigurationMapEntry[];
}

interface IODataConfiguration {
    metadata: IODataMetadataConfiguration;
}


const extensionSettings = vscode.workspace.getConfiguration("odata");

const config: IODataConfiguration = {
    metadata: extensionSettings.get("metadata") as IODataMetadataConfiguration
};


export { config };