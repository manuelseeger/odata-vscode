import { randomBytes } from "crypto";
import * as vscode from "vscode";
import { APP_NAME, commands, getConfig, globalStates, internalCommands } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { ITokenizer } from "./contracts/ITokenizer";
import { AuthKind, Profile, ProfileSecrets, StoredProfile } from "./contracts/types";
import { parseEndpoint, parseProfileDraft, parseProfile, publicProfile } from "./profileData";
import { Disposable } from "./provider";
import { requireTrustedWorkspace } from "./security";

export class ProfileItem extends vscode.TreeItem {
    constructor(public profile: StoredProfile) {
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
        private requestMetadata: (
            profile: Profile,
            signal?: AbortSignal,
        ) => Promise<string | undefined>,
        subscribe = true,
    ) {
        super();
        const secure = () => {
            void this.enqueue(() => this.migratePublicStorage())
                .then(() => this.refresh())
                .catch(() => {
                    void vscode.window.showErrorMessage(
                        "Cannot secure stored profiles. Check profile settings.",
                    );
                });
        };
        if (vscode.workspace.isTrusted) {
            secure();
        }
        const trustListener = vscode.workspace.onDidGrantWorkspaceTrust(secure);
        this.subscriptions = subscribe
            ? [
                  this.changes,
                  trustListener,
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
            : [this.changes, trustListener];
    }

    override dispose(): void {
        this.currentWebviewPanel?.dispose();
        super.dispose();
    }

    private storedDraft(value: unknown, index: number): StoredProfile {
        try {
            const safe = publicProfile(parseProfileDraft(value));
            if (
                value &&
                typeof value === "object" &&
                "recovery" in value &&
                value.recovery === true
            ) {
                return { ...safe, recovery: true };
            }
            return safe;
        } catch {
            const data =
                value && typeof value === "object" ? (value as Record<string, unknown>) : {};
            let baseUrl = "";
            if (typeof data.baseUrl === "string") {
                try {
                    parseEndpoint(data.baseUrl);
                    baseUrl = data.baseUrl;
                } catch {}
            }
            return {
                name:
                    typeof data.name === "string" && data.name
                        ? data.name
                        : `Recovered profile ${index + 1}`,
                baseUrl,
                auth: { kind: AuthKind.None },
                headers: {},
                recovery: true,
            };
        }
    }

    private storedDrafts(values: unknown[]): StoredProfile[] {
        const names = new Set(
            values.flatMap((value) => {
                if (
                    value &&
                    typeof value === "object" &&
                    "name" in value &&
                    typeof value.name === "string" &&
                    value.name
                ) {
                    return [value.name];
                }
                return [];
            }),
        );
        return values.map((value, index) => {
            const profile = this.storedDraft(value, index);
            const named =
                value &&
                typeof value === "object" &&
                "name" in value &&
                typeof value.name === "string" &&
                value.name;
            if (profile.recovery && !named) {
                const base = profile.name;
                let suffix = 1;
                while (names.has(profile.name)) {
                    profile.name = `${base} (${suffix++})`;
                }
                names.add(profile.name);
            }
            return profile;
        });
    }

    private async migratePublicStorage(): Promise<StoredProfile[]> {
        requireTrustedWorkspace();
        const raw = this.context.globalState.get<unknown>(globalStates.profiles, []);
        const items: unknown[] = Array.isArray(raw) ? [...raw] : [raw];
        const selected = this.context.globalState.get<unknown>(globalStates.selectedProfile);
        const drafts = this.storedDrafts([...items, ...(selected === undefined ? [] : [selected])]);
        const profiles = drafts.slice(0, items.length);
        const selectedDraft = selected === undefined ? undefined : drafts.at(-1);
        if (selectedDraft && !profiles.some((profile) => profile.name === selectedDraft.name)) {
            items.push(selected);
            profiles.push(selectedDraft);
        }
        const sources: { item: unknown; safe: StoredProfile; overwrite: boolean }[] = [];
        if (selectedDraft) {
            sources.push({ item: selected, safe: selectedDraft, overwrite: false });
        }
        sources.push(
            ...items.map((item, index) => ({ item, safe: profiles[index], overwrite: true })),
        );
        let failed = false;
        for (const { item, safe, overwrite } of sources) {
            try {
                let fields: Partial<ProfileSecrets>;
                try {
                    const draft = parseProfileDraft(item);
                    fields = {};
                    for (const field of ["password", "token", "passphrase"] as const) {
                        if (draft.auth[field] !== undefined) {
                            fields[field] = draft.auth[field];
                        }
                    }
                    if (Object.keys(draft.headers).length) {
                        fields.headers = draft.headers;
                    }
                } catch {
                    fields = { recovery: item };
                }
                if (!Object.keys(fields).length) {
                    continue;
                }
                requireTrustedWorkspace();
                const rawSecret = await this.context.secrets.get(this.secretKey(safe.name));
                const previous: unknown = rawSecret ? JSON.parse(rawSecret) : {};
                if (!previous || typeof previous !== "object" || Array.isArray(previous)) {
                    throw new Error("Invalid stored profile secrets.");
                }
                const next = JSON.stringify(
                    overwrite ? { ...previous, ...fields } : { ...fields, ...previous },
                );
                if (next !== rawSecret) {
                    await this.context.secrets.store(this.secretKey(safe.name), next);
                }
            } catch {
                failed = true;
            }
        }
        if (failed) {
            throw new Error("Cannot secure stored profiles.");
        }
        if (JSON.stringify(raw) !== JSON.stringify(profiles)) {
            await this.context.globalState.update(globalStates.profiles, profiles);
        }
        const nextSelected = profiles.find((profile) => profile.name === selectedDraft?.name);
        if (JSON.stringify(selected) !== JSON.stringify(nextSelected)) {
            await this.context.globalState.update(globalStates.selectedProfile, nextSelected);
        }
        return profiles;
    }

    private profiles(): StoredProfile[] {
        const input = this.context.globalState.get<unknown>(globalStates.profiles, []);
        const items: unknown[] = Array.isArray(input) ? input : [input];
        const selected = this.context.globalState.get<unknown>(globalStates.selectedProfile);
        return this.storedDrafts([...items, ...(selected === undefined ? [] : [selected])]).slice(
            0,
            items.length,
        );
    }

    private selectedPublicProfile(): StoredProfile | undefined {
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

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.writes.then(operation);
        this.writes = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    private secretKey(name: string): string {
        return `${APP_NAME}.profile.secret.${name}`;
    }

    private async loadSecrets(profile: Profile): Promise<Profile & { recoveryData?: unknown }> {
        return this.enqueue(async () => {
            const profiles = await this.migratePublicStorage();
            const current = profiles.find((value) => value.name === profile.name) || profile;
            return this.readSecrets(current);
        });
    }

    private async readSecrets(profile: Profile): Promise<Profile & { recoveryData?: unknown }> {
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
        return {
            ...parseProfileDraft({ ...profile, auth, headers: data.headers }),
            ...(data.recovery !== undefined ? { recoveryData: data.recovery } : {}),
        };
    }

    async saveProfile(input: unknown, previousName?: string): Promise<void> {
        requireTrustedWorkspace();
        await this.enqueue(async () => {
            const profiles = await this.migratePublicStorage();
            const profile = parseProfile(input);
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
        return this.enqueue(async () => {
            const profiles = await this.migratePublicStorage();
            const selected = this.context.globalState.get<Profile>(globalStates.selectedProfile);
            const current = profiles.find((profile) => profile.name === selected?.name);
            if (current?.recovery) {
                throw new Error("Repair this recovered profile before use.");
            }
            return current ? parseProfile(await this.readSecrets(current)) : undefined;
        });
    }

    async setSelectedProfile(profile: Profile): Promise<void> {
        requireTrustedWorkspace();
        await this.enqueue(async () => {
            const profiles = await this.migratePublicStorage();
            const current = profiles.find((p) => p.name === profile.name);
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
                    `Metadata updated successfully for profile ${profile.name}.`,
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
        return this.requestMetadata(profile, signal);
    }

    public async openProfileWebview(input?: Profile): Promise<void> {
        input = input ? publicProfile(parseProfileDraft(input)) : undefined;
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
            post({
                command: "initProfile",
                profile: value
                    ? {
                          ...value,
                          auth: {
                              ...value.auth,
                              cert: value.auth.cert?.toString(),
                              key: value.auth.key?.toString(),
                              pfx: value.auth.pfx?.toString(),
                          },
                      }
                    : undefined,
            });
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
                        panelWrites = panelWrites
                            .catch(() => undefined)
                            .then(async () => {
                                if (!active) {
                                    return;
                                }
                                await this.saveProfile(data.data, profile?.name);
                                profile = parseProfile(data.data);
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
            const secured = await this.migratePublicStorage();
            const profiles = secured.filter((p) => p.name !== profile.name);
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
