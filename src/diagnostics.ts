import * as vscode from "vscode";
import {
    SyntaxError,
    LocationRange,
    ParsedTree,
    ParseSuccessHandler,
    ParseResult,
    ParseSyntaxErrorHandler,
    SyntaxLocation,
} from "./parser/syntaxparser";
import { MetadataModelService } from "./services/MetadataModelService";
import { Profile } from "./profiles";
import { DataModel } from "./odata2ts/data-model/DataModel";
import {
    ActionImportType,
    EntitySetType,
    EntityType,
    FunctionImportType,
    SingletonType,
} from "./odata2ts/data-model/DataTypeModel";
import { entityTypeFromResource, ResourceType } from "./metadata";

function rangeFromPeggyRange(span: LocationRange): vscode.Range {
    return new vscode.Range(
        new vscode.Position(span.start.line - 1, span.start.column - 1),
        new vscode.Position(span.end.line - 1, span.end.column - 1),
    );
}

export class ODataDiagnosticProvider {
    constructor(
        private diagnostics: vscode.DiagnosticCollection,
        private metadataService: MetadataModelService,
        private context: vscode.ExtensionContext,
    ) {}

    /**
     * Add syntax errors from parsing a document's OData text to the diagnostics collection.
     *
     * @param uri vscode.Uri of the document to set the diagnostics for
     * @param error SyntaxError to set as a diagnostic
     */
    public handleSyntaxError: ParseSyntaxErrorHandler = (uri: vscode.Uri, error: SyntaxError) => {
        const diagnostics: vscode.Diagnostic[] = [];
        const range = rangeFromPeggyRange(error.location);
        const diagnostic = new vscode.Diagnostic(
            range,
            error.message,
            vscode.DiagnosticSeverity.Error,
        );
        diagnostics.push(diagnostic);
        this.diagnostics.set(uri, diagnostics);
    };

    /**
     * Add metadata aware warning diagnostics to the diagnostics collection.
     *
     * This method is called when the OData query is successfully parsed.
     * It checks identified parts of the OData query against the metadata model and
     * adds warnings to the diagnostics collection if the parts can't be found in
     * the metadata model.
     *
     * @param uri vscode.Uri of the document to set the diagnostics for
     * @param result ODataUri object representing the parsed OData query
     */
    public handleParseSucess: ParseSuccessHandler = async (
        uri: vscode.Uri,
        result: ParseResult,
    ) => {
        const diagnostics: vscode.Diagnostic[] = [];
        this.diagnostics.set(uri, diagnostics);

        const document = await vscode.workspace.openTextDocument(uri);
        const text = document.getText();

        const profile = this.context.globalState.get<Profile>("selectedProfile");
        const metadata = await this.metadataService.getModel(profile!);
        if (!metadata) {
            return;
        }

        const resource = this.diagnoseResourcePath(diagnostics, metadata, result.tree, profile!);
        if (resource) {
            this.diagnoseQueryOptions(diagnostics, metadata, result, resource, profile!);
        }

        this.diagnostics.set(uri, diagnostics);
    };

    private diagnoseQueryOptions(
        diagnostics: vscode.Diagnostic[],
        metadata: DataModel,
        result: ParseResult,
        resource: ResourceType,
        profile: Profile,
    ) {
        const queryOptions = result.tree.odataRelativeUri!.queryOptions;
        if (!queryOptions) {
            return;
        }

        // Recursive function to traverse the tree
        const visit = (node: any, currentQueryOption: SyntaxLocation | null) => {
            if (node && typeof node === "object") {
                // Check if the current node is a syntaxnode
                if (node.type && node.span && node.value) {
                    const syntaxNode = node as SyntaxLocation;
                    switch (syntaxNode.type) {
                        case "selectItem":
                            this.diagnoseSelectItem(
                                diagnostics,
                                syntaxNode,
                                currentQueryOption,
                                metadata,
                                result,
                                resource,
                                profile,
                            );
                            break;
                        case "propertyPath":
                            this.diagnosePropertyPath(
                                diagnostics,
                                syntaxNode,
                                currentQueryOption,
                                metadata,
                                result,
                                resource,
                                profile,
                            );
                            break;
                        case "systemQueryOption":
                            currentQueryOption = syntaxNode;
                            break;
                        default:
                            break;
                    }
                }

                // Recursively traverse child nodes
                if (Array.isArray(node)) {
                    for (const child of node) {
                        visit(child, currentQueryOption);
                    }
                } else {
                    for (const key in node) {
                        if (node.hasOwnProperty(key)) {
                            visit(node[key], currentQueryOption);
                        }
                    }
                }
            }
        };

        // Start traversal from the root queryOptions node
        visit(queryOptions, null);
    }

    diagnosePropertyPath(
        diagnostics: vscode.Diagnostic[],
        node: SyntaxLocation,
        parent: SyntaxLocation | null,
        metadata: DataModel,
        result: ParseResult,
        resource: ResourceType,
        profile: Profile,
    ) {
        const entity = entityTypeFromResource(resource, metadata);
        if (!entity) {
            return;
        }
        const prop = entity.props.find((p) => p.name === node.value);
        if (prop) {
            return;
        } else {
            const range = rangeFromPeggyRange(node.span);
            const diagnostic = new vscode.Diagnostic(
                range,
                `Property '${node.value}' not found in the resource ${resource.name} of profile ${profile.name}.`,
                vscode.DiagnosticSeverity.Warning,
            );
            diagnostics.push(diagnostic);
        }
    }

    private diagnoseSelectItem(
        diagnostics: vscode.Diagnostic[],
        node: SyntaxLocation,
        parent: SyntaxLocation | null,
        metadata: DataModel,
        result: ParseResult,
        resource: ResourceType,
        profile: Profile,
    ) {
        const entity = entityTypeFromResource(resource, metadata);
        if (!entity) {
            return;
        }
        const prop = entity.props.find((p) => p.name === node.value);
        if (prop) {
            return;
        } else {
            const range = rangeFromPeggyRange(node.span);
            const diagnostic = new vscode.Diagnostic(
                range,
                `Select item '${node.value}' not found in the resource ${resource.name} of profile ${profile.name}.`,
                vscode.DiagnosticSeverity.Warning,
            );
            diagnostics.push(diagnostic);
        }
    }

    private diagnoseResourcePath(
        diagnostics: vscode.Diagnostic[],
        metadata: DataModel,
        tree: ParsedTree,
        profile: Profile,
    ): ResourceType | undefined {
        const resourcePath = tree.odataRelativeUri!.resourcePath;
        const resourcePathName = resourcePath.value;
        const entityContainer = metadata.getEntityContainer();
        if (!entityContainer) {
            return;
        }

        const members = [
            ...Object.values(entityContainer.entitySets),
            ...Object.values(entityContainer.singletons),
            ...Object.values(entityContainer.functions),
            ...Object.values(entityContainer.actions),
        ];

        const matchingMember = members.find((member) => member.name === resourcePathName);
        if (!matchingMember) {
            const range = rangeFromPeggyRange(resourcePath.span);
            const diagnostic = new vscode.Diagnostic(
                range,
                `Resource path '${resourcePathName}' not found in the entity container of profile ${profile.name}.`,
                vscode.DiagnosticSeverity.Warning,
            );
            diagnostics.push(diagnostic);
        }
        return matchingMember;
    }
}
