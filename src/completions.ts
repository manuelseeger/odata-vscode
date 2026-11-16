import * as vscode from "vscode";
import {
    Csdl, findRoot, findType, formatTypeRef, Member, members, memberType,
    resolveMemberPath, resourceStructuredType, RootResource, roots,
} from "./schema";

import { getSelectedPublicProfile, ODataMode } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { Disposable } from "./provider";
import { combineODataUrl, getBaseUrl } from "./util";
import * as odataV2 from "./definitions/odataV2.json";
import * as odataV4 from "./definitions/odataV4.json";

export class DefaultCompletionItemProvider
    extends Disposable
    implements vscode.CompletionItemProvider
{
    public _id: string = "DefaultCompletionItemProvider";
    public triggerCharacters = [".", "=", ",", "(", "/", "'"];
    constructor(
        private context: vscode.ExtensionContext,
        private readonly metadataService: IMetadataModelService,
    ) {
        super();
        this.subscriptions = [
            vscode.languages.registerCompletionItemProvider(
                ODataMode,
                this,
                ...this.triggerCharacters,
            ),
        ];
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext,
    ): Promise<vscode.CompletionList<vscode.CompletionItem> | null | undefined> {
        if (document.getWordRangeAtPosition(position, /\$[a-zA-Z]*/)) {
            return null;
        }
        if (document.getWordRangeAtPosition(position, /\$select=.*/)) {
            return null;
        }
        if (document.getWordRangeAtPosition(position, /\/[a-zA-Z]*/)) {
            return null;
        }
        if (document.getWordRangeAtPosition(position, /\$inlinecount=.*/)) {
            return new vscode.CompletionList([
                new vscode.CompletionItem("allpages", vscode.CompletionItemKind.EnumMember),
            ]);
        }
        if (document.getWordRangeAtPosition(position, /\$format=.*/)) {
            return new vscode.CompletionList([
                new vscode.CompletionItem("json", vscode.CompletionItemKind.EnumMember),
                new vscode.CompletionItem("xml", vscode.CompletionItemKind.EnumMember),
            ]);
        }

        const methods = odataV2.functions;
        const methodCompletions = methods.map((methodObj) => {
            const item = new vscode.CompletionItem(
                methodObj.name,
                vscode.CompletionItemKind.Function,
            );
            item.documentation = methodObj.doc;
            return item;
        });
        const profile = getSelectedPublicProfile(this.context);

        let model: Csdl | undefined;
        try {
            model = profile ? this.metadataService.getCsdl(profile) : undefined;
        } catch {
            return new vscode.CompletionList(methodCompletions);
        }

        if (model?.version.startsWith("4.")) {
            const methodsV4 = odataV4.functions;
            methodsV4.forEach((methodObj) => {
                const item = new vscode.CompletionItem(
                    methodObj.name,
                    vscode.CompletionItemKind.Function,
                );
                item.documentation = methodObj.doc;
                methodCompletions.push(item);
            });
        }
        return new vscode.CompletionList(methodCompletions);
    }
}

export class SystemQueryCompletionItemProvider
    extends Disposable
    implements vscode.CompletionItemProvider
{
    public _id: string = "SystemQueryCompletionItemProvider";
    public triggerCharacters = ["$"];
    constructor() {
        super();
        this.subscriptions = [
            vscode.languages.registerCompletionItemProvider(
                ODataMode,
                this,
                ...this.triggerCharacters,
            ),
        ];
    }
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.CompletionList> {
        if (document.getWordRangeAtPosition(position, /\$[a-zA-Z]*/)) {
            const combinedOptions = [...odataV2.systemQueryOptions, ...odataV4.systemQueryOptions];
            const completionItems = combinedOptions.map((option) => {
                const completion = new vscode.CompletionItem(
                    option.name,
                    vscode.CompletionItemKind.Keyword,
                );
                const text = option.name.startsWith("$") ? option.name.slice(1) : option.name;
                completion.insertText = text;
                completion.filterText = text;
                completion.documentation = option.doc;
                return completion;
            });
            return new vscode.CompletionList(completionItems);
        }
    }
}

export class MetadataCompletionItemProvider
    extends Disposable
    implements vscode.CompletionItemProvider
{
    public _id: string = "MetadataCompletionItemProvider";
    public triggerCharacters = [".", "=", ",", "(", "/", "'"];
    constructor(
        private metadataService: IMetadataModelService,

        private context: vscode.ExtensionContext,
    ) {
        super();
        this.subscriptions = [
            vscode.languages.registerCompletionItemProvider(
                ODataMode,
                this,
                ...this.triggerCharacters,
            ),
        ];
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.CompletionList<vscode.CompletionItem> | null | undefined> {
        const completions: vscode.CompletionItem[] = [];
        const profile = getSelectedPublicProfile(this.context);
        if (!profile) { return null; }

        try {
            const model = this.metadataService.getCsdl(profile);
            if (!model) {
                return null;
            }
            const resource = this.getResourceFromDocument(document, model, profile.baseUrl);
            if (!resource) {
                this.completeResourcePath(completions, model);
                return new vscode.CompletionList(completions);
            }
            const queryOption = this.findNearestSystemQueryOption(document, position);
            if (!queryOption) {
                return null;
            }
            this.completeMemberPath(completions, position, document, model, resource, queryOption === "$expand");
            return new vscode.CompletionList(completions);
        } catch {
            return null;
        }
    }

    private completeMemberPath(
        completions: vscode.CompletionItem[],
        position: vscode.Position,
        document: vscode.TextDocument,
        model: Csdl,
        resource: RootResource,
        navigationOnly: boolean,
    ) {
        let type = resourceStructuredType(model, resource);
        if (!type) {
            return;
        }
        const path = this.getMemberPrefix(document, position);
        if (path.length) {
            const member = resolveMemberPath(model, type, path);
            type = member ? findType(model, memberType(member).qname) : undefined;
        }
        if (!type) {
            return;
        }
        for (const member of members(model, type)) {
            if (navigationOnly && member.kind !== "navigation") {
                continue;
            }
            const item = new vscode.CompletionItem(member.record.name, vscode.CompletionItemKind.Property);
            item.documentation = getPropertyDoc(member);
            completions.push(item);
        }
    }

    private completeResourcePath(completions: vscode.CompletionItem[], model: Csdl) {
        for (const name of new Set(roots(model).map((root) => root.record.name))) {
            completions.push(new vscode.CompletionItem(name, vscode.CompletionItemKind.Class));
        }
    }

    private findNearestSystemQueryOption(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): string | null {
        let line = position.line;
        let character = position.character;

        while (line >= 0) {
            const lineText = document.lineAt(line).text;

            const textToCheck =
                line === position.line ? lineText.substring(0, character) : lineText;

            const match = textToCheck.match(/\$[a-zA-Z]+/g);
            if (match) {
                return match[match.length - 1];
            }

            line--;
            character = line >= 0 ? document.lineAt(line).text.length : 0;
        }

        return null;
    }

    private getMemberPrefix(document: vscode.TextDocument, position: vscode.Position): string[] {
        const precedingText = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
        const match = precedingText.match(/([\p{L}\p{N}_.]+(?:\s*\/\s*[\p{L}\p{N}_.]+)*)\s*\/\s*[\p{L}\p{N}_.]*$/u);
        return match ? match[1].split("/").map((part) => part.trim()) : [];
    }

    private getResourceFromDocument(
        document: vscode.TextDocument, model: Csdl, baseUrl: string,
    ): RootResource | undefined {
        const url = combineODataUrl(document.getText());
        const base = getBaseUrl(baseUrl);
        const relative = url.startsWith(base) ? url.slice(base.length) : url;
        const name = relative.split(/[(/?]/, 1)[0];
        const found = findRoot(model, name);
        return found.kind === "found" ? found.value : undefined;
    }
}

export function getPropertyDoc(member: Member): vscode.MarkdownString {
    return new vscode.MarkdownString(
        `**Name**: ${member.record.name}\n\n**Type**: ${formatTypeRef(memberType(member))}`,
    );
}
