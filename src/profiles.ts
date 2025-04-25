import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

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
            vscode.commands.registerCommand(commands.selectProfile, this.selectProfile, this),
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
            // Register internal command for getting selected profile with secrets
            vscode.commands.registerCommand(
                internalCommands.getSelectedProfileWithSecrets,
                async () => {
                    return await this.getSelectedProfile();
                },
            ),
        ];
    }

    /**
     * Returns the TreeItem representation for a given ProfileItem.
     * Adds a check icon if the profile is currently selected.
     */
    getTreeItem(element: ProfileItem): vscode.TreeItem {
        const selectedProfile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (selectedProfile && selectedProfile.name === element.profile.name) {
            element.iconPath = new vscode.ThemeIcon("check");
        }
        return element;
    }

    /**
     * Returns the list of ProfileItems to display in the tree view.
     */
    getChildren(): ProfileItem[] {
        const profiles: Profile[] = this.context.globalState.get<Profile[]>(
            globalStates.profiles,
            [],
        );
        return profiles.map((profile: Profile) => new ProfileItem(profile));
    }

    /**
     * Refreshes the tree view by firing the change event.
     */
    refresh() {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Helper: get the key for secrets storage for a given profile name.
     */
    private getSecretKey(profileName: string): string {
        return `${APP_NAME}.profile.secret.${profileName}`;
    }

    /**
     * Helper: extract secrets from a profile's authentication object.
     */
    private extractSecrets(profile: Profile): Record<string, string | undefined> {
        const { auth } = profile;
        return {
            password: auth.password,
            token: auth.token,
            passphrase: auth.passphrase,
        };
    }

    /**
     * Helper: remove secrets from a profile (for storing in globalState).
     */
    private stripSecrets(profile: Profile): Profile {
        const { auth } = profile;
        return {
            ...profile,
            auth: {
                ...auth,
                password: undefined,
                token: undefined,
                passphrase: undefined,
            },
        };
    }

    /**
     * Helper: save secrets to context.secrets for a profile.
     */
    private async saveSecrets(profile: Profile) {
        const key = this.getSecretKey(profile.name);
        const secrets = this.extractSecrets(profile);
        await this.context.secrets.store(key, JSON.stringify(secrets));
    }

    /**
     * Helper: load secrets from context.secrets and merge into the profile.
     */
    private async loadSecrets(profile: Profile): Promise<Profile> {
        const key = this.getSecretKey(profile.name);
        const secretsRaw = await this.context.secrets.get(key);
        if (!secretsRaw) {
            return profile;
        }
        let secrets: Record<string, string | undefined> = {};
        try {
            secrets = JSON.parse(secretsRaw);
        } catch {}
        return {
            ...profile,
            auth: {
                ...profile.auth,
                ...secrets,
            },
        };
    }

    /**
     * Helper: save profile (non-secrets to globalState, secrets to secrets storage).
     */
    private async saveProfile(newProfile: Profile) {
        let profiles: Profile[] = this.context.globalState.get<Profile[]>(
            globalStates.profiles,
            [],
        );
        const index = profiles.findIndex((p: Profile) => p.name === newProfile.name);
        const profileNoSecrets = this.stripSecrets(newProfile);
        if (index >= 0) {
            profiles[index] = profileNoSecrets;
        } else {
            profiles.push(profileNoSecrets);
        }
        this.context.globalState.update(globalStates.profiles, profiles);
        await this.saveSecrets(newProfile);
        if (profiles.length === 1) {
            this.context.globalState.update(globalStates.selectedProfile, profiles[0]);
        }
    }

    /**
     * Returns the currently selected profile with secrets loaded, or undefined if none is selected.
     */
    async getSelectedProfile(): Promise<Profile | undefined> {
        const selected = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (!selected) {
            return undefined;
        }
        return this.loadSecrets(selected);
    }

    /**
     * Sets the selected profile in globalState (without secrets).
     */
    setSelectedProfile(profile: Profile) {
        this.context.globalState.update(globalStates.selectedProfile, this.stripSecrets(profile));
    }

    /**
     * Prompt the user to select a profile from the list of profiles.
     */
    async selectProfile() {
        const profiles: Profile[] = this.context.globalState.get<Profile[]>(
            globalStates.profiles,
            [],
        );
        if (profiles.length === 0) {
            return;
        }
        const profileName = await vscode.window.showQuickPick(
            profiles.map((p: Profile) => p.name),
            {
                placeHolder: "Select an endpoint",
            },
        );
        if (!profileName) {
            return;
        }
        const profile = profiles.find((p: Profile) => p.name === profileName);
        if (profile) {
            this.setSelectedProfile(profile);
            this.refresh();
        }
    }

    /**
     * Get the metadata for the selected profile and update the profile.
     * If no profile is selected, prompt the user to select one.
     * If no profile is found, show an error message.
     */
    async getEndpointMetadata() {
        let selected = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (!selected) {
            await vscode.commands.executeCommand<string>(commands.selectProfile);
            selected = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        }
        if (!selected) {
            vscode.window.showErrorMessage("No profile selected or found.");
            return;
        }
        const profile = await this.loadSecrets(selected);
        const metadata = await this.requestProfileMetadata(profile);
        if (!metadata) {
            vscode.window.showErrorMessage("No metadata found for the selected profile.");
            return;
        }
        profile.metadata = metadata;
        await this.saveProfile(profile);
        this.setSelectedProfile(profile);
        vscode.window.showInformationMessage(
            `Metadata updated successfully for profile ${profile.name}.`,
        );
        this.sendMetadataToWebview(metadata);
        this.refresh();
    }

    /**
     * Requests metadata for the given profile and saves it if found.
     * Returns the metadata string if successful.
     */
    async requestProfileMetadata(profile: Profile): Promise<string | undefined> {
        const fullProfile = await this.loadSecrets(profile);
        const metadata = await vscode.commands.executeCommand<string>(
            internalCommands.requestMetadata,
            fullProfile,
        );
        if (metadata) {
            fullProfile.metadata = metadata;
            await this.saveProfile(fullProfile);
            return metadata;
        }
    }

    /**
     * Loads and returns the HTML content for the profile webview panel.
     */
    private async _getWebViewContent(webview: vscode.Webview, profile?: Profile): Promise<string> {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "main.js"),
        );
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "webview.bundle.css"),
        );
        const htmlPath = path.join(
            this.context.extensionPath,
            "src",
            "webview",
            "profileForm.html",
        );
        let html = fs.readFileSync(htmlPath, "utf8");

        html = html.replace(
            '<link id="vscode-stylesheet" rel="stylesheet" />',
            `<link href="${stylesUri}" rel="stylesheet" />`,
        );
        html = html.replace(
            '<script id="vscode-script"></script>',
            `<script src="${scriptUri}"></script>`,
        );
        // Set CSP source
        html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
        return html;
    }

    /**
     * Opens the profile webview panel for creating or editing a profile.
     * Handles webview messages for saving, requesting metadata, and file dialogs.
     */
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
        await this.sendProfileToWebview(profile ? await this.loadSecrets(profile) : undefined);
        this.currentWebviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === "saveProfile") {
                    const newProfile: Profile = parseProfile(message.data);
                    await this.saveProfile(newProfile);
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
                } else if (message.command === "webviewLoaded") {
                    await this.sendProfileToWebview(
                        profile ? await this.loadSecrets(profile) : undefined,
                    );
                }
            },
            undefined,
            this.context.subscriptions,
        );
        this.currentWebviewPanel.onDidDispose(() => {
            this.currentWebviewPanel = undefined;
        });
    }

    /**
     * Send profile data (including token/model info) to the webview panel.
     */
    private async sendProfileToWebview(profile?: Profile) {
        if (!this.currentWebviewPanel) {
            return;
        }
        let tokenCount, filteredCount, limits, metadata;
        if (profile && profile.metadata) {
            const payload = await this.buildMetadataPayload(profile.metadata);
            tokenCount = payload.tokenCount;
            filteredCount = payload.filteredCount;
            limits = payload.limits;
            metadata = profile.metadata;
        }
        this.currentWebviewPanel.webview.postMessage({
            command: "initProfile",
            profile,
            tokenCount,
            filteredCount,
            limits,
            metadata,
        });
    }

    /**
     * Builds a metadata payload with token counts and model limits for the webview.
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

    /**
     * Send metadata payload to the webview panel.
     */
    private async sendMetadataToWebview(metadata: string) {
        if (!this.currentWebviewPanel) {
            return;
        }
        const payload = await this.buildMetadataPayload(metadata);
        this.currentWebviewPanel.webview.postMessage({ command: "metadataReceived", ...payload });
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
     * Deletes a profile and its secrets from storage.
     * Updates the selected profile if necessary.
     */
    async deleteProfile(profile: Profile) {
        let profiles: Profile[] = this.context.globalState.get<Profile[]>(
            globalStates.profiles,
            [],
        );
        profiles = profiles.filter((p: Profile) => p.name !== profile.name);
        if (profiles.length === 0) {
            this.context.globalState.update(globalStates.selectedProfile, undefined);
        } else if (
            this.context.globalState.get<Profile>(globalStates.selectedProfile)?.name ===
            profile.name
        ) {
            this.context.globalState.update(globalStates.selectedProfile, profiles[0]);
        }
        this.context.globalState.update(globalStates.profiles, profiles);
        // Remove secrets from context.secrets
        const key = this.getSecretKey(profile.name);
        await this.context.secrets.delete(key);
        this.refresh();
    }
}

/**
 * Returns file dialog filters for a given input type (cert, key, pfx, etc).
 */
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

/**
 * Parses raw profile data from the webview into a Profile object.
 */
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
