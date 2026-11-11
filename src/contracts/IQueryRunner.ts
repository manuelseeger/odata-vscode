import { Profile } from "./types";

export interface RequestResult {
    status: number;
    statusText: string;
    contentType: string;
    text: string;
}

export interface RequestPolicy {
    timeoutMs: number;
    maxResponseBytes: number;
}

export interface IQueryRunner {
    run(query: string, profile: Profile, signal?: AbortSignal): Promise<RequestResult>;
    fetch(
        url: string,
        profile: Profile,
        accept: string,
        signal?: AbortSignal,
    ): Promise<RequestResult>;
}
