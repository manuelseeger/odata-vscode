import { DOMParser, Element } from "@xmldom/xmldom";
import { Csdl, EntitySet, Function, Nav, Prop, Restrictions, TypeRef } from "./model";

const edmNamespaces = new Set([
    "http://docs.oasis-open.org/odata/ns/edm",
    "http://schemas.microsoft.com/ado/2006/04/edm",
    "http://schemas.microsoft.com/ado/2007/05/edm",
    "http://schemas.microsoft.com/ado/2008/09/edm",
    "http://schemas.microsoft.com/ado/2009/11/edm",
]);
const sapNamespace = "http://www.sap.com/Protocols/SAPData";
const metadataNamespace = "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata";

function children(element: Element, name?: string): Element[] {
    return Array.from(element.childNodes).filter(
        (node): node is Element =>
            node.nodeType === 1 &&
            edmNamespaces.has(node.namespaceURI || "") &&
            (!name || node.localName === name),
    );
}

function attr(element: Element, name: string): string {
    return element.getAttribute(name) || "";
}

export function parseCsdl(xml: string): Csdl {
    const doc = new DOMParser({
        onError: (level, message) => {
            if (level !== "warning") {
                throw new Error(message);
            }
        },
    }).parseFromString(xml, "text/xml");
    const root = doc.documentElement;
    if (
        !root ||
        root.localName !== "Edmx" ||
        ![
            "http://docs.oasis-open.org/odata/ns/edmx",
            "http://schemas.microsoft.com/ado/2007/06/edmx",
        ].includes(root.namespaceURI || "")
    ) {
        throw new Error("The provided XML is not valid OData metadata.");
    }
    const schemas = Array.from(doc.getElementsByTagNameNS("*", "Schema")).filter((schema) =>
        edmNamespaces.has(schema.namespaceURI || ""),
    );
    if (!schemas.length) {
        throw new Error("No CSDL schema found in metadata.");
    }
    const aliases = new Map<string, string>();
    for (const schema of schemas) {
        if (attr(schema, "Alias")) {
            aliases.set(attr(schema, "Alias"), attr(schema, "Namespace"));
        }
    }
    for (const include of Array.from(doc.getElementsByTagNameNS("*", "Include"))) {
        if (attr(include, "Alias")) {
            aliases.set(attr(include, "Alias"), attr(include, "Namespace"));
        }
    }
    function qualify(name: string, namespace: string): string {
        if (!name.includes(".")) {
            return `${namespace}.${name}`;
        }
        const dot = name.indexOf(".");
        return `${aliases.get(name.slice(0, dot)) || name.slice(0, dot)}${name.slice(dot)}`;
    }
    function ref(value: string, namespace: string): TypeRef {
        const match = /^Collection\((.*)\)$/.exec(value);
        return { qname: qualify(match ? match[1] : value, namespace), collection: !!match };
    }
    function prop(element: Element, namespace: string, typeAttr = "Type"): Prop {
        return {
            name: attr(element, "Name"),
            type: ref(attr(element, typeAttr), namespace),
            nullable: attr(element, "Nullable") !== "false",
        };
    }
    function path(value: string, namespace: string): string {
        return value
            .split("/")
            .map((part) => (part.includes(".") ? qualify(part, namespace) : part))
            .join("/");
    }
    function restrictions(element: Element, namespace: string): Restrictions {
        const result: Restrictions = {};
        if (element.getAttributeNS(sapNamespace, "filterable") === "false") {
            result.filter = false;
        }
        if (element.getAttributeNS(sapNamespace, "sortable") === "false") {
            result.sort = false;
        }
        if (element.getAttributeNS(sapNamespace, "requires-filter") === "true") {
            result.requiresFilter = true;
        }
        for (const annotation of children(element, "Annotation")) {
            const term = qualify(attr(annotation, "Term"), namespace);
            if (!term.startsWith("Org.OData.Capabilities.V1.")) {
                continue;
            }
            const kind = term.slice("Org.OData.Capabilities.V1.".length);
            const bool = (node: Element) =>
                attr(node, "Bool") || children(node, "Bool")[0]?.textContent;
            if (kind === "TopSupported" && bool(annotation) === "false") {
                result.top = false;
            }
            if (kind === "SkipSupported" && bool(annotation) === "false") {
                result.skip = false;
            }
            const fields: Record<string, Record<string, keyof Restrictions>> = {
                FilterRestrictions: {
                    NonFilterableProperties: "nonFilterable",
                    RequiredProperties: "requiredFilter",
                    Filterable: "filter",
                    RequiresFilter: "requiresFilter",
                },
                SortRestrictions: { NonSortableProperties: "nonSortable", Sortable: "sort" },
                ExpandRestrictions: { NonExpandableProperties: "nonExpandable" },
                CountRestrictions: { Countable: "count" },
            };
            for (const record of children(annotation, "Record")) {
                for (const value of children(record, "PropertyValue")) {
                    const field = fields[kind]?.[attr(value, "Property")];
                    if (!field) {
                        continue;
                    }
                    if (
                        [
                            "nonFilterable",
                            "nonSortable",
                            "nonExpandable",
                            "requiredFilter",
                        ].includes(field)
                    ) {
                        const paths = children(value, "Collection")
                            .flatMap((collection) => children(collection))
                            .filter((entry) =>
                                ["PropertyPath", "NavigationPropertyPath"].includes(
                                    entry.localName || "",
                                ),
                            )
                            .map((entry) => path(entry.textContent || "", namespace));
                        if (paths.length) {
                            Object.assign(result, { [field]: paths });
                        }
                    } else if (
                        field === "requiresFilter"
                            ? bool(value) === "true"
                            : bool(value) === "false"
                    ) {
                        Object.assign(result, { [field]: field === "requiresFilter" });
                    }
                }
            }
        }
        return result;
    }
    const dataServices = Array.from(doc.getElementsByTagNameNS("*", "DataServices"))[0];
    const csdl: Csdl = {
        version:
            dataServices?.getAttributeNS(metadataNamespace, "MaxDataServiceVersion") ||
            dataServices?.getAttributeNS(metadataNamespace, "DataServiceVersion") ||
            attr(root, "Version"),
        schemas: schemas.map((schema) => attr(schema, "Namespace")),
        types: [],
        enums: [],
        entitySets: [],
        singletons: [],
        functions: [],
        functionImports: [],
        actionImports: [],
        legacyOperationImports: [],
    };
    const associations = new Map<string, Map<string, { type: string; multiplicity: string }>>();
    for (const schema of schemas) {
        const namespace = attr(schema, "Namespace");
        for (const association of children(schema, "Association")) {
            associations.set(
                `${namespace}.${attr(association, "Name")}`,
                new Map(
                    children(association, "End").map((end) => [
                        attr(end, "Role"),
                        {
                            type: qualify(attr(end, "Type"), namespace),
                            multiplicity: attr(end, "Multiplicity"),
                        },
                    ]),
                ),
            );
        }
    }
    const targets = new Map<string, Restrictions>();
    const legacyNavs: {
        name: string;
        relationship: string;
        from: string;
        to: string;
    }[] = [];
    const associationSets: {
        container: string;
        relationship: string;
        ends: Map<string, string>;
    }[] = [];
    function queryFunction(element: Element, namespace: string, legacy = false): Function {
        const params = children(element, "Parameter").map((param) => prop(param, namespace));
        const bound = attr(element, "IsBound") === "true" ? params.shift()?.type : undefined;
        const returnElement = children(element, "ReturnType")[0];
        return {
            qname: `${namespace}.${attr(element, "Name")}`,
            bound,
            params,
            returns:
                legacy && attr(element, "ReturnType")
                    ? prop(element, namespace, "ReturnType")
                    : returnElement
                      ? prop(returnElement, namespace)
                      : undefined,
            composable: legacy || attr(element, "IsComposable") === "true",
            entitySetPath: attr(element, "EntitySetPath") || undefined,
        };
    }
    for (const schema of schemas) {
        const namespace = attr(schema, "Namespace");
        for (const element of children(schema)) {
            const qname = `${namespace}.${attr(element, "Name")}`;
            if (element.localName === "EntityType" || element.localName === "ComplexType") {
                const props = children(element, "Property").map((value) => prop(value, namespace));
                const navs: Nav[] = children(element, "NavigationProperty").map((nav) => {
                    if (attr(nav, "Relationship")) {
                        const relationship = qualify(attr(nav, "Relationship"), namespace);
                        const end = associations.get(relationship)?.get(attr(nav, "ToRole"));
                        if (!end) {
                            throw new Error(`Unresolved association ${relationship}`);
                        }
                        legacyNavs.push({
                            name: attr(nav, "Name"),
                            relationship,
                            from: attr(nav, "FromRole"),
                            to: attr(nav, "ToRole"),
                        });
                        return {
                            name: attr(nav, "Name"),
                            target: { qname: end.type, collection: end.multiplicity === "*" },
                            nullable: end.multiplicity === "0..1",
                            containsTarget: false,
                        };
                    }
                    return {
                        name: attr(nav, "Name"),
                        target: ref(attr(nav, "Type"), namespace),
                        nullable: attr(nav, "Nullable") !== "false",
                        partner: attr(nav, "Partner") || undefined,
                        containsTarget: attr(nav, "ContainsTarget") === "true",
                    };
                });
                const limits = restrictions(element, namespace);
                for (const property of children(element, "Property")) {
                    if (property.getAttributeNS(sapNamespace, "filterable") === "false") {
                        (limits.nonFilterable ??= []).push(attr(property, "Name"));
                    }
                    if (property.getAttributeNS(sapNamespace, "sortable") === "false") {
                        (limits.nonSortable ??= []).push(attr(property, "Name"));
                    }
                    if (property.getAttributeNS(sapNamespace, "required-in-filter") === "true") {
                        (limits.requiredFilter ??= []).push(attr(property, "Name"));
                    }
                }
                csdl.types.push({
                    qname,
                    kind: element.localName === "EntityType" ? "entity" : "complex",
                    base: attr(element, "BaseType")
                        ? qualify(attr(element, "BaseType"), namespace)
                        : undefined,
                    abstract: attr(element, "Abstract") === "true",
                    open: attr(element, "OpenType") === "true",
                    key: children(element, "Key").flatMap((key) =>
                        children(key, "PropertyRef").map((p) => attr(p, "Name")),
                    ),
                    props,
                    navs,
                    restrictions: limits,
                });
                targets.set(qname, limits);
            } else if (element.localName === "EnumType") {
                csdl.enums.push({
                    qname,
                    members: children(element, "Member").map((member) => attr(member, "Name")),
                    isFlags: attr(element, "IsFlags") === "true",
                });
            } else if (element.localName === "Function") {
                csdl.functions.push(queryFunction(element, namespace));
            } else if (element.localName === "EntityContainer") {
                for (const entry of children(element)) {
                    const name = attr(entry, "Name");
                    if (entry.localName === "EntitySet" || entry.localName === "Singleton") {
                        const set: EntitySet = {
                            name,
                            container: qname,
                            type: qualify(
                                attr(
                                    entry,
                                    entry.localName === "EntitySet" ? "EntityType" : "Type",
                                ),
                                namespace,
                            ),
                            bindings: new Map(
                                children(entry, "NavigationPropertyBinding").map((binding) => [
                                    path(attr(binding, "Path"), namespace),
                                    path(attr(binding, "Target"), namespace),
                                ]),
                            ),
                            restrictions: restrictions(entry, namespace),
                        };
                        (entry.localName === "EntitySet" ? csdl.entitySets : csdl.singletons).push(
                            set,
                        );
                        targets.set(`${qname}/${name}`, set.restrictions);
                    } else if (entry.localName === "FunctionImport") {
                        if (attr(entry, "Function")) {
                            csdl.functionImports.push({
                                name,
                                container: qname,
                                function: qualify(attr(entry, "Function"), namespace),
                                entitySet: attr(entry, "EntitySet") || undefined,
                            });
                        } else if (
                            entry.getAttributeNS(metadataNamespace, "HttpMethod") === "GET"
                        ) {
                            const fn = queryFunction(entry, namespace, true);
                            csdl.functions.push(fn);
                            csdl.functionImports.push({
                                name,
                                container: qname,
                                function: fn.qname,
                                entitySet: attr(entry, "EntitySet") || undefined,
                            });
                        } else {
                            csdl.legacyOperationImports.push({
                                name,
                                container: qname,
                                httpMethod: entry.getAttributeNS(metadataNamespace, "HttpMethod") || undefined,
                                returns: queryFunction(entry, namespace, true).returns,
                                entitySet: attr(entry, "EntitySet") || undefined,
                            });
                        }
                    } else if (entry.localName === "ActionImport") {
                        csdl.actionImports.push({
                            name,
                            container: qname,
                            action: qualify(attr(entry, "Action"), namespace),
                        });
                    } else if (entry.localName === "AssociationSet") {
                        associationSets.push({
                            container: qname,
                            relationship: qualify(attr(entry, "Association"), namespace),
                            ends: new Map(
                                children(entry, "End").map((end) => [
                                    attr(end, "Role"),
                                    attr(end, "EntitySet"),
                                ]),
                            ),
                        });
                    }
                }
            }
        }
    }
    for (const schema of schemas) {
        const namespace = attr(schema, "Namespace");
        for (const annotations of children(schema, "Annotations")) {
            const target = targets.get(path(attr(annotations, "Target"), namespace));
            if (target) {
                Object.assign(target, restrictions(annotations, namespace));
            }
        }
    }
    for (const associationSet of associationSets) {
        for (const nav of legacyNavs.filter(
            (nav) => nav.relationship === associationSet.relationship,
        )) {
            const source = csdl.entitySets.find(
                (set) =>
                    set.container === associationSet.container &&
                    set.name === associationSet.ends.get(nav.from),
            );
            const target = associationSet.ends.get(nav.to);
            if (source && target) {
                source.bindings.set(nav.name, target);
            }
        }
    }
    return csdl;
}
