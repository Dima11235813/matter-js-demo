// CPU cost of the API's JS work per request (no DB I/O): JSON parse + zod + merge + stringify.
// docs/research/hosting/cloudflare.md §2.2 (Workers Free allows 10 ms CPU per request).
// Run: npx tsx docs/research/experiments/hosting-cpu-bench.mts
import { randomUUID } from "node:crypto";
import {
    PushRequest, PushResponse, PullResponse, SyncRecord, mergeRecords, sameRecord, wordKey, encodeVector,
} from "../../../packages/shared/src/index.ts";

const deviceId = randomUUID();
const model = "Xenova/all-MiniLM-L6-v2", dtype = "q8";
function wordRecord(i: number) {
    const v = new Float32Array(384).map(() => Math.random() - 0.5);
    const word = `word${i}`;
    return { collection: "words", key: wordKey(word, model, dtype), schemaVersion: 1, clientUpdatedAt: Date.now(), deviceId,
        payload: { word, vector: encodeVector(v), model, dtype, createdAt: Date.now() } };
}
function analogyRecord(i: number) {
    return { collection: "analogies", key: `a${i}|b|c`, schemaVersion: 1, clientUpdatedAt: Date.now(), deviceId,
        payload: { a: `a${i}`, b: "b", c: "c", answer: "d", similarity: 0.8, alternatives: Array.from({ length: 10 }, (_, j) => ({ word: `w${j}`, similarity: 0.5 })),
            vocabVersion: "v1", playsByDevice: { [deviceId]: 3 }, createdAt: Date.now() } };
}

function bench(name: string, records: unknown[], iterations = 50) {
    const body = JSON.stringify({ deviceId, records });
    // warm up
    if (records.length > 200) iterations = iterations; const doPush = records.length <= 200;
    for (let i = 0; doPush && i < 5; i++) run(body);
    const t0 = performance.now();
    for (let i = 0; doPush && i < iterations; i++) run(body);
    const push = (performance.now() - t0) / iterations;

    const pullBody = JSON.stringify({ changes: records.map((r, i) => ({ serverSeq: i + 1, record: r })), nextCursor: "1", hasMore: false });
    const pullRows = records.map((r, i) => ({ record: r, server_seq: String(i + 1) }));
    for (let i = 0; i < 5; i++) pull(pullRows);
    const t1 = performance.now();
    for (let i = 0; i < iterations; i++) pull(pullRows);
    const pullMs = (performance.now() - t1) / iterations;
    console.log(`${name}: body ${(body.length / 1024).toFixed(0)} KB, push JS ${push.toFixed(2)} ms, pull JS ${pullMs.toFixed(2)} ms (pull body ${(pullBody.length / 1024).toFixed(0)} KB)`);
}
function run(body: string) {
    const req = PushRequest.parse(JSON.parse(body));
    const out: unknown[] = [];
    for (const incoming of req.records) {
        // simulate a stored copy: re-parse a JSON roundtrip of itself (as the pg driver would deliver jsonb)
        const stored = SyncRecord.parse(JSON.parse(JSON.stringify(incoming)));
        const merged = mergeRecords(stored, incoming);
        JSON.stringify(merged);
        const changed = !sameRecord(merged, incoming);
        out.push({ collection: incoming.collection, key: incoming.key, status: changed ? "merged" : "applied", serverSeq: 1, ...(changed ? { record: merged } : {}) });
    }
    JSON.stringify(PushResponse.parse({ results: out }));
}
function pull(rows: { record: unknown; server_seq: string }[]) {
    JSON.stringify(PullResponse.parse({ changes: rows.map(r => ({ serverSeq: Number(r.server_seq), record: r.record })), nextCursor: "1", hasMore: false }));
}

bench("1 word (typical 30 s push)", [wordRecord(0)], 500);
bench("10 mixed", [...Array.from({ length: 5 }, (_, i) => wordRecord(i)), ...Array.from({ length: 5 }, (_, i) => analogyRecord(i))], 200);
bench("200 words (max push, first sync)", Array.from({ length: 200 }, (_, i) => wordRecord(i)));
bench("200 analogies", Array.from({ length: 200 }, (_, i) => analogyRecord(i)));
bench("500 words (max pull page)", Array.from({ length: 500 }, (_, i) => wordRecord(i)), 20);

// RS256 JWT verification cost (Firebase ID tokens), with jose over WebCrypto
const jose = await import("file:///D:/GDrive/Dev/matter-js-demo/node_modules/jose/dist/webapi/index.js");
const { publicKey, privateKey } = await jose.generateKeyPair("RS256");
const token = await new jose.SignJWT({}).setProtectedHeader({ alg: "RS256" }).setIssuer("i").setAudience("a").setSubject("s").setExpirationTime("1h").sign(privateKey);
for (let i = 0; i < 20; i++) await jose.jwtVerify(token, publicKey);
const t = performance.now();
for (let i = 0; i < 500; i++) await jose.jwtVerify(token, publicKey);
console.log(`RS256 jwtVerify: ${((performance.now() - t) / 500).toFixed(3)} ms`);
