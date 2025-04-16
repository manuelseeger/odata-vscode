import * as vscode from "vscode";
import * as path from "path";

import { Disposable } from "./provider";
import { APP_NAME, commands, getConfig, globalStates, internalCommands } from "./configuration";
import { Profile, IProfileAuthentication, AuthKind } from "./contracts/types";

const profileCommands = {
    deleteProfile: `${APP_NAME}.deleteProfile`,
    editProfile: `${APP_NAME}.editProfile`,
    requestMetadata: `${APP_NAME}.requestProfileMetadata`,
};

export class ProfileItem extends vscode.TreeItem {
    constructor(public profile: Profile) {
        super(profile.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = `${APP_NAME}.profile`; // Enables context menu
    }
}

export class ProfileTreeProvider
    extends Disposable
    implements vscode.TreeDataProvider<ProfileItem>
{
    public _id: string = "ProfileTreeProvider";
    private _onDidChangeTreeData: vscode.EventEmitter<ProfileItem | undefined | void> =
        new vscode.EventEmitter<ProfileItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ProfileItem | undefined | void> =
        this._onDidChangeTreeData.event;

    // Add a class-level property to store the webview panel
    private currentWebviewPanel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {
        super();
        this.subscriptions = [
            vscode.window.registerTreeDataProvider(`${APP_NAME}.profiles-view`, this),
            vscode.commands.registerCommand(commands.addProfile, this.openProfileWebview, this),
            vscode.commands.registerCommand(
                profileCommands.editProfile,
                (profileItem: ProfileItem) => {
                    this.openProfileWebview(profileItem.profile);
                },
            ),
            vscode.commands.registerCommand(
                profileCommands.deleteProfile,
                (profileItem: ProfileItem) => {
                    this.deleteProfile(profileItem.profile);
                },
            ),
            vscode.commands.registerCommand(
                profileCommands.requestMetadata,
                async (profileItem: ProfileItem) => {
                    await this.requestProfileMetadata(profileItem.profile);
                },
            ),
        ];
    }

    getTreeItem(element: ProfileItem): vscode.TreeItem {
        const selectedProfile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (selectedProfile && selectedProfile.name === element.profile.name) {
            element.iconPath = new vscode.ThemeIcon("check");
        }

        return element;
    }

    getChildren(): ProfileItem[] {
        const profiles = this.context.globalState.get<Profile[]>(globalStates.profiles, []);
        return profiles.map((profile) => new ProfileItem(profile));
    }
    addProfile(profile: Profile) {
        const profiles = this.context.globalState.get<Profile[]>(globalStates.profiles, []);
        profiles.push(profile);
        this.context.globalState.update(globalStates.profiles, profiles);
        this.refresh();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }

    deleteProfile(profile: Profile) {
        let profiles = this.context.globalState.get<Profile[]>(globalStates.profiles, []);
        profiles = profiles.filter((p) => p.name !== profile.name);
        this.context.globalState.update(globalStates.profiles, profiles);
        this.refresh();
    }

    async requestProfileMetadata(profile: Profile): Promise<string | undefined> {
        const metadata = await vscode.commands.executeCommand<string>(
            internalCommands.requestMetadata,
            profile,
        );
        if (metadata) {
            profile.metadata = metadata;
            this.saveProfile(profile);
            return metadata;
        }
    }

    public openProfileWebview(profile?: Profile) {
        if (!this.currentWebviewPanel) {
            this.currentWebviewPanel = vscode.window.createWebviewPanel(
                "profileManager",
                profile ? `Edit Profile: ${profile.name}` : "Create HTTP Profile",
                vscode.ViewColumn.One,
                { enableScripts: true },
            );
        }

        this.currentWebviewPanel.title = profile
            ? `Edit Profile: ${profile.name}`
            : "Create HTTP Profile";
        this.currentWebviewPanel.webview.html = this._getWebViewContent(
            this.currentWebviewPanel.webview,
            profile,
        );
        this.currentWebviewPanel.reveal(vscode.ViewColumn.One);

        this.currentWebviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === "saveProfile") {
                    const newProfile: Profile = parseProfile(message.data);
                    this.saveProfile(newProfile);
                    this.refresh();
                } else if (message.command === "requestMetadata") {
                    const newProfile = parseProfile(message.data);
                    const metadata = await this.requestProfileMetadata(newProfile);

                    if (metadata) {
                        this.currentWebviewPanel!.webview.postMessage({
                            command: "metadataReceived",
                            data: metadata,
                        });
                    }
                    this.refresh();
                } else if (message.command === "openFileDialog") {
                    const type = message.inputName;
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectFolders: false,
                        canSelectMany: false,
                        filters: getFiltersForType(type),
                    });
                    if (fileUri && fileUri.length > 0) {
                        this.currentWebviewPanel!.webview.postMessage({
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

        // Handle panel disposal
        this.currentWebviewPanel.onDidDispose(() => {
            this.currentWebviewPanel = undefined;
        });
    }

    private saveProfile(newProfile: Profile) {
        let profiles = this.context.globalState.get<Profile[]>(globalStates.profiles, []);
        const index = profiles.findIndex((p) => p.name === newProfile.name);
        if (index >= 0) {
            profiles[index] = newProfile;
        } else {
            profiles.push(newProfile);
        }

        this.context.globalState.update(globalStates.profiles, profiles);

        if (profiles.length === 1) {
            this.context.globalState.update(globalStates.selectedProfile, profiles[0]);
        }
    }

    private _getWebViewContent(webview: vscode.Webview, profile?: Profile): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "assets", "main.js"),
        );

        const styles = [
            "@vscode/codicons/dist/codicon.css",
            "@vscode-elements/elements-lite/components/action-button/action-button.css",
            "@vscode-elements/elements-lite/components/label/label.css",
            "@vscode-elements/elements-lite/components/button/button.css",
            "@vscode-elements/elements-lite/components/textfield/textfield.css",
            "@vscode-elements/elements-lite/components/textarea/textarea.css",
            "@vscode-elements/elements-lite/components/select/select.css",
            "@vscode-elements/elements-lite/components/divider/divider.css",
            "@vscode-elements/elements-lite/components/progress-ring/progress-ring.css",
        ];
        const stylesUriList = styles.map((style) =>
            webview.asWebviewUri(
                vscode.Uri.file(path.join(this.context.extensionPath, "dist", "modules", style)),
            ),
        );
        stylesUriList.push(
            webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, "assets", "style.css"),
            ),
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
                  
                  <label for="baseUrl" class="vscode-label">Service URL</label>
                  <p>Either provide the full URL of your $metadata file or the path where the $metadata file resides.</p>
                  <input type="text" id="baseUrl" name="baseUrl" value="${profile ? profile.baseUrl : ""}" required  class="vscode-textfield full-width"/>
                  <br/>
                  <br/>
                  <hr class="vscode-divider""/>
                  
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
                  <br/>
                  <br/>
                  <hr class="vscode-divider""/>
                  
                    <label for="pfx" class="vscode-label">PFX</label>
                    <div >
                        <input type="text" id="pfx" name="pfx" class="vscode-textfield"  value="${profile && profile.auth.pfx ? profile.auth.pfx.path : ""}"/>
                        <div  class="icon"><i class="codicon codicon-symbol-file"></i></div>
                    </div>
                    <br/><br/>
                    <label for="passphrase" class="vscode-label">Passphrase</label>
                    <input type="password" id="passphrase" name="passphrase" class="vscode-textfield" value="${profile && profile.auth.passphrase ? profile.auth.passphrase : ""}"/>
                  </div>
                  <br/>
                  <br/>
                  <hr class="vscode-divider""/>
                
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
                  
                  <button id="requestMetadataButton" type="button" class="vscode-button" ${getConfig().disableRunner ? "disabled" : ""}>Request Metadata</button>
                  
                  <svg id="progressRing" class="vscode-progress-ring" part="vscode-progress-ring" viewBox="0 0 16 16">
                    <circle
                        class="background"
                        part="background"
                        cx="8px"
                        cy="8px"
                        r="7px"
                    ></circle>
                    <circle
                        class="indicator"
                        part="indicator"
                        cx="8px"
                        cy="8px"
                        r="7px"
                    ></circle>
                  </svg>

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
            return { Certificates: ["crt", "pem", "key"], "All Files": ["*"] };
        case "pfx":
            return { "PFX Files": ["pfx", "p12"], "All Files": ["*"] };
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
        name: data.name.trim(),
        baseUrl: data.baseUrl.trim(),
        auth,
        metadata: data.metadata || undefined,
        headers: data.headers || {},
    };
}
