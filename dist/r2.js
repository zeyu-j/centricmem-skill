/**
 * r2.ts — S3-compatible object store (Cloudflare R2) for attach originals.
 * Pairing keys never see bucket credentials. Agents PUT to a short-lived presigned URL.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolvePaths } from "./core.js";
export const R2_SIGN_TTL_SEC = 15 * 60;
const SERVICE = "s3";
const UNSIGNED = "UNSIGNED-PAYLOAD";
export function readR2Config() {
    const accountId = process.env.CENTRICMEM_R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.CENTRICMEM_R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.CENTRICMEM_R2_SECRET_ACCESS_KEY?.trim();
    const bucket = process.env.CENTRICMEM_R2_BUCKET?.trim();
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket)
        return null;
    const region = process.env.CENTRICMEM_R2_REGION?.trim() || "auto";
    const endpoint = (process.env.CENTRICMEM_R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
    const host = new URL(endpoint).host;
    return { accountId, accessKeyId, secretAccessKey, bucket, endpoint, region, host };
}
export function isR2Enabled() {
    return readR2Config() !== null;
}
export function objectKeyFor(libraryId, attachRel) {
    const lib = libraryId.replace(/[^A-Za-z0-9._-]+/g, "_") || "library";
    const rel = attachRel.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${lib}/${rel}`;
}
function hmac(key, data) {
    return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256Hex(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
}
function signingKey(secret, dateStamp, region) {
    const kDate = hmac(`AWS4${secret}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, SERVICE);
    return hmac(kService, "aws4_request");
}
function uriEncode(value, encodeSlash = true) {
    let out = "";
    for (const ch of value) {
        if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "_" || ch === "-" || ch === "." || ch === "~") {
            out += ch;
        }
        else if (ch === "/" && !encodeSlash) {
            out += ch;
        }
        else {
            const buf = Buffer.from(ch, "utf8");
            for (const b of buf)
                out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
        }
    }
    return out;
}
function canonicalUri(bucket, objectKey) {
    return `/${uriEncode(bucket, false)}/${uriEncode(objectKey, false)}`;
}
function iso8601(d = new Date()) {
    const compact = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return { amzDate: compact, dateStamp: compact.slice(0, 8) };
}
function sortedQuery(params) {
    return Object.keys(params)
        .sort()
        .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
        .join("&");
}
export function presignPut(cfg, objectKey, ttlSec = R2_SIGN_TTL_SEC) {
    const { amzDate, dateStamp } = iso8601();
    const credential = `${cfg.accessKeyId}/${dateStamp}/${cfg.region}/${SERVICE}/aws4_request`;
    const contentType = "application/octet-stream";
    const signedHeaders = "content-type;host";
    const canonicalHeaders = `content-type:${contentType}\nhost:${cfg.host}\n`;
    const query = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": credential,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": String(ttlSec),
        "X-Amz-SignedHeaders": signedHeaders,
    };
    const canonicalRequest = [
        "PUT",
        canonicalUri(cfg.bucket, objectKey),
        sortedQuery(query),
        canonicalHeaders,
        signedHeaders,
        UNSIGNED,
    ].join("\n");
    const stringToSign = [
        "AWS4-HMAC-SHA256",
        amzDate,
        `${dateStamp}/${cfg.region}/${SERVICE}/aws4_request`,
        sha256Hex(canonicalRequest),
    ].join("\n");
    const sig = hmac(signingKey(cfg.secretAccessKey, dateStamp, cfg.region), stringToSign).toString("hex");
    const putUrl = `${cfg.endpoint}${canonicalUri(cfg.bucket, objectKey)}?${sortedQuery(query)}&X-Amz-Signature=${sig}`;
    return {
        putUrl,
        headers: { "Content-Type": contentType },
        expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };
}
async function signedFetch(cfg, method, objectKey, body) {
    const { amzDate, dateStamp } = iso8601();
    const payloadHash = body ? sha256Hex(body) : sha256Hex("");
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders = `host:${cfg.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const canonicalRequest = [
        method,
        canonicalUri(cfg.bucket, objectKey),
        "",
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join("\n");
    const stringToSign = [
        "AWS4-HMAC-SHA256",
        amzDate,
        `${dateStamp}/${cfg.region}/${SERVICE}/aws4_request`,
        sha256Hex(canonicalRequest),
    ].join("\n");
    const sig = hmac(signingKey(cfg.secretAccessKey, dateStamp, cfg.region), stringToSign).toString("hex");
    const auth = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${dateStamp}/${cfg.region}/${SERVICE}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${sig}`;
    const url = `${cfg.endpoint}${canonicalUri(cfg.bucket, objectKey)}`;
    return fetch(url, {
        method,
        headers: {
            Authorization: auth,
            Host: cfg.host,
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
        },
        body: body && method !== "HEAD" && method !== "GET" && method !== "DELETE" ? new Uint8Array(body) : undefined,
    });
}
export async function r2Put(objectKey, bytes) {
    const cfg = readR2Config();
    if (!cfg)
        throw new Error("R2 is not configured.");
    const res = await signedFetch(cfg, "PUT", objectKey, bytes);
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`R2 PUT failed (${res.status}): ${text.slice(0, 200)}`);
    }
}
function listAttachFiles(dir) {
    const root = path.resolve(dir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        throw new Error(`Not a directory: ${root}`);
    }
    const out = [];
    const walk = (current) => {
        for (const name of fs.readdirSync(current)) {
            if (name === "." || name === "..")
                continue;
            const abs = path.join(current, name);
            const st = fs.statSync(abs);
            if (st.isDirectory()) {
                walk(abs);
                continue;
            }
            if (!st.isFile())
                continue;
            const rel = path.relative(root, abs).replace(/\\/g, "/");
            out.push({ abs, attachRel: `imported/attach/${rel}`, size: st.size });
        }
    };
    walk(root);
    return out;
}
async function mapPool(items, concurrency, fn) {
    let next = 0;
    const n = Math.max(1, Math.min(concurrency, items.length || 1));
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (next < items.length) {
            const item = items[next++];
            await fn(item);
        }
    }));
}
/** Copy files from a local attach directory into R2 using existing stub-relative names. Does not write Markdown. */
export async function fillAttachFromDir(opts) {
    const libraryId = opts.libraryId.trim();
    if (!libraryId)
        throw new Error("Provide --library.");
    if (!opts.dryRun && !isR2Enabled())
        throw new Error("R2 is not configured.");
    if (opts.deleteSource && opts.dryRun)
        throw new Error("--delete-source cannot be used with --dry-run.");
    const files = listAttachFiles(opts.dir);
    const result = {
        libraryId,
        scanned: files.length,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        bytes: 0,
        deleted: 0,
    };
    if (opts.dryRun) {
        result.bytes = files.reduce((n, f) => n + f.size, 0);
        return result;
    }
    await mapPool(files, opts.concurrency ?? 3, async (file) => {
        const key = objectKeyFor(libraryId, file.attachRel);
        try {
            const head = await r2Head(key);
            if (head.exists && head.size === file.size) {
                result.skipped += 1;
                result.bytes += file.size;
                if (opts.deleteSource) {
                    fs.unlinkSync(file.abs);
                    result.deleted += 1;
                }
                return;
            }
            const bytes = fs.readFileSync(file.abs);
            await r2Put(key, bytes);
            const check = await r2Head(key);
            if (!check.exists || check.size !== file.size) {
                throw new Error(`HEAD size mismatch after PUT (${check.size ?? "missing"} != ${file.size})`);
            }
            result.uploaded += 1;
            result.bytes += file.size;
            if (opts.deleteSource) {
                fs.unlinkSync(file.abs);
                result.deleted += 1;
            }
        }
        catch (error) {
            result.failed += 1;
            const msg = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 160) : "error";
            console.error(`fail ${path.basename(file.abs)}: ${msg}`);
        }
    });
    return result;
}
export async function r2Head(objectKey) {
    const cfg = readR2Config();
    if (!cfg)
        return { exists: false };
    const res = await signedFetch(cfg, "HEAD", objectKey);
    if (res.status === 404)
        return { exists: false };
    if (!res.ok) {
        throw new Error(`R2 HEAD failed (${res.status})`);
    }
    const len = res.headers.get("content-length");
    return { exists: true, size: len ? Number(len) : undefined };
}
export async function r2Get(objectKey) {
    const cfg = readR2Config();
    if (!cfg)
        throw new Error("R2 is not configured.");
    const res = await signedFetch(cfg, "GET", objectKey);
    if (res.status === 404)
        throw new Error(`Attached original missing: ${objectKey}`);
    if (!res.ok)
        throw new Error(`R2 GET failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}
export async function r2Delete(objectKey) {
    const cfg = readR2Config();
    if (!cfg)
        return;
    const res = await signedFetch(cfg, "DELETE", objectKey);
    if (res.status === 404 || res.ok)
        return;
    throw new Error(`R2 DELETE failed (${res.status})`);
}
export async function loadAttachOriginal(home, libraryId, attachRel) {
    const rel = attachRel.replace(/\\/g, "/");
    const paths = resolvePaths(home, libraryId);
    const abs = path.join(paths.memDir, ...rel.split("/"));
    if (fs.existsSync(abs) && fs.statSync(abs).isFile())
        return fs.readFileSync(abs);
    if (isR2Enabled())
        return r2Get(objectKeyFor(libraryId, rel));
    throw new Error(`Attached original missing: ${attachRel}`);
}
const pending = new Map();
export function createPendingKeep(row) {
    const uploadId = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + R2_SIGN_TTL_SEC * 1000;
    pending.set(uploadId, { ...row, expiresAt });
    return { uploadId, expiresAt: new Date(expiresAt).toISOString() };
}
export function takePendingKeep(uploadId) {
    const row = pending.get(uploadId);
    if (!row)
        throw new Error("Unknown or already used keep upload.");
    if (row.expiresAt < Date.now()) {
        pending.delete(uploadId);
        throw new Error("Keep upload expired. Sign again.");
    }
    pending.delete(uploadId);
    return row;
}
export function peekPendingKeep(uploadId) {
    return pending.get(uploadId);
}
