import * as vscode from "vscode";
import * as path from "path";
import { requestProfileMetadata } from "./commands";

export enum AuthKind {
    None = "none",
    Basic = "basic",
    Bearer = "bearer",
    ClientCert = "cliencert",
}

interface IProfileAuthentication {
    kind: AuthKind;
    username?: string;
    password?: string;
    token?: string;
    cert?: vscode.Uri;
    key?: vscode.Uri;
    pfx?: vscode.Uri;
    passphrase?: string;
}

export interface Profile {
    name: string;
    baseUrl: string;
    auth: IProfileAuthentication;
    metadata?: string;
    headers: { [key: string]: string };
}

export class ProfileItem extends vscode.TreeItem {
    constructor(public profile: Profile) {
        super(profile.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "odata.profile"; // Enables context menu
    }
}

export class ProfileTreeProvider implements vscode.TreeDataProvider<ProfileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProfileItem | undefined | void> =
        new vscode.EventEmitter<ProfileItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ProfileItem | undefined | void> =
        this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    getTreeItem(element: ProfileItem): vscode.TreeItem {
        const selectedProfile = this.context.globalState.get<Profile>("selectedProfile");
        if (selectedProfile && selectedProfile.name === element.profile.name) {
            element.iconPath = new vscode.ThemeIcon("check");
        }

        return element;
    }

    getChildren(): ProfileItem[] {
        const profiles = this.context.globalState.get<Profile[]>("odata.profiles", []);
        return profiles.map((profile) => new ProfileItem(profile));
    }
    addProfile(profile: Profile) {
        const profiles = this.context.globalState.get<Profile[]>("odata.profiles", []);
        profiles.push(profile);
        this.context.globalState.update("odata.profiles", profiles);
        this.refresh();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }

    deleteProfile(profile: Profile) {
        let profiles = this.context.globalState.get<Profile[]>("odata.profiles", []);
        profiles = profiles.filter((p) => p.name !== profile.name);
        this.context.globalState.update("odata.profiles", profiles);
        this.refresh();
    }

    public openProfileWebview(profile?: Profile) {
        const panel = vscode.window.createWebviewPanel(
            "profileManager",
            profile ? `Edit Profile: ${profile.name}` : "Create HTTP Profile",
            vscode.ViewColumn.One,
            { enableScripts: true },
        );

        panel.webview.html = this._getWebViewContent(panel.webview, profile);

        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === "saveProfile") {
                    let profiles = this.context.globalState.get<Profile[]>("odata.profiles", []);

                    // update or add
                    const newProfile: Profile = parseProfile(message.data);

                    const index = profiles.findIndex((p) => p.name === newProfile.name);
                    if (index >= 0) {
                        profiles[index] = newProfile;
                    } else {
                        profiles.push(newProfile);
                    }

                    this.context.globalState.update("odata.profiles", profiles);

                    if (profiles.length === 1) {
                        this.context.globalState.update("selectedProfile", profiles[0]);
                    }
                    this.refresh();
                    vscode.window.showInformationMessage(
                        `Profile "${message.data.name}" ${profile ? "updated" : "added"}!`,
                    );
                    panel.dispose();
                } else if (message.command === "requestMetadata") {
                    const newProfile = parseProfile(message.data);
                    const metadata = await requestProfileMetadata(newProfile);
                    if (metadata) {
                        panel.webview.postMessage({ command: "metadataReceived", data: metadata });
                    }
                } else if (message.command === "openFileDialog") {
                    const type = message.inputName;
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectFolders: false,
                        canSelectMany: false,
                        filters: getFiltersForType(type),
                    });
                    if (fileUri && fileUri.length > 0) {
                        panel.webview.postMessage({
                            command: "fileSelected",
                            inputName: type,
                            filePath: fileUri[0].path,
                        });
                    }
                }
            },
            undefined,
            this.context.subscriptions,
        );
    }

    private _getWebViewContent(webview: vscode.Webview, profile?: Profile): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "assets", "main.js"),
        );

        const styles = [
            "assets/vscode.css",
            "node_modules/@vscode/codicons/dist/codicon.css",
            "node_modules/@vscode-elements/elements-lite/components/action-button/action-button.css",
            "node_modules/@vscode-elements/elements-lite/components/label/label.css",
            "node_modules/@vscode-elements/elements-lite/components/button/button.css",
            "node_modules/@vscode-elements/elements-lite/components/textfield/textfield.css",
            "node_modules/@vscode-elements/elements-lite/components/textarea/textarea.css",
            "node_modules/@vscode-elements/elements-lite/components/select/select.css",
        ];
        const stylesUriList = styles.map((style) =>
            webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, style))),
        );
        const linkTags = stylesUriList
            .map((uri) => `<link href="${uri}" rel="stylesheet" />`)
            .join("\n");

        const nonce = getNonce();

        return `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <!--
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            -->
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Cat Coding</title>
            ${linkTags}
          </head>
          <body>
            <h1>${profile ? "Edit Profile" : "Create Profile"}</h1>
            <form id="profileForm">
              <div style="display: flex; gap: 20px;">
                <div style="flex: 1;">
                  <label for="name" class="vscode-label">Name</label>
                  <input type="text" id="name" name="name" value="${profile ? profile.name : ""}" required class="vscode-textfield" /><br/><br/>
                  
                  <label for="baseUrl" class="vscode-label">Base URL</label>
                  <p>URL of your service. The path where your $metadata file resides.</p>
                  <input type="text" id="baseUrl" name="baseUrl" value="${profile ? profile.baseUrl : ""}" required  class="vscode-textfield"/><br/><br/>
                  
                  <label for="authKind" class="vscode-label">Auth Type</label>
                  <select id="authKind" name="authKind" class="vscode-select">
                    <option value="none" ${profile && profile.auth.kind === "none" ? "selected" : ""}>None</option>
                    <option value="basic" ${profile && profile.auth.kind === "basic" ? "selected" : ""}>Basic</option>
                    <option value="bearer" ${profile && profile.auth.kind === "bearer" ? "selected" : ""}>Bearer</option>
                    <option value="cliencert" ${profile && profile.auth.kind === "cliencert" ? "selected" : ""}>Client Cert</option>
                  </select><br/><br/>

                  <div id="basicFields" style="display:none;">
                    <label for="username" class="vscode-label">Username</label>
                    <input type="text" id="username" name="username" class="vscode-textfield" value="${profile && profile.auth.username ? profile.auth.username : ""}"/><br/><br/>
                    <label for="password" class="vscode-label">Password</label>
                    <input type="password" id="password" name="password" class="vscode-textfield" value="${profile && profile.auth.password ? profile.auth.password : ""}"/><br/><br/>
                  </div>
                  <div id="bearerFields" style="display:none;">
                    <label for="token" class="vscode-label">Token</label>
                    <input type="text" id="token" name="token" class="vscode-textfield" value="${profile && profile.auth.token ? profile.auth.token : ""}"/><br/><br/>
                  </div>
                  <div id="clientCertFields" style="display:none;">
                    <label for="cert" class="vscode-label">Certificate</label>
                    <div>
                        <input type="input" id="cert" name="cert" class="vscode-textfield" value="${profile && profile.auth.cert ? profile.auth.cert.path : ""}"/>
                        <div  class="icon"><i class="codicon codicon-symbol-file"></i></div>
                    </div>
                    <br/><br/>
                    <label for="key" class="vscode-label">Key</label>
                    <div>
                        <input type="input" id="key" name="key" class="vscode-textfield"  value="${profile && profile.auth.key ? profile.auth.key.path : ""}"/>
                        <div  class="icon"><i class="codicon codicon-symbol-file"></i></div>
                    </div>
                    <br/><br/>
                    <label for="pfx" class="vscode-label">PFX</label>
                    <div >
                        <input type="text" id="pfx" name="pfx" class="vscode-textfield"  value="${profile && profile.auth.pfx ? profile.auth.pfx.path : ""}"/>
                        <div  class="icon"><i class="codicon codicon-symbol-file"></i></div>
                    </div>
                    <br/><br/>
                    <label for="passphrase" class="vscode-label">Passphrase</label>
                    <input type="password" id="passphrase" name="passphrase" class="vscode-textfield" value="${profile && profile.auth.passphrase ? profile.auth.passphrase : ""}"/><br/><br/>
                  </div>
                  
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <label class="vscode-label">Headers</label>
                    <div class="icon" id="addHeaderButton"><i class="codicon codicon-add"></i></div>
                  </div>
                  <div id="headersContainer">
                    ${
                        profile && profile.headers
                            ? Object.keys(profile.headers)
                                  .map(
                                      (key) =>
                                          `<div>
                             <input type="text" class="headerKey vscode-textfield" placeholder="Header Name" value="${key}"/>
                             <input type="text" class="headerValue vscode-textfield" placeholder="Header Value" value="${profile.headers[key]}"/>
                             <div class="icon" onclick="this.parentElement.remove();"><i class="codicon codicon-trash"></i></div>
                    </div>`,
                                  )
                                  .join("")
                            : ""
                    }
                  </div>
                  <br/><br/>
                  <button type="submit" class="vscode-button">${profile ? "Update Profile" : "Create Profile"}</button>
                  <button id="requestMetadataButton" type="button" class="vscode-button">Request Metadata</button>
                </div>
                <div style="flex: 1;">
                  <label for="metadata" class="vscode-label">Metadata:</label>
                  <textarea id="metadata" name="metadata" style="width: 100%; height: 100%; box-sizing: border-box;" class="vscode-textarea">${profile && profile.metadata ? profile.metadata : ""}</textarea>
                </div>
              </div>
            </form>
            <script nonce="${nonce}" src="${scriptUri}" />
          </body>
        </html>
        `;
    }
}

function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function getFiltersForType(type: string): { [name: string]: string[] } {
    switch (type) {
        case "cert":
        case "key":
            return { Certificates: ["crt", "pem", "key"] };
        case "pfx":
            return { "PFX Files": ["pfx", "p12"] };
        default:
            return { "All Files": ["*"] };
    }
}

function parseProfile(data: any): Profile {
    const auth: IProfileAuthentication = {
        kind: data.auth.kind as AuthKind,
        username: data.auth.username || "",
        password: data.auth.password || "",
        token: data.auth.token || "undefined",
        cert: data.auth.cert ? vscode.Uri.parse(data.auth.cert) : undefined,
        key: data.auth.key ? vscode.Uri.parse(data.auth.key) : undefined,
        pfx: data.auth.pfx ? vscode.Uri.parse(data.auth.pfx) : undefined,
        passphrase: data.auth.passphrase || "",
    };

    return {
        name: data.name,
        baseUrl: data.baseUrl,
        auth,
        metadata: data.metadata || undefined,
        headers: data.headers,
    };
}
