import { odata } from "../contracts/types";
import * as v2 from "../definitions/odataV2.json";
import * as v4 from "../definitions/odataV4.json";

export const reference: odata.Reference = {
    v2: v2 as odata.Spec,
    v4: v4 as odata.Spec,
};

/** Lower case names of all functions built into the OData query language. */
export const BUILTIN_FUNCTIONS: ReadonlySet<string> = new Set(
    [
        ...reference.v2.functions.map((f) => f.name),
        ...reference.v4.functions.map((f) => f.name),
        // 4.01 and functions without an entry in the reference
        "matchespattern",
        "hassubset",
        "hassubsequence",
        "case",
        "totalseconds",
        "average",
        // $apply
        "rollup",
        "isdefined",
    ].map((name) => name.toLowerCase()),
);

/** System query options allowed inside the parentheses of an $expand item. */
export const EXPAND_OPTIONS = [
    "$filter",
    "$select",
    "$expand",
    "$orderby",
    "$top",
    "$skip",
    "$count",
    "$search",
    "$levels",
    "$compute",
    "$apply",
];

export const OPERATORS: Array<{ name: string; doc: string }> = [
    { name: "eq", doc: "Equal" },
    { name: "ne", doc: "Not equal" },
    { name: "gt", doc: "Greater than" },
    { name: "ge", doc: "Greater than or equal" },
    { name: "lt", doc: "Less than" },
    { name: "le", doc: "Less than or equal" },
    { name: "and", doc: "Logical and" },
    { name: "or", doc: "Logical or" },
    { name: "has", doc: "Has enumeration flags" },
    { name: "in", doc: "Is a member of a list" },
    { name: "add", doc: "Addition" },
    { name: "sub", doc: "Subtraction" },
    { name: "mul", doc: "Multiplication" },
    { name: "div", doc: "Division" },
    { name: "divby", doc: "Decimal division" },
    { name: "mod", doc: "Modulo" },
];

/**
 * Numbers of arguments each built-in function of the reference can be called with, by lower
 * case name.
 */
export const FUNCTION_ARITY: ReadonlyMap<string, ReadonlySet<number>> = (() => {
    const arity = new Map<string, Set<number>>();
    for (const func of [...reference.v2.functions, ...reference.v4.functions]) {
        const name = func.name.toLowerCase();
        // listed in the reference for documentation, but written as operators
        if (name === "any" || name === "all" || name === "mod") {
            continue;
        }
        if (!arity.has(name)) {
            arity.set(name, new Set());
        }
        arity.get(name)!.add(func.params?.length ?? 0);
    }
    return arity;
})();
