import { DataModel } from "../odata2ts/data-model/DataModel";
import {
    ComplexType,
    DataTypes,
    EntityType,
    EnumType,
    OperationType,
    PropertyModel,
} from "../odata2ts/data-model/DataTypeModel";
import {
    AggregateItem,
    Apply,
    Arg,
    ExpandItem,
    Expr,
    Missing,
    Name,
    ODataUri,
    Path,
    QueryOption,
    SelectItem,
    Span,
    Transformation,
} from "../parser/ast";
import { splitServiceRoot } from "../parser/parse";
import { BUILTIN_FUNCTIONS, FUNCTION_ARITY } from "./reference";

/**
 * Semantic analysis of a parsed OData URL against the metadata of a service.
 *
 * Walks the tree once, resolving every name against the type it applies to: the resource
 * path through the entity container, query options against the addressed type, nested
 * `$expand` and `$select` options against the type of the expanded property, lambda
 * predicates with their range variables, and so on. The walk yields
 * - diagnostics for names that do not exist, and
 * - a `Site` for each position where a name is or could be written, recording the type its
 *   candidates come from. Completions and hovers are answered from those sites.
 *
 * Without a model all types are unknown: no names are checked, but sites are still found.
 */

export type TypeRef =
    | { kind: "structured"; type: EntityType | ComplexType; collection: boolean }
    | { kind: "enum"; type: EnumType; collection: boolean }
    | { kind: "primitive"; name: string; collection: boolean }
    /** Not known, or not checked. Names below an unknown type are never reported. */
    | { kind: "unknown" };

const UNKNOWN: TypeRef = { kind: "unknown" };

export interface SemanticDiagnostic {
    span: Span;
    message: string;
    code:
        | "unknown-resource"
        | "unknown-property"
        | "unknown-navigation"
        | "not-a-navigation"
        | "unknown-function"
        | "unknown-option"
        | "unknown-key"
        | "duplicate-option"
        | "argument-count"
        | "not-a-collection";
}

export type SiteKind =
    /** First segment of the resource path: entity sets, singletons, operation imports. */
    | "resource"
    /** Further segment of the resource path. */
    | "segment"
    /** Start of an operand in an expression: properties, variables, functions. */
    | "expression"
    /** Segment of a member path after a slash. */
    | "member"
    /** Segment of a `$select` item. */
    | "select"
    /** Segment of an `$expand` item. */
    | "expand"
    /** Name of a query option. */
    | "option"
    /** Position inside the parentheses of an `$expand` or `$select` item. */
    | "nestedOption";

export type Resolved =
    | { kind: "property"; property: PropertyModel; owner: EntityType | ComplexType }
    | { kind: "containerMember"; name: string }
    | { kind: "type"; type: EntityType | ComplexType | EnumType }
    | { kind: "operation"; operation: OperationType }
    | { kind: "variable"; name: string; type: TypeRef }
    | { kind: "function"; name: string };

export interface Site {
    kind: SiteKind;
    /** Span of the name. Empty where a name is missing. */
    span: Span;
    /** The type whose members can be written here. */
    type: TypeRef;
    /** Lambda range variables in scope. */
    variables: string[];
    /** Names introduced by `$compute` and `$apply`. */
    aliases: string[];
    /** Whether an option site is inside `$expand` or `$select` parentheses. */
    nested?: boolean;
    resolved?: Resolved;
}

export interface AnalyzeOptions {
    model?: DataModel;
    /** Service root of the endpoint, to tell it from the resource path. */
    baseUrl?: string;
    /** Name of the endpoint profile, for messages. */
    profileName?: string;
}

export interface Analysis {
    diagnostics: SemanticDiagnostic[];
    sites: Site[];
    /** Type addressed by the resource path. */
    resource: TypeRef;
}

interface Scope {
    /** Type that unqualified names resolve against. */
    type: TypeRef;
    /** Type of `$it`. */
    it: TypeRef;
    variables: Map<string, TypeRef>;
    aliases: Set<string>;
}

export function analyze(tree: ODataUri, text: string, options: AnalyzeOptions = {}): Analysis {
    const analyzer = new Analyzer(options);
    return analyzer.run(tree, text);
}

export function allProperties(type: EntityType | ComplexType): PropertyModel[] {
    return [...type.baseProps, ...type.props];
}

/** Type of a single element: what a path continues on after a key or inside a lambda. */
function element(type: TypeRef): TypeRef {
    return type.kind === "unknown" ? type : { ...type, collection: false };
}

function typeName(type: TypeRef): string {
    switch (type.kind) {
        case "structured":
        case "enum":
            return type.type.fqName;
        case "primitive":
            return type.name;
        case "unknown":
            return "unknown";
    }
}

class Analyzer {
    private readonly model?: DataModel;
    private readonly diagnostics: SemanticDiagnostic[] = [];
    private readonly sites: Site[] = [];

    constructor(private readonly options: AnalyzeOptions) {
        this.model = options.model;
    }

    run(tree: ODataUri, text: string): Analysis {
        if (this.model || this.options.baseUrl) {
            splitServiceRoot(tree, text, {
                baseUrl: this.options.baseUrl,
                isContainerMember: this.model
                    ? (name) => this.containerMember(name) !== undefined
                    : undefined,
            });
        }
        const resource = this.bindResourcePath(tree);
        if (tree.query) {
            this.bindOptions(tree.query, element(resource), false);
        }
        return { diagnostics: this.diagnostics, sites: this.sites, resource };
    }

    // --- Model access ----------------------------------------------------------------------

    private containerMember(name: string): TypeRef | undefined {
        const model = this.model!;
        const container = model.getEntityContainer();
        if (!container) {
            return undefined;
        }
        const byName = <T extends { odataName: string }>(members: Record<string, T>) =>
            Object.values(members).find((m) => m.odataName === name);

        const entitySet = byName(container.entitySets);
        if (entitySet) {
            return { kind: "structured", type: entitySet.entityType, collection: true };
        }
        const singleton = byName(container.singletons);
        if (singleton) {
            return { kind: "structured", type: singleton.entityType, collection: false };
        }
        const func = byName(container.functions);
        if (func) {
            const operation = model.getUnboundOperationType(func.operation);
            if (operation?.returnType) {
                return this.propertyType(operation.returnType);
            }
            const set = Object.values(container.entitySets).find(
                (s) => s.odataName === func.entitySet,
            );
            return set ? { kind: "structured", type: set.entityType, collection: true } : UNKNOWN;
        }
        if (byName(container.actions)) {
            return UNKNOWN;
        }
        return undefined;
    }

    private propertyType(property: PropertyModel): TypeRef {
        const collection = property.isCollection;
        if (property.dataType === DataTypes.PrimitiveType) {
            return { kind: "primitive", name: property.odataType, collection };
        }
        return this.namedType(property.fqType, collection) ?? UNKNOWN;
    }

    private namedType(name: string, collection: boolean): TypeRef | undefined {
        const type = this.model?.getModel(name);
        if (!type) {
            return undefined;
        }
        return type.dataType === DataTypes.EnumType
            ? { kind: "enum", type: type as EnumType, collection }
            : { kind: "structured", type: type as EntityType | ComplexType, collection };
    }

    private boundOperation(
        type: Extract<TypeRef, { kind: "structured" }>,
        name: string,
    ): OperationType | undefined {
        const model = this.model!;
        const unqualified = name.slice(name.lastIndexOf(".") + 1);
        for (const fqName of [type.type.fqName, ...type.type.baseClasses]) {
            // Whether a path addresses one entity or many is not always known here (a key may
            // be given as a segment), so operations bound to either are accepted.
            const operation = model.getAllEntityOperations(fqName).find(
                (o) =>
                    o.fqName === name ||
                    o.odataName === name ||
                    o.fqName.slice(o.fqName.lastIndexOf(".") + 1) === unqualified,
            );
            if (operation) {
                return operation;
            }
        }
        return undefined;
    }

    /**
     * Resolve `name` as a member of `parent`: a property, a type cast or a bound operation.
     * Returns undefined if the type is known and has no such member.
     */
    private member(
        parent: TypeRef,
        name: string,
        aliases?: Set<string>,
    ): { type: TypeRef; resolved?: Resolved } | undefined {
        if (parent.kind !== "structured" || !this.model) {
            return { type: UNKNOWN };
        }
        const property = allProperties(parent.type).find((p) => p.odataName === name);
        if (property) {
            return {
                type: this.propertyType(property),
                resolved: { kind: "property", property, owner: parent.type },
            };
        }
        if (name.includes(".")) {
            const cast = this.namedType(name, parent.collection);
            if (cast) {
                return {
                    type: cast,
                    resolved:
                        cast.kind === "unknown" || cast.kind === "primitive"
                            ? undefined
                            : { kind: "type", type: cast.type },
                };
            }
        }
        const operation = this.boundOperation(parent, name);
        if (operation) {
            return {
                type: operation.returnType ? this.propertyType(operation.returnType) : UNKNOWN,
                resolved: { kind: "operation", operation },
            };
        }
        if (aliases?.has(name) || parent.type.open) {
            return { type: UNKNOWN };
        }
        return undefined;
    }

    // --- Bookkeeping -----------------------------------------------------------------------

    private report(code: SemanticDiagnostic["code"], span: Span, message: string) {
        this.diagnostics.push({ code, span, message });
    }

    private site(
        kind: SiteKind,
        span: Span,
        type: TypeRef,
        scope?: Scope,
        extra?: Partial<Site>,
    ): Site {
        const site: Site = {
            kind,
            span,
            type,
            variables: scope ? [...scope.variables.keys()] : [],
            aliases: scope ? [...scope.aliases] : [],
            ...extra,
        };
        this.sites.push(site);
        return site;
    }

    // --- Resource path ---------------------------------------------------------------------

    private bindResourcePath(tree: ODataUri): TypeRef {
        const rootScope: Scope = {
            type: UNKNOWN,
            it: UNKNOWN,
            variables: new Map(),
            aliases: new Set(),
        };
        let current: TypeRef = UNKNOWN;
        const path = tree.resourcePath;

        path.forEach((segment, index) => {
            const first = index === 0;
            for (const arg of [...(segment.args ?? []), ...(segment.key ?? [])]) {
                this.bindExpr(arg.value, rootScope);
            }
            if (segment.kind !== "name") {
                // $count, $value and $ref keep addressing the same type for query options;
                // after anything else we do not know.
                if (!["$count", "$value", "$ref", "$each"].includes(segment.name)) {
                    current = UNKNOWN;
                }
                return;
            }
            const span = segment.nameSpan ?? segment.span;
            const site = this.site(first ? "resource" : "segment", span, first ? UNKNOWN : current);
            if (!this.model) {
                return;
            }
            if (first) {
                const member = this.containerMember(segment.name);
                if (!member) {
                    this.report(
                        "unknown-resource",
                        span,
                        `Resource path '${segment.name}' not found in the entity container${this.profileSuffix()}.`,
                    );
                    current = UNKNOWN;
                    return;
                }
                site.resolved = { kind: "containerMember", name: segment.name };
                current = member;
            } else {
                const member = this.member(current, segment.name);
                if (!member) {
                    this.report(
                        "unknown-property",
                        span,
                        `'${segment.name}' not found on type '${typeName(current)}'.`,
                    );
                    current = UNKNOWN;
                    return;
                }
                site.resolved = member.resolved;
                current = member.type;
            }
            const isOperation =
                site.resolved?.kind === "operation" ||
                (first && current.kind === "structured" && !this.isEntitySetOrSingleton(segment.name));
            const key = isOperation ? segment.key : (segment.args ?? segment.key);
            if (key) {
                this.checkKey(key, current);
                current = element(current);
            }
        });

        // A trailing slash: the next segment is yet to be written.
        const last = tree.segments[tree.segments.length - 1];
        if (last?.kind === "empty") {
            this.site(path.length ? "segment" : "resource", last.span, path.length ? current : UNKNOWN);
        }
        return current;
    }

    private isEntitySetOrSingleton(name: string): boolean {
        const container = this.model!.getEntityContainer();
        return [...Object.values(container.entitySets), ...Object.values(container.singletons)].some(
            (m) => m.odataName === name,
        );
    }

    private checkKey(key: Arg[], type: TypeRef) {
        if (type.kind !== "structured" || !("keyNames" in type.type)) {
            return;
        }
        const keys = (type.type as EntityType).keys?.map((k) => k.odataName) ?? [];
        if (!keys.length) {
            return;
        }
        for (const arg of key) {
            if (arg.name && !keys.includes(arg.name.name)) {
                this.report(
                    "unknown-key",
                    arg.name.span,
                    `'${arg.name.name}' is not a key property of type '${typeName(type)}'.`,
                );
            }
        }
    }

    private profileSuffix(): string {
        return this.options.profileName ? ` of profile ${this.options.profileName}` : "";
    }

    // --- Query options ---------------------------------------------------------------------

    private bindOptions(options: QueryOption[], type: TypeRef, nested: boolean) {
        const scope: Scope = {
            type,
            it: type,
            variables: new Map(),
            aliases: this.collectAliases(options),
        };
        const seen = new Set<string>();
        for (const option of options) {
            if (option.kind !== "system") {
                continue;
            }
            if (seen.has(option.name) && !option.incomplete) {
                this.report(
                    "duplicate-option",
                    option.nameSpan ?? option.span,
                    `System query option '${option.name}' is given more than once.`,
                );
            }
            seen.add(option.name);
            if (option.nameSpan) {
                this.site("option", option.nameSpan, type, scope, { nested });
            }
            if (option.unknown && !option.incomplete) {
                this.report(
                    "unknown-option",
                    option.nameSpan ?? option.span,
                    `Unknown system query option '${option.name}'.`,
                );
            }
            const value = option.value;
            if (!value) {
                continue;
            }
            switch (value.type) {
                case "raw":
                case "search":
                    break;
                case "orderby":
                    value.items.forEach((item) => this.bindExpr(item.expr, scope));
                    break;
                case "compute":
                    value.items.forEach((item) => this.bindExpr(item.expr, scope));
                    break;
                case "select":
                    value.items.forEach((item) => this.bindItem(item, "select", scope));
                    break;
                case "expand":
                    value.items.forEach((item) => this.bindItem(item, "expand", scope));
                    break;
                case "apply":
                    this.bindApply(value, scope);
                    break;
                default:
                    this.bindExpr(value, scope);
            }
        }
    }

    /** Names that `$compute` and `$apply` add to the result. */
    private collectAliases(options: QueryOption[]): Set<string> {
        const aliases = new Set<string>();
        const add = (name?: Name) => name && aliases.add(name.name);
        const fromAggregate = (item: AggregateItem) => {
            add(item.alias);
            item.items?.forEach(fromAggregate);
        };
        const fromApply = (apply: Apply) => {
            for (const t of apply.transformations) {
                add(t.alias);
                t.aggregates?.forEach(fromAggregate);
                t.computes?.forEach((c) => add(c.alias));
                t.sequences?.forEach(fromApply);
                if (t.then) {
                    fromApply(t.then);
                }
            }
        };
        for (const option of options) {
            if (option.value?.type === "compute") {
                option.value.items.forEach((item) => add(item.alias));
            } else if (option.value?.type === "apply") {
                fromApply(option.value);
            }
        }
        return aliases;
    }

    private bindItem(item: SelectItem | ExpandItem, kind: "select" | "expand", scope: Scope) {
        let current = scope.type;
        let last: Resolved | undefined;
        let failed = false;

        for (const name of item.path as Array<Name | Missing>) {
            const site = this.site(kind, name.span, element(current), scope);
            if (name.type === "missing" || failed) {
                continue;
            }
            if (name.name.startsWith("@")) {
                // annotation
                current = UNKNOWN;
                continue;
            }
            const member = this.member(element(current), name.name, scope.aliases);
            if (!member) {
                failed = true;
                current = UNKNOWN;
                if (kind === "expand") {
                    this.report(
                        "unknown-navigation",
                        name.span,
                        `Navigation property '${name.name}' not found on type '${typeName(site.type)}'.`,
                    );
                } else {
                    this.report(
                        "unknown-property",
                        name.span,
                        `Property '${name.name}' not found on type '${typeName(site.type)}'.`,
                    );
                }
                continue;
            }
            site.resolved = member.resolved;
            last = member.resolved;
            current = member.type;
        }

        if (
            kind === "expand" &&
            !failed &&
            last?.kind === "property" &&
            last.property.dataType !== DataTypes.ModelType
        ) {
            const name = item.path[item.path.length - 1];
            this.report(
                "not-a-navigation",
                name.span,
                `'${last.property.odataName}' is not a navigation property of type '${last.owner.fqName}'.`,
            );
        }

        if (item.options) {
            // Remember the position for completing option names inside the parentheses.
            this.site("nestedOption", { start: item.span.end, end: item.span.end }, element(current), scope, {
                nested: true,
            });
            this.bindOptions(item.options, element(current), true);
        }
    }

    // --- $apply ----------------------------------------------------------------------------

    private bindApply(apply: Apply, scope: Scope) {
        apply.transformations.forEach((t) => this.bindTransformation(t, scope));
    }

    private bindTransformation(t: Transformation, scope: Scope) {
        const inner = (type: TypeRef): Scope => ({ ...scope, type: element(type), it: element(type) });
        switch (t.name) {
            case "expand":
            case "join":
            case "outerjoin":
            case "nest":
            case "addnested": {
                const target = t.args?.[0] ? this.bindExpr(t.args[0], scope) : UNKNOWN;
                t.nested?.forEach((n) => this.bindTransformation(n, inner(target)));
                if (t.then) {
                    this.bindApply(t.then, inner(target));
                }
                break;
            }
            default:
                t.args?.forEach((arg) => this.bindExpr(arg, scope));
                t.aggregates?.forEach((item) => this.bindAggregate(item, scope));
                t.computes?.forEach((item) => this.bindExpr(item.expr, scope));
                t.orderby?.forEach((item) => this.bindExpr(item.expr, scope));
                t.sequences?.forEach((sequence) => this.bindApply(sequence, scope));
                if (t.then) {
                    this.bindApply(t.then, scope);
                }
        }
    }

    private bindAggregate(item: AggregateItem, scope: Scope) {
        if (item.path) {
            const target = this.bindPath(item.path, scope);
            const inner = { ...scope, type: element(target), it: element(target) };
            item.items?.forEach((nested) => this.bindAggregate(nested, inner));
            return;
        }
        if (item.expr) {
            if (!item.method && item.expr.type === "path" && item.expr.segments.length === 1) {
                // a custom aggregate defined by the service, not a property
                return;
            }
            this.bindExpr(item.expr, scope);
        }
        item.from?.forEach((from) => this.bindExpr(from, scope));
    }

    // --- Expressions -----------------------------------------------------------------------

    private bindExpr(expr: Expr, scope: Scope): TypeRef {
        switch (expr.type) {
            case "binary":
                this.bindExpr(expr.left, scope);
                this.bindExpr(expr.right, scope);
                return UNKNOWN;
            case "unary":
                this.bindExpr(expr.operand, scope);
                return UNKNOWN;
            case "paren":
                return this.bindExpr(expr.expr, scope);
            case "list":
            case "array":
                expr.items.forEach((item) => this.bindExpr(item, scope));
                return UNKNOWN;
            case "object":
                expr.members.forEach((member) => this.bindExpr(member.value, scope));
                return UNKNOWN;
            case "path":
                return this.bindPath(expr, scope);
            case "missing":
                this.site("expression", expr.span, scope.type, scope);
                return UNKNOWN;
            default:
                return UNKNOWN;
        }
    }

    private bindArgs(args: Arg[] | undefined, scope: Scope) {
        for (const arg of args ?? []) {
            if (arg.condition) {
                this.bindExpr(arg.condition, scope);
            }
            this.bindExpr(arg.value, scope);
        }
    }

    private bindPath(path: Path, scope: Scope): TypeRef {
        let current: TypeRef = UNKNOWN;
        // After $root the next segment is looked up in the entity container.
        let atRoot = false;

        path.segments.forEach((segment, index) => {
            const first = index === 0;
            switch (segment.type) {
                case "annotation":
                    current = UNKNOWN;
                    return;

                case "system":
                    if (segment.name === "$it") {
                        current = scope.it;
                    } else if (segment.name === "$this") {
                        current = scope.type;
                    } else if (segment.name === "$root") {
                        current = UNKNOWN;
                        atRoot = true;
                    } else if (segment.name === "$count") {
                        if (segment.options) {
                            this.bindOptions(segment.options, element(current), true);
                        }
                        current = { kind: "primitive", name: "Edm.Int64", collection: false };
                    } else if (segment.name === "$filter") {
                        if (segment.filter) {
                            const type = element(current);
                            this.bindExpr(segment.filter, { ...scope, type, it: type });
                        }
                        if (segment.key) {
                            current = element(current);
                        }
                    } else {
                        current = UNKNOWN;
                    }
                    return;

                case "lambda": {
                    if (!first && current.kind !== "unknown" && !current.collection) {
                        this.report(
                            "not-a-collection",
                            segment.span,
                            `'${segment.op}' can only be applied to a collection.`,
                        );
                    }
                    if (segment.predicate) {
                        const variables = new Map(scope.variables);
                        if (segment.variable) {
                            variables.set(segment.variable.name, element(current));
                        }
                        this.bindExpr(segment.predicate, { ...scope, variables });
                    }
                    current = { kind: "primitive", name: "Edm.Boolean", collection: false };
                    return;
                }

                case "member": {
                    if (atRoot) {
                        atRoot = false;
                        this.bindArgs(segment.args, scope);
                        const site = this.site("resource", segment.nameSpan, UNKNOWN, scope);
                        if (!this.model) {
                            return;
                        }
                        const member = this.containerMember(segment.name);
                        if (!member) {
                            this.report(
                                "unknown-resource",
                                segment.nameSpan,
                                `Resource path '${segment.name}' not found in the entity container${this.profileSuffix()}.`,
                            );
                            current = UNKNOWN;
                            return;
                        }
                        site.resolved = { kind: "containerMember", name: segment.name };
                        current = segment.args ? element(member) : member;
                        return;
                    }
                    current = first
                        ? this.bindFirstMember(segment, scope)
                        : this.bindNextMember(segment, current, scope);
                    return;
                }
            }
        });
        return current;
    }

    private bindFirstMember(segment: Extract<Path["segments"][number], { type: "member" }>, scope: Scope): TypeRef {
        const site = this.site("expression", segment.nameSpan, scope.type, scope);
        const name = segment.name;

        if (segment.args) {
            return this.bindCall(segment, site, scope);
        }
        const variable = scope.variables.get(name);
        if (variable) {
            site.resolved = { kind: "variable", name, type: variable };
            return variable;
        }
        const member = this.member(scope.type, name, scope.aliases);
        if (member) {
            site.resolved = member.resolved;
            return member.type;
        }
        if (name.includes(".") && (this.model?.getModel(name) || /^Edm\./i.test(name))) {
            // a type name, as argument of cast() or isof()
            return UNKNOWN;
        }
        this.report(
            "unknown-property",
            segment.nameSpan,
            `Property '${name}' not found on type '${typeName(scope.type)}'.`,
        );
        return UNKNOWN;
    }

    private bindCall(
        segment: Extract<Path["segments"][number], { type: "member" }>,
        site: Site,
        scope: Scope,
    ): TypeRef {
        const name = segment.name;
        this.bindArgs(segment.args, scope);
        this.bindArgs(segment.key, scope);

        if (BUILTIN_FUNCTIONS.has(name.toLowerCase())) {
            site.resolved = { kind: "function", name };
            const arity = FUNCTION_ARITY.get(name.toLowerCase());
            const args = segment.args ?? [];
            // not while an argument is still being typed
            if (arity && !arity.has(args.length) && !args.some((a) => a.value.type === "missing")) {
                const counts = [...arity].sort((a, b) => a - b).join(" or ");
                this.report(
                    "argument-count",
                    segment.span,
                    `Function '${name}' takes ${counts} argument${counts === "1" ? "" : "s"}, got ${args.length}.`,
                );
            }
            return UNKNOWN;
        }
        if (!this.model) {
            return UNKNOWN;
        }
        const unbound = this.model.getUnboundOperationType(name);
        if (unbound) {
            site.resolved = { kind: "operation", operation: unbound };
            return unbound.returnType ? this.propertyType(unbound.returnType) : UNKNOWN;
        }
        if (scope.type.kind === "structured") {
            const bound = this.boundOperation(scope.type, name);
            if (bound) {
                site.resolved = { kind: "operation", operation: bound };
                return bound.returnType ? this.propertyType(bound.returnType) : UNKNOWN;
            }
        }
        if (name.includes(".") && this.model.getModel(name)) {
            return UNKNOWN;
        }
        this.report("unknown-function", segment.nameSpan, `Unknown function '${name}'.`);
        return UNKNOWN;
    }

    private bindNextMember(
        segment: Extract<Path["segments"][number], { type: "member" }>,
        parent: TypeRef,
        scope: Scope,
    ): TypeRef {
        const site = this.site("member", segment.nameSpan, element(parent), scope);
        this.bindArgs(segment.args, scope);
        this.bindArgs(segment.key, scope);
        if (segment.missing) {
            return UNKNOWN;
        }
        // A cast applies to the collection as a whole, anything else to its elements.
        const member = this.member(segment.name.includes(".") ? parent : element(parent), segment.name);
        if (!member) {
            this.report(
                "unknown-property",
                segment.nameSpan,
                `Property '${segment.name}' not found on type '${typeName(parent)}'.`,
            );
            return UNKNOWN;
        }
        site.resolved = member.resolved;
        const isOperation = member.resolved?.kind === "operation";
        return (isOperation ? segment.key : (segment.args ?? segment.key)) ? element(member.type) : member.type;
    }
}
