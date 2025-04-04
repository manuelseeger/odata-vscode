import * as vscode from "vscode";
import { DataModel } from "./odata2ts/data-model/DataModel";
import {
    EntityContainerModel,
    EntityType,
    ODataVersion,
} from "./odata2ts/data-model/DataTypeModel";
import { LocationRange } from "./parser/parser.js";
import { SyntaxParser } from "./parser/syntaxparser";
import { Profile } from "./profiles";
import { MetadataModelService } from "./services/MetadataModelService";
import { entityTypeFromResource, getPropertyDoc, ResourceType } from "./metadata";
import { combineODataUrl } from "./formatting";
import { Disposable } from "./provider";
import { globalStates, ODataMode } from "./configuration";

export class DefaultCompletionItemProvider
    extends Disposable
    implements vscode.CompletionItemProvider
{
    public _id: string = "DefaultCompletionItemProvider";
    public triggerCharacters = [".", "=", ",", "(", "/", "'"];
    constructor(
        private context: vscode.ExtensionContext,
        private readonly metadataService: MetadataModelService,
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

        const methods = odataMethods["V2"];
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
            const methodsV4 = odataMethods["V4"];
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
            const combinedOptions = [
                ...odataSystemQueryOptions["V2"],
                ...odataSystemQueryOptions["V4"],
            ];
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
        private metadataService: MetadataModelService,
        private syntaxParser: SyntaxParser,
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

const odataMethods = {
    V2: [
        {
            name: "substringof",
            doc: "Determines if a substring exists within a string.",
            params: [
                {
                    name: "substring",
                    type: "Edm.String",
                    description: "The substring to search for.",
                },
                { name: "string", type: "Edm.String", description: "The string to search within." },
            ],
        },
        {
            name: "startswith",
            doc: "Checks if a string starts with a specified substring.",
            params: [
                { name: "string", type: "Edm.String", description: "The string to check." },
                { name: "prefix", type: "Edm.String", description: "The prefix to look for." },
            ],
        },
        {
            name: "endswith",
            doc: "Checks if a string ends with a specified substring.",
            params: [
                { name: "string", type: "Edm.String", description: "The string to check." },
                { name: "suffix", type: "Edm.String", description: "The suffix to look for." },
            ],
        },
        {
            name: "indexof",
            doc: "Finds the zero-based index of a substring within a string.",
            params: [
                { name: "string", type: "Edm.String", description: "The string to search within." },
                { name: "substring", type: "Edm.String", description: "The substring to find." },
            ],
        },
        {
            name: "replace",
            doc: "Replaces occurrences of a substring with another substring.",
            params: [
                { name: "string", type: "Edm.String", description: "The original string." },
                { name: "find", type: "Edm.String", description: "The substring to replace." },
                { name: "replace", type: "Edm.String", description: "The replacement substring." },
            ],
        },
        {
            name: "tolower",
            doc: "Converts a string to lower-case.",
            params: [{ name: "string", type: "Edm.String", description: "The string to convert." }],
        },
        {
            name: "toupper",
            doc: "Converts a string to upper-case.",
            params: [{ name: "string", type: "Edm.String", description: "The string to convert." }],
        },
        {
            name: "trim",
            doc: "Removes trailing and leading whitespace from a string.",
            params: [{ name: "string", type: "Edm.String", description: "The string to trim." }],
        },
        {
            name: "substring",
            doc: "Extracts a substring from a string starting at a specified index.",
            params: [
                { name: "string", type: "Edm.String", description: "The original string." },
                { name: "start", type: "Edm.Int32", description: "The zero-based starting index." },
                { name: "length", type: "Edm.Int32", description: "The length of the substring." },
            ],
        },
        {
            name: "concat",
            doc: "Concatenates two or more strings together.",
            params: [
                { name: "string1", type: "Edm.String", description: "The first string." },
                { name: "string2", type: "Edm.String", description: "The second string." },
            ],
        },
        { name: "round", doc: "Rounds a number to the nearest integer." },
        { name: "floor", doc: "Rounds a number down to the nearest integer." },
        { name: "ceiling", doc: "Rounds a number up to the nearest integer." },
        { name: "year", doc: "Extracts the year component from a date." },
        { name: "month", doc: "Extracts the month component from a date." },
        { name: "day", doc: "Extracts the day component from a date." },
        { name: "hour", doc: "Extracts the hour component from a time." },
        { name: "minute", doc: "Extracts the minute component from a time." },
        { name: "second", doc: "Extracts the second component from a time." },
        { name: "isof", doc: "Checks if a value is of a specified type." },
        { name: "cast", doc: "Casts a value to a specified type." },
    ],
    V4: [
        {
            name: "contains",
            doc: "Determines if a string contains a specified substring.",
            params: [
                { name: "string", type: "Edm.String", description: "The string to search within." },
                {
                    name: "substring",
                    type: "Edm.String",
                    description: "The substring to search for.",
                },
            ],
        },
        {
            name: "length",
            doc: "Gets the length of a string.",
            params: [{ name: "string", type: "Edm.String", description: "The string to measure." }],
        },
        {
            name: "abs",
            doc: "Returns the absolute value of a number.",
            params: [
                { name: "number", type: "Edm.Decimal", description: "The number to process." },
            ],
        },
        {
            name: "mod",
            doc: "Calculates the remainder after division of two numbers.",
            params: [
                { name: "dividend", type: "Edm.Decimal", description: "The number to be divided." },
                { name: "divisor", type: "Edm.Decimal", description: "The number to divide by." },
            ],
        },
        {
            name: "fractionalseconds",
            doc: "Extracts fractional seconds from a time value.",
            params: [{ name: "time", type: "Edm.DateTimeOffset", description: "The time value." }],
        },
        { name: "date", doc: "Extracts the date portion from a datetime value." },
        { name: "time", doc: "Extracts the time portion from a datetime value." },
        {
            name: "totaloffsetminutes",
            doc: "Calculates the total minutes of the time zone offset.",
        },
        { name: "now", doc: "Returns the current datetime." },
        { name: "mindatetime", doc: "Returns the minimum possible datetime." },
        { name: "maxdatetime", doc: "Returns the maximum possible datetime." },
        { name: "any", doc: "Checks if any element of a collection meets a condition." },
        { name: "all", doc: "Determines if all elements of a collection meet a condition." },
        { name: "geo.distance", doc: "Calculates the distance between two geo points." },
        { name: "geo.length", doc: "Calculates the total length of a geometry." },
        { name: "geo.intersects", doc: "Determines if two geometries intersect." },
    ],
};

const odataSystemQueryOptions = {
    V2: [
        { name: "$select", doc: "Selects a specific set of properties to return." },
        { name: "$filter", doc: "Filters the resources based on provided criteria." },
        { name: "$orderby", doc: "Sorts resources based on one or more properties." },
        { name: "$top", doc: "Limits the number of resources returned." },
        { name: "$skip", doc: "Skips a specified number of resources." },
        { name: "$expand", doc: "Includes related entities inline with the primary resource." },
        { name: "$format", doc: "Specifies the media type for the response (json, xml)." },
        { name: "$inlinecount", doc: "Returns the total count of matching resources." },
    ],
    V4: [
        {
            name: "$apply",
            doc: "Applies aggregations or transformations to the resource collection.",
        },
        { name: "$search", doc: "Filters resources based on a free-text search expression." },
        { name: "$count", doc: "Returns the count of matching resources." },
        { name: "$skiptoken", doc: "Specifies a continuation token for paginating results." },
        { name: "$compute", doc: "Adds computed properties based on specified expressions." },
        { name: "$schemaversion", doc: "Indicates the version of the schema for the service." },
    ],
};
