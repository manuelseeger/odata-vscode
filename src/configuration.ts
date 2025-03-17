import * as vscode from "vscode";

type ODataFormat = "json" | "xml";

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
    defaultFormat: ODataFormat;
}


const extensionSettings = vscode.workspace.getConfiguration("odata");

const config: IODataConfiguration = {
    metadata: extensionSettings.get("metadata") as IODataMetadataConfiguration,
    defaultFormat: extensionSettings.get("defaultFormat") as ODataFormat
};


export { config };