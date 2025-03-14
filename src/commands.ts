import * as vscode from 'vscode';
import { isMetadataXml } from './metadata';
import { getExtensionContext } from './util';

import { EndpointProfileMap, Profile, AuthKind } from './profiles';


import { config } from './configuration';

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
            cert = certs ? certs[0] : undefined;
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
            cert: cert
        }
    };

    const context = getExtensionContext();

    const profiles = context.globalState.get<EndpointProfileMap>("odata.profiles", {});
    profiles[baseUrl] = profile;
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

    if (profile.metadata) {
        return profile.metadata;
    }
    const metadata = await requestProfileMetadata(profile);
    profile.metadata = metadata;
    const profiles = context.globalState.get<EndpointProfileMap>("odata.profiles", {});
    profiles[profile.baseUrl] = profile;
    context.globalState.update("odata.profiles", profiles);
    return metadata;
}

export async function selectProfile() {
    const context = getExtensionContext();
    const profiles = context.globalState.get<EndpointProfileMap>("odata.profiles", {});
    const baseUrl = await vscode.window.showQuickPick(
        Object.keys(profiles),
        {
            placeHolder: "Select an endpoint"
        }
    );
    if (!baseUrl) {
        return;
    }
    const profile = profiles[baseUrl];
    context.globalState.update("selectedProfile", profile);
}


async function requestProfileMetadata(profile: Profile): Promise<string> {
    // request the /$metadata endpoint via http using the profile details
    const context = getExtensionContext();
    //const storagePath = context.globalStorageUri.fsPath; // Safe storage location
    // Save the metadata to a file

    const r = new Request(profile.baseUrl + "/$metadata", {
        method: 'GET',
        headers: {
            'Accept': 'application/xml'
        }
    });

    switch (profile.auth.kind) {
        case AuthKind.Basic:
            r.headers.set('Authorization', 'Basic ' + Buffer.from(profile.auth.username + ":" + profile.auth.password).toString('base64'));
            break;
    }

    const res = await fetch(r);
    if (!res.ok) {
        vscode.window.showErrorMessage("Failed to fetch metadata.");
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

    // strip leading http verb: 
    query = query.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, '');

    query = query.trim() + `&$format=json`;

    const r = new Request(query);

    switch (profile.auth.kind) {
        case AuthKind.Basic:
            r.headers.set('Authorization', 'Basic ' + Buffer.from(profile.auth.username + ":" + profile.auth.password).toString('base64'));
            break;
    }



    const res = await fetch(r);

    let format;
    const contentType = res.headers.get('Content-Type');
    if (contentType && contentType.includes('application/json')) {
        format = 'json';
    }
    else if (contentType && contentType.includes('application/xml')) {
        format = 'xml';
    }
    else if (contentType && contentType.includes('application/atom+xml')) {
        format = 'xml';
    } else {
        format = 'plaintext';
    }


    // show result in an editor
    const doc = await vscode.workspace.openTextDocument({ language: format, content: await res.text() });
    await vscode.window.showTextDocument(doc);
    // format 
    await vscode.commands.executeCommand('editor.action.formatDocument');
}