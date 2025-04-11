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

import { Profile } from "./contracts/types";
import { DataModel } from "./odata2ts/data-model/DataModel";

import { entityTypeFromResource, ResourceType } from "./metadata";
import { Disposable } from "./provider";
import { getConfig, globalStates } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";

/**
 * Provides diagnostic services for OData queries in a Visual Studio Code extension.
 *
 * This class is responsible for analyzing OData queries, identifying syntax errors,
 * and validating query components against a metadata model. It generates diagnostics
 * such as errors and warnings, which are displayed in the editor.
 *
 * Key responsibilities include:
 * - Handling syntax errors during query parsing.
 * - Validating parsed OData queries against a metadata model.
 * - Supporting metadata-aware diagnostics.
 *
 * Dependencies:
 * - `MetadataModelService`: Provides access to the metadata model for validation.
 * - `vscode.ExtensionContext`: Provides context for the extension, including global state.
 */
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

    /**
     * Add syntax errors from parsing a document's OData text to the diagnostics collection.
     *
     * @param uri vscode.Uri of the document to set the diagnostics for
     * @param error SyntaxError to set as a diagnostic
     */
    public handleSyntaxError: ParseSyntaxErrorHandler = (uri: vscode.Uri, error: SyntaxError) => {
        const diagnostics: vscode.Diagnostic[] = [];
        const range = spanToRange(error.location);
        const diagnostic = new vscode.Diagnostic(
            range,
            error.message,
            getConfig().strictParser
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning,
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

        const profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (!profile) {
            return;
        }
        const metadata = await this.metadataService.getModel(profile);
        if (!metadata) {
            return;
        }

        const resource = this.diagnoseResourcePath(diagnostics, metadata, result.tree, profile);
        if (resource) {
            this.diagnoseQueryOptions(diagnostics, metadata, result, resource, profile);
        }

        this.diagnostics.set(uri, diagnostics);
    };

    /**
     * Diagnose query options in an OData query and add relevant diagnostics.
     *
     * This method traverses the query options in the parsed OData query tree and validates them
     * against the metadata model. It identifies issues such as missing or invalid properties,
     * incorrect navigation paths, and unsupported query options. Diagnostics are added to the
     * provided diagnostics array for each issue found.
     *
     * @param diagnostics Array to store diagnostics for the document.
     * @param metadata Metadata model used for validation.
     * @param result Parsed OData query result.
     * @param resource Resource type derived from the OData query.
     * @param profile OData profile used for validation.
     * @returns void
     */
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

        const visit = (node: any, currentQueryOption: SyntaxLocation | null, visited: Set<any>) => {
            if (visited.has(node)) {
                return;
            }
            visited.add(node);

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
                        case "firstMemberExpr":
                            this.diagnoseFirstMemberExpr(
                                diagnostics,
                                syntaxNode,
                                currentQueryOption,
                                metadata,
                                result,
                                resource,
                                profile,
                                visited,
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
                        case "expandPath":
                            this.diagnoseExpandPath(
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
                        visit(child, currentQueryOption, visited);
                    }
                } else {
                    for (const key in node) {
                        if (node.hasOwnProperty(key)) {
                            visit(node[key], currentQueryOption, visited);
                        }
                    }
                }
            }
        };

        // Start traversal from the root queryOptions node
        const visited = new Set<any>();
        visit(queryOptions, null, visited);
    }

    private diagnoseFirstMemberExpr(
        diagnostics: vscode.Diagnostic[],
        syntaxNode: SyntaxLocation,
        currentQueryOption: SyntaxLocation | null,
        metadata: DataModel,
        result: ParseResult,
        resource: ResourceType,
        profile: Profile,
        visited: Set<any>,
    ) {
        const entity = entityTypeFromResource(resource, metadata);
        if (!entity) {
            return;
        }

        const range = spanToRange(syntaxNode.span);
        if (Array.isArray(syntaxNode.value)) {
            const flattened = syntaxNode.value.flat(Infinity);
            if (
                flattened.length === 3 &&
                typeof flattened[0] === "string" &&
                flattened[1] === "/"
            ) {
                const [parentName, , child] = flattened;
                let childName: string;

                if (typeof child === "object" && child !== null && "value" in child) {
                    // found a child syntaxNode. Mark it as visited so that later visits don't
                    // add another diagnostic for it.
                    visited.add(child);
                    childName = child.value as string;
                } else {
                    childName = child as string;
                }

                const parentProp = entity.props.find(
                    (p) => p.name === parentName && p.dataType === "ModelType",
                );
                if (!parentProp) {
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Parent '${parentName}' not found as a navigational property in the resource ${resource.name} of profile ${profile.name}.`,
                        vscode.DiagnosticSeverity.Warning,
                    );
                    diagnostics.push(diagnostic);
                    return;
                }

                const parentEntity = metadata.getEntityType(parentProp.fqType);
                if (!parentEntity) {
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Entity type for parent '${parentName}' could not be resolved in profile ${profile.name}.`,
                        vscode.DiagnosticSeverity.Warning,
                    );
                    diagnostics.push(diagnostic);
                    return;
                }

                const childProp = parentEntity.props.find((p) => p.name === childName);
                if (!childProp) {
                    const subRange = range.with(
                        new vscode.Position(
                            range.start.line,
                            range.start.character + parentName.length + 1,
                        ),
                    );
                    const diagnostic = new vscode.Diagnostic(
                        subRange,
                        `Child '${childName}' not found under parent '${parentName}' in the resource ${resource.name} of profile ${profile.name}.`,
                        vscode.DiagnosticSeverity.Warning,
                    );
                    diagnostics.push(diagnostic);
                }
            }
        } else {
            if (typeof syntaxNode.value === "string") {
                this.diagnosePropertyPath(
                    diagnostics,
                    syntaxNode,
                    currentQueryOption,
                    metadata,
                    result,
                    resource,
                    profile,
                );
            }
        }
    }

    private diagnoseExpandPath(
        diagnostics: vscode.Diagnostic[],
        syntaxNode: SyntaxLocation,
        currentQueryOption: SyntaxLocation | null,
        metadata: DataModel,
        result: ParseResult,
        resource: ResourceType,
        profile: Profile,
    ) {
        const entity = entityTypeFromResource(resource, metadata);
        if (!entity) {
            return;
        }
        let name;
        if (Array.isArray(syntaxNode.value)) {
            name = syntaxNode.value.find((n: any) => typeof n === "string");
        } else if (typeof syntaxNode.value === "string") {
            name = syntaxNode.value;
        } else {
            // Edge case; we can't meaningfully determine the intended expanse operation
            return;
        }
        const prop = entity.props
            .filter((p) => p.dataType === "ModelType")
            .find((p) => p.name === name);
        if (prop) {
            return;
        } else {
            const range = spanToRange(syntaxNode.span);
            const diagnostic = new vscode.Diagnostic(
                range,
                `'Resource ${resource.name} doesn't have a navigational property ${syntaxNodeToString(syntaxNode)} in profile ${profile.name}.`,
                vscode.DiagnosticSeverity.Warning,
            );
            diagnostics.push(diagnostic);
        }
    }

    private diagnosePropertyPath(
        diagnostics: vscode.Diagnostic[],
        syntaxNode: SyntaxLocation,
        currentQueryOption: SyntaxLocation | null,
        metadata: DataModel,
        result: ParseResult,
        resource: ResourceType,
        profile: Profile,
    ) {
        const entity = entityTypeFromResource(resource, metadata);
        if (!entity) {
            return;
        }
        const prop = entity.props.find((p) => p.name === syntaxNode.value);
        if (prop) {
            return;
        } else {
            const range = spanToRange(syntaxNode.span);
            const diagnostic = new vscode.Diagnostic(
                range,
                `Property '${syntaxNodeToString(syntaxNode)}' not found in the resource ${resource.name} of profile ${profile.name}.`,
                vscode.DiagnosticSeverity.Warning,
            );
            diagnostics.push(diagnostic);
        }
    }

    private diagnoseSelectItem(
        diagnostics: vscode.Diagnostic[],
        syntaxNode: SyntaxLocation,
        currentQueryOption: SyntaxLocation | null,
        metadata: DataModel,
        result: ParseResult,
        resource: ResourceType,
        profile: Profile,
    ) {
        const entity = entityTypeFromResource(resource, metadata);
        if (!entity) {
            return;
        }
        const range = spanToRange(syntaxNode.span);
        const nodeName = syntaxNode.value;
        if (typeof nodeName === "string" && nodeName.includes("/")) {
            const [parentName, childName] = nodeName.split("/");
            const parentProp = entity.props.find(
                (p) => p.name === parentName && p.dataType === "ModelType",
            );
            if (!parentProp) {
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Parent '${parentName}' not found as a navigational property in the resource ${resource.name} of profile ${profile.name}.`,
                    vscode.DiagnosticSeverity.Warning,
                );
                diagnostics.push(diagnostic);
                return;
            }

            const parentEntity = metadata.getEntityType(parentProp.fqType);
            if (!parentEntity) {
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Entity type for parent '${parentName}' could not be resolved in profile ${profile.name}.`,
                    vscode.DiagnosticSeverity.Warning,
                );
                diagnostics.push(diagnostic);
                return;
            }

            const childProp = parentEntity.props.find((p) => p.name === childName);
            if (!childProp) {
                const subRange = range.with(
                    new vscode.Position(
                        range.start.line,
                        range.start.character + parentName.length + 1,
                    ),
                );

                const diagnostic = new vscode.Diagnostic(
                    subRange,
                    `Child '${childName}' not found under parent '${parentName}' in the resource ${resource.name} of profile ${profile.name}.`,
                    vscode.DiagnosticSeverity.Warning,
                );
                diagnostics.push(diagnostic);
            }
        } else {
            const prop = entity.props.find((p) => p.name === nodeName);
            if (!prop) {
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Select item '${nodeName}' not found in the resource ${resource.name} of profile ${profile.name}.`,
                    vscode.DiagnosticSeverity.Warning,
                );
                diagnostics.push(diagnostic);
            }
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
            const range = spanToRange(resourcePath.span);
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

/**
 * Convert from a peggy LocationRange to a vscode.Range.
 *
 * LocationRange is 1-based, while vscode.Range is 0-based.
 *
 * @param span The LocationRange to convert.
 * @returns The corresponding vscode.Range.
 */
function spanToRange(span: LocationRange): vscode.Range {
    return new vscode.Range(
        new vscode.Position(span.start.line - 1, span.start.column - 1),
        new vscode.Position(span.end.line - 1, span.end.column - 1),
    );
}

function syntaxNodeToString(node: SyntaxLocation): string {
    if (typeof node.value === "string") {
        return node.value;
    } else if (Array.isArray(node.value)) {
        return node.value.flat(Infinity).join("");
    }
    return "";
}
