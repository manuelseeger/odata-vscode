#!/usr/bin/env node
// Drive the instance of RUN_ID.
// Usage:
//   RUN_ID=<id> drive.mjs wait-ready                 # used by launch.sh
//   RUN_ID=<id> drive.mjs list                       # list journeys
//   RUN_ID=<id> drive.mjs <journey> [<journey> ...]  # run journeys in order, write evidence
//   RUN_ID=<id> drive.mjs eval '<js using vs>'       # ad-hoc step; `vs` is the VSCode helper
// Evidence: $EVIDENCE/<journey>/{NN-step.png, *.aria.txt, result.json}. Exit 1 if any check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VSCode, loadState, sleep } from "./vscode.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const journeysDir = path.join(here, "journeys");
const [cmd, ...rest] = process.argv.slice(2);
const state = loadState();

if (cmd === "list") {
    for (const f of fs.readdirSync(journeysDir).sort()) console.log(f.replace(/\.mjs$/, ""));
    process.exit(0);
}

const vs = await VSCode.connect(state);
let failed = false;
try {
    if (cmd === "wait-ready") {
        const deadline = Date.now() + 60000;
        let entries = [];
        while (Date.now() < deadline) {
            entries = await vs.paletteEntries("OData:").catch(() => []);
            if (entries.includes("OData: Add Endpoint Profile")) break;
            await sleep(1000);
        }
        console.log("palette:", entries.join(" | "));
        if (!entries.includes("OData: Add Endpoint Profile")) throw new Error("OData commands not contributed");
        console.log("ready");
    } else if (cmd === "eval") {
        const fn = new Function("vs", "sleep", `return (async () => { ${rest.join(" ")} })()`);
        const out = await fn(vs, sleep);
        if (out !== undefined) console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
    } else {
        if (!cmd) throw new Error("usage: drive.mjs <journey...>|list|eval|wait-ready");
        for (const name of [cmd, ...rest]) {
            const ok = await runJourney(name);
            failed ||= !ok;
        }
    }
} catch (e) {
    console.error(e.stack || String(e));
    failed = true;
} finally {
    await vs.close();
}
process.exit(failed ? 1 : 0);

async function runJourney(name) {
    const mod = await import(path.join(journeysDir, `${name}.mjs`));
    const dir = path.join(state.EVIDENCE, name);
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    const checks = [];
    const ev = {
        dir,
        shot: async (label) => vs.screenshot(path.join(dir, `${String(++n).padStart(2, "0")}-${label}.png`)),
        aria: async (label, loc) => vs.ariaSnapshot(path.join(dir, `${String(++n).padStart(2, "0")}-${label}.aria.txt`), loc),
        write: (file, data) => fs.writeFileSync(path.join(dir, file), typeof data === "string" ? data : JSON.stringify(data, null, 2)),
        check: (label, pass, detail) => {
            checks.push({ label, pass: !!pass, detail });
            console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
        },
    };
    let error;
    try {
        await mod.default(vs, ev, state);
    } catch (e) {
        error = e.stack || String(e);
        console.error(`ERROR ${name}: ${error}`);
        await ev.shot("error").catch(() => {});
    }
    const ok = !error && checks.length > 0 && checks.every((c) => c.pass);
    ev.write("result.json", { journey: name, ok, error, checks, at: new Date().toISOString() });
    console.log(`${ok ? "OK" : "FAILED"} ${name} (evidence: ${dir})`);
    return ok;
}
