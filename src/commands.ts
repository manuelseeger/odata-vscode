import * as vscode from 'vscode';
import { isMetadataXml } from './metadata';
import { getExtensionContext } from './util';

import { Profile, AuthKind } from './profiles';

import { fetch } from 'undici';
import { ODataFormat } from './configuration';
import { getRequestInit } from './client';

export async function selectMetadata() {
    const fileUri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Select metadata file",
        filters: {
            "XML Files": ["xml", "edmx"],
            "All Files": ["*"]
        }
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


export async function addEndpointProfile() {

    const name = await vscode.window.showInputBox({ prompt: "Enter the profile name" });
    const baseUrl = await vscode.window.showInputBox({ prompt: "Enter the base URL" });
    if (!baseUrl) {
        return;
    }
    const auth = await vscode.window.showQuickPick(
        Object.values(AuthKind),
        {
            placeHolder: 'Authentication method',
            canPickMany: false
        }
    ) as AuthKind;

    let username: string | undefined;
    let password: string | undefined;
    let token: string | undefined;
    let cert: vscode.Uri | undefined;
    let key: vscode.Uri | undefined;

    switch (auth) {
        case AuthKind.Basic:
            username = await vscode.window.showInputBox({ prompt: "Enter the username" });
            password = await vscode.window.showInputBox({ prompt: "Enter the password", password: true });
            break;
        case AuthKind.Bearer:
            token = await vscode.window.showInputBox({ prompt: "Enter the token" });
            break;
        case AuthKind.ClientCert:
            const certs = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                openLabel: "Select certificate"
            });
            const keys = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                openLabel: "Select key"
            });
            cert = certs ? vscode.Uri.file(certs[0].fsPath) : undefined;
            key = keys ? vscode.Uri.file(keys[0].fsPath) : undefined;
            break;
        default:

    }
    const profile: Profile = {
        name: name || "",
        baseUrl: baseUrl,
        auth: {
            kind: auth,
            username: username || "",
            password: password,
            token: token,
            cert: cert,
            key: key
        },
        headers: {}
    };

    const context = getExtensionContext();

    const profiles = context.globalState.get<Profile[]>("odata.profiles", []);
    profiles.push(profile);
    context.globalState.update("odata.profiles", profiles);
    vscode.window.showInformationMessage("Profile added successfully.");
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
    const index = profiles.findIndex(p => p.baseUrl === profile.baseUrl);
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
        profiles.map(p => p.name),
        {
            placeHolder: "Select an endpoint"
        }
    );
    if (!profileName) {
        return;
    }
    const profile = profiles.find(p => p.name === profileName);
    context.globalState.update("selectedProfile", profile);
}


export async function requestProfileMetadata(profile: Profile): Promise<string> {
    // request the /$metadata endpoint via http using the profile details
    const context = getExtensionContext();

    const requestInit = await getRequestInit(profile);
    requestInit.headers.set('Accept', 'application/xml');
    const metadataUrl = `${profile.baseUrl.replace(/\/+$/, '')}/$metadata`;
    const res = await fetch(metadataUrl, requestInit);

    if (!res.ok) {
        vscode.window.showErrorMessage(`Failed to fetch metadata: ${res.status} ${res.statusText}`);
        return "";
    }
    const metadata = await res.text();
    return metadata;
}


export async function runQuery(query: string) {
    const context = getExtensionContext();
    const profile = context.globalState.get<Profile>("selectedProfile");
    if (!profile) {
        return;
    }

    const defaultFormat = vscode.workspace.getConfiguration("odata").get("defaultFormat") as ODataFormat;

    // strip leading http verb 
    query = query.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, '');
    query = query.trim();
    if (!query.endsWith('$count')) {
        query += `&$format=${defaultFormat}`;
    }

    const r = await getRequestInit(profile);
    const res = await fetch(query, r);

    let format = 'txt';
    const contentType = res.headers.get('Content-Type');
    if (contentType) {
        if (contentType.includes('json')) {
            format = 'json';
        } else if (contentType.includes('xml')) {
            format = 'xml';
        }
    }

    // Use a fixed untitled document URI so that we reuse the same editor.
    const outputUri = vscode.Uri.parse(`untitled:OData Query Results.${format}`);
    let doc = await vscode.workspace.openTextDocument(outputUri);
    doc = await vscode.languages.setTextDocumentLanguage(doc, format);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const newContent = await res.text();

    const entireRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
    );
    await editor.edit(editBuilder => {
        editBuilder.replace(entireRange, newContent);
    });

    await vscode.commands.executeCommand('editor.action.formatDocument');
}