import * as vscode from "vscode";
import { getSelectedPublicProfile, ODataMode } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { odata, Profile } from "./contracts/types";
import { spanToRange } from "./diagnostics";
import { resolvedSiteAt } from "./language/completion";
import { Disposable } from "./provider";
import { Csdl, EntitySet, findRoot, findType, formatTypeRef, members, memberType } from "./schema";
import { formatFunctionLabel } from "./signatures";
import { combineODataUrl, getBaseUrl } from "./util";

export class HoverProvider extends Disposable implements vscode.HoverProvider {
    public _id: string = "HoverProvider";
    private functions = new Map<string, odata.Function[]>();

    constructor(
        private metadataService: IMetadataModelService,
        private context: vscode.ExtensionContext,
        ref: odata.Reference,
    ) {
        super();
        const v4Names = new Set(ref.v4.functions.map((func) => func.name));
        for (const func of [
            ...ref.v4.functions,
            ...ref.v2.functions.filter((func) => !v4Names.has(func.name)),
        ]) {
            this.functions.set(func.name, [...(this.functions.get(func.name) ?? []), func]);
        }
        this.subscriptions = [vscode.languages.registerHoverProvider(ODataMode, this)];
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.Hover | null | undefined> {
        const functionRange = document.getWordRangeAtPosition(position, /[A-Za-z][\w.]*/);
        if (
            functionRange &&
            /^\s*\(/.test(document.lineAt(position.line).text.slice(functionRange.end.character))
        ) {
            const functions = this.functions.get(document.getText(functionRange));
            if (functions) {
                const contents = functions.map((func) => {
                    const markdown = new vscode.MarkdownString();
                    markdown.appendCodeblock(formatFunctionLabel(func));
                    markdown.appendMarkdown(`${func.doc}\n\n`);
                    for (const param of func.params ?? []) {
                        markdown.appendMarkdown(
                            `- \`${param.name}: ${param.type}\` ${param.description}\n`,
                        );
                    }
                    return markdown;
                });
                return new vscode.Hover(contents, functionRange);
            }
        }

        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);

        const profile = getSelectedPublicProfile(this.context);
        if (!profile) {
            return;
        }

        try {
            const metadata = this.metadataService.getCsdl(profile);
            if (metadata) {
                const site = resolvedSiteAt(document.getText(), document.offsetAt(position), {
                    csdl: metadata,
                    baseUrl: getBaseUrl(profile.baseUrl),
                });
                if (site?.resolved?.kind === "property") {
                    const { member, owner } = site.resolved;
                    return new vscode.Hover(
                        new vscode.MarkdownString(
                            `**Property**: ${member.record.name}\n\n**Type**: ${formatTypeRef(memberType(member))}\n\n**On type**: ${owner.qname}`,
                        ),
                        spanToRange(site.span),
                    );
                }

                const found = findRoot(metadata, word);
                if (found.kind === "found" && found.value.kind === "set") {
                    return new vscode.Hover(
                        this.getEntityTypeHover(metadata, found.value.record),
                        wordRange,
                    );
                }
            }
        } catch {
            return new vscode.Hover(this.getSelectedProfileHover(document, profile));
        }
        return new vscode.Hover(this.getSelectedProfileHover(document, profile));
    }

    private getEntityTypeHover(metadata: Csdl, set: EntitySet): vscode.MarkdownString {
        let hoverText = `**Entity Set**: ${set.name}\n\n`;
        if (set.bindings.size) {
            hoverText += `**Navigation Property Binding**: ${[...set.bindings].map(([path, target]) => `${path} -> ${target}`).join(", ")}\n\n`;
        }
        const type = findType(metadata, set.type);
        if (type) {
            hoverText += `**Entity Type**: ${type.qname}\n\n`;
            hoverText += `**Properties**: \n - ${members(metadata, type).map((member) => `${member.record.name} (${formatTypeRef(memberType(member))})`).join("\n - ")}\n\n`;
        }
        return new vscode.MarkdownString(hoverText);
    }

    private getSelectedProfileHover(
        document: vscode.TextDocument,
        profile: Profile,
    ): vscode.MarkdownString {
        let hoverText = `**Selected Profile**: ${profile.name}\n\n`;
        hoverText += `**Base URL**: ${getBaseUrl(profile.baseUrl)}\n\n`;
        const queryUrl = combineODataUrl(document.getText());
        hoverText += `**Query:** [${queryUrl}](<${queryUrl}>)`;

        return new vscode.MarkdownString(hoverText);
    }
}
