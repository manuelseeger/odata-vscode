import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULT_SCHEMA_MAX_TOKENS, summarizeSchema } = require("../out/schema");
const fixtures = ["odatav2", "trippin", "northwind", "azuredevops", "msgraph"];
const selected = process.argv[2];
if (selected && !fixtures.includes(selected)) throw new Error("Unknown fixture");
if (!selected)
    console.log(
        "| Fixture | XML bytes | YAML bytes | Reduction | Approx. tokens | Fits 32000 |\n|---|---:|---:|---:|---:|---|",
    );
for (const fixture of selected ? [selected] : fixtures) {
    const xml = readFileSync(
        new URL(`../src/test/testdata/${fixture}.edmx`, import.meta.url),
        "utf8",
    );
    const { yaml, tokens } = summarizeSchema(xml, "https://example.test/");
    if (selected) process.stdout.write(yaml);
    else {
        const xmlBytes = Buffer.byteLength(xml);
        const yamlBytes = Buffer.byteLength(yaml);
        console.log(
            `| ${fixture} | ${xmlBytes} | ${yamlBytes} | ${(100 * (1 - yamlBytes / xmlBytes)).toFixed(1)}% | ${tokens} | ${tokens <= DEFAULT_SCHEMA_MAX_TOKENS ? "yes" : "no"} |`,
        );
    }
}
