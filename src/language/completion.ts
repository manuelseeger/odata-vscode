import { DataModel } from "../odata2ts/data-model/DataModel";
import { DataTypes, PropertyModel } from "../odata2ts/data-model/DataTypeModel";
import { ODataUri, QueryOption, walk } from "../parser/ast";
import { parseDocument } from "../parser/parse";
import { allProperties, analyze, Analysis, Site, TypeRef } from "./analyze";

export type EntryKind =
    | "property"
    | "navigation"
    | "entitySet"
    | "singleton"
    | "function"
    | "action"
    | "type"
    | "variable";

export interface CompletionEntry {
    label: string;
    kind: EntryKind;
    /** The property behind a property or navigation entry. */
    property?: PropertyModel;
    detail?: string;
}

export interface CompletionContext {
    /** Whether the text before the cursor could be parsed at all. */
    parsed: boolean;
    /** The place a name is being written at, if the cursor is at one. */
    site?: Site;
    /** Names from the service metadata that fit at the cursor. */
    entries: CompletionEntry[];
    /** The cursor is where an operand starts: built-in functions fit. */
    functions: boolean;
    /** The cursor follows a complete operand: operators fit. */
    operators: boolean;
    /** The cursor follows a complete `$orderby` item. */
    direction: boolean;
    /** The cursor is where a query option starts, at top level or inside parentheses. */
    options?: "top" | "nested";
}

export interface LanguageOptions {
    model?: DataModel;
    baseUrl?: string;
}

const NONE: CompletionContext = {
    parsed: false,
    entries: [],
    functions: false,
    operators: false,
    direction: false,
};

/**
 * Work out what can be written at `offset`.
 *
 * Only the text before the cursor is looked at. It is parsed tolerantly and analyzed; the
 * site the analysis recorded as ending at the cursor tells what kind of name is expected
 * there and on which type.
 */
export function completionContext(
    text: string,
    offset: number,
    options: LanguageOptions = {},
): CompletionContext {
    const prefix = text.slice(0, offset);
    const result = parseDocument(prefix, { baseUrl: options.baseUrl });
    if (!result.tree) {
        return NONE;
    }
    const analysis = analyze(result.tree, prefix, options);
    const context: CompletionContext = { ...NONE, parsed: true };

    const site = last(
        analysis.sites.filter((s) => s.kind !== "nestedOption" && s.span.end.offset === offset),
    );
    if (site) {
        context.site = site;
        if (site.kind === "option") {
            context.options = site.nested ? "nested" : "top";
        } else {
            context.entries = entriesFor(site, options.model);
            context.functions = site.kind === "expression";
        }
        return context;
    }

    const trimmed = prefix.trimEnd();
    const previous = trimmed[trimmed.length - 1];
    if ((previous === "?" || previous === "&") && result.tree.query) {
        context.options = "top";
    } else if (
        (previous === "(" || previous === ";") &&
        analysis.sites.some((s) => s.kind === "nestedOption" && s.span.end.offset === offset)
    ) {
        context.options = "nested";
    } else if (trimmed.length < prefix.length) {
        // After a complete operand and whitespace, an operator can follow.
        const option = optionEndingAt(result.tree, trimmed.length);
        if (option && !option.junk && ["$filter", "$orderby", "$compute"].includes(option.name)) {
            context.operators = true;
            context.direction = option.name === "$orderby";
        }
    }
    return context;
}

/** The innermost site at `offset` that the analysis could resolve, e.g. for hovers. */
export function resolvedSiteAt(
    text: string,
    offset: number,
    options: LanguageOptions = {},
): Site | undefined {
    const result = parseDocument(text, { baseUrl: options.baseUrl });
    if (!result.tree) {
        return undefined;
    }
    const analysis: Analysis = analyze(result.tree, text, options);
    return last(
        analysis.sites.filter(
            (s) => s.resolved && s.span.start.offset <= offset && offset <= s.span.end.offset,
        ),
    );
}

function last<T>(items: T[]): T | undefined {
    return items[items.length - 1];
}

function optionEndingAt(tree: ODataUri, offset: number): QueryOption | undefined {
    let found: QueryOption | undefined;
    walk(tree, (node) => {
        if (node.type === "option" && node.kind === "system" && node.span.end.offset === offset) {
            // inner options are visited after the ones containing them
            found = node;
        }
    });
    return found;
}

function entriesFor(site: Site, model?: DataModel): CompletionEntry[] {
    if (!model) {
        return [];
    }
    switch (site.kind) {
        case "resource":
            return containerEntries(model);
        case "segment":
        case "member":
            return [...propertyEntries(site.type), ...operationEntries(site.type, model), ...castEntries(site.type)];
        case "select":
            return propertyEntries(site.type);
        case "expand":
            return propertyEntries(site.type).filter((e) => leadsToNavigation(e.property!, model));
        case "expression":
            return [
                ...propertyEntries(site.type),
                ...site.variables.map((label): CompletionEntry => ({ label, kind: "variable" })),
                ...site.aliases.map((label): CompletionEntry => ({ label, kind: "variable" })),
            ];
        default:
            return [];
    }
}

function containerEntries(model: DataModel): CompletionEntry[] {
    const container = model.getEntityContainer();
    if (!container) {
        return [];
    }
    const entries = (members: Record<string, { odataName: string }>, kind: EntryKind) =>
        Object.values(members).map((m): CompletionEntry => ({ label: m.odataName, kind }));
    return [
        ...entries(container.entitySets, "entitySet"),
        ...entries(container.singletons, "singleton"),
        ...entries(container.functions, "function"),
        ...entries(container.actions, "action"),
    ];
}

function propertyEntries(type: TypeRef): CompletionEntry[] {
    if (type.kind !== "structured") {
        return [];
    }
    return allProperties(type.type).map((property) => ({
        label: property.odataName,
        kind: property.dataType === DataTypes.ModelType ? "navigation" : "property",
        property,
        detail: property.odataType,
    }));
}

function operationEntries(type: TypeRef, model: DataModel): CompletionEntry[] {
    if (type.kind !== "structured") {
        return [];
    }
    return [type.type.fqName, ...type.type.baseClasses]
        .flatMap((fqName) => model.getAllEntityOperations(fqName))
        .map((operation) => ({
            label: operation.fqName,
            kind: operation.type === "Action" ? "action" : "function",
        }));
}

function castEntries(type: TypeRef): CompletionEntry[] {
    if (type.kind !== "structured") {
        return [];
    }
    return [...type.type.subtypes].map((label) => ({ label, kind: "type" }));
}

/** Navigation properties, and complex properties that contain some. */
function leadsToNavigation(property: PropertyModel, model: DataModel): boolean {
    if (property.dataType === DataTypes.ModelType) {
        return true;
    }
    if (property.dataType !== DataTypes.ComplexType) {
        return false;
    }
    const type = model.getComplexType(property.fqType);
    return !!type && allProperties(type).some((p) => p.dataType === DataTypes.ModelType);
}
