import * as assert from "assert";
import * as vscode from "vscode";
import { globalStates } from "../../configuration";
import { AuthKind, Profile } from "../../contracts/types";
import { ProfileTreeProvider } from "../../profiles";
import { MetadataModelService } from "../../services/MetadataModelService";
import { metadataString } from "./testutil";

suite("Profile storage and panel boundary", () => {
    let provider: ProfileTreeProvider;
    let state: Map<string, unknown>;
    let secrets: Map<string, string>;
    let secretReads: number;
    let secretWrites: number;
    let failingSecret: string | undefined;
    let context: vscode.ExtensionContext;
    const draft = (name = "Test"): Profile => ({
        name,
        baseUrl: "https://example.test/service",
        auth: { kind: AuthKind.Basic, username: "test", password: "password-secret" },
        headers: { "X-Key": "header-secret" },
    });
    const tokenizer = { approximateTokenCount: (value: string) => value.length };

    setup(() => {
        state = new Map();
        secrets = new Map();
        secretReads = 0;
        secretWrites = 0;
        failingSecret = undefined;
        context = {
            extensionUri: vscode.Uri.file(process.cwd()),
            globalState: {
                get: (key: string, fallback?: unknown) => state.get(key) ?? fallback,
                update: async (key: string, value: unknown) => {
                    await Promise.resolve();
                    state.set(key, value);
                },
            },
            secrets: {
                get: async (key: string) => {
                    secretReads++;
                    return secrets.get(key);
                },
                store: async (key: string, value: string) => {
                    secretWrites++;
                    if (key === failingSecret) {
                        throw new Error("SecretStorage unavailable");
                    }
                    await Promise.resolve();
                    secrets.set(key, value);
                },
                delete: async (key: string) => {
                    secrets.delete(key);
                },
            },
        } as unknown as vscode.ExtensionContext;
        provider = new ProfileTreeProvider(
            tokenizer,
            new MetadataModelService(),
            context,
            async () => undefined,
            false,
        );
    });
    teardown(() => provider.dispose());

    test("serializes concurrent saves without losing profiles", async () => {
        await Promise.all([provider.saveProfile(draft("A")), provider.saveProfile(draft("B"))]);
        assert.deepStrictEqual(
            provider.getChildren().map((item) => item.profile.name),
            ["A", "B"],
        );
        const serialized = JSON.stringify([...state.values()]);
        assert.ok(!serialized.includes("password-secret"));
        assert.ok(!serialized.includes("header-secret"));
        assert.ok([...secrets.values()].every((value) => value.includes("header-secret")));
        assert.strictEqual((await provider.getSelectedProfile())?.auth.password, "password-secret");
    });

    test("moves existing header values out of public storage", async () => {
        provider.dispose();
        state.set(globalStates.profiles, [draft()]);
        state.set(globalStates.selectedProfile, draft());
        provider = new ProfileTreeProvider(
            tokenizer,
            new MetadataModelService(),
            context,
            async () => undefined,
            false,
        );
        const selected = await provider.getSelectedProfile();
        assert.strictEqual(selected?.headers["X-Key"], "header-secret");
        assert.strictEqual(selected?.auth.password, "password-secret");
        assert.ok(!JSON.stringify([...state.values()]).includes("secret"));
    });

    test("secures mixed legacy drafts before unrelated saves and deletes", async () => {
        provider.dispose();
        const local = { ...draft("Local"), baseUrl: "http://localhost/service" };
        const cert = {
            ...draft("Cert"),
            auth: {
                kind: AuthKind.ClientCert,
                cert: vscode.Uri.file("/tmp/client.pem"),
                passphrase: "cert-secret",
            },
        };
        const badHeader = { ...draft("Header"), headers: { "Bad Name": "malformed-secret" } };
        const basic = {
            ...draft("Basic"),
            auth: { kind: AuthKind.Basic, username: "user:name", password: "basic-secret" },
        };
        state.set(globalStates.profiles, [
            draft("Prod"),
            local,
            cert,
            badHeader,
            basic,
            draft("Stage"),
        ]);
        state.set(globalStates.selectedProfile, draft("Stage"));
        provider = new ProfileTreeProvider(
            tokenizer,
            new MetadataModelService(),
            context,
            async () => undefined,
            false,
        );
        await provider.saveProfile(draft("New"));
        assert.deepStrictEqual(
            provider.getChildren().map((item) => item.profile.name),
            ["Prod", "Local", "Cert", "Header", "Basic", "Stage", "New"],
        );
        assert.ok(!JSON.stringify([...state.values()]).includes("secret"));
        assert.strictEqual(
            JSON.parse(secrets.get("odata.profile.secret.Local")!).headers["X-Key"],
            "header-secret",
        );
        assert.strictEqual(
            JSON.parse(secrets.get("odata.profile.secret.Header")!).headers["Bad Name"],
            "malformed-secret",
        );
        await provider.deleteProfile(draft("New"));
        assert.strictEqual(provider.getChildren().length, 6);
        assert.strictEqual(
            (await provider.getSelectedProfile())?.headers["X-Key"],
            "header-secret",
        );
        const before = JSON.stringify({ state: [...state], secrets: [...secrets] });
        await provider.getSelectedProfile();
        assert.strictEqual(JSON.stringify({ state: [...state], secrets: [...secrets] }), before);
        await provider.setSelectedProfile(local);
        await assert.rejects(provider.getSelectedProfile(), /HTTPS/);
    });

    test("invalid save input cannot prevent credential migration", async () => {
        await provider.getSelectedProfile();
        const legacy = { ...draft("Legacy"), baseUrl: "http://localhost/" };
        state.set(globalStates.profiles, [draft("Prod"), legacy]);
        state.set(globalStates.selectedProfile, legacy);
        await assert.rejects(provider.saveProfile(legacy), /HTTPS/);
        assert.ok(!JSON.stringify([...state]).includes("secret"));
        assert.deepStrictEqual(
            provider.getChildren().map((item) => item.profile.name),
            ["Prod", "Legacy"],
        );
        assert.strictEqual(
            JSON.parse(secrets.get("odata.profile.secret.Legacy")!).headers["X-Key"],
            "header-secret",
        );
    });

    test("retries failed secret migration before any destructive mutation", async () => {
        await provider.getSelectedProfile();
        const local = { ...draft("Local"), baseUrl: "http://localhost/service" };
        state.set(globalStates.profiles, [draft("Prod"), local, draft("Stage")]);
        state.set(globalStates.selectedProfile, draft("Stage"));
        const before = JSON.stringify([...state]);
        failingSecret = "odata.profile.secret.Local";
        await assert.rejects(provider.saveProfile(draft("New")), /secure/);
        await assert.rejects(provider.deleteProfile(draft("Prod")), /secure/);
        assert.strictEqual(JSON.stringify([...state]), before);
        assert.ok(secrets.get("odata.profile.secret.Stage")?.includes("header-secret"));
        failingSecret = undefined;
        await provider.saveProfile(draft("New"));
        assert.ok(!JSON.stringify([...state]).includes("secret"));
        assert.deepStrictEqual(
            provider.getChildren().map((item) => item.profile.name),
            ["Prod", "Local", "Stage", "New"],
        );
        const writes = secretWrites;
        await provider.getSelectedProfile();
        await provider.getSelectedProfile();
        assert.strictEqual(secretWrites, writes);
        assert.strictEqual(
            (await provider.getSelectedProfile())?.headers["X-Key"],
            "header-secret",
        );
    });

    test("recovers malformed data and orphan selected snapshots without allowing execution", async () => {
        await provider.getSelectedProfile();
        const malformed = {
            ...draft("Malformed"),
            headers: { "X-Key": ["array-secret"] },
            extra: "extra-secret",
        };
        const embedded = {
            ...draft("Embedded"),
            baseUrl: "https:////user:url-secret@example.test/",
        };
        state.set(globalStates.profiles, [draft("Prod"), malformed, embedded]);
        state.set(globalStates.selectedProfile, {
            ...draft("Orphan"),
            baseUrl: "http://localhost/service",
        });
        await provider.saveProfile(draft("New"));
        const children = provider.getChildren();
        assert.deepStrictEqual(
            children.map((item) => item.profile.name),
            ["Prod", "Malformed", "Embedded", "Orphan", "New"],
        );
        assert.ok(!JSON.stringify([...state]).includes("secret"));
        assert.deepStrictEqual(
            JSON.parse(secrets.get("odata.profile.secret.Malformed")!).recovery,
            malformed,
        );
        await assert.rejects(provider.getSelectedProfile(), /HTTPS/);
        await provider.setSelectedProfile(children[1].profile);
        await assert.rejects(provider.getSelectedProfile(), /Repair/);
        await provider.saveProfile(draft("Repaired"), "Malformed");
        assert.ok(!secrets.has("odata.profile.secret.Malformed"));
        assert.strictEqual((await provider.getSelectedProfile())?.name, "Repaired");
        assert.deepStrictEqual(
            JSON.parse(secrets.get("odata.profile.secret.Embedded")!).recovery,
            embedded,
        );
        await provider.deleteProfile(children[3].profile);
        assert.deepStrictEqual(
            provider.getChildren().map((item) => item.profile.name),
            ["Prod", "Repaired", "Embedded", "New"],
        );
    });

    test("recovery names cannot collide with named profiles", async () => {
        await provider.getSelectedProfile();
        const named = draft("Recovered profile 1");
        state.set(globalStates.profiles, [null, named]);
        state.set(globalStates.selectedProfile, named);
        await provider.saveProfile(draft("New"));
        const children = provider.getChildren();
        assert.deepStrictEqual(
            children.map((item) => item.profile.name),
            ["Recovered profile 1 (1)", "Recovered profile 1", "New"],
        );
        assert.strictEqual(
            JSON.parse(secrets.get("odata.profile.secret.Recovered profile 1 (1)")!).recovery,
            null,
        );
        await provider.deleteProfile(children[0].profile);
        assert.strictEqual((await provider.getSelectedProfile())?.auth.password, "password-secret");
        assert.deepStrictEqual(
            provider.getChildren().map((item) => item.profile.name),
            ["Recovered profile 1", "New"],
        );
    });

    test("trust grant secures legacy drafts before the first save", async () => {
        await provider.getSelectedProfile();
        provider.dispose();
        const descriptor = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted")!;
        const originalEvent = vscode.workspace.onDidGrantWorkspaceTrust;
        let trusted = false;
        let grant = () => undefined;
        Object.defineProperty(vscode.workspace, "isTrusted", {
            configurable: true,
            get: () => trusted,
        });
        (
            vscode.workspace as unknown as { onDidGrantWorkspaceTrust: typeof originalEvent }
        ).onDidGrantWorkspaceTrust = ((handler: () => undefined) => {
            grant = handler;
            return new vscode.Disposable(() => undefined);
        }) as typeof originalEvent;
        try {
            state.set(globalStates.profiles, [
                draft("Prod"),
                { ...draft("Local"), baseUrl: "http://localhost/" },
            ]);
            state.set(globalStates.selectedProfile, draft("Prod"));
            provider = new ProfileTreeProvider(
                tokenizer,
                new MetadataModelService(),
                context,
                async () => undefined,
                false,
            );
            assert.strictEqual(secretReads, 0);
            const secured = new Promise<void>((resolve) => {
                const listener = provider.onDidChangeTreeData(() => {
                    listener.dispose();
                    resolve();
                });
            });
            trusted = true;
            grant();
            await secured;
            assert.ok(!JSON.stringify([...state]).includes("secret"));
            await provider.saveProfile(draft("New"));
            await provider.deleteProfile(draft("New"));
            assert.ok(!JSON.stringify([...state]).includes("secret"));
            assert.strictEqual(
                (await provider.getSelectedProfile())?.headers["X-Key"],
                "header-secret",
            );
            assert.strictEqual(
                JSON.parse(secrets.get("odata.profile.secret.Local")!).headers["X-Key"],
                "header-secret",
            );
        } finally {
            Object.defineProperty(vscode.workspace, "isTrusted", descriptor);
            (
                vscode.workspace as unknown as { onDidGrantWorkspaceTrust: typeof originalEvent }
            ).onDidGrantWorkspaceTrust = originalEvent;
        }
    });

    test("first trusted secret load migrates profiles without a trust event", async () => {
        await provider.getSelectedProfile();
        provider.dispose();
        const descriptor = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted")!;
        let trusted = false;
        Object.defineProperty(vscode.workspace, "isTrusted", {
            configurable: true,
            get: () => trusted,
        });
        try {
            state.set(globalStates.profiles, [
                draft("Prod"),
                { ...draft("Local"), baseUrl: "http://localhost/" },
            ]);
            state.set(globalStates.selectedProfile, draft("Prod"));
            provider = new ProfileTreeProvider(
                tokenizer,
                new MetadataModelService(),
                context,
                async () => undefined,
                false,
            );
            await assert.rejects(provider.getSelectedProfile(), /Trust/);
            assert.strictEqual(secretReads, 0);
            trusted = true;
            assert.strictEqual(
                (await provider.getSelectedProfile())?.headers["X-Key"],
                "header-secret",
            );
            assert.ok(!JSON.stringify([...state]).includes("secret"));
        } finally {
            Object.defineProperty(vscode.workspace, "isTrusted", descriptor);
        }
    });

    test("stale selected snapshots cannot overwrite canonical secrets or settings", async () => {
        await provider.saveProfile({ ...draft(), metadata: "current metadata" });
        state.set(globalStates.selectedProfile, {
            ...draft(),
            baseUrl: "https://stale.test/",
            metadata: "stale metadata",
            auth: { kind: AuthKind.Basic, username: "stale", password: "stale-secret" },
            headers: { "X-Key": "stale-header-secret" },
        });
        const current = await provider.getSelectedProfile();
        assert.strictEqual(current?.auth.password, "password-secret");
        assert.strictEqual(current?.headers["X-Key"], "header-secret");
        assert.strictEqual(current?.baseUrl, draft().baseUrl);
        assert.strictEqual(current?.metadata, "current metadata");
        assert.ok(!JSON.stringify([...state]).includes("secret"));
    });

    test("stored metadata credentials bypass the global command bus", async () => {
        await provider.getSelectedProfile();
        provider.dispose();
        let intercepted = 0;
        let received: Profile | undefined;
        const interceptor = vscode.commands.registerCommand("odata.requestMetadata", () => {
            intercepted++;
        });
        provider = new ProfileTreeProvider(
            tokenizer,
            new MetadataModelService(),
            context,
            async (profile) => {
                received = profile;
                return "<metadata/>";
            },
            false,
        );
        try {
            await provider.saveProfile(draft());
            await provider.getEndpointMetadata();
            assert.strictEqual(received?.auth.password, "password-secret");
            assert.strictEqual(received?.headers["X-Key"], "header-secret");
            assert.strictEqual(intercepted, 0);
        } finally {
            interceptor.dispose();
        }
    });

    test("updates the selected profile snapshot after edits and rename", async () => {
        await provider.saveProfile(draft());
        await provider.saveProfile({ ...draft(), baseUrl: "https://example.test/edited" });
        assert.strictEqual(
            (await provider.getSelectedProfile())?.baseUrl,
            "https://example.test/edited",
        );
        await provider.saveProfile(draft("Renamed"), "Test");
        assert.strictEqual((await provider.getSelectedProfile())?.name, "Renamed");
        assert.deepStrictEqual(
            provider.getChildren().map((item) => item.profile.name),
            ["Renamed"],
        );
        assert.ok(!secrets.has("odata.profile.secret.Test"));
        await provider.deleteProfile(draft("Renamed"));
        assert.strictEqual(await provider.getSelectedProfile(), undefined);
        assert.strictEqual(secrets.size, 0);
    });

    test("rejects unknown input before storage effects", async () => {
        await assert.rejects(provider.saveProfile({ name: "bad", headers: { test: ["x"] } }));
        assert.strictEqual(secrets.size, 0);
        assert.deepStrictEqual(provider.getChildren(), []);
    });

    test("secret storage cannot replace current metadata or endpoint", async () => {
        await provider.saveProfile(draft());
        secrets.set(
            "odata.profile.secret.Test",
            JSON.stringify({
                password: "safe",
                headers: {},
                metadata: "stale",
                baseUrl: "https://other.test/",
                kind: "none",
            }),
        );
        await provider.saveProfile({ ...draft(), metadata: "edited" });
        const stored = JSON.parse(secrets.get("odata.profile.secret.Test")!);
        secrets.set(
            "odata.profile.secret.Test",
            JSON.stringify({ ...stored, metadata: "stale", baseUrl: "https://other.test/" }),
        );
        const selected = await provider.getSelectedProfile();
        assert.strictEqual(selected?.metadata, "edited");
        assert.strictEqual(selected?.baseUrl, "https://example.test/service");
    });

    test("restricted mode permits public inspection without secret reads", async () => {
        await provider.saveProfile(draft());
        const descriptor = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted")!;
        Object.defineProperty(vscode.workspace, "isTrusted", {
            configurable: true,
            get: () => false,
        });
        try {
            const before = secretReads;
            assert.strictEqual(provider.getChildren().length, 1);
            await assert.rejects(provider.getSelectedProfile(), /Trust/);
            await assert.rejects(provider.saveProfile(draft()), /Trust/);
            assert.strictEqual(secretReads, before);
        } finally {
            Object.defineProperty(vscode.workspace, "isTrusted", descriptor);
        }
    });

    test("panel ignores unknown messages, survives model failure, and cancels on dispose", async () => {
        const originalCreate = vscode.window.createWebviewPanel;
        const originalModels = vscode.lm.selectChatModels;
        let panel: vscode.WebviewPanel;
        let receive: (message: unknown) => Promise<void> = async () => undefined;
        let onDispose = () => undefined;
        let listenerCount = 0;
        let disposedListeners = 0;
        const posted: unknown[] = [];
        let modelCalls = 0;
        let requestSignal: AbortSignal | undefined;
        let finish: ((value: string) => void) | undefined;
        (vscode.lm as unknown as { selectChatModels: typeof originalModels }).selectChatModels =
            async () => {
                modelCalls++;
                throw new Error("No model provider");
            };
        (
            vscode.window as unknown as { createWebviewPanel: typeof originalCreate }
        ).createWebviewPanel = ((
            _type: string,
            _title: string,
            _column: vscode.ViewColumn,
            options: vscode.WebviewPanelOptions & vscode.WebviewOptions,
        ) => {
            assert.deepStrictEqual(
                options.localResourceRoots?.map((uri) => uri.path),
                [vscode.Uri.joinPath(context.extensionUri, "dist", "webview").path],
            );
            panel = {
                webview: {
                    cspSource: "test-source",
                    html: "",
                    asWebviewUri: (uri: vscode.Uri) => uri,
                    onDidReceiveMessage: (handler: typeof receive) => {
                        listenerCount++;
                        receive = handler;
                        return { dispose: () => disposedListeners++ };
                    },
                    postMessage: async (message: unknown) => {
                        posted.push(message);
                        return true;
                    },
                },
                onDidDispose: (handler: () => undefined) => {
                    onDispose = handler;
                    return { dispose: () => undefined };
                },
                dispose: () => onDispose(),
            } as unknown as vscode.WebviewPanel;
            return panel;
        }) as typeof originalCreate;
        try {
            await provider.openProfileWebview();
            assert.strictEqual(listenerCount, 1);
            await receive({ command: "unknown", data: draft() });
            await receive({ command: "openFileDialog", inputName: "metadata" });
            assert.strictEqual(secrets.size, 0);
            await receive({
                command: "saveProfile",
                data: { ...draft(), metadata: metadataString },
            });
            await receive({ command: "webviewLoaded" });
            assert.ok(
                posted.some(
                    (message) => (message as { command: string }).command === "initProfile",
                ),
            );
            assert.strictEqual(modelCalls, 1);
            provider.requestProfileMetadata = async (_profile, signal) => {
                requestSignal = signal;
                return new Promise<string>((resolve) => {
                    finish = resolve;
                });
            };
            const pending = receive({ command: "requestMetadata", data: draft() });
            assert.ok(requestSignal);
            panel!.dispose();
            assert.strictEqual(requestSignal?.aborted, true);
            const before = posted.length;
            finish!("metadata");
            await pending;
            assert.strictEqual(posted.length, before);
            assert.strictEqual(disposedListeners, 1);
            await provider.openProfileWebview();
            assert.strictEqual(listenerCount, 2);
            assert.ok(!panel!.webview.html.includes("{{nonce}}"));
            assert.ok(panel!.webview.html.includes("nonce="));
            const certPath = "/tmp/client #? literal%20.pem";
            const keyPath = "/tmp/key #? literal%20.pem";
            const certificate = {
                ...draft("Certificate"),
                auth: {
                    kind: AuthKind.ClientCert,
                    cert: vscode.Uri.file(certPath),
                    key: vscode.Uri.file(keyPath),
                    passphrase: "cert-secret",
                },
            };
            await provider.saveProfile(certificate);
            await provider.openProfileWebview(
                provider.getChildren().find((item) => item.profile.name === "Certificate")!.profile,
            );
            await receive({ command: "webviewLoaded" });
            const init = posted
                .filter((message) => (message as { command: string }).command === "initProfile")
                .at(-1) as { profile: { auth: { cert: string; key: string } } };
            assert.strictEqual(typeof init.profile.auth.cert, "string");
            assert.strictEqual(vscode.Uri.parse(init.profile.auth.cert).fsPath, certPath);
            assert.strictEqual(vscode.Uri.parse(init.profile.auth.key).fsPath, keyPath);
            await receive({ command: "saveProfile", data: init.profile });
            await provider.setSelectedProfile(certificate);
            assert.strictEqual((await provider.getSelectedProfile())?.auth.cert?.fsPath, certPath);
            assert.strictEqual((await provider.getSelectedProfile())?.auth.key?.fsPath, keyPath);
            const invalid = {
                ...draft("Incomplete"),
                auth: {
                    kind: AuthKind.ClientCert,
                    cert: vscode.Uri.file(certPath),
                    passphrase: "incomplete-secret",
                },
            };
            const malformed = { ...draft("Recovery"), headers: { test: ["recovery-secret"] } };
            state.set(globalStates.profiles, [
                ...(state.get(globalStates.profiles) as Profile[]),
                invalid,
                malformed,
            ]);
            await provider.openProfileWebview(
                provider.getChildren().find((item) => item.profile.name === "Incomplete")!.profile,
            );
            await receive({ command: "webviewLoaded" });
            const incomplete = posted.at(-1) as {
                profile: { auth: { passphrase: string; cert: string } };
            };
            assert.strictEqual(incomplete.profile.auth.passphrase, "incomplete-secret");
            assert.strictEqual(vscode.Uri.parse(incomplete.profile.auth.cert).fsPath, certPath);
            await provider.openProfileWebview(
                provider.getChildren().find((item) => item.profile.name === "Recovery")!.profile,
            );
            await receive({ command: "webviewLoaded" });
            const recovery = posted.at(-1) as { profile: { recoveryData: unknown } };
            assert.deepStrictEqual(recovery.profile.recoveryData, malformed);
            assert.ok(!JSON.stringify([...state]).includes("secret"));
        } finally {
            (
                vscode.window as unknown as { createWebviewPanel: typeof originalCreate }
            ).createWebviewPanel = originalCreate;
            (vscode.lm as unknown as { selectChatModels: typeof originalModels }).selectChatModels =
                originalModels;
        }
    });
});
