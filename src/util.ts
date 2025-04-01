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

export abstract class Disposable {
    subscriptions: Array<{ dispose: () => void }>;
    constructor() {
        this.subscriptions = [];
    }
    dispose(): void {
        if (this.subscriptions) {
            this.subscriptions.forEach((obj) => obj.dispose());
            this.subscriptions = [];
        }
    }
}
