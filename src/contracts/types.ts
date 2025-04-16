import { URI } from "vscode-uri";

export enum AuthKind {
    None = "none",
    Basic = "basic",
    Bearer = "bearer",
    ClientCert = "cliencert",
}

export interface IProfileAuthentication {
    kind: AuthKind;
    username?: string;
    password?: string;
    token?: string;
    cert?: URI;
    key?: URI;
    pfx?: URI;
    passphrase?: string;
}

export interface Profile {
    name: string;
    baseUrl: string;
    auth: IProfileAuthentication;
    metadata?: string;
    headers: { [key: string]: string };
}

export type ODataFormat = "json" | "xml";

export interface IODataMetadataConfigurationMapEntry {
    url: string;
    path: string;
}

export interface IODataMetadataConfiguration {
    filterNs: string[];
    filterXPath: string[];
    xpathDefaultNsPrefix: string;
}

export interface IODataConfiguration {
    metadata: IODataMetadataConfiguration;
    defaultFormat: ODataFormat;
    strictParser: boolean;
    disableRunner: boolean;
}

export namespace odata {
    export interface Param {
        name: string;
        type: string;
        description: string;
    }

    export interface Function {
        name: string;
        doc: string;
        params?: Param[];
    }

    export interface SystemQueryOption {
        name: string;
        doc: string;
    }

    export interface Spec {
        functions: Function[];
        systemQueryOptions: SystemQueryOption[];
    }

    export interface Reference {
        v2: Spec;
        v4: Spec;
    }
}

export interface TokenClass {
    classLabel: string;
    characters: number[];
    avgContribution: number;
}
