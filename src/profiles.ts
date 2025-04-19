import * as vscode from "vscode";
import * as path from "path";

import { Disposable } from "./provider";
import { APP_NAME, commands, getConfig, globalStates, internalCommands } from "./configuration";
import { Profile, IProfileAuthentication, AuthKind } from "./contracts/types";
import { ITokenizer } from "./contracts/ITokenizer";
import { IMetadataModelService } from "./contracts/IMetadataModelService";

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

    constructor(
        private tokenizer: ITokenizer,
        private metadataService: IMetadataModelService,
        private context: vscode.ExtensionContext,
    ) {
        super();
        this.subscriptions = [
            vscode.window.registerTreeDataProvider(`${APP_NAME}.profiles-view`, this),
            vscode.commands.registerCommand(commands.addProfile, this.openProfileWebview, this),
            vscode.commands.registerCommand(commands.getMetadata, this.getEndpointMetadata, this),
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
        if (profiles.length === 0) {
            this.context.globalState.update(globalStates.selectedProfile, undefined);
        } else if (
            this.context.globalState.get<Profile>(globalStates.selectedProfile)?.name ===
            profile.name
        ) {
            this.context.globalState.update(globalStates.selectedProfile, profiles[0]);
        }
        this.context.globalState.update(globalStates.profiles, profiles);
        this.refresh();
    }

    /**
     * Get the metadata for the selected profile and update the profile.
     *
     * If no profile is selected, prompt the user to select one.
     * If no profile is found, return an empty string.
     */
    async getEndpointMetadata() {
        let profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (!profile) {
            await vscode.commands.executeCommand<string>(commands.selectProfile);
            profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        }
        if (!profile) {
            vscode.window.showErrorMessage("No profile selected or found.");
            return;
        }

        const metadata = await this.requestProfileMetadata(profile);
        if (!metadata) {
            vscode.window.showErrorMessage("No metadata found for the selected profile.");
            return;
        }
        profile.metadata = metadata;

        this.saveProfile(profile);
        this.context.globalState.update(globalStates.selectedProfile, profile);
        vscode.window.showInformationMessage(
            `Metadata updated successfully for profile ${profile.name}.`,
        );
        this.sendMetadataToWebview(metadata);
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

    public async openProfileWebview(profile?: Profile) {
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
        this.currentWebviewPanel.webview.html = await this._getWebViewContent(
            this.currentWebviewPanel.webview,
            profile,
        );
        this.currentWebviewPanel.reveal(vscode.ViewColumn.One);

        this.currentWebviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === "saveProfile") {
                    const newProfile: Profile = parseProfile(message.data);
                    this.saveProfile(newProfile);
                    // Update token counts and model info after saving (e.g., metadata edit)
                    if (newProfile.metadata) {
                        await this.sendMetadataToWebview(newProfile.metadata);
                    }
                    this.refresh();
                } else if (message.command === "requestMetadata") {
                    const newProfile = parseProfile(message.data);
                    const metadata = await this.requestProfileMetadata(newProfile);

                    if (metadata) {
                        await this.sendMetadataToWebview(metadata);
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
        // If editing an existing profile with metadata, send model info on load
        if (profile && profile.metadata) {
            this.sendMetadataToWebview(profile.metadata);
        }
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

    private async _getWebViewContent(webview: vscode.Webview, profile?: Profile): Promise<string> {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "assets", "main.js"),
        );
        const nonce = getNonce();

        // Initialize the profile page with token counts and model limits
        let initialMessageScript = "";
        if (profile && profile.metadata) {
            const payload = await this.buildMetadataPayload(profile.metadata);
            initialMessageScript =
                `<script nonce="${nonce}">` +
                `window.dispatchEvent(new MessageEvent('message',{data:{` +
                `command:'metadataReceived',` +
                `data:${JSON.stringify(payload.data)},` +
                `tokenCount:${payload.tokenCount},` +
                `filteredCount:${payload.filteredCount},` +
                `limits:${JSON.stringify(payload.limits)}` +
                `}}));</script>`;
        }
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
            "@vscode-elements/elements-lite/components/collapsible/collapsible.css",
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

        return `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">            
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${profile ? "Edit Profile" : "Create Profile"}</title>
            <meta charset="UTF-8">
            ${linkTags}
          </head>
          <body>
            <h1>${profile ? "Edit Profile" : "Create Profile"}</h1>
            <form id="profileForm">
              <div class="profile-form-row">
                <div class="profile-form-column">
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

                  <div id="basicFields" class="hidden">
                    <label for="username" class="vscode-label">Username</label>
                    <input type="text" id="username" name="username" class="vscode-textfield" value="${profile && profile.auth.username ? profile.auth.username : ""}"/><br/><br/>
                    <label for="password" class="vscode-label">Password</label>
                    <input type="password" id="password" name="password" class="vscode-textfield" value="${profile && profile.auth.password ? profile.auth.password : ""}"/><br/><br/>
                  </div>
                  <div id="bearerFields" class="hidden">
                    <label for="token" class="vscode-label">Token</label>
                    <input type="text" id="token" name="token" class="vscode-textfield" value="${profile && profile.auth.token ? profile.auth.token : ""}"/><br/><br/>
                  </div>
                  <div id="clientCertFields" class="hidden">
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
                
                  <div class="headers-header">
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

                </div> <!-- end of left flex: 1 -->
                <!-- Add metadata textarea as second flex column -->
                <div class="profile-form-column">
                  <label for="metadata" class="vscode-label">Metadata:</label>
                  <textarea id="metadata" name="metadata" class="vscode-textarea metadata-textarea">${profile && profile.metadata ? profile.metadata : ""}</textarea>
                </div>
              </div> <!-- end of flex row -->

            </form>
            <br/><br/>
            <hr class="vscode-divider""/>
            
            <label class="vscode-label">Metadata size</label>
            <div id="tokenSummary" class="token-count">
              
              <span class="vscode-label">Tokens:</span>
              <span id="tokenCountInfo" class="token-count-value"></span>
              <span class="vscode-label">Tokens (filtered):</span>
              <span id="filteredCountInfo" class="token-count-value"></span>
            </div>
            <p>Make sure the metadata fits into the Github Copilot input token limit. Use filtering in Settings to reduce size.</p>
            <details id="copilotAdvancedSection" class="vscode-collapsible">
              <summary>
                <i class="codicon codicon-chevron-right icon-arrow"></i>
                <h2 class="title">Github Copilot Models<span class="description">Github Copilot models and max input tokens</span></h2>
              </summary>
              <div>    
                  <div id="modelInfo">No info on Copilot models yet, retry.</div>
              </div>
            </details>
            <script nonce="${nonce}" src="${scriptUri}"></script>
            ${initialMessageScript}
          </body>
        </html>
        `;
    }

    /**
     * Compute raw token counts and filtered token counts for a metadata string.
     */
    private getMetadataCounts(metadata: string) {
        const tokenCount = this.tokenizer.approximateTokenCount(metadata);
        const filteredXml = this.metadataService.getFilteredMetadataXml(metadata, getConfig());
        const filteredCount = this.tokenizer.approximateTokenCount(filteredXml);
        return { tokenCount, filteredCount };
    }

    /**
     * Prepare metadata payload with raw data, token counts, and model limits.
     */
    private async buildMetadataPayload(metadata: string) {
        const { tokenCount, filteredCount } = this.getMetadataCounts(metadata);
        const models = await vscode.lm.selectChatModels();
        const limits = models.map((model) => ({
            name: model.name,
            maxTokens: model.maxInputTokens,
        }));
        return { data: metadata, tokenCount, filteredCount, limits };
    }

    private async sendMetadataToWebview(metadata: string) {
        if (!this.currentWebviewPanel) {
            return;
        }
        const payload = await this.buildMetadataPayload(metadata);
        this.currentWebviewPanel.webview.postMessage({ command: "metadataReceived", ...payload });
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
        metadata: data.metadata.trim() || undefined,
        headers: data.headers || {},
    };
}
