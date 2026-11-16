import * as vscode from "vscode";
import {
    LocationRange, ParseResult, ParseSyntaxErrorHandler, SyntaxLocation,
} from "./parser/syntaxparser";
import { Profile } from "./contracts/types";
import { getConfig, getSelectedPublicProfile } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import {
    Csdl, findMember, findRoot, findType, memberType, resourceStructuredType,
    RootResource, StructuredType,
} from "./schema";
import { Disposable } from "./provider";

export class ODataDiagnosticProvider extends Disposable {
    public _id: string = "ODataDiagnosticProvider";
    private _diagnostics: vscode.DiagnosticCollection;
    public get diagnostics(): vscode.DiagnosticCollection {
        return this._diagnostics;
    }

    constructor(
        private metadataService: IMetadataModelService,
        private context: vscode.ExtensionContext,
    ) {
        super();
        this._diagnostics = vscode.languages.createDiagnosticCollection("odata");
        this.subscriptions = [this._diagnostics];
    }

    public handleSyntaxError: ParseSyntaxErrorHandler = (uri, error) => {
        this.diagnostics.set(uri, [new vscode.Diagnostic(
            spanToRange(error.location),
            error.message,
            getConfig().strictParser
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning,
        )]);
    };

    public async handleParseSucess(uri: vscode.Uri, result: ParseResult) {
        const diagnostics: vscode.Diagnostic[] = [];
        this.diagnostics.set(uri, diagnostics);
        const profile = getSelectedPublicProfile(this.context);
        if (!profile) {
            return;
        }
        try {
            const metadata = this.metadataService.getCsdl(profile);
            const relative = result.tree.odataRelativeUri;
            if (!metadata || !relative) {
                return;
            }
            const resourcePath = relative.resourcePath;
            const name = syntaxNodeToString(resourcePath).split(/[(/]/, 1)[0];
            const found = findRoot(metadata, name);
            if (found.kind === "missing") {
                diagnostics.push(new vscode.Diagnostic(
                    spanToRange(resourcePath.span),
                    `Resource path '${name}' not found in the entity container of profile ${profile.name}.`,
                    vscode.DiagnosticSeverity.Warning,
                ));
            } else if (found.kind === "found") {
                const type = resourceStructuredType(metadata, found.value);
                if (type) {
                    this.diagnoseQueryOptions(diagnostics, metadata, relative.queryOptions, type, found.value, profile);
                }
            }
        } catch {
            return;
        }
        this.diagnostics.set(uri, diagnostics);
    }

    private diagnoseQueryOptions(
        diagnostics: vscode.Diagnostic[], metadata: Csdl, queryOptions: unknown,
        type: StructuredType, resource: RootResource, profile: Profile,
    ) {
        const visit = (node: unknown): void => {
            if (!node || typeof node !== "object") {
                return;
            }
            if (Array.isArray(node)) {
                node.forEach(visit);
                return;
            }
            if ("type" in node && "span" in node && "value" in node) {
                const syntaxNode = node as SyntaxLocation;
                if (["selectItem", "firstMemberExpr", "propertyPath", "expandPath"].includes(syntaxNode.type)) {
                    const path = syntaxNodeToString(syntaxNode);
                    if (/^[\p{L}_][\p{L}\p{N}_.]*(?:\/[\p{L}_][\p{L}\p{N}_.]*)*$/u.test(path)) {
                        this.diagnoseMember(diagnostics, metadata, type, syntaxNode, path, resource, profile);
                        return;
                    }
                }
            }
            Object.values(node).forEach(visit);
        };
        visit(queryOptions);
    }

    private diagnoseMember(
        diagnostics: vscode.Diagnostic[], metadata: Csdl, type: StructuredType,
        node: SyntaxLocation, path: string, resource: RootResource, profile: Profile,
    ) {
        const segments = path.split("/");
        let current: StructuredType | undefined = type;
        for (let index = 0; index < segments.length; index++) {
            if (!current) {
                return;
            }
            const name = segments[index];
            const member = findMember(metadata, current, name);
            const last = index === segments.length - 1;
            if (!member || (node.type === "expandPath" && last && member.kind !== "navigation")) {
                let message: string;
                if (node.type === "expandPath") {
                    message = `'Resource ${resource.record.name} doesn't have a navigational property ${path} in profile ${profile.name}.`;
                } else if (index > 0) {
                    message = `Child '${name}' not found under parent '${segments[index - 1]}' in the resource ${resource.record.name} of profile ${profile.name}.`;
                } else if (segments.length > 1) {
                    message = `Parent '${name}' not found as a navigational property in the resource ${resource.record.name} of profile ${profile.name}.`;
                } else if (node.type === "selectItem") {
                    message = `Select item '${name}' not found in the resource ${resource.record.name} of profile ${profile.name}.`;
                } else {
                    message = `Property '${name}' not found in the resource ${resource.record.name} of profile ${profile.name}.`;
                }
                const range = spanToRange(node.span);
                const offset = segments.slice(0, index).reduce((length, part) => length + part.length + 1, 0);
                diagnostics.push(new vscode.Diagnostic(
                    index ? range.with(new vscode.Position(range.start.line, range.start.character + offset)) : range,
                    message, vscode.DiagnosticSeverity.Warning,
                ));
                return;
            }
            current = findType(metadata, memberType(member).qname);
        }
    }
}

function spanToRange(span: LocationRange): vscode.Range {
    return new vscode.Range(
        new vscode.Position(span.start.line - 1, span.start.column - 1),
        new vscode.Position(span.end.line - 1, span.end.column - 1),
    );
}

function syntaxNodeToString(node: SyntaxLocation): string {
    const text = (value: unknown): string => {
        if (typeof value === "string") {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(text).join("");
        }
        if (value && typeof value === "object" && "value" in value) {
            return text(value.value);
        }
        return "";
    };
    return text(node.value);
}
