import * as vscode from "vscode";
import { Disposable } from "./provider";
import { Profile } from "./profiles";
import { fetch } from "undici";
import { getRequestInit } from "./client";
import { APP_NAME, commands, getConfig, internalCommands, ODataMode } from "./configuration";
import { combineODataUrl } from "./formatting";

export class CommandProvider extends Disposable {
    private queryDocument: vscode.TextDocument | undefined = undefined;
    private resultDocument: vscode.TextDocument | undefined = undefined;

    constructor(private context: vscode.ExtensionContext) {
        super();
        this.subscriptions = [
            vscode.commands.registerCommand(commands.run, this.runEditorQuery, this),
            vscode.commands.registerCommand(commands.selectProfile, this.selectProfile, this),
            vscode.commands.registerCommand(commands.getMetadata, this.getEndpointMetadata, this),

            vscode.commands.registerCommand(
                internalCommands.openAndRunQuery,
                this.openAndRunQuery,
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
        const profiles = this.context.globalState.get<Profile[]>(`${APP_NAME}.profiles`, []);
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
        this.context.globalState.update("selectedProfile", profile);
    }

    /**
     * Get the metadata for the selected profile and update the profile.
     *
     * If no profile is selected, prompt the user to select one.
     * If no profile is found, return an empty string.
     */
    async getEndpointMetadata(): Promise<string> {
        let profile = this.context.globalState.get<Profile>("selectedProfile");
        if (!profile) {
            await this.selectProfile();
            profile = this.context.globalState.get<Profile>("selectedProfile");
        }
        if (!profile) {
            return "";
        }

        const metadata = await requestProfileMetadata(profile);
        profile.metadata = metadata;
        const profiles = this.context.globalState.get<Profile[]>(`${APP_NAME}.profiles`, []);
        const index = profiles.findIndex((p) => p.baseUrl === profile.baseUrl);
        if (index >= 0) {
            profiles[index] = profile;
        } else {
            profiles.push(profile);
        }
        this.context.globalState.update(`${APP_NAME}.profiles`, profiles);
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
        const profile = this.context.globalState.get<Profile>("selectedProfile");
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
        const profile = this.context.globalState.get<Profile>("selectedProfile");
        if (!profile) {
            return;
        }

        const defaultFormat = getConfig().defaultFormat;

        // strip leading http verb
        query = query.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, "");
        query = query.trim();
        if (!query.endsWith("$count") && !query.includes("$format")) {
            query += `&$format=${defaultFormat}`;
        }

        const r = await getRequestInit(profile);
        const res = await fetch(query, r);

        let format = "txt";
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
}

export async function requestProfileMetadata(profile: Profile): Promise<string> {
    // request the /$metadata endpoint via http using the profile details
    const requestInit = await getRequestInit(profile);
    requestInit.headers.set("Accept", "application/xml");
    const metadataUrl = `${profile.baseUrl.replace(/\/+$/, "")}/$metadata`;
    let response: Response;
    try {
        response = await fetch(metadataUrl, requestInit);
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
