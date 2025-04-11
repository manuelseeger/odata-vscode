import * as vscode from "vscode";
import { IFileReader } from "./contracts/IFileReader";

export abstract class Disposable {
    public abstract _id: string;
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

export class VSCodeFileReader implements IFileReader {
    async readFile(path: string): Promise<Uint8Array> {
        return vscode.workspace.fs.readFile(vscode.Uri.file(path));
    }
}
