import * as vscode from "vscode";

export function requireTrustedWorkspace(): void {
    if (!vscode.workspace.isTrusted) {
        throw new Error("Trust this workspace to use network, secrets, certificates, or chat.");
    }
}
