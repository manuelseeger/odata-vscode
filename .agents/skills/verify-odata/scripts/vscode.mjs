// Harness library: drive the headless VS Code started by launch.sh through CDP (playwright-core).
// Everything goes through the workbench UI: command palette, keyboard, editor, panels, webviews.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export function loadState(runId = process.env.RUN_ID) {
    if (!runId) throw new Error("RUN_ID is not set");
    const file = `/tmp/verify-odata/${runId}/state.env`;
    if (!fs.existsSync(file)) throw new Error(`no state file ${file}; run launch.sh ${runId}`);
    return Object.fromEntries(
        fs.readFileSync(file, "utf8").trim().split("\n").map((l) => {
            const i = l.indexOf("=");
            return [l.slice(0, i), l.slice(i + 1)];
        }),
    );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class VSCode {
    constructor(state, browser, page) {
        this.state = state;
        this.browser = browser;
        this.page = page;
        this.kb = page.keyboard;
    }

    static async connect(state = loadState(), timeoutMs = 60000) {
        const require = createRequire(path.join(state.TOOLS, "package.json"));
        const { chromium } = require("playwright-core");
        const deadline = Date.now() + timeoutMs;
        let lastErr;
        while (Date.now() < deadline) {
            try {
                const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.CDP_PORT}`);
                for (const ctx of browser.contexts()) {
                    for (const p of ctx.pages()) {
                        if (p.url().includes("workbench.html")) {
                            await p.waitForSelector(".monaco-workbench .part.statusbar", { timeout: 30000 });
                            return new VSCode(state, browser, p);
                        }
                    }
                }
                await browser.close();
            } catch (e) {
                lastErr = e;
            }
            await sleep(1000);
        }
        throw new Error(`workbench not reachable on CDP ${state.CDP_PORT}: ${lastErr}`);
    }

    async close() {
        // Disconnect only; never closes VS Code (cleanup.sh owns the process).
        await this.browser.close().catch(() => {});
    }

    // ---------- command palette ----------
    async runCommand(title, { exact = true } = {}) {
        await this.page.keyboard.press("Escape");
        await this.kb.press("F1");
        const input = this.page.locator(".quick-input-widget .quick-input-box input");
        await input.waitFor({ state: "visible" });
        await input.fill(`>${title}`);
        const row = this.page
            .locator(".quick-input-widget .quick-input-list .monaco-list-row")
            .filter({ has: this.page.locator(".label-name", { hasText: exact ? new RegExp(`^${escapeRe(title)}$`) : title }) })
            .first();
        await row.waitFor({ state: "visible", timeout: 10000 });
        await row.click();
        await sleep(300);
    }

    async paletteEntries(filter) {
        await this.kb.press("Escape");
        await this.kb.press("F1");
        const input = this.page.locator(".quick-input-widget .quick-input-box input");
        await input.waitFor({ state: "visible" });
        await input.fill(`>${filter}`);
        await sleep(500);
        const labels = await this.page
            .locator(".quick-input-widget .quick-input-list .monaco-list-row .label-name")
            .allInnerTexts();
        await this.kb.press("Escape");
        return labels;
    }

    /** Rows of the open quick pick (after a command opened one). */
    async quickPickRows() {
        const rows = this.page.locator(".quick-input-widget .quick-input-list .monaco-list-row .label-name");
        await rows.first().waitFor({ state: "visible", timeout: 10000 });
        return rows.allInnerTexts();
    }

    async pickQuickPick(label) {
        await this.page
            .locator(".quick-input-widget .quick-input-list .monaco-list-row", { hasText: label })
            .first()
            .click();
        await sleep(300);
    }

    // ---------- files & editors ----------
    /** Close every editor; answers "Don't Save" for dirty untitled docs (e.g. query results). */
    async closeAllEditors() {
        await this.runCommand("View: Close All Editors");
        const dontSave = this.page.locator(".monaco-dialog-box .monaco-button", { hasText: "Don't Save" });
        for (let i = 0; i < 5; i++) {
            await sleep(300);
            if (!(await dontSave.isVisible().catch(() => false))) break;
            await dontSave.click();
        }
    }

    /** Write a file into the workspace folder and open it via Quick Open (Ctrl+P). */
    async openWorkspaceFile(name, content) {
        if (content !== undefined) fs.writeFileSync(path.join(this.state.WS, name), content);
        await this.kb.press("Escape");
        await this.kb.press("Control+P");
        const input = this.page.locator(".quick-input-widget .quick-input-box input");
        await input.waitFor({ state: "visible" });
        // An absolute path in Quick Open resolves directly (no wait for the file search index).
        await input.fill(path.join(this.state.WS, name));
        const row = this.page.locator(".quick-input-widget .quick-input-list .monaco-list-row", { hasText: name }).first();
        await row.waitFor({ state: "visible", timeout: 10000 });
        await this.kb.press("Enter");
        await this.page
            .locator(".tabs-container .tab.active", { hasText: name })
            .waitFor({ state: "visible", timeout: 10000 });
        await sleep(500);
    }

    activeEditor() {
        return this.page.locator(".editor-group-container.active .editor-instance .monaco-editor").first();
    }

    async focusEditor() {
        await this.activeEditor().locator(".view-lines").click();
    }

    /** Visible text of the active editor (Monaco renders U+00A0 for spaces). */
    async editorText(editor = this.activeEditor()) {
        const lines = await editor.locator(".view-lines .view-line").evaluateAll((els) =>
            els
                .map((e) => ({ top: parseFloat(e.style.top), text: e.textContent.replace(/\u00a0/g, " ") }))
                .sort((a, b) => a.top - b.top)
                .map((l) => l.text),
        );
        return lines.join("\n");
    }

    /** Move the cursor to the end of the document (Ctrl+End). */
    async cursorToEnd() {
        await this.focusEditor();
        await this.kb.press("Control+End");
    }

    async type(text, delay = 30) {
        await this.kb.type(text, { delay });
    }

    async activeTabLabel() {
        return this.page.locator(".editor-group-container.active .tabs-container .tab.active .label-name").innerText();
    }

    async languageStatus() {
        return this.page.locator('.statusbar-item[id="status.editor.mode"]').innerText();
    }

    // ---------- widgets ----------
    async suggestions({ timeout = 8000 } = {}) {
        const rows = this.page.locator(".editor-widget.suggest-widget.visible .monaco-list-row");
        await rows.first().waitFor({ state: "visible", timeout });
        await sleep(300);
        return this.page
            .locator(".editor-widget.suggest-widget.visible .monaco-list-row .label-name")
            .allInnerTexts();
    }

    async triggerSuggest() {
        await this.kb.press("Control+Space");
        return this.suggestions();
    }

    /** Screen point of the character `index` inside the first rendered occurrence of `text`. */
    async pointOfText(text, index = 1) {
        const pt = await this.activeEditor().locator(".view-lines").evaluate(
            (root, [text, index]) => {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                    const i = n.textContent.replace(/\u00a0/g, " ").indexOf(text);
                    if (i < 0) continue;
                    const r = document.createRange();
                    r.setStart(n, i + index);
                    r.setEnd(n, i + index + 1);
                    const b = r.getBoundingClientRect();
                    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
                }
                return null;
            },
            [text, index],
        );
        if (!pt) throw new Error(`text not rendered in editor: ${text}`);
        return pt;
    }

    /** Hover the mouse over `text` in the active editor and return the hover widget text. */
    async hoverAtText(text, index = 1, opts) {
        await this.page.mouse.move(5, 500);
        await sleep(300);
        const { x, y } = await this.pointOfText(text, index);
        await this.page.mouse.move(x, y);
        return this.hoverText(null, opts);
    }

    async hoverText(locator, { timeout = 8000 } = {}) {
        if (locator) await locator.hover();
        const hover = this.page.locator(".monaco-hover:not(.hidden) .monaco-hover-content").first();
        await hover.waitFor({ state: "visible", timeout });
        await sleep(300);
        return hover.innerText();
    }

    async signatureHelp({ timeout = 8000 } = {}) {
        const w = this.page.locator(".editor-widget.parameter-hints-widget.visible");
        await w.waitFor({ state: "visible", timeout });
        await sleep(200);
        return w.innerText();
    }

    /** Problems panel rows (opens the panel with Ctrl+Shift+M). */
    async problems() {
        await this.kb.press("Escape");
        if (!(await this.page.locator(".markers-panel").isVisible().catch(() => false))) {
            await this.kb.press("Control+Shift+M");
        }
        await this.page.locator(".markers-panel").waitFor({ state: "visible", timeout: 10000 });
        await sleep(800);
        return this.page.locator(".markers-panel .monaco-list-row").evaluateAll((rows) =>
            rows.map((r) => r.getAttribute("aria-label") || r.textContent),
        );
    }

    /** Problems panel entries that belong to workspace file `name` (rows follow their file header). */
    async problemsInFile(name) {
        const rows = await this.problems();
        const out = [];
        let inFile = false;
        for (const r of rows) {
            const m = r.match(/^\d+ problems? in file (.+?) of folder/);
            if (m) inFile = m[1] === name;
            else if (inFile) out.push(r);
        }
        return out;
    }

    async squiggles(kind = "error") {
        return this.activeEditor().locator(`.squiggly-${kind}`).count();
    }

    async notifications() {
        return this.page.locator(".notifications-toasts .notification-toast .notification-list-item-message").allInnerTexts();
    }

    async waitForNotification(re, timeout = 10000) {
        const loc = this.page.locator(".notifications-toasts .notification-list-item-message", { hasText: re }).first();
        await loc.waitFor({ state: "visible", timeout });
        return loc.innerText();
    }

    async clearNotifications() {
        await this.runCommand("Notifications: Clear All Notifications").catch(() => {});
    }

    // ---------- explorer view ----------
    async profilesView() {
        const header = this.page.locator('.pane-header[aria-label*="OData Endpoint Profiles"]');
        if (!(await header.isVisible().catch(() => false))) {
            await this.kb.press("Control+Shift+E");
            await header.waitFor({ state: "visible", timeout: 10000 });
        }
        if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
        const pane = this.page.locator(".pane", { has: header });
        await sleep(500);
        return pane;
    }

    /** Rows of the profiles tree. Polls until `until(rows)` is true or timeout (tree renders lazily). */
    async profileRows(until = (rows) => rows.length > 0, timeout = 8000) {
        const pane = await this.profilesView();
        const deadline = Date.now() + timeout;
        let rows = [];
        do {
            rows = await pane.locator(".monaco-list-row").evaluateAll((els) =>
                els.map((r) => ({
                    label: (r.querySelector(".label-name")?.textContent || "").trim(),
                    checked: !!r.querySelector(".codicon-check"),
                })),
            );
            if (until(rows)) break;
            await sleep(300);
        } while (Date.now() < deadline);
        return rows;
    }

    /** Precondition for metadata-aware journeys: profile `name` exists and is selected. */
    async requireSelectedProfile(name = "Mock") {
        const rows = await this.profileRows((r) => r.some((x) => x.label === name && x.checked));
        if (!rows.some((x) => x.label === name && x.checked)) {
            throw new Error(
                `precondition failed: profile '${name}' is not listed+selected (rows=${JSON.stringify(rows)}). ` +
                    "Run the 'profiles' journey first on this instance.",
            );
        }
    }

    // ---------- webviews ----------
    /** The frame of a webview whose document contains `selector` (webviews are nested iframes). */
    async webviewFrame(selector, timeout = 15000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            for (const f of this.page.frames()) {
                if (await f.locator(selector).count().catch(() => 0)) return f;
            }
            await sleep(300);
        }
        throw new Error(`no webview frame with ${selector}`);
    }

    // ---------- clipboard (through the UI: paste into a scratch untitled editor) ----------
    async clipboardViaPaste() {
        await this.runCommand("File: New Untitled Text File");
        await sleep(300);
        await this.focusEditor();
        await this.kb.press("Control+V");
        await sleep(300);
        const text = await this.editorText();
        await this.runCommand("View: Revert and Close Editor").catch(() => {});
        return text;
    }

    // ---------- evidence ----------
    async screenshot(file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await this.page.screenshot({ path: file });
        return file;
    }

    async ariaSnapshot(file, locator = this.page.locator(".monaco-workbench")) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const snap = await locator.ariaSnapshot();
        fs.writeFileSync(file, snap);
        return file;
    }

    requestLog() {
        const f = path.join(this.state.EVIDENCE, "requests.jsonl");
        if (!fs.existsSync(f)) return [];
        return fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    }
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { sleep };
