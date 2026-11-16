import * as vscode from "vscode";

import { getSelectedPublicProfile, ODataMode } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { odata } from "./contracts/types";
import { CompletionContext, completionContext, EntryKind } from "./language/completion";
import { EXPAND_OPTIONS, OPERATORS, reference } from "./language/reference";
import { Disposable } from "./provider";
import { Csdl, formatTypeRef, Member, memberType } from "./schema";
import { getBaseUrl } from "./util";

/**
 * What can be written at a position, according to the syntax of the query up to there and,
 * if a profile with metadata is selected, the model of its service.
 */
function contextAt(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ExtensionContext,
    metadataService: IMetadataModelService,
): { completion: CompletionContext; csdl?: Csdl } {
    const profile = getSelectedPublicProfile(context);
    const baseUrl = profile ? getBaseUrl(profile.baseUrl) : undefined;
    let csdl: Csdl | undefined;
    if (profile) {
        try {
            csdl = metadataService.getCsdl(profile);
        } catch {
            // complete without metadata
        }
    }
    try {
        return {
            completion: completionContext(document.getText(), document.offsetAt(position), { csdl, baseUrl }),
            csdl,
        };
    } catch {
        return {
            completion: completionContext(document.getText(), document.offsetAt(position), { baseUrl }),
        };
    }
}

/**
 * Completes what is part of the query language itself: built-in functions where an operand
 * is expected, operators after an operand, and the values of some query options.
 */
export class DefaultCompletionItemProvider
    extends Disposable
    implements vscode.CompletionItemProvider
{
    public _id: string = "DefaultCompletionItemProvider";
    public triggerCharacters = [".", "=", ",", "(", "/", "'", " "];
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
        if (document.getWordRangeAtPosition(position, /\$inlinecount=.*/)) {
            return new vscode.CompletionList([
                new vscode.CompletionItem("allpages", vscode.CompletionItemKind.EnumMember),
                new vscode.CompletionItem("none", vscode.CompletionItemKind.EnumMember),
            ]);
        }
        if (document.getWordRangeAtPosition(position, /\$format=.*/)) {
            return new vscode.CompletionList([
                new vscode.CompletionItem("json", vscode.CompletionItemKind.EnumMember),
                new vscode.CompletionItem("xml", vscode.CompletionItemKind.EnumMember),
            ]);
        }
        if (document.getWordRangeAtPosition(position, /\$count=.*/)) {
            return new vscode.CompletionList([
                new vscode.CompletionItem("true", vscode.CompletionItemKind.EnumMember),
                new vscode.CompletionItem("false", vscode.CompletionItemKind.EnumMember),
            ]);
        }

        const { completion, csdl } = contextAt(
            document,
            position,
            this.context,
            this.metadataService,
        );

        if (completion.operators) {
            const items = OPERATORS.map((operator) => {
                const item = new vscode.CompletionItem(
                    operator.name,
                    vscode.CompletionItemKind.Operator,
                );
                item.documentation = operator.doc;
                return item;
            });
            if (completion.direction) {
                items.unshift(
                    new vscode.CompletionItem("asc", vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem("desc", vscode.CompletionItemKind.Keyword),
                );
            }
            return new vscode.CompletionList(items);
        }
        if (!completion.functions) {
            return null;
        }

        const functions: odata.Function[] = [...reference.v2.functions];
        if (csdl?.version.startsWith("4")) {
            functions.push(...reference.v4.functions);
        }
        const seen = new Set<string>();
        const items: vscode.CompletionItem[] = [];
        for (const func of functions) {
            if (seen.has(func.name)) {
                continue;
            }
            seen.add(func.name);
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.documentation = func.doc;
            items.push(item);
        }
        return new vscode.CompletionList(items);
    }
}

/**
 * Completes the names of system query options, at the top level of the query and inside
 * the parentheses of `$expand` and `$select` items.
 */
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
        const completion = completionContext(document.getText(), document.offsetAt(position));
        const typingName = !!document.getWordRangeAtPosition(position, /\$[a-zA-Z]*/);
        if (completion.parsed ? !completion.options : !typingName) {
            return undefined;
        }
        // System query options of V2 and V4 are offered alike, as many services mix them.
        const nested = completion.options === "nested";
        const seen = new Set<string>();
        const items: vscode.CompletionItem[] = [];
        for (const option of [
            ...reference.v2.systemQueryOptions,
            ...reference.v4.systemQueryOptions,
            { name: "$levels", doc: "How many levels deep to expand a recursive navigation." },
        ]) {
            if (seen.has(option.name) || (nested && !EXPAND_OPTIONS.includes(option.name))) {
                continue;
            }
            if (!nested && option.name === "$levels") {
                continue;
            }
            seen.add(option.name);
            const item = new vscode.CompletionItem(option.name, vscode.CompletionItemKind.Keyword);
            // The "$" is not part of a word: when it is typed already, complete what follows.
            const text = typingName ? option.name.slice(1) : option.name;
            item.insertText = `${text}=`;
            item.filterText = text;
            item.documentation = option.doc;
            items.push(item);
        }
        return new vscode.CompletionList(items);
    }
}

const ITEM_KINDS: Record<EntryKind, vscode.CompletionItemKind> = {
    property: vscode.CompletionItemKind.Property,
    navigation: vscode.CompletionItemKind.Reference,
    entitySet: vscode.CompletionItemKind.Class,
    singleton: vscode.CompletionItemKind.Class,
    function: vscode.CompletionItemKind.Function,
    action: vscode.CompletionItemKind.Function,
    type: vscode.CompletionItemKind.Struct,
    variable: vscode.CompletionItemKind.Variable,
};

/**
 * Completes names from the metadata of the selected profile: resources in the resource
 * path, and properties of the type that is addressed at the cursor. That is the type of the
 * resource for top-level query options, the type of the expanded navigation property inside
 * nested `$expand` options, the type of a range variable inside a lambda, and so on.
 */
export class MetadataCompletionItemProvider
    extends Disposable
    implements vscode.CompletionItemProvider
{
    public _id: string = "MetadataCompletionItemProvider";
    public triggerCharacters = [".", "=", ",", "(", "/", "'", ";", " "];
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
        const { completion, csdl } = contextAt(
            document,
            position,
            this.context,
            this.metadataService,
        );
        if (!csdl || !completion.entries.length) {
            return null;
        }
        const items = completion.entries.map((entry, index) => {
            const item = new vscode.CompletionItem(entry.label, ITEM_KINDS[entry.kind]);
            item.detail = entry.detail;
            if (entry.member) {
                item.documentation = getPropertyDoc(entry.member);
            }
            // keep the order of the metadata document
            item.sortText = String(index).padStart(4, "0");
            return item;
        });
        return new vscode.CompletionList(items);
    }
}

export function getPropertyDoc(member: Member): vscode.MarkdownString {
    return new vscode.MarkdownString(
        `**Name**: ${member.record.name}\n\n**Type**: ${formatTypeRef(memberType(member))}`,
    );
}
