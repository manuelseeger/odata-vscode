import { createHash } from "crypto";
import { IMetadataModelService } from "../contracts/IMetadataModelService";
import { Profile } from "../contracts/types";
import { Csdl, parseCsdl, SchemaSummary, summarizeCsdl } from "../schema";

export class MetadataModelService implements IMetadataModelService {
    private parseCache = new Map<string, Csdl>();
    private schemaCache = new Map<string, Map<string, SchemaSummary>>();

    public getCsdl(profile: Profile): Csdl | undefined {
        return profile.metadata ? this.getParsed(profile.metadata) : undefined;
    }

    public clearCache(): void {
        this.parseCache.clear();
        this.schemaCache.clear();
    }

    public isMetadataXml(text: string): boolean {
        try {
            this.getParsed(text);
            return true;
        } catch {
            return false;
        }
    }

    public getSchemaSummary(text: string, root: string): SchemaSummary {
        const hash = this.hash(text);
        let summaries = this.schemaCache.get(hash);
        if (!summaries) {
            summaries = new Map();
            this.schemaCache.set(hash, summaries);
        }
        let summary = summaries.get(root);
        if (!summary) {
            summary = summarizeCsdl(this.getParsed(text, hash), root);
            summaries.set(root, summary);
        }
        return summary;
    }

    private hash(text: string): string {
        return createHash("sha256").update(text).digest("hex");
    }

    private getParsed(text: string, hash = this.hash(text)): Csdl {
        let csdl = this.parseCache.get(hash);
        if (!csdl) {
            csdl = parseCsdl(text);
            this.parseCache.set(hash, csdl);
        }
        return csdl;
    }
}
