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
                    await Promise.resolve();
                    secrets.set(key, value);
                },
                delete: async (key: string) => {
                    secrets.delete(key);
                },
            },
        } as unknown as vscode.ExtensionContext;
        provider = new ProfileTreeProvider(tokenizer, new MetadataModelService(), context, false);
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
        provider = new ProfileTreeProvider(tokenizer, new MetadataModelService(), context, false);
        const selected = await provider.getSelectedProfile();
        assert.strictEqual(selected?.headers["X-Key"], "header-secret");
        assert.strictEqual(selected?.auth.password, "password-secret");
        assert.ok(!JSON.stringify([...state.values()]).includes("secret"));
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
        } finally {
            (
                vscode.window as unknown as { createWebviewPanel: typeof originalCreate }
            ).createWebviewPanel = originalCreate;
            (vscode.lm as unknown as { selectChatModels: typeof originalModels }).selectChatModels =
                originalModels;
        }
    });
});
