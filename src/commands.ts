import * as vscode from "vscode";
import { isMetadataXml } from "./metadata";
import { getExtensionContext } from "./util";

import { Profile, AuthKind } from "./profiles";

import { fetch } from "undici";
import { ODataFormat } from "./configuration";
import { getRequestInit } from "./client";

let queryDocument: vscode.TextDocument | undefined = undefined;
let resultDocument: vscode.TextDocument | undefined = undefined;

export async function selectMetadata() {
    const fileUri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Select metadata file",
        filters: {
            "XML Files": ["xml", "edmx"],
            "All Files": ["*"],
        },
    });
    if (fileUri && fileUri[0]) {
        const filePath = fileUri[0];

        // Read and store the file content
        const fileContent = await vscode.workspace.fs.readFile(filePath);

        const xml = fileContent.toString();

        // Check if the file content is valid metadata
        if (!isMetadataXml(xml)) {
            vscode.window.showErrorMessage("The selected file is not a valid OData metadata file.");
            return;
        }
        const context = getExtensionContext();
        context.globalState.update("selectedMetadata", xml);
    }
}

export async function getEndpointMetadata(): Promise<string> {
    const context = getExtensionContext();

    let profile = context.globalState.get<Profile>("selectedProfile");
    if (!profile) {
        await selectProfile();
        profile = context.globalState.get<Profile>("selectedProfile");
    }
    if (!profile) {
        return "";
    }

    const metadata = await requestProfileMetadata(profile);
    profile.metadata = metadata;
    const profiles = context.globalState.get<Profile[]>("odata.profiles", []);
    const index = profiles.findIndex((p) => p.baseUrl === profile.baseUrl);
    if (index >= 0) {
        profiles[index] = profile;
    } else {
        profiles.push(profile);
    }
    context.globalState.update("odata.profiles", profiles);
    return metadata;
}

export async function selectProfile() {
    const context = getExtensionContext();
    const profiles = context.globalState.get<Profile[]>("odata.profiles", []);
    if (profiles.length === 0) {
        return;
    }
    const profileName = await vscode.window.showQuickPick(
        profiles.map((p) => p.name),
        {
            placeHolder: "Select an endpoint",
        },
    );
    if (!profileName) {
        return;
    }
    const profile = profiles.find((p) => p.name === profileName);
    context.globalState.update("selectedProfile", profile);
}

export async function openQuery(query: string) {
    const context = getExtensionContext();
    const profile = context.globalState.get<Profile>("selectedProfile");
    if (!profile) {
        return;
    }
    if (!queryDocument) {
        let doc = await vscode.workspace.openTextDocument({ language: "odata", content: query });
        queryDocument = doc;
    }

    const editor = await vscode.window.showTextDocument(queryDocument, { preview: false });
    const entireRange = new vscode.Range(
        queryDocument.positionAt(0),
        queryDocument.positionAt(queryDocument.getText().length),
    );
    await editor.edit((editBuilder) => {
        editBuilder.replace(entireRange, query);
    });

    await vscode.commands.executeCommand("editor.action.formatDocument");
}

export async function requestProfileMetadata(profile: Profile): Promise<string> {
    // request the /$metadata endpoint via http using the profile details
    const context = getExtensionContext();

    const requestInit = await getRequestInit(profile);
    requestInit.headers.set("Accept", "application/xml");
    const metadataUrl = `${profile.baseUrl.replace(/\/+$/, "")}/$metadata`;
    let response: Response;
    try {
        response = await fetch(metadataUrl, requestInit);
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to fetch metadata: ${err}`);
        return "";
    }

    if (!response.ok) {
        vscode.window.showErrorMessage(
            `Failed to fetch metadata: ${response.status} ${response.statusText}`,
        );
        return "";
    }
    const metadata = await response.text();
    return metadata;
}

export async function runQuery(query: string) {
    openQuery(query);
    const context = getExtensionContext();
    const profile = context.globalState.get<Profile>("selectedProfile");
    if (!profile) {
        return;
    }

    const defaultFormat = vscode.workspace
        .getConfiguration("odata")
        .get("defaultFormat") as ODataFormat;

    // strip leading http verb
    query = query.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, "");
    query = query.trim();
    if (!query.endsWith("$count") && !query.includes("$format")) {
        query += `&$format=${defaultFormat}`;
    }

    const r = await getRequestInit(profile);
    const res = await fetch(query, r);

    let format = "txt";
    const contentType = res.headers.get("Content-Type");
    if (contentType) {
        if (contentType.includes("json")) {
            format = "json";
        } else if (contentType.includes("xml")) {
            format = "xml";
        }
    }

    const newContent = await res.text();
    if (!resultDocument) {
        let doc = await vscode.workspace.openTextDocument({
            language: format,
            content: newContent,
        });
        resultDocument = doc;
    }

    resultDocument = await vscode.languages.setTextDocumentLanguage(resultDocument, format);

    const editor = await vscode.window.showTextDocument(resultDocument, { preview: false });
    const entireRange = new vscode.Range(
        resultDocument.positionAt(0),
        resultDocument.positionAt(resultDocument.getText().length),
    );
    await editor.edit((editBuilder) => {
        editBuilder.replace(entireRange, newContent);
    });

    await vscode.commands.executeCommand("editor.action.formatDocument");
}
