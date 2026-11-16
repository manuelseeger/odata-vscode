import { Junk, Node, ODataUri, Position, Segment, Span, walk } from "./ast";
import { Expectation, parse as peggyParse, SyntaxError } from "./parser.js";

export { SyntaxError };

export interface ParseOptions {
    /**
     * Recover from syntax errors where possible and return a best-effort tree containing
     * `missing` and `junk` nodes instead of throwing.
     */
    tolerant?: boolean;
    /** Information used to tell the service root from the resource path. */
    serviceRoot?: ServiceRootHint;
}

export interface ServiceRootHint {
    /** Service root URL of the endpoint the query is written against. */
    baseUrl?: string;
    /** Whether a name is an entity set, singleton or operation import of the service. */
    isContainerMember?: (name: string) => boolean;
}

export interface DocumentParseResult {
    /** Syntax tree. From a tolerant parse if `error` is set. */
    tree?: ODataUri;
    /** The first syntax error in the text, if any. */
    error?: SyntaxError;
}

/**
 * Parse an OData request URL.
 *
 * @throws SyntaxError if the text is not a valid OData URL, unless `options.tolerant` is set
 * and the parser could recover.
 */
export function parseODataUri(text: string, options: ParseOptions = {}): ODataUri {
    let tree: ODataUri;
    try {
        tree = peggyParse(text, { tolerant: options.tolerant === true }) as ODataUri;
    } catch (error) {
        throw error instanceof SyntaxError ? withReadableMessage(error) : error;
    }
    splitServiceRoot(tree, text, options.serviceRoot);
    return tree;
}

/**
 * Parse the text of a document. Never throws on syntax errors: reports the first error and,
 * where the parser can recover, still returns a tree to work with.
 */
export function parseDocument(text: string, hint?: ServiceRootHint): DocumentParseResult {
    try {
        return { tree: parseODataUri(text, { serviceRoot: hint }) };
    } catch (error) {
        if (!(error instanceof SyntaxError)) {
            throw error;
        }
        try {
            return { tree: parseODataUri(text, { tolerant: true, serviceRoot: hint }), error };
        } catch {
            return { error };
        }
    }
}

/** Nodes a tolerant parse inserted where it had to recover from a syntax error. */
export function recoveryNodes(tree: ODataUri): Node[] {
    const nodes: Node[] = [];
    walk(tree, (node) => {
        if (
            node.type === "missing" ||
            node.type === "junk" ||
            (node.type === "option" && node.incomplete) ||
            (node.type === "member" && node.missing) ||
            (node.type === "literal" && node.unterminated)
        ) {
            nodes.push(node);
        }
    });
    return nodes;
}

// --- Service root ------------------------------------------------------------------------

/** System segments that address a resource of their own, directly below the service root. */
const ROOT_SYSTEM_SEGMENTS = new Set(["$metadata", "$batch", "$crossjoin", "$all", "$entity"]);

/**
 * Decide where the service root ends and the resource path begins, and set `serviceRoot`
 * and `resourcePath` on the tree.
 *
 * A URL does not tell which of its path segments belong to the service root. In order of
 * preference this uses the base URL of the endpoint, the names in its entity container, and
 * finally the shape of the segments: the resource path starts at the first segment that can
 * only be part of a resource path (key predicate, parameters, `$`-segment), or else is the
 * last segment.
 */
export function splitServiceRoot(tree: ODataUri, text: string, hint: ServiceRootHint = {}): void {
    const segments = tree.segments;
    let start = fromBaseUrl(tree, text, hint.baseUrl);
    if (start === undefined && hint.isContainerMember) {
        const index = segments.findIndex(
            (s) =>
                (s.kind === "name" && hint.isContainerMember!(s.name)) ||
                (s.kind === "system" && ROOT_SYSTEM_SEGMENTS.has(s.name)),
        );
        start = index >= 0 ? index : undefined;
    }
    if (start === undefined) {
        start = fromShape(segments);
    }

    tree.resourcePath = segments.slice(start).filter((s) => s.kind !== "empty");

    const first = tree.resourcePath[0];
    const pathEnd = segments.length ? segments[segments.length - 1].span.end : tree.origin.span.end;
    const end = first ? first.span.start : pathEnd;
    const value = text.slice(tree.span.start.offset, end.offset).trimEnd();
    tree.serviceRoot = {
        type: "serviceRoot",
        value,
        span: {
            start: tree.span.start,
            end: positionAt(text, tree.span.start.offset + value.length, tree.span.start),
        },
    };
}

function fromBaseUrl(tree: ODataUri, text: string, baseUrl?: string): number | undefined {
    if (!baseUrl) {
        return undefined;
    }
    const base = baseUrl
        .trim()
        .replace(/[?#].*$/, "")
        .replace(/\/+$/, "")
        .toLowerCase();
    let prefix = tree.origin.text.toLowerCase();
    if (prefix === base) {
        return 0;
    }
    for (let i = 0; i < tree.segments.length; i++) {
        const segment = tree.segments[i];
        prefix += "/" + text.slice(segment.span.start.offset, segment.span.end.offset).toLowerCase();
        if (prefix === base) {
            return i + 1;
        }
        if (!base.startsWith(prefix)) {
            break;
        }
    }
    return undefined;
}

function fromShape(segments: Segment[]): number {
    const index = segments.findIndex((s) => s.kind === "system" || s.kind === "key" || s.args);
    if (index < 0) {
        // No telling segment: the last one is the resource, unless the URL ends in a slash.
        const last = segments.length - 1;
        return last >= 0 && segments[last].kind !== "empty" ? last : segments.length;
    }
    const segment = segments[index];
    if (segment.args || ROOT_SYSTEM_SEGMENTS.has(segment.name)) {
        return index;
    }
    // $count, $value, $ref, a key segment, ... follow the resource they apply to.
    return Math.max(index - 1, 0);
}

/** Position of `offset`, computed by scanning forward from a known earlier position. */
export function positionAt(text: string, offset: number, from?: Position): Position {
    let line = from?.line ?? 1;
    let column = from?.column ?? 1;
    for (let i = from?.offset ?? 0; i < offset && i < text.length; i++) {
        if (text[i] === "\n") {
            line++;
            column = 1;
        } else {
            column++;
        }
    }
    return { offset, line, column };
}

export function spanText(text: string, span: Span): string {
    return text.slice(span.start.offset, span.end.offset);
}

export function isJunk(node: Node): node is Junk {
    return node.type === "junk";
}

// --- Error messages ----------------------------------------------------------------------

const OPERATORS = new Set([
    "or",
    "and",
    "eq",
    "ne",
    "gt",
    "ge",
    "lt",
    "le",
    "add",
    "sub",
    "mul",
    "div",
    "divby",
    "mod",
    "has",
    "in",
]);

/**
 * Peggy lists every token that could have continued the input, which for expressions runs
 * to dozens of entries. Condense that into something a person can read.
 */
function withReadableMessage(error: SyntaxError): SyntaxError {
    const expected = new Set<string>();
    for (const e of error.expected ?? []) {
        const description = describe(e);
        if (description) {
            expected.add(description);
        }
    }
    // Whitespace is allowed nearly everywhere and never what is actually missing.
    if (expected.size > 1) {
        expected.delete("whitespace");
    }
    if (expected.size === 0) {
        return error;
    }
    const list = [...expected].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const expectation =
        list.length === 1
            ? list[0]
            : `${list.slice(0, -1).join(", ")}${list.length > 2 ? "," : ""} or ${list[list.length - 1]}`;
    const found =
        error.found === null || error.found === undefined
            ? "end of input"
            : JSON.stringify(error.found);
    const message = `Expected ${expectation} but ${found} found.`;
    return new SyntaxError(message, error.expected, error.found ?? null, error.location);
}

function describe(expectation: Expectation): string | undefined {
    switch (expectation.type) {
        case "literal":
            if (expectation.text.startsWith("%")) {
                // percent-encoded alternative of a delimiter that is listed anyway
                return undefined;
            }
            if (OPERATORS.has(expectation.text.toLowerCase())) {
                return "operator";
            }
            return JSON.stringify(expectation.text);
        case "other":
            return expectation.description;
        case "end":
            return "end of input";
        case "any":
            return "any character";
        case "class":
            return undefined;
    }
}

function rank(description: string): number {
    if (description === "end of input") {
        return 2;
    }
    return description.startsWith('"') ? 0 : 1;
}
