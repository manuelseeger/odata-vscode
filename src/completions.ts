import * as vscode from "vscode";
import { Profile } from "./contracts/types";
import { DataModel } from "./odata2ts/data-model/DataModel";
import {
    EntityContainerModel,
    EntityType,
    ODataVersion,
    PropertyModel,
} from "./odata2ts/data-model/DataTypeModel";
import { LocationRange } from "./parser/parser.js";

import { globalStates, ODataMode } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { entityTypeFromResource, ResourceType } from "./metadata";
import { Disposable } from "./provider";
import { combineODataUrl } from "./util";
import * as odataV2 from "./odataV2.json";
import * as odataV4 from "./odataV4.json";

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
        const profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);

        if (!profile || !(await this.metadataService.hasModel(profile))) {
            return new vscode.CompletionList(methodCompletions);
        }
        const model = await this.metadataService.getModel(profile);

        if (!model) {
            return new vscode.CompletionList(methodCompletions);
        }

        const version = model.getODataVersion();

        if (version === ODataVersion.V4) {
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
            // Merge system query options from both V2 and V4 into a single list for completion.
            // We don't differentiate between V2 and V4 for system query options as many services
            // mix and match them between versions.
            const combinedOptions = [...odataV2.systemQueryOptions, ...odataV4.systemQueryOptions];
            const completionItems = combinedOptions.map((option) => {
                const completion = new vscode.CompletionItem(
                    option.name,
                    vscode.CompletionItemKind.Keyword,
                );
                // Remove the leading "$" for insertText and filterText
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
        const profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);

        const model = await this.metadataService.getModel(profile!);
        if (!model) {
            return null;
        }

        const resourceType = this.getResourceEntityTypeFromDocument(document, model);
        if (!resourceType) {
            this.completeResourcePath(completions, model);
            return new vscode.CompletionList(completions);
        }

        // Traverse backward to find the nearest system query option
        const queryOption = this.findNearestSystemQueryOption(document, position);
        if (!queryOption) {
            return null;
        }

        switch (queryOption) {
            case "$select":
            case "$filter":
                this.completePropertyPath(completions, position, document, model, resourceType);
                break;
            case "$expand":
                this.completeExpandItem(completions, model, resourceType);
                break;
            default:
                this.completePropertyPath(completions, position, document, model, resourceType);
        }

        return new vscode.CompletionList(completions);
    }

    private completePropertyPath(
        completions: vscode.CompletionItem[],
        position: vscode.Position,
        document: vscode.TextDocument,
        model: DataModel,
        resourceType: ResourceType,
    ) {
        let entity: EntityType | undefined;

        const lastSegment = this.getLastSegment(document, position);

        if (lastSegment) {
            const navProperty = lastSegment;
            const parentEntity = entityTypeFromResource(resourceType, model);
            const navEntityProp = parentEntity!.props.find(
                (prop) => prop.name === navProperty && prop.dataType === "ModelType",
            );

            if (navEntityProp) {
                entity = model.getEntityType(navEntityProp.fqType);
            }
        } else {
            entity = entityTypeFromResource(resourceType, model);
        }

        if (entity) {
            this.completePropertiesForEntity(completions, entity.fqName, model);
        }
    }

    private completePropertiesForEntity(
        completions: vscode.CompletionItem[],
        entityTypeName: string,
        model: DataModel,
    ) {
        const entity = model.getEntityType(entityTypeName);
        if (!entity) {
            return;
        }
        for (const property of entity.props) {
            const item = new vscode.CompletionItem(
                property.name,
                vscode.CompletionItemKind.Property,
            );
            item.documentation = getPropertyDoc(property);
            completions.push(item);
        }
    }

    private completeExpandItem(
        completions: vscode.CompletionItem[],
        model: DataModel,
        resource: ResourceType,
    ) {
        const entity = entityTypeFromResource(resource!, model);
        if (!entity) {
            return;
        }
        const expandProps = entity.props.filter((p) => p.dataType === "ModelType");
        for (const property of expandProps) {
            const item = new vscode.CompletionItem(
                property.name,
                vscode.CompletionItemKind.Property,
            );
            item.documentation = getPropertyDoc(property);
            completions.push(item);
        }
    }

    private completeResourcePath(completions: vscode.CompletionItem[], model: DataModel) {
        const container: EntityContainerModel = model.getEntityContainer();
        // add all container items to completions
        if (container) {
            const containerItems = [
                ...Object.values(container.entitySets),
                ...Object.values(container.singletons),
                ...Object.values(container.functions),
                ...Object.values(container.actions),
            ];
            for (const containerItem of containerItems) {
                const item = new vscode.CompletionItem(
                    containerItem.name,
                    vscode.CompletionItemKind.Class,
                );
                completions.push(item);
            }
        }
    }

    /**
     * Finds the nearest system query option (e.g., $select, $filter) in the document
     * by traversing backward from the given position.
     *
     * @param document The text document being edited.
     * @param position The position in the document to start searching from.
     * @returns The nearest system query option as a string, or null if none is found.
     */
    private findNearestSystemQueryOption(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): string | null {
        let line = position.line;
        let character = position.character;

        while (line >= 0) {
            const lineText = document.lineAt(line).text;

            // Check text up to the current character for the current line
            const textToCheck =
                line === position.line ? lineText.substring(0, character) : lineText;

            // Match system query options using a regex and return the last one found
            const match = textToCheck.match(/\$[a-zA-Z]+/g);
            if (match) {
                return match[match.length - 1];
            }

            line--;
            character = line >= 0 ? document.lineAt(line).text.length : 0;
        }

        return null;
    }

    private getLastSegment(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): string | undefined {
        const precedingText = document.getText(
            new vscode.Range(new vscode.Position(position.line, 0), position),
        );

        // Match the last segment preceding a slash and optionally a word
        const match = precedingText.match(/\b\w+(?=\s*\/\s*\w*\s*$)/);
        return match ? match[0] : undefined;
    }

    private getResourceEntityTypeFromDocument(
        document: vscode.TextDocument,
        model: DataModel,
    ): ResourceType | undefined {
        const regex = /(?<=\/)(\w+)(?=\s*[\/?]|$)/g;
        let resourcePath: string | undefined;

        const lineText = combineODataUrl(document.getText());

        const matches = lineText.match(regex);
        if (matches) {
            resourcePath = matches[matches.length - 1];
        }

        if (!resourcePath) {
            return undefined;
        }

        const container: EntityContainerModel = model.getEntityContainer();
        const containerItems = [
            ...Object.values(container.entitySets),
            ...Object.values(container.singletons),
            ...Object.values(container.functions),
            ...Object.values(container.actions),
        ];
        const item = containerItems.find((i) => i.name === resourcePath);
        return item;
    }
}

function isInSpan(position: vscode.Position, span: LocationRange): boolean {
    if (span.start.line - 1 === position.line && span.end.line - 1 === position.line) {
        return (
            span.start.column - 1 <= position.character && span.end.column - 1 >= position.character
        );
    }
    return false;
}

export function getPropertyDoc(property: PropertyModel): vscode.MarkdownString {
    return new vscode.MarkdownString(
        `**Name**: ${property.odataName}\n\n**Type**: ${property.odataType}`,
    );
}
