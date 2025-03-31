import * as vscode from "vscode";
import { DataModel } from "./odata2ts/data-model/DataModel";
import { EntityContainerModel, ODataVersion } from "./odata2ts/data-model/DataTypeModel";
import { LocationRange } from "./parser/parser.js";
import { ParseResult, SyntaxParser } from "./parser/syntaxparser";
import { Profile } from "./profiles";
import { MetadataModelService } from "./services/MetadataModelService";

import { entityTypeFromResource, getPropertyDoc, ResourceType } from "./metadata";

const odataMethods = {
    V2: [
        { name: "substringof", doc: "Determines if a substring exists within a string." },
        { name: "startswith", doc: "Checks if a string starts with a specified substring." },
        { name: "endswith", doc: "Checks if a string ends with a specified substring." },
        { name: "indexof", doc: "Finds the zero-based index of a substring within a string." },
        { name: "replace", doc: "Replaces occurrences of a substring with another substring." },
        { name: "tolower", doc: "Converts a string to lower-case." },
        { name: "toupper", doc: "Converts a string to upper-case." },
        { name: "trim", doc: "Removes trailing and leading whitespace from a string." },
        {
            name: "substring",
            doc: "Extracts a substring from a string starting at a specified index.",
        },
        { name: "concat", doc: "Concatenates two or more strings together." },
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
        { name: "contains", doc: "Determines if a string contains a specified substring." },
        { name: "length", doc: "Gets the length of a string." },
        { name: "abs", doc: "Returns the absolute value of a number." },
        { name: "mod", doc: "Calculates the remainder after division of two numbers." },
        { name: "fractionalseconds", doc: "Extracts fractional seconds from a time value." },
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

export class ODataDefaultCompletionItemProvider implements vscode.CompletionItemProvider {
    public triggerCharacters = [".", "=", ",", "(", "/", "'"];
    constructor(private readonly metadataService: MetadataModelService) {}

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
        const profile = vscode.workspace
            .getConfiguration("odata")
            .get("selectedProfile") as Profile;

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

export class ODataSystemQueryCompletionItemProvider implements vscode.CompletionItemProvider {
    triggerCharacters = ["$"];
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

export class ODataMetadataCompletionItemProvider implements vscode.CompletionItemProvider {
    constructor(
        private metadataService: MetadataModelService,
        private syntaxParser: SyntaxParser,
        private context: vscode.ExtensionContext,
    ) {}

    triggerCharacters = [".", "=", ",", "(", "/", "'"];
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.CompletionList<vscode.CompletionItem> | null | undefined> {
        const profile = this.context.globalState.get<Profile>("selectedProfile");

        const model = await this.metadataService.getModel(profile!);

        if (!model) {
            return null;
        }

        const text = document.getText();

        const result = this.syntaxParser.process(document);
        if (!result) {
            return null;
        }

        const completions: vscode.CompletionItem[] = [];

        for (const location of result.locations) {
            if (!this.isInSpan(position, location.span)) {
                continue;
            }
            switch (location.type) {
                case "resourcePath":
                    this.completeResourcePath(completions, model, result);
                    break;
                case "selectItem":
                    this.completeSelectItem(completions, model, result);
                    break;
                case "propertyPath":
                    this.completePropertyPath(completions, model, result);
                    break;
                case "systemQueryOption":
                    if (Array.isArray(location.value) && location.value.includes("$expand")) {
                        this.completeExpandItem(completions, model, result);
                    }
            }
        }
        return new vscode.CompletionList(completions);
    }

    private completePropertyPath(
        completions: vscode.CompletionItem[],
        model: DataModel,
        result: ParseResult,
    ) {
        const resource = this.getResourceType(result, model);
        const entity = entityTypeFromResource(resource!, model);
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
    private completeSelectItem = this.completePropertyPath;

    private completeExpandItem(
        completions: vscode.CompletionItem[],
        model: DataModel,
        result: ParseResult,
    ) {
        const resource = this.getResourceType(result, model);
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

    private getResourceType(result: ParseResult, model: DataModel): ResourceType | undefined {
        const resourcePath = result.tree.odataRelativeUri?.resourcePath.value;
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

    private completeResourcePath(
        completions: vscode.CompletionItem[],
        model: DataModel,
        parseResult: ParseResult,
    ) {
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

    private isInSpan(position: vscode.Position, span: LocationRange): boolean {
        if (span.start.line - 1 === position.line && span.end.line - 1 === position.line) {
            return (
                span.start.column - 1 <= position.character &&
                span.end.column - 1 >= position.character
            );
        }
        return false;
    }
}
