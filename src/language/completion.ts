import { ODataUri, QueryOption, walk } from "../parser/ast";
import { parseDocument } from "../parser/parse";
import {
    boundFunctions,
    Csdl,
    derivedTypes,
    findType,
    formatTypeRef,
    Member,
    members,
    memberType,
    roots,
} from "../schema";
import { analyze, Analysis, Site, TypeRef } from "./analyze";

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
    member?: Member;
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
    csdl?: Csdl;
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
            context.entries = entriesFor(site, options.csdl);
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

function entriesFor(site: Site, csdl?: Csdl): CompletionEntry[] {
    if (!csdl) {
        return [];
    }
    switch (site.kind) {
        case "resource":
            return containerEntries(csdl);
        case "segment":
        case "member":
            return [...propertyEntries(site.type, csdl), ...operationEntries(site.type, csdl), ...castEntries(site.type, csdl)];
        case "select":
            return propertyEntries(site.type, csdl);
        case "expand":
            return propertyEntries(site.type, csdl).filter((entry) => leadsToNavigation(entry.member!, csdl));
        case "expression":
            return [
                ...propertyEntries(site.type, csdl),
                ...site.variables.map((label): CompletionEntry => ({ label, kind: "variable" })),
                ...site.aliases.map((label): CompletionEntry => ({ label, kind: "variable" })),
            ];
        default:
            return [];
    }
}

function containerEntries(csdl: Csdl): CompletionEntry[] {
    return roots(csdl).map((root): CompletionEntry => ({
        label: root.record.name,
        kind:
            root.kind === "set"
                ? "entitySet"
                : root.kind === "singleton"
                  ? "singleton"
                  : root.kind === "actionImport"
                    ? "action"
                    : "function",
    }));
}

function propertyEntries(type: TypeRef, csdl: Csdl): CompletionEntry[] {
    if (type.kind !== "structured") {
        return [];
    }
    return members(csdl, type.type).map((member) => ({
        label: member.record.name,
        kind: member.kind === "navigation" ? "navigation" : "property",
        member,
        detail: formatTypeRef(memberType(member)),
    }));
}

function operationEntries(type: TypeRef, csdl: Csdl): CompletionEntry[] {
    if (type.kind !== "structured") {
        return [];
    }
    return boundFunctions(csdl, type.type).map((operation) => ({
        label: operation.qname,
        kind: "function",
    }));
}

function castEntries(type: TypeRef, csdl: Csdl): CompletionEntry[] {
    if (type.kind !== "structured") {
        return [];
    }
    return derivedTypes(csdl, type.type.qname).map((label) => ({ label, kind: "type" as const }));
}

/** Navigation properties, and complex properties that contain some. */
function leadsToNavigation(member: Member, csdl: Csdl): boolean {
    if (member.kind === "navigation") {
        return true;
    }
    const type = findType(csdl, member.record.type.qname);
    return !!type && type.kind === "complex" && members(csdl, type).some((item) => item.kind === "navigation");
}
