import * as vscode from "vscode";
import {
    commands,
    getConfig,
    getSelectedPublicProfile,
    internalCommands,
    ODataMode,
} from "./configuration";
import { IQueryRunner, RequestResult } from "./contracts/IQueryRunner";
import { requireTrustedWorkspace } from "./security";
import { Profile } from "./contracts/types";
import { Disposable } from "./provider";
import { combineODataUrl, getMetadataUrl } from "./util";
import { parseEndpoint } from "./profileData";

export class CommandProvider extends Disposable {
    public _id: string = "CommandProvider";
    private queryDocument: vscode.TextDocument | undefined = undefined;
    private _resultDocument: vscode.TextDocument | undefined = undefined;

    public get resultDocument(): vscode.TextDocument | undefined {
        return this._resultDocument;
    }
    private set resultDocument(value: vscode.TextDocument | undefined) {
        this._resultDocument = value;
    }

    constructor(
        private context: vscode.ExtensionContext,
        private runner: IQueryRunner,
        private getProfile: () => Promise<Profile | undefined>,
        subscribe: boolean = true,
    ) {
        super();
        if (subscribe) {
            this.registerCommands();
        }
    }

    private registerCommands() {
        this.subscriptions = [
            vscode.commands.registerCommand(commands.run, this.runEditorQuery, this),

            vscode.commands.registerCommand(commands.copyQuery, this.copyQueryToClipboard, this),
            vscode.commands.registerCommand(
                internalCommands.openAndRunQuery,
                this.openAndRunQuery,
                this,
            ),
        ];
    }

    async openAndRunQuery(query: string) {
        requireTrustedWorkspace();
        query = await this.openQuery(query);
        if (getConfig().disableRunner) {
            return;
        }
        query = combineODataUrl(query);
        await this.runQuery(query);
    }

    async runEditorQuery() {
        if (getConfig().disableRunner) {
            return;
        }
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        let document = editor.document;

        if (document.languageId !== ODataMode.language) {
            vscode.window.showInformationMessage("This command affects only OData files.");
        } else {
            try {
                let text = editor.document.getText();
                let combinedUrl = combineODataUrl(text);
                const url = new URL(combinedUrl);
                await this.runQuery(url.href);
            } catch (exception) {
                vscode.window.showWarningMessage(
                    "Cannot run query. Check the URL, workspace trust, and selected profile settings.",
                );
            }
        }
    }

    public async openQuery(query: string): Promise<string> {
        query = query.trim().replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, "").trim();
        if (!this.queryDocument || this.queryDocument.isClosed) {
            this.queryDocument = await vscode.workspace.openTextDocument({
                language: "odata",
                content: query,
            });
        }

        const editor = await vscode.window.showTextDocument(this.queryDocument, {
            preview: false,
            viewColumn: vscode.ViewColumn.One,
        });
        const entireRange = new vscode.Range(
            this.queryDocument.positionAt(0),
            this.queryDocument.positionAt(this.queryDocument.getText().length),
        );
        await editor.edit((editBuilder) => {
            editBuilder.replace(entireRange, query);
        });

        this.queryDocument = await vscode.languages.setTextDocumentLanguage(
            this.queryDocument,
            "odata",
        );
        await vscode.commands.executeCommand("editor.action.formatDocument");
        return query;
    }

    private async runQuery(query: string) {
        requireTrustedWorkspace();
        const config = getConfig();
        const publicProfile = getSelectedPublicProfile(this.context);
        if (
            publicProfile &&
            parseEndpoint(query).origin !== parseEndpoint(publicProfile.baseUrl).origin
        ) {
            throw new Error("The query must use the selected endpoint origin.");
        }
        const profile = await this.getProfile();
        if (!profile) {
            return;
        }

        let url: URL;
        try {
            url = new URL(query);
        } catch (error) {
            vscode.window.showErrorMessage("Invalid query URL.");
            return;
        }

        if (!query.endsWith("$count") && !url.searchParams.has("$format")) {
            url.searchParams.append("$format", config.defaultFormat);
        }

        let res: RequestResult;
        try {
            res = await this.withRequestProgress("Run OData query", (signal) =>
                this.runner.run(url.href, profile, signal),
            );
        } catch {
            void vscode.window.showErrorMessage(
                "Request failed or cancelled. Check workspace trust and profile settings.",
            );
            return;
        }

        let format = "plaintext";
        const contentType = res.contentType;
        if (contentType) {
            if (contentType.includes("json")) {
                format = "json";
            } else if (contentType.includes("xml")) {
                format = "xml";
            }
        }

        const newContent = res.text;
        if (!this.resultDocument) {
            this.resultDocument = await vscode.workspace.openTextDocument({
                language: format,
                content: newContent,
            });
        }

        if (res.status < 200 || res.status >= 300) {
            let show: string | undefined = undefined;
            if (newContent && newContent.length > 0) {
                show = await vscode.window.showErrorMessage(
                    `Running query failed: ${res.status} ${res.statusText}`,
                    "Show Response",
                );
            } else {
                vscode.window.showErrorMessage(
                    `Running query failed: ${res.status} ${res.statusText}`,
                );
            }
            if (!show || show !== "Show Response") {
                return;
            }
        }

        const showOptions: vscode.TextDocumentShowOptions = { preview: false };
        if (config.openResultInNewPane) {
            showOptions.viewColumn = vscode.ViewColumn.Beside;
        }
        const editor = await vscode.window.showTextDocument(this.resultDocument, showOptions);
        const entireRange = new vscode.Range(
            this.resultDocument.positionAt(0),
            this.resultDocument.positionAt(this.resultDocument.getText().length),
        );
        await editor.edit((editBuilder) => {
            editBuilder.replace(entireRange, newContent);
        });

        this.resultDocument = await vscode.languages.setTextDocumentLanguage(
            this.resultDocument,
            format,
        );

        await vscode.commands.executeCommand("editor.action.formatDocument");
    }

    async requestProfileMetadata(profile: Profile, signal?: AbortSignal): Promise<string> {
        requireTrustedWorkspace();
        const metadataUrl = getMetadataUrl(profile.baseUrl);
        let response: RequestResult;
        try {
            response = await this.withRequestProgress(
                "Get OData metadata",
                (requestSignal) =>
                    this.runner.fetch(metadataUrl, profile, "application/xml", requestSignal),
                signal,
            );
        } catch (err) {
            vscode.window.showErrorMessage("Metadata request failed or cancelled.");
            return "";
        }

        if (response.status < 200 || response.status >= 300) {
            vscode.window.showErrorMessage(
                `Failed to fetch metadata: ${response.status} ${response.statusText}`,
            );
            return "";
        }
        return response.text;
    }

    private async withRequestProgress<T>(
        title: string,
        request: (signal: AbortSignal) => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        return vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title, cancellable: true },
            async (_progress, token) => {
                const controller = new AbortController();
                const abort = () => controller.abort();
                const listener = token.onCancellationRequested(abort);
                signal?.addEventListener("abort", abort, { once: true });
                if (signal?.aborted || token.isCancellationRequested) {
                    abort();
                }
                try {
                    return await request(controller.signal);
                } finally {
                    listener.dispose();
                    signal?.removeEventListener("abort", abort);
                }
            },
        );
    }

    async copyQueryToClipboard(): Promise<string | undefined> {
        const editor = vscode.window.activeTextEditor;
        const config = getConfig();
        if (!editor) {
            vscode.window.showInformationMessage("No active editor found.");
            return;
        }

        const document = editor.document;
        if (document.languageId !== ODataMode.language) {
            vscode.window.showInformationMessage("This command affects only OData files.");
            return;
        }

        try {
            const text = document.getText();
            let combinedUrl = combineODataUrl(text);
            const url = new URL(combinedUrl);
            if (!url.searchParams.has("$format") && config.defaultFormat) {
                combinedUrl += `&$format=${config.defaultFormat}`;
            }

            await vscode.env.clipboard.writeText(combinedUrl);
            vscode.window.showInformationMessage("Query copied to clipboard.");
            return combinedUrl;
        } catch (exception) {
            vscode.window.showWarningMessage("Failed to copy query to clipboard");
        }
    }
}
