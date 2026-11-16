import { Tokenizer } from "../services/Tokenizer";
import { Csdl, EntitySet, Restrictions, SchemaSummary, TypeRef } from "./model";
import { parseCsdl } from "./parse";

export { parseCsdl } from "./parse";
export * from "./model";
export * from "./query";

export function prune(csdl: Csdl): Csdl {
    const types = new Map(csdl.types.map((type) => [type.qname, type]));
    const derived = new Map<string, string[]>();
    for (const type of csdl.types) {
        if (type.base) {
            derived.set(type.base, [...(derived.get(type.base) || []), type.qname]);
        }
    }
    const reachable = new Set<string>();
    const pending = [...csdl.entitySets, ...csdl.singletons].map((set) => set.type);
    const functions = new Set(csdl.functions.filter((fn) => !fn.bound));
    function addFunctionTypes(): void {
        for (const fn of functions) {
            pending.push(...fn.params.map((param) => param.type.qname));
            if (fn.returns) {
                pending.push(fn.returns.type.qname);
            }
        }
    }
    addFunctionTypes();
    while (pending.length) {
        const name = pending.pop()!;
        if (reachable.has(name)) {
            continue;
        }
        reachable.add(name);
        const type = types.get(name);
        if (type) {
            if (type.base) {
                pending.push(type.base);
            }
            pending.push(
                ...(derived.get(name) || []),
                ...type.props.map((prop) => prop.type.qname),
                ...type.navs.map((nav) => nav.target.qname),
            );
        }
        for (const fn of csdl.functions) {
            if (fn.bound?.qname === name && !functions.has(fn)) {
                functions.add(fn);
                pending.push(...fn.params.map((param) => param.type.qname));
                if (fn.returns) {
                    pending.push(fn.returns.type.qname);
                }
            }
        }
    }
    return {
        ...csdl,
        types: csdl.types.filter((type) => reachable.has(type.qname)),
        enums: csdl.enums.filter((type) => reachable.has(type.qname)),
        functions: csdl.functions.filter((fn) => functions.has(fn)),
    };
}

function scalar(value: string): string {
    return /^[A-Za-z_][A-Za-z0-9_.\/?-]*$/.test(value) &&
        !/^(?:null|true|false|yes|no|on|off|~)$/i.test(value)
        ? value
        : JSON.stringify(value);
}

function flow(entries: [string, string][]): string {
    return `{${entries.map(([key, value]) => `${scalar(key)}: ${scalar(value)}`).join(", ")}}`;
}

function list(values: string[]): string {
    return `[${values.map(scalar).join(", ")}]`;
}

export function renderYaml(csdl: Csdl, service: { root: string; version: string }): string {
    const namespace = csdl.schemas[0] || "";
    const name = (qname: string) =>
        qname.startsWith(`${namespace}.`) ? qname.slice(namespace.length + 1) : qname;
    const ref = (type: TypeRef, nullable = false) =>
        `${name(type.qname)}${type.collection ? "[]" : ""}${nullable ? "?" : ""}`;
    const lines = [
        `notation: ${scalar("T? nullable; T[] collection; other T non-null; types default entity. Qualify local types as namespace.T for casts and V4 enum literals. nav -> set overrides inferred target; contained nav has no set.")}`,
        `root: ${scalar(service.root)}`,
        `version: ${JSON.stringify(service.version)}`,
        `namespace: ${scalar(namespace)}`,
    ];
    const sorted = <T>(items: T[], key: (item: T) => string) =>
        [...items].sort((a, b) => key(a).localeCompare(key(b), "en"));
    const setsForType = (type: string) => csdl.entitySets.filter((set) => set.type === type);
    function limits(restrictions: Restrictions, indent: string): void {
        const entries = Object.entries(restrictions).sort(([a], [b]) => a.localeCompare(b, "en"));
        if (entries.length) {
            lines.push(
                `${indent}restrictions: {${entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? list([...new Set(value)].sort()) : value}`).join(", ")}}`,
            );
        }
    }
    function sets(label: string, items: EntitySet[]): void {
        if (!items.length) {
            return;
        }
        lines.push(`${label}:`);
        for (const set of sorted(items, (set) => set.name)) {
            const bindings = [...set.bindings]
                .filter(([path, target]) => {
                    if (path.includes("/")) {
                        return true;
                    }
                    let type = csdl.types.find((type) => type.qname === set.type);
                    while (type) {
                        const nav = type.navs.find((nav) => nav.name === path);
                        if (nav) {
                            const candidates = setsForType(nav.target.qname);
                            return (
                                candidates.length !== 1 ||
                                candidates[0].name !== target ||
                                nav.containsTarget
                            );
                        }
                        type = csdl.types.find((parent) => parent.qname === type!.base);
                    }
                    return true;
                })
                .sort(([a], [b]) => a.localeCompare(b, "en"));
            if (!bindings.length && !Object.keys(set.restrictions).length) {
                lines.push(`  ${scalar(set.name)}: ${scalar(name(set.type))}`);
            } else {
                lines.push(`  ${scalar(set.name)}:`, `    type: ${scalar(name(set.type))}`);
                if (bindings.length) {
                    lines.push(
                        `    nav: ${flow(bindings.map(([path, target]) => [path.split("/").map(name).join("/"), `-> ${target}`]))}`,
                    );
                }
                limits(set.restrictions, "    ");
            }
        }
    }
    sets("sets", csdl.entitySets);
    sets("singletons", csdl.singletons);
    if (csdl.types.length) {
        lines.push("types:");
    }
    for (const type of sorted(csdl.types, (type) => type.qname)) {
        const empty =
            type.kind === "entity" &&
            !type.base &&
            !type.abstract &&
            !type.key.length &&
            !type.props.length &&
            !type.navs.length &&
            !Object.keys(type.restrictions).length;
        lines.push(`  ${scalar(name(type.qname))}:${empty ? " {}" : ""}`);
        if (type.kind === "complex") {
            lines.push("    kind: complex");
        }
        if (type.base) {
            lines.push(`    base: ${scalar(name(type.base))}`);
        }
        if (type.abstract) {
            lines.push("    abstract: true");
        }
        if (type.key.length) {
            lines.push(`    key: ${list(type.key)}`);
        }
        if (type.props.length) {
            lines.push(
                `    props: ${flow(type.props.map((prop) => [prop.name, ref(prop.type, prop.nullable)]))}`,
            );
        }
        if (type.navs.length) {
            lines.push(
                `    nav: ${flow(type.navs.map((nav) => [nav.name, `${ref(nav.target, !nav.target.collection && nav.nullable)}${nav.containsTarget ? " contained" : ""}`]))}`,
            );
        }
        limits(type.restrictions, "    ");
    }
    if (csdl.enums.length) {
        lines.push("enums:");
    }
    for (const type of sorted(csdl.enums, (type) => type.qname)) {
        lines.push(
            `  ${scalar(name(type.qname))}: ${type.isFlags ? `{flags: true, members: ${list(type.members)}}` : list(type.members)}`,
        );
    }
    if (csdl.functions.length) {
        lines.push("functions:");
    }
    for (const fn of sorted(
        csdl.functions,
        (fn) => `${fn.qname}(${fn.params.map((p) => p.type.qname).join(",")})`,
    )) {
        lines.push(`  - name: ${scalar(fn.qname)}`);
        if (fn.bound) {
            lines.push(`    bound: ${scalar(ref(fn.bound))}`);
        }
        if (fn.params.length) {
            lines.push(
                `    params: ${flow(fn.params.map((param) => [param.name, ref(param.type, param.nullable)]))}`,
            );
        }
        if (fn.returns) {
            lines.push(`    returns: ${scalar(ref(fn.returns.type, fn.returns.nullable))}`);
        }
        lines.push(`    composable: ${fn.composable}`);
        if (fn.entitySetPath) {
            lines.push(`    entitySetPath: ${scalar(fn.entitySetPath)}`);
        }
    }
    if (csdl.functionImports.length) {
        lines.push("imports:");
        for (const entry of sorted(csdl.functionImports, (entry) => entry.name)) {
            lines.push(
                `  ${scalar(entry.name)}: ${flow([["function", entry.function], ...(entry.entitySet ? [["set", entry.entitySet] as [string, string]] : [])])}`,
            );
        }
    }
    return lines.join("\n") + "\n";
}

export function summarizeSchema(xml: string, root: string): SchemaSummary {
    return summarizeCsdl(parseCsdl(xml), root);
}

export function summarizeCsdl(document: Csdl, root: string): SchemaSummary {
    const csdl = prune(document);
    const yaml = renderYaml(csdl, { root, version: csdl.version });
    return { yaml, tokens: new Tokenizer().approximateTokenCount(yaml) };
}
