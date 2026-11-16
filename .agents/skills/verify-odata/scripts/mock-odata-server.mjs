#!/usr/bin/env node
// Verification scaffolding: a real HTTP OData v4 service for the extension to talk to.
// Usage: mock-odata-server.mjs <port> <request-log-path>
// Serves /odata/$metadata, /odata/Orders, /odata/Items. Other paths return 404 with a JSON body.
// Every request is appended to the request log as one JSON line (side-effect evidence).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 0);
const logPath = process.argv[3] || "/dev/null";
const metadata = fs.readFileSync(path.join(here, "..", "fixtures", "metadata.xml"), "utf8");

const data = {
    Orders: [
        { OrderID: 1, OrderDate: "2025-04-10T00:00:00Z", CustomerName: "Alfreds" },
        { OrderID: 2, OrderDate: "2025-04-09T00:00:00Z", CustomerName: "Berglunds" },
        { OrderID: 3, OrderDate: "2025-04-08T00:00:00Z", CustomerName: "Chop-suey" },
    ],
    Items: [
        { ItemID: 10, ItemName: "Chai", Quantity: 5 },
        { ItemID: 11, ItemName: "Chang", Quantity: 12 },
    ],
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    fs.appendFileSync(
        logPath,
        JSON.stringify({ t: new Date().toISOString(), method: req.method, url: req.url, headers: req.headers }) + "\n",
    );
    const p = decodeURIComponent(url.pathname);
    if (p === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
        return;
    }
    if (p === "/odata/$metadata") {
        res.writeHead(200, { "Content-Type": "application/xml" }).end(metadata);
        return;
    }
    const m = p.match(/^\/odata\/(\w+)$/);
    if (m && data[m[1]]) {
        let rows = data[m[1]];
        const top = url.searchParams.get("$top");
        if (top) rows = rows.slice(0, Number(top));
        const select = url.searchParams.get("$select");
        if (select) {
            const cols = select.split(",").map((s) => s.trim());
            rows = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
        }
        const body = { "@odata.context": `http://${req.headers.host}/odata/$metadata#${m[1]}`, value: rows };
        res.writeHead(200, { "Content-Type": "application/json; odata.metadata=minimal" }).end(JSON.stringify(body));
        return;
    }
    res.writeHead(404, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: { code: "NotFound", message: `Resource ${p} not found` } }),
    );
});

server.listen(port, "127.0.0.1", () => {
    console.log(`mock-odata listening on http://127.0.0.1:${server.address().port}/odata/`);
});
