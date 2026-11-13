import * as assert from "assert";
import * as vscode from "vscode";
import { commands, globalStates } from "../../configuration";
import { AuthKind, Profile } from "../../contracts/types";
import { ProfileTreeProvider } from "../../profiles";
import { MetadataModelService } from "../../services/MetadataModelService";

suite("Profile command callbacks", () => {
    const prefix = "odata.profile-command-test.";
    const profile: Profile = {
        name: "Test",
        baseUrl: "https://example.test/service",
        auth: { kind: AuthKind.None },
        headers: {},
    };
    const other = { ...profile, name: "Other" };
    let provider: ProfileTreeProvider;
    let state: Map<string, unknown>;
    let secrets: Map<string, string>;
    let secretCalls: number;
    let writes: number;
    let trusted: boolean;
    let pickerCalls: number;
    let pick: string | undefined;
    let pickerFailure: boolean;
    let storageFailure: boolean;
    let messages: string[];
    let trustDescriptor: PropertyDescriptor;
    let originalPick: typeof vscode.window.showQuickPick;
    let originalError: typeof vscode.window.showErrorMessage;

    setup(async () => {
        trusted = true;
        state = new Map();
        secrets = new Map();
        secretCalls = 0;
        writes = 0;
        pickerCalls = 0;
        pick = other.name;
        pickerFailure = false;
        storageFailure = false;
        messages = [];
        trustDescriptor = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted")!;
        Object.defineProperty(vscode.workspace, "isTrusted", {
            configurable: true,
            get: () => trusted,
        });
        originalPick = vscode.window.showQuickPick;
        originalError = vscode.window.showErrorMessage;
        vscode.window.showQuickPick = (async () => {
            pickerCalls++;
            if (pickerFailure) {
                throw new Error("private-picker-detail");
            }
            return pick;
        }) as typeof originalPick;
        vscode.window.showErrorMessage = (async (message: string) => {
            messages.push(message);
            return undefined;
        }) as typeof originalError;
        const context = {
            globalState: {
                get: (key: string, fallback?: unknown) => state.get(key) ?? fallback,
                update: async (key: string, value: unknown) => {
                    writes++;
                    if (storageFailure) {
                        throw new Error("private-storage-detail");
                    }
                    state.set(key, value);
                },
            },
            secrets: {
                get: async (key: string) => {
                    secretCalls++;
                    return secrets.get(key);
                },
                store: async (key: string, value: string) => {
                    secretCalls++;
                    secrets.set(key, value);
                },
                delete: async (key: string) => {
                    secretCalls++;
                    if (storageFailure) {
                        throw new Error("private-storage-detail");
                    }
                    secrets.delete(key);
                },
            },
        } as unknown as vscode.ExtensionContext;
        const originalRegister = vscode.commands.registerCommand;
        const originalTree = vscode.window.registerTreeDataProvider;
        vscode.commands.registerCommand = (command, callback, thisArg) =>
            originalRegister(prefix + command, callback, thisArg);
        vscode.window.registerTreeDataProvider = () => new vscode.Disposable(() => undefined);
        try {
            provider = new ProfileTreeProvider(
                { approximateTokenCount: (value: string) => value.length },
                new MetadataModelService(),
                context,
                async () => undefined,
            );
        } finally {
            vscode.commands.registerCommand = originalRegister;
            vscode.window.registerTreeDataProvider = originalTree;
        }
        await provider.saveProfile(profile);
        await provider.saveProfile(other);
        await provider.setSelectedProfile(profile);
        secretCalls = 0;
        writes = 0;
    });

    teardown(() => {
        provider?.dispose();
        Object.defineProperty(vscode.workspace, "isTrusted", trustDescriptor);
        vscode.window.showQuickPick = originalPick;
        vscode.window.showErrorMessage = originalError;
    });

    function assertError(action: "select" | "delete"): void {
        assert.deepStrictEqual(messages, [
            `Cannot ${action} profile. Check workspace trust and profile settings.`,
        ]);
    }

    for (const action of ["select", "delete"] as const) {
        test(`restricted ${action} resolves with an extension error and no effects`, async () => {
            trusted = false;
            const before = [...state];
            const beforeSecrets = [...secrets];
            await assert.doesNotReject(async () => {
                await vscode.commands.executeCommand(
                    prefix + (action === "select" ? commands.selectProfile : "odata.deleteProfile"),
                    provider.getChildren()[0],
                );
            });
            assertError(action);
            assert.strictEqual(pickerCalls, 0);
            assert.strictEqual(writes, 0);
            assert.strictEqual(secretCalls, 0);
            assert.deepStrictEqual([...state], before);
            assert.deepStrictEqual([...secrets], beforeSecrets);
        });

        test(`${action} reports asynchronous storage failures without leaking details`, async () => {
            storageFailure = true;
            await assert.doesNotReject(async () => {
                await vscode.commands.executeCommand(
                    prefix + (action === "select" ? commands.selectProfile : "odata.deleteProfile"),
                    provider.getChildren()[0],
                );
            });
            assertError(action);
        });
    }

    test("restricted select does not open even a cancelled picker", async () => {
        trusted = false;
        pick = undefined;
        await vscode.commands.executeCommand(prefix + commands.selectProfile);
        assert.strictEqual(pickerCalls, 0);
        assertError("select");
        assert.strictEqual(writes, 0);
        assert.strictEqual(secretCalls, 0);
    });

    test("trusted select updates the selected profile", async () => {
        await vscode.commands.executeCommand(prefix + commands.selectProfile);
        assert.strictEqual((await provider.getSelectedProfile())?.name, other.name);
        assert.strictEqual(pickerCalls, 1);
        assert.deepStrictEqual(messages, []);
    });

    test("trusted cancellation keeps the selected profile without writes", async () => {
        pick = undefined;
        const before = [...state];
        await vscode.commands.executeCommand(prefix + commands.selectProfile);
        assert.deepStrictEqual([...state], before);
        assert.strictEqual(writes, 0);
        assert.strictEqual(secretCalls, 0);
        assert.strictEqual(pickerCalls, 1);
        assert.deepStrictEqual(messages, []);
    });

    test("trusted delete removes the profile and its secrets and selects the remaining profile", async () => {
        secrets.set("odata.profile.secret.Test", "private-secret");
        await vscode.commands.executeCommand(prefix + "odata.deleteProfile", provider.getChildren()[0]);
        assert.deepStrictEqual(provider.getChildren().map((item) => item.profile.name), [other.name]);
        assert.strictEqual((state.get(globalStates.selectedProfile) as Profile).name, other.name);
        assert.strictEqual(secrets.has("odata.profile.secret.Test"), false);
        assert.deepStrictEqual(messages, []);
    });

    test("select reports picker failures without leaking details", async () => {
        pickerFailure = true;
        await assert.doesNotReject(async () => {
            await vscode.commands.executeCommand(prefix + commands.selectProfile);
        });
        assertError("select");
        assert.strictEqual(writes, 0);
        assert.strictEqual(secretCalls, 0);
    });

    test("low-level selection and deletion still reject in restricted mode", async () => {
        trusted = false;
        await assert.rejects(provider.setSelectedProfile(other), /Trust this workspace/);
        await assert.rejects(provider.deleteProfile(profile), /Trust this workspace/);
        assert.strictEqual(writes, 0);
        assert.strictEqual(secretCalls, 0);
    });
});
