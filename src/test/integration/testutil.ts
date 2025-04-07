import { ProfileTreeProvider, Profile, AuthKind } from "../../profiles";
import { Disposable } from "../../provider";
import * as vscode from "vscode";
import * as assert from "assert";

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
