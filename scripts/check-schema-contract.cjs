const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { isDeepStrictEqual } = require("node:util");
require("ts-node").register({ compilerOptions: { types: ["node", "mocha"] } });
const { load } = createRequire(require.resolve("mocha"))("js-yaml");
const { MetadataModelService } = require("../src/services/MetadataModelService");
const { findRoot, findType, members, memberType, resourceType } = require("../src/schema");
const fixtures = path.resolve(__dirname, "../src/test/testdata");
const baseline = require("../src/test/testdata/schema-baseline.json");
const service = new MetadataModelService();

for (const [file, hash] of Object.entries(baseline.sha256)) {
    const metadata = readFileSync(path.join(fixtures, file), "utf8");
    const csdl = service.getCsdl({ metadata });
    const before = structuredClone(csdl);
    const summary = service.getSchemaSummary(metadata, baseline.root);
    assert.equal(createHash("sha256").update(summary.yaml).digest("hex"), hash, `${file} YAML bytes`);
    const yaml = load(summary.yaml);
    const qualify = (name) => name.startsWith("Edm.") || name.includes(".") ? name : `${yaml.namespace}.${name}`;
    const ref = (value) => {
        const nullable = value.endsWith("?");
        const type = value.replace(/\?$/, "").replace(/ contained$/, "");
        return { qname: qualify(type.replace(/\[\]$/, "")), collection: type.endsWith("[]"), nullable };
    };
    const yamlTypes = new Map(Object.entries(yaml.types || {}).map(([name, type]) => [qualify(name), type]));
    const inherited = (qname) => {
        const type = yamlTypes.get(qname);
        assert(type, `${file} YAML type ${qname}`);
        return [
            ...(type.base ? inherited(qualify(type.base)) : []),
            ...Object.entries(type.props || {}).map(([name, value]) => ({ kind: "property", name, ...ref(value) })),
            ...Object.entries(type.nav || {}).map(([name, value]) => ({ kind: "navigation", name, ...ref(value.replace(/ contained$/, "")) })),
        ];
    };
    for (const qname of yamlTypes.keys()) {
        const type = findType(csdl, qname);
        assert(type, `${file} canonical type ${qname}`);
        assert.deepEqual(members(csdl, type).map((member) => ({
            kind: member.kind, name: member.record.name, ...memberType(member),
            nullable: member.kind === "navigation" && member.record.target.collection ? false : member.record.nullable,
        })), inherited(qname), `${file} editor members of ${qname}`);
    }
    for (const [label, kind] of [["sets", "set"], ["singletons", "singleton"]]) {
        const records = kind === "set" ? csdl.entitySets : csdl.singletons;
        assert.deepEqual(records.map((record) => record.name).sort(), Object.keys(yaml[label] || {}).sort(), `${file} ${label} names`);
        for (const [name, value] of Object.entries(yaml[label] || {})) {
            const found = findRoot(csdl, name);
            assert.equal(found.kind, "found", `${file} root ${name}`);
            assert.equal(found.value.kind, kind);
            assert.equal(resourceType(csdl, found.value).qname, qualify(typeof value === "string" ? value : value.type));
        }
    }
    assert.deepEqual(csdl.functionImports.map((entry) => entry.name).sort(), Object.keys(yaml.imports || {}).sort(), `${file} query import names`);
    for (const [name, value] of Object.entries(yaml.imports || {})) {
        const found = findRoot(csdl, name);
        assert.equal(found.kind, "found", `${file} import ${name}`);
        assert.equal(found.value.kind, "functionImport");
        assert.equal(found.value.record.function, value.function);
        assert.equal(found.value.record.entitySet, value.set);
    }
    for (const [name, value] of Object.entries(yaml.enums || {})) {
        const enumeration = csdl.enums.find((entry) => entry.qname === qualify(name));
        assert(enumeration, `${file} enum ${name}`);
        assert.deepEqual(enumeration.members, Array.isArray(value) ? value : value.members);
        assert.equal(enumeration.isFlags, !Array.isArray(value));
    }
    const operation = (fn) => ({
        name: fn.qname,
        bound: fn.bound,
        params: fn.params.map((param) => ({ name: param.name, ...param.type, nullable: param.nullable })),
        returns: fn.returns && { ...fn.returns.type, nullable: fn.returns.nullable },
        composable: fn.composable,
        entitySetPath: fn.entitySetPath,
    });
    const operations = csdl.functions.map(operation);
    for (const fn of yaml.functions || []) {
        const expected = {
            name: fn.name,
            bound: fn.bound ? (({ nullable, ...type }) => type)(ref(fn.bound)) : undefined,
            params: Object.entries(fn.params || {}).map(([name, type]) => ({ name, ...ref(type) })),
            returns: fn.returns ? ref(fn.returns) : undefined,
            composable: fn.composable,
            entitySetPath: fn.entitySetPath,
        };
        assert(operations.some((candidate) => isDeepStrictEqual(candidate, expected)), `${file} function overload ${fn.name}`);
    }
    assert.deepEqual(csdl, before, `${file} queries and summaries do not mutate declarations`);
    console.log(`${file} compact hash and canonical query declarations agree`);
}
