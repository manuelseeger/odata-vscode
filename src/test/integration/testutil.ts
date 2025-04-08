import { ProfileTreeProvider } from "../../profiles";
import { Profile, AuthKind } from "../../contracts/types";
import { Disposable } from "../../provider";
import * as vscode from "vscode";
import * as assert from "assert";
import { activate } from "../../extension";
import { instance, mock, when, anything } from "ts-mockito";
import { IQueryRunner } from "../../contracts/IQueryRunner";

export async function setupTestEnvironment() {
    const baseUrl = "https://services.odata.org/northwind/northwind.svc/";
    const extension = vscode.extensions.getExtension("manuelseeger.odata");
    assert.ok(extension, "Extension not found");

    const context = await extension!.activate();

    const profilTree = context.subscriptions.find(
        (sub: Disposable) => sub._id === "ProfileTreeProvider",
    ) as ProfileTreeProvider;
    assert.ok(profilTree, "Profile tree provider not found");

    const profile: Profile = {
        name: "Northwind",
        baseUrl: baseUrl,
        metadata: "",
        auth: {
            kind: AuthKind.None,
        },
        headers: {},
    };
    profilTree.addProfile(profile);
    context.globalState.update("odata.selectedProfile", profile);

    return { context, baseUrl };
}

export async function setupWithMockedRunner(records: { [key: string]: string }) {
    const context = {
        subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    const queryRunnerMock = mock<IQueryRunner>();

    // Override mock for each record: when called with the key, return its value
    for (const [key, value] of Object.entries(records)) {
        when(queryRunnerMock.run(key, anything())).thenResolve(
            new Response(value, {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
    }

    return await activate(context, {
        queryRunner: instance(queryRunnerMock),
    });
}
