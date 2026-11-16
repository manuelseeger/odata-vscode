/**
 * Syntax tree of an OData request URL as produced by the grammar in ./odata.peggy.
 *
 * Every node carries its `span` in the source text. Nodes of type `missing` and `junk`, and
 * the flags `incomplete`, `missing` and `unterminated`, only occur in trees from a tolerant
 * parse of syntactically invalid input.
 */

export interface Position {
    /** 0-based offset in the source text. */
    offset: number;
    /** 1-based line. */
    line: number;
    /** 1-based column. */
    column: number;
}

export interface Span {
    start: Position;
    end: Position;
}

interface NodeBase {
    span: Span;
}

// --- URL ---------------------------------------------------------------------------------

export interface ODataUri extends NodeBase {
    type: "uri";
    /** Scheme and authority, e.g. `https://example.com`. */
    origin: Origin;
    /** All path segments after the origin, service root and resource path alike. */
    segments: Segment[];
    query?: QueryOption[];
    fragment?: string;
    junk?: Junk;
    /** The part of the URL up to the resource path. Set by `splitServiceRoot`. */
    serviceRoot: ServiceRoot;
    /** Path segments that address the resource. Set by `splitServiceRoot`. */
    resourcePath: Segment[];
}

export interface Origin extends NodeBase {
    type: "origin";
    text: string;
}

export interface ServiceRoot extends NodeBase {
    type: "serviceRoot";
    value: string;
}

export type SegmentKind =
    /** An identifier, optionally qualified: entity set, property, type cast, operation. */
    | "name"
    /** `$count`, `$metadata`, `$value`, `$ref`, `$batch`, `$crossjoin(..)`, ... */
    | "system"
    /** A literal, as in key-as-segment URLs: `/Orders/1`. */
    | "key"
    /** Anything else. Only valid within the service root. */
    | "raw"
    /** Nothing between two slashes, or after a trailing slash. */
    | "empty";

export interface Segment extends NodeBase {
    type: "segment";
    kind: SegmentKind;
    name: string;
    nameSpan?: Span;
    /** Key predicate or operation parameters. */
    args?: Arg[];
    /** Key predicate following operation parameters: `Func(p=1)(2)`. */
    key?: Arg[];
    /** The literal of a `key` segment. */
    value?: Literal;
}

export interface Arg extends NodeBase {
    type: "arg";
    name?: Name;
    /** Condition of a `condition:value` pair of the `case` function. */
    condition?: Expr;
    value: Expr;
}

export interface Name extends NodeBase {
    type: "name";
    name: string;
}

export interface Missing extends NodeBase {
    type: "missing";
}

export interface Junk extends NodeBase {
    type: "junk";
    text: string;
}

export interface Raw extends NodeBase {
    type: "raw";
    text: string;
}

// --- Query options -----------------------------------------------------------------------

export interface QueryOption extends NodeBase {
    type: "option";
    kind: "system" | "alias" | "custom";
    /** Lower case name including the `$` or `@` prefix: `$filter`, `@p1`, `api-version`. */
    name: string;
    nameSpan?: Span;
    /** Whether a system query option was written with its `$` prefix. */
    dollar?: boolean;
    value?: OptionValue;
    /** A system query option this grammar has no rule for. */
    unknown?: boolean;
    /** The option is still being typed. */
    incomplete?: boolean;
    /** Unparseable remainder of the option value. */
    junk?: Junk;
}

export type OptionValue = Expr | OrderBy | Select | Expand | Compute | Apply | Search | Raw;

export interface OrderBy extends NodeBase {
    type: "orderby";
    items: OrderByItem[];
}

export interface OrderByItem extends NodeBase {
    type: "orderbyItem";
    expr: Expr;
    direction?: "asc" | "desc";
}

export interface Select extends NodeBase {
    type: "select";
    items: SelectItem[];
}

export interface SelectItem extends NodeBase {
    type: "selectItem";
    path: Array<Name | Missing>;
    /** `*` or `Namespace.*` */
    star?: boolean;
    options?: QueryOption[];
    /** Parameter names selecting an overload of a bound operation: `NS.Func(a,b)`. */
    signature?: Name[];
}

export interface Expand extends NodeBase {
    type: "expand";
    items: ExpandItem[];
}

export interface ExpandItem extends NodeBase {
    type: "expandItem";
    path: Array<Name | Missing>;
    star?: boolean;
    suffix?: "$ref" | "$count" | "$value";
    options?: QueryOption[];
}

export interface Compute extends NodeBase {
    type: "compute";
    items: ComputeItem[];
}

export interface ComputeItem extends NodeBase {
    type: "computeItem";
    expr: Expr;
    alias?: Name;
}

export interface Search extends NodeBase {
    type: "search";
    expr: SearchExpr;
}

export type SearchExpr = SearchTerm | Binary | Unary | Paren;

export interface SearchTerm extends NodeBase {
    type: "searchTerm";
    text: string;
    phrase?: boolean;
}

export interface Apply extends NodeBase {
    type: "apply";
    transformations: Transformation[];
}

export interface Transformation extends NodeBase {
    type: "transformation";
    /** `aggregate`, `groupby`, `filter`, ... or the name of a custom function. */
    name: string;
    args?: Expr[];
    aggregates?: AggregateItem[];
    computes?: ComputeItem[];
    orderby?: OrderByItem[];
    search?: Search;
    /** Transformations applied to each group or joined collection. */
    then?: Apply;
    sequences?: Apply[];
    nested?: Transformation[];
    alias?: Name;
}

export interface AggregateItem extends NodeBase {
    type: "aggregateItem";
    expr?: Expr;
    method?: string;
    from?: Expr[];
    alias?: Name;
    /** Aggregation along a path: `Sales(Amount with sum as Total)`. */
    path?: Path;
    items?: AggregateItem[];
}

// --- Expressions -------------------------------------------------------------------------

export type Expr =
    | Binary
    | Unary
    | Paren
    | List
    | Literal
    | JsonArray
    | JsonObject
    | Alias
    | Path
    | Missing;

export type BinaryOperator =
    | "or"
    | "and"
    | "eq"
    | "ne"
    | "gt"
    | "ge"
    | "lt"
    | "le"
    | "add"
    | "sub"
    | "mul"
    | "div"
    | "divby"
    | "mod"
    | "has"
    | "in";

export interface Binary extends NodeBase {
    type: "binary";
    op: BinaryOperator;
    left: Expr;
    right: Expr;
}

export interface Unary extends NodeBase {
    type: "unary";
    op: "not" | "neg";
    operand: Expr;
}

export interface Paren extends NodeBase {
    type: "paren";
    expr: Expr;
}

export interface List extends NodeBase {
    type: "list";
    items: Expr[];
}

export type LiteralKind =
    | "null"
    | "boolean"
    | "int"
    | "decimal"
    | "double"
    | "string"
    | "date"
    | "dateTime"
    | "dateTimeOffset"
    | "timeOfDay"
    | "guid"
    | "enum"
    // prefixed literals: datetime'..', duration'..', binary'..', geography'..', ...
    | "datetime"
    | "datetimeoffset"
    | "time"
    | "timeofday"
    | "duration"
    | "binary"
    | "geography"
    | "geometry";

export interface Literal extends NodeBase {
    type: "literal";
    kind: LiteralKind;
    /** Source text of the literal including quotes and prefix. */
    text: string;
    /** Prefix of a prefixed literal, e.g. the enum type name. */
    typeName?: string;
    unterminated?: boolean;
    json?: boolean;
}

export interface JsonArray extends NodeBase {
    type: "array";
    items: Expr[];
}

export interface JsonObject extends NodeBase {
    type: "object";
    members: JsonMember[];
}

export interface JsonMember extends NodeBase {
    type: "jsonMember";
    key: string;
    value: Expr;
}

/** Parameter alias: `@p1`. */
export interface Alias extends NodeBase {
    type: "alias";
    name: string;
}

/** A member path, function call, or a combination: `Items/any(i: i/Quantity gt 1)`. */
export interface Path extends NodeBase {
    type: "path";
    segments: PathSegment[];
}

export type PathSegment = Member | Lambda | SystemMember | Annotation;

export interface Member extends NodeBase {
    type: "member";
    /** Property, range variable, function, or qualified type name. */
    name: string;
    nameSpan: Span;
    /** Function parameters or key predicate. Present, possibly empty, for `name(..)`. */
    args?: Arg[];
    /** Key predicate following function parameters. */
    key?: Arg[];
    /** Placeholder after a trailing slash. */
    missing?: boolean;
}

export interface Lambda extends NodeBase {
    type: "lambda";
    op: "any" | "all";
    variable?: Name;
    predicate?: Expr;
}

/** `$it`, `$this`, `$root`, `$count`, ... */
export interface SystemMember extends NodeBase {
    type: "system";
    name: string;
    /** Options of `$count(..)`. */
    options?: QueryOption[];
    /** Expression of a `$filter(..)` path segment. */
    filter?: Expr;
    key?: Arg[];
}

export interface Annotation extends NodeBase {
    type: "annotation";
    name: string;
}

export type Node =
    | ODataUri
    | Origin
    | ServiceRoot
    | Segment
    | Arg
    | Name
    | Missing
    | Junk
    | Raw
    | QueryOption
    | OrderBy
    | OrderByItem
    | Select
    | SelectItem
    | Expand
    | ExpandItem
    | Compute
    | ComputeItem
    | Search
    | SearchTerm
    | Apply
    | Transformation
    | AggregateItem
    | Expr
    | JsonMember
    | PathSegment;

/**
 * Visit `node` and all its descendants, parents first.
 */
export function walk(node: unknown, visit: (node: Node) => void): void {
    if (Array.isArray(node)) {
        for (const child of node) {
            walk(child, visit);
        }
    } else if (node !== null && typeof node === "object") {
        const record = node as Record<string, unknown>;
        if (typeof record.type === "string" && record.span) {
            visit(node as Node);
        }
        for (const key of Object.keys(record)) {
            // resourcePath holds a subset of the nodes in segments
            if (key !== "span" && key !== "nameSpan" && key !== "resourcePath") {
                walk(record[key], visit);
            }
        }
    }
}
