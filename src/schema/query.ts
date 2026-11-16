import {
    ActionImport, Csdl, EntitySet, EnumType, Function, FunctionImport, LegacyOperationImport,
    Nav, Prop, StructuredType, TypeRef,
} from "./model";

export type RootResource =
    | { kind: "set" | "singleton"; record: EntitySet }
    | { kind: "functionImport"; record: FunctionImport }
    | { kind: "actionImport"; record: ActionImport }
    | { kind: "legacyOperationImport"; record: LegacyOperationImport };

export type Member =
    | { kind: "property"; record: Prop }
    | { kind: "navigation"; record: Nav };

export type Lookup<T> =
    | { kind: "found"; value: T }
    | { kind: "missing" }
    | { kind: "ambiguous" };

export function roots(csdl: Csdl): RootResource[] {
    return [
        ...csdl.entitySets.map((record): RootResource => ({ kind: "set", record })),
        ...csdl.singletons.map((record): RootResource => ({ kind: "singleton", record })),
        ...csdl.functionImports.map((record): RootResource => ({ kind: "functionImport", record })),
        ...csdl.actionImports.map((record): RootResource => ({ kind: "actionImport", record })),
        ...csdl.legacyOperationImports.map((record): RootResource => ({ kind: "legacyOperationImport", record })),
    ];
}

export function findRoot(csdl: Csdl, name: string, container?: string): Lookup<RootResource> {
    const matches = roots(csdl).filter((root) =>
        root.record.name === name && (!container || root.record.container === container),
    );
    return matches.length === 1
        ? { kind: "found", value: matches[0] }
        : { kind: matches.length ? "ambiguous" : "missing" };
}

export function findType(csdl: Csdl, qname: string): StructuredType | undefined {
    return csdl.types.find((type) => type.qname === qname);
}

export function members(csdl: Csdl, type: StructuredType): Member[] {
    const chain: StructuredType[] = [];
    const seen = new Set<string>();
    let current: StructuredType | undefined = type;
    while (current) {
        if (seen.has(current.qname)) {
            throw new Error(`Cyclic CSDL inheritance at ${current.qname}`);
        }
        seen.add(current.qname);
        chain.unshift(current);
        current = current.base ? findType(csdl, current.base) : undefined;
    }
    return chain.flatMap((owner) => [
        ...owner.props.map((record): Member => ({ kind: "property", record })),
        ...owner.navs.map((record): Member => ({ kind: "navigation", record })),
    ]);
}

export function findMember(csdl: Csdl, type: StructuredType, name: string): Member | undefined {
    return members(csdl, type).find((member) => member.record.name === name);
}

export function memberType(member: Member): TypeRef {
    return member.kind === "property" ? member.record.type : member.record.target;
}

export function formatTypeRef(ref: TypeRef): string {
    return ref.collection ? `Collection(${ref.qname})` : ref.qname;
}

export function functionsForImport(csdl: Csdl, entry: FunctionImport) {
    return csdl.functions.filter((fn) => !fn.bound && fn.qname === entry.function);
}

export function resourceType(csdl: Csdl, root: RootResource): TypeRef | undefined {
    switch (root.kind) {
        case "set":
        case "singleton":
            return { qname: root.record.type, collection: root.kind === "set" };
        case "actionImport":
            return undefined;
        case "functionImport": {
            const overloads = functionsForImport(csdl, root.record);
            const refs = overloads.map((fn) => fn.returns?.type);
            if (refs.length) {
                const first = refs[0];
                return first && refs.every((ref) =>
                    ref?.qname === first.qname && ref.collection === first.collection,
                ) ? first : undefined;
            }
            break;
        }
        case "legacyOperationImport":
            if (root.record.returns) {
                return root.record.returns.type;
            }
            break;
    }
    if (root.record.entitySet) {
        const set = findRoot(csdl, root.record.entitySet, root.record.container);
        if (set.kind === "found" && set.value.kind === "set") {
            return { qname: set.value.record.type, collection: true };
        }
    }
    return undefined;
}

export function resourceStructuredType(csdl: Csdl, root: RootResource): StructuredType | undefined {
    const ref = resourceType(csdl, root);
    return ref ? findType(csdl, ref.qname) : undefined;
}

export function resolveMemberPath(
    csdl: Csdl, type: StructuredType, segments: string[],
): Member | undefined {
    let member: Member | undefined;
    for (let i = 0; i < segments.length; i++) {
        member = findMember(csdl, type, segments[i]);
        if (!member) {
            return undefined;
        }
        if (i < segments.length - 1) {
            const next = findType(csdl, memberType(member).qname);
            if (!next) {
                return undefined;
            }
            type = next;
        }
    }
    return member;
}

export function findEnum(csdl: Csdl, qname: string): EnumType | undefined {
    return csdl.enums.find((type) => type.qname === qname);
}

/** This type and each type it inherits from, nearest first. */
export function typeChain(csdl: Csdl, type: StructuredType): StructuredType[] {
    const chain: StructuredType[] = [];
    const seen = new Set<string>();
    let current: StructuredType | undefined = type;
    while (current && !seen.has(current.qname)) {
        seen.add(current.qname);
        chain.push(current);
        current = current.base ? findType(csdl, current.base) : undefined;
    }
    return chain;
}

export function boundFunctions(csdl: Csdl, type: StructuredType): Function[] {
    const names = new Set(typeChain(csdl, type).map((item) => item.qname));
    return csdl.functions.filter((fn) => fn.bound && names.has(fn.bound.qname));
}

export function derivedTypes(csdl: Csdl, qname: string): string[] {
    const children = new Map<string, string[]>();
    for (const type of csdl.types) {
        if (type.base) {
            children.set(type.base, [...(children.get(type.base) ?? []), type.qname]);
        }
    }
    const names: string[] = [];
    const pending = [...(children.get(qname) ?? [])];
    const seen = new Set<string>();
    while (pending.length) {
        const name = pending.pop()!;
        if (seen.has(name)) {
            continue;
        }
        seen.add(name);
        names.push(name);
        pending.push(...(children.get(name) ?? []));
    }
    return names;
}
