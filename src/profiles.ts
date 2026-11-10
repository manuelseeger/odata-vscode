import { randomBytes } from "crypto";
import * as vscode from "vscode";
import { APP_NAME, commands, getConfig, globalStates, internalCommands } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { ITokenizer } from "./contracts/ITokenizer";
import { Profile, ProfileSecrets, PublicProfile } from "./contracts/types";
import { parseHeaders, parseProfile, publicProfile } from "./profileData";
import { Disposable } from "./provider";
import { requireTrustedWorkspace } from "./security";

export class ProfileItem extends vscode.TreeItem {
    constructor(public profile: Profile) {
        super(profile.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = `${APP_NAME}.profile`;
    }
}

export class ProfileTreeProvider
    extends Disposable
    implements vscode.TreeDataProvider<ProfileItem>
{
    public _id = "ProfileTreeProvider";
    private changes = new vscode.EventEmitter<ProfileItem | undefined | void>();
    readonly onDidChangeTreeData = this.changes.event;
    private currentWebviewPanel?: vscode.WebviewPanel;
    private writes: Promise<void> = Promise.resolve();

    constructor(
        private tokenizer: ITokenizer,
        private metadataService: IMetadataModelService,
        private context: vscode.ExtensionContext,
        subscribe = true,
    ) {
        super();
        if (vscode.workspace.isTrusted) {
            void this.enqueue(() => this.migratePublicStorage()).catch(() => {
                void vscode.window.showErrorMessage(
                    "Cannot secure stored profiles. Check profile settings.",
                );
            });
        }
        this.subscriptions = subscribe
            ? [
                  this.changes,
                  vscode.window.registerTreeDataProvider(`${APP_NAME}.profiles-view`, this),
                  vscode.commands.registerCommand(commands.addProfile, () =>
                      this.openProfileWebview(),
                  ),
                  vscode.commands.registerCommand(commands.getMetadata, () =>
                      this.getEndpointMetadata(),
                  ),
                  vscode.commands.registerCommand(commands.selectProfile, () =>
                      this.selectProfile(),
                  ),
                  vscode.commands.registerCommand(`${APP_NAME}.editProfile`, (item: ProfileItem) =>
                      this.openProfileWebview(item.profile),
                  ),
                  vscode.commands.registerCommand(
                      `${APP_NAME}.deleteProfile`,
                      (item: ProfileItem) => this.deleteProfile(item.profile),
                  ),
                  vscode.commands.registerCommand(internalCommands.getSelectedProfile, () =>
                      this.selectedPublicProfile(),
                  ),
              ]
            : [this.changes];
    }

    override dispose(): void {
        this.currentWebviewPanel?.dispose();
        super.dispose();
    }

    private async migratePublicStorage(): Promise<void> {
        requireTrustedWorkspace();
        const raw = this.context.globalState.get<unknown>(globalStates.profiles, []);
        if (!Array.isArray(raw)) {
            return;
        }
        const profiles: Profile[] = [];
        for (const item of raw) {
            const profile = parseProfile(item);
            const { password, token, passphrase } = profile.auth;
            if (password || token || passphrase || Object.keys(profile.headers).length) {
                requireTrustedWorkspace();
                const stored = await this.context.secrets.get(this.secretKey(profile.name));
                let previous: Record<string, unknown> = {};
                if (stored) {
                    const data: unknown = JSON.parse(stored);
                    if (data && typeof data === "object" && !Array.isArray(data)) {
                        const record = data as Record<string, unknown>;
                        previous = {
                            password: record.password,
                            token: record.token,
                            passphrase: record.passphrase,
                            headers: record.headers,
                        };
                    }
                }
                await this.context.secrets.store(
                    this.secretKey(profile.name),
                    JSON.stringify({
                        ...previous,
                        ...(password ? { password } : {}),
                        ...(token ? { token } : {}),
                        ...(passphrase ? { passphrase } : {}),
                        ...(Object.keys(profile.headers).length
                            ? { headers: profile.headers }
                            : {}),
                    }),
                );
            }
            profiles.push(publicProfile(profile));
        }
        await this.context.globalState.update(globalStates.profiles, profiles);
        const selected = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        await this.context.globalState.update(
            globalStates.selectedProfile,
            profiles.find((p) => p.name === selected?.name),
        );
    }

    private profiles(): PublicProfile[] {
        const input = this.context.globalState.get<unknown>(globalStates.profiles, []);
        if (!Array.isArray(input)) {
            return [];
        }
        return input.flatMap((value) => {
            try {
                return [publicProfile(parseProfile(value))];
            } catch {
                return [];
            }
        });
    }

    private selectedPublicProfile(): PublicProfile | undefined {
        const selected = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        return this.profiles().find((profile) => profile.name === selected?.name);
    }

    getTreeItem(item: ProfileItem): vscode.TreeItem {
        item.iconPath =
            this.selectedPublicProfile()?.name === item.profile.name
                ? new vscode.ThemeIcon("check")
                : undefined;
        return item;
    }

    getChildren(): ProfileItem[] {
        return this.profiles().map((profile) => new ProfileItem(profile));
    }

    refresh(): void {
        this.changes.fire();
    }

    private enqueue(operation: () => Promise<void>): Promise<void> {
        const result = this.writes.then(operation);
        this.writes = result.catch(() => undefined);
        return result;
    }

    private secretKey(name: string): string {
        return `${APP_NAME}.profile.secret.${name}`;
    }

    private async loadSecrets(profile: Profile): Promise<Profile> {
        requireTrustedWorkspace();
        const raw = await this.context.secrets.get(this.secretKey(profile.name));
        if (!raw) {
            return profile;
        }
        let secret: unknown;
        try {
            secret = JSON.parse(raw);
        } catch {
            throw new Error("Invalid stored profile secrets.");
        }
        if (!secret || typeof secret !== "object" || Array.isArray(secret)) {
            throw new Error("Invalid stored profile secrets.");
        }
        const data = secret as Record<string, unknown>;
        const auth = { ...profile.auth };
        for (const field of ["password", "token", "passphrase"] as const) {
            if (data[field] !== undefined) {
                if (typeof data[field] !== "string") {
                    throw new Error("Invalid stored authentication field.");
                }
                auth[field] = data[field];
            }
        }
        return parseProfile({ ...profile, auth, headers: parseHeaders(data.headers) });
    }

    async saveProfile(input: unknown, previousName?: string): Promise<void> {
        requireTrustedWorkspace();
        const profile = parseProfile(input);
        await this.enqueue(async () => {
            requireTrustedWorkspace();
            const profiles = this.profiles();
            if (
                previousName &&
                previousName !== profile.name &&
                profiles.some((p) => p.name === profile.name)
            ) {
                throw new Error("A profile with that name already exists.");
            }
            const oldName = previousName || profile.name;
            const index = profiles.findIndex((p) => p.name === oldName);
            const safe = publicProfile(profile);
            const secret: ProfileSecrets = {
                password: profile.auth.password,
                token: profile.auth.token,
                passphrase: profile.auth.passphrase,
                headers: profile.headers,
            };
            await this.context.secrets.store(this.secretKey(profile.name), JSON.stringify(secret));
            if (index < 0) {
                profiles.push(safe);
            } else {
                profiles[index] = safe;
            }
            await this.context.globalState.update(globalStates.profiles, profiles);
            const selected = this.context.globalState.get<Profile>(globalStates.selectedProfile);
            if (!selected || selected.name === oldName) {
                await this.context.globalState.update(globalStates.selectedProfile, safe);
            }
            if (oldName !== profile.name) {
                await this.context.secrets.delete(this.secretKey(oldName));
            }
            this.refresh();
        });
    }

    async getSelectedProfile(): Promise<Profile | undefined> {
        requireTrustedWorkspace();
        await this.writes;
        const selected = this.selectedPublicProfile();
        return selected ? this.loadSecrets(selected) : undefined;
    }

    async setSelectedProfile(profile: Profile): Promise<void> {
        await this.enqueue(async () => {
            const current = this.profiles().find((p) => p.name === profile.name);
            await this.context.globalState.update(globalStates.selectedProfile, current);
            this.refresh();
        });
    }

    async selectProfile(): Promise<void> {
        const profiles = this.profiles();
        const name = await vscode.window.showQuickPick(
            profiles.map((p) => p.name),
            { placeHolder: "Select an endpoint" },
        );
        const profile = profiles.find((p) => p.name === name);
        if (profile) {
            await this.setSelectedProfile(profile);
        }
    }

    async getEndpointMetadata(): Promise<void> {
        try {
            requireTrustedWorkspace();
            if (!this.selectedPublicProfile()) {
                await this.selectProfile();
            }
            const profile = await this.getSelectedProfile();
            if (!profile) {
                return;
            }
            const metadata = await this.requestProfileMetadata(profile);
            if (metadata) {
                await this.saveProfile({ ...profile, metadata });
                void vscode.window.showInformationMessage(
                    `Metadata updated for profile ${profile.name}.`,
                );
            }
        } catch {
            void vscode.window.showErrorMessage(
                "Cannot get metadata. Check workspace trust and profile settings.",
            );
        }
    }

    async requestProfileMetadata(
        input: Profile,
        signal?: AbortSignal,
    ): Promise<string | undefined> {
        requireTrustedWorkspace();
        const profile = parseProfile(input);
        return vscode.commands.executeCommand<string>(
            internalCommands.requestMetadata,
            profile,
            signal,
        );
    }

    public async openProfileWebview(input?: Profile): Promise<void> {
        input = input ? publicProfile(parseProfile(input)) : undefined;
        this.currentWebviewPanel?.dispose();
        const panel = vscode.window.createWebviewPanel(
            "profileManager",
            input ? `Edit Profile: ${input.name}` : "Create HTTP Profile",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview"),
                ],
            },
        );
        this.currentWebviewPanel = panel;
        let active = true;
        let revision = 0;
        let profile = input;
        const controller = new AbortController();
        const events: vscode.Disposable[] = [];
        const post = (message: unknown) => {
            if (active) {
                void panel.webview.postMessage(message);
            }
        };
        let panelWrites: Promise<void> = Promise.resolve();
        const sendProfile = async () => {
            const value =
                profile && vscode.workspace.isTrusted ? await this.loadSecrets(profile) : profile;
            post({ command: "initProfile", profile: value });
            if (value?.metadata) {
                const payload = await this.buildMetadataPayload(value.metadata);
                post({ command: "metadataStats", ...payload });
            }
        };
        events.push(
            panel.onDidDispose(() => {
                active = false;
                controller.abort();
                events.forEach((event) => event.dispose());
                if (this.currentWebviewPanel === panel) {
                    this.currentWebviewPanel = undefined;
                }
            }),
        );
        events.push(
            panel.webview.onDidReceiveMessage(async (message: unknown) => {
                if (!active || !message || typeof message !== "object" || Array.isArray(message)) {
                    return;
                }
                const data = message as Record<string, unknown>;
                const current = ++revision;
                try {
                    if (data.command === "webviewLoaded") {
                        await sendProfile();
                    } else if (data.command === "saveProfile") {
                        requireTrustedWorkspace();
                        const next = parseProfile(data.data);
                        panelWrites = panelWrites
                            .catch(() => undefined)
                            .then(async () => {
                                if (!active) {
                                    return;
                                }
                                await this.saveProfile(next, profile?.name);
                                profile = next;
                            });
                        await panelWrites;
                    } else if (data.command === "requestMetadata") {
                        requireTrustedWorkspace();
                        const next = parseProfile(data.data);
                        const metadata = await this.requestProfileMetadata(next, controller.signal);
                        if (active && current === revision && metadata) {
                            await panelWrites;
                            if (active && current === revision) {
                                await this.saveProfile({ ...next, metadata }, profile?.name);
                                profile = { ...next, metadata };
                                post({ command: "metadataReceived", data: metadata });
                                const payload = await this.buildMetadataPayload(metadata);
                                if (active && current === revision) {
                                    post({ command: "metadataStats", ...payload });
                                }
                            }
                        } else {
                            post({ command: "requestFinished" });
                        }
                    } else if (
                        data.command === "openFileDialog" &&
                        typeof data.inputName === "string" &&
                        ["cert", "key", "pfx"].includes(data.inputName)
                    ) {
                        requireTrustedWorkspace();
                        const files = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                        });
                        if (active && files?.[0]?.scheme === "file") {
                            post({
                                command: "fileSelected",
                                inputName: data.inputName,
                                filePath: files[0].toString(),
                            });
                        }
                    }
                } catch {
                    post({ command: "requestFinished" });
                    if (active) {
                        void vscode.window.showErrorMessage(
                            "Cannot update profile. Check workspace trust and profile fields.",
                        );
                    }
                }
            }),
        );
        const htmlUri = vscode.Uri.joinPath(
            this.context.extensionUri,
            "dist",
            "webview",
            "profileForm.html",
        );
        const html = Buffer.from(await vscode.workspace.fs.readFile(htmlUri)).toString("utf8");
        if (!active) {
            return;
        }
        const nonce = randomBytes(24).toString("base64");
        panel.webview.html = html
            .replace(
                /\{\{styleUri\}\}/g,
                panel.webview
                    .asWebviewUri(
                        vscode.Uri.joinPath(
                            this.context.extensionUri,
                            "dist",
                            "webview",
                            "webview.bundle.css",
                        ),
                    )
                    .toString(),
            )
            .replace(
                /\{\{scriptUri\}\}/g,
                panel.webview
                    .asWebviewUri(
                        vscode.Uri.joinPath(
                            this.context.extensionUri,
                            "dist",
                            "webview",
                            "main.js",
                        ),
                    )
                    .toString(),
            )
            .replace(/\{\{cspSource\}\}/g, panel.webview.cspSource)
            .replace(/\{\{nonce\}\}/g, nonce);
    }

    private async buildMetadataPayload(metadata: string) {
        const tokenCount = this.tokenizer.approximateTokenCount(metadata);
        let filteredCount = tokenCount;
        try {
            filteredCount = this.tokenizer.approximateTokenCount(
                this.metadataService.getFilteredMetadataXml(metadata, getConfig()),
            );
        } catch {}
        let limits: { name: string; maxTokens: number }[] = [];
        if (vscode.workspace.isTrusted) {
            try {
                limits = (await vscode.lm.selectChatModels()).map((model) => ({
                    name: model.name,
                    maxTokens: model.maxInputTokens,
                }));
            } catch {}
        }
        return { data: metadata, tokenCount, filteredCount, limits };
    }

    async deleteProfile(profile: Profile): Promise<void> {
        requireTrustedWorkspace();
        await this.enqueue(async () => {
            requireTrustedWorkspace();
            const profiles = this.profiles().filter((p) => p.name !== profile.name);
            await this.context.secrets.delete(this.secretKey(profile.name));
            await this.context.globalState.update(globalStates.profiles, profiles);
            if (
                this.context.globalState.get<Profile>(globalStates.selectedProfile)?.name ===
                profile.name
            ) {
                await this.context.globalState.update(globalStates.selectedProfile, profiles[0]);
            }
            this.refresh();
        });
    }
}
