import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const original = path.resolve(process.argv[2]);
const checker = path.resolve("scripts/check-vsix.mjs");
const directory = mkdtempSync(path.join(tmpdir(), "odata-vsix-check-"));
const archive = path.join(directory, "modified.vsix");
const rejected = (description) => {
    const result = spawnSync(process.execPath, [checker, archive], { encoding: "utf8" });
    assert.notEqual(result.status, 0, description);
    assert.match(result.stderr, /AssertionError/, description);
};
try {
    for (const resource of ["odata.configuration.json", "skills/odata/SKILL.md"]) {
        copyFileSync(original, archive);
        execFileSync("zip", ["-qd", archive, `extension/${resource}`]);
        rejected(`Missing contributed resource ${resource} must fail validation.`);
    }
    for (const file of [
        "extension/.pi/secrets.json",
        "extension/src/source.js",
        "extension/.env",
        "extension/dist/example.test.js",
    ]) {
        copyFileSync(original, archive);
        const target = path.join(directory, file);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, "test artifact");
        execFileSync("zip", ["-q", archive, file], { cwd: directory });
        rejected(`${file} must fail validation.`);
    }
    console.log(
        "VSIX validator rejects missing resources, agent data, sources, secrets, and test artifacts.",
    );
} finally {
    rmSync(directory, { recursive: true, force: true });
}
