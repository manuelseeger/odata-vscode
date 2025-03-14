import * as vscode from "vscode";

export function hasProperty(obj: unknown, key: string): boolean {
    return typeof obj === "object" && obj !== null && key in obj;
}



let extensionContext: vscode.ExtensionContext;

export function setExtensionContext(context: vscode.ExtensionContext) {
    extensionContext = context;
}

export function getExtensionContext(): vscode.ExtensionContext {
    return extensionContext;
}