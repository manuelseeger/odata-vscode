import * as vscode from "vscode";
import { Disposable } from "./provider";
import { Profile } from "./contracts/types";
import { commands, getConfig, globalStates, internalCommands, ODataMode } from "./configuration";
import { combineODataUrl } from "./util";
import { getMetadataUrl } from "./util";
import { IQueryRunner } from "./contracts/IQueryRunner";

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
        subscribe: boolean = true,
    ) {
        super();
        if (subscribe) {
            this.registerCommands();
        }
    }

    /**
     * Register the commands for the command provider.
     *
     * This is put into a dedicated method so that we can run CommandProvider in extension
     * testing without re-registering the commands.
     */
    private registerCommands() {
        this.subscriptions = [
            vscode.commands.registerCommand(commands.run, this.runEditorQuery, this),
            vscode.commands.registerCommand(commands.selectProfile, this.selectProfile, this),
            vscode.commands.registerCommand(commands.getMetadata, this.getEndpointMetadata, this),
            vscode.commands.registerCommand(commands.copyQuery, this.copyQueryToClipboard, this),
            vscode.commands.registerCommand(
                internalCommands.openAndRunQuery,
                this.openAndRunQuery,
                this,
            ),

            vscode.commands.registerCommand(
                internalCommands.requestMetadata,
                this.requestProfileMetadata,
                this,
            ),
        ];
    }

    /**
     * Open a query in the editor and run it.
     *
     * This is used by the chat handler to open and run queries the chat participant generates.
     * @param query The query to run.
     */
    async openAndRunQuery(query: string) {
        // strip leading http verb
        query = query.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, "");
        query = query.trim();
        this.openQuery(query);
        await this.runQuery(query);
    }

    /**
     * Run the query in the editor.
     *
     * Run the query from the active editor. The query is expected to be a valid OData URL.
     */
    async runEditorQuery() {
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
                this.runQuery(url.href);
            } catch (exception) {
                vscode.window.showWarningMessage("Document does not represent a valid URL.");
            }
        }
    }

    /**
     * Prompt the user to select a profile from the list of profiles.
     */
    async selectProfile() {
        const profiles = this.context.globalState.get<Profile[]>(globalStates.profiles, []);
        if (profiles.length === 0) {
            return;
        }
        const profileName = await vscode.window.showQuickPick(
            profiles.map((p) => p.name),
            {
                placeHolder: "Select an endpoint",
            },
        );
        if (!profileName) {
            return;
        }
        const profile = profiles.find((p) => p.name === profileName);
        this.context.globalState.update(globalStates.selectedProfile, profile);
    }

    /**
     * Get the metadata for the selected profile and update the profile.
     *
     * If no profile is selected, prompt the user to select one.
     * If no profile is found, return an empty string.
     */
    async getEndpointMetadata(): Promise<string> {
        let profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (!profile) {
            await this.selectProfile();
            profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        }
        if (!profile) {
            return "";
        }

        const metadata = await this.requestProfileMetadata(profile);
        profile.metadata = metadata;
        const profiles = this.context.globalState.get<Profile[]>(globalStates.profiles, []);
        const index = profiles.findIndex((p) => p.name === profile.name);
        if (index >= 0) {
            profiles[index] = profile;
        } else {
            profiles.push(profile);
        }
        this.context.globalState.update(globalStates.profiles, profiles);
        this.context.globalState.update(globalStates.selectedProfile, profile);
        return metadata;
    }

    /**
     * Open the query in the editor.
     *
     * This is used by the chat handler to open queries the chat participant generates.
     *
     * @param query The query to show in the editor.
     */
    private async openQuery(query: string) {
        const profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (!profile) {
            return;
        }
        if (!this.queryDocument) {
            this.queryDocument = await vscode.workspace.openTextDocument({
                language: "odata",
                content: query,
            });
        }

        const editor = await vscode.window.showTextDocument(this.queryDocument, { preview: false });
        const entireRange = new vscode.Range(
            this.queryDocument.positionAt(0),
            this.queryDocument.positionAt(this.queryDocument.getText().length),
        );
        await editor.edit((editBuilder) => {
            editBuilder.replace(entireRange, query);
        });

        await vscode.commands.executeCommand("editor.action.formatDocument");
    }

    /**
     * Run the query against the selected profile.
     *
     * @param query The query to run.
     */
    private async runQuery(query: string) {
        const profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (!profile) {
            return;
        }

        const defaultFormat = getConfig().defaultFormat;

        let url: URL;
        try {
            url = new URL(query);
        } catch (error) {
            vscode.window.showErrorMessage("Invalid URL: " + query);
            return;
        }

        if (!query.endsWith("$count") && !url.searchParams.has("$format")) {
            url.searchParams.append("$format", defaultFormat);
        }

        const res = await this.runner.run(url.href, profile);

        let format = "plaintext";
        const contentType = res.headers.get("Content-Type");
        if (contentType) {
            if (contentType.includes("json")) {
                format = "json";
            } else if (contentType.includes("xml")) {
                format = "xml";
            }
        }

        const newContent = await res.text();
        if (!this.resultDocument) {
            this.resultDocument = await vscode.workspace.openTextDocument({
                language: format,
                content: newContent,
            });
        }

        if (!res.ok) {
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

        this.resultDocument = await vscode.languages.setTextDocumentLanguage(
            this.resultDocument,
            format,
        );

        const editor = await vscode.window.showTextDocument(this.resultDocument, {
            preview: false,
        });
        const entireRange = new vscode.Range(
            this.resultDocument.positionAt(0),
            this.resultDocument.positionAt(this.resultDocument.getText().length),
        );
        await editor.edit((editBuilder) => {
            editBuilder.replace(entireRange, newContent);
        });

        await vscode.commands.executeCommand("editor.action.formatDocument");
    }

    /**
     * Requests and returns the metadata for the given OData profile.
     *
     * This method uses the provided profile's details to build the metadata URL and performs an HTTP GET request.
     * If the request is successful, the XML metadata is returned as a string; otherwise, an empty string is returned.
     *
     * @param profile The OData profile containing the base URL and authentication details.
     * @returns A promise that resolves to the metadata string or an empty string on failure.
     */
    async requestProfileMetadata(profile: Profile): Promise<string> {
        // request the /$metadata endpoint via http using the profile details
        const requestInit = {
            headers: { Accept: "application/xml" },
        } as RequestInit;
        const metadataUrl = getMetadataUrl(profile.baseUrl);
        let response: Response;
        try {
            response = await this.runner.fetch(metadataUrl, profile, requestInit);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to fetch metadata: ${err}`);
            return "";
        }

        if (!response.ok) {
            vscode.window.showErrorMessage(
                `Failed to fetch metadata: ${response.status} ${response.statusText}`,
            );
            return "";
        }
        const metadata = await response.text();
        return metadata;
    }

    /**
     * Copy the query in the editor to the clipboard.
     *
     * This command takes the current editor content, combines the URL, and copies the resulting one-line URL to the clipboard.
     */
    async copyQueryToClipboard(): Promise<string | undefined> {
        const editor = vscode.window.activeTextEditor;
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
            const combinedUrl = combineODataUrl(text);
            await vscode.env.clipboard.writeText(combinedUrl);
            vscode.window.showInformationMessage("Query copied to clipboard.");
            return combinedUrl;
        } catch (exception) {
            vscode.window.showWarningMessage("Failed to copy query to clipboard");
        }
    }
}
