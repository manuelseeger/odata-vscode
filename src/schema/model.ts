export interface TypeRef {
    qname: string;
    collection: boolean;
}

export interface Prop {
    name: string;
    type: TypeRef;
    nullable: boolean;
}

export interface Nav {
    name: string;
    target: TypeRef;
    nullable: boolean;
    partner?: string;
    containsTarget: boolean;
}

export interface Restrictions {
    nonFilterable?: string[];
    nonSortable?: string[];
    nonExpandable?: string[];
    requiredFilter?: string[];
    count?: false;
    top?: false;
    skip?: false;
    filter?: false;
    sort?: false;
    requiresFilter?: true;
}

export interface StructuredType {
    qname: string;
    kind: "entity" | "complex";
    base?: string;
    abstract: boolean;
    open: boolean;
    key: string[];
    props: Prop[];
    navs: Nav[];
    restrictions: Restrictions;
}

export interface EnumType {
    qname: string;
    members: string[];
    isFlags: boolean;
}

export interface EntitySet {
    name: string;
    container: string;
    type: string;
    bindings: Map<string, string>;
    restrictions: Restrictions;
}

export interface Function {
    qname: string;
    bound?: TypeRef;
    params: Prop[];
    returns?: Prop;
    composable: boolean;
    entitySetPath?: string;
}

export interface FunctionImport {
    name: string;
    container: string;
    function: string;
    entitySet?: string;
}

export interface ActionImport {
    name: string;
    container: string;
    action: string;
}

export interface LegacyOperationImport {
    name: string;
    container: string;
    httpMethod?: string;
    returns?: Prop;
    entitySet?: string;
}

export interface Csdl {
    version: string;
    schemas: string[];
    types: StructuredType[];
    enums: EnumType[];
    entitySets: EntitySet[];
    singletons: EntitySet[];
    functions: Function[];
    functionImports: FunctionImport[];
    actionImports: ActionImport[];
    legacyOperationImports: LegacyOperationImport[];
}

export interface SchemaSummary {
    yaml: string;
    tokens: number;
}

export const DEFAULT_SCHEMA_MAX_TOKENS = 32000;
