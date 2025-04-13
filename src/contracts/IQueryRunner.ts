import { Profile } from "./types";

export interface IQueryRunner {
    run(query: string, profile: Profile): Promise<Response>;
    fetch(url: string, profile: Profile, options: RequestInit): Promise<Response>;
}
