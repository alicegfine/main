// Minimal zero-dependency static server for OrgDraft, plus a tiny shared-state API.
//
// Static files: serves this directory, binds to $PORT on 0.0.0.0, defaults to index.html.
//
// Shared org API (so one version lives at the URL and everyone edits it):
//   GET  /api/org -> { rev, data }            (rev 0 / data null when nothing saved yet)
//   PUT  /api/org { rev, data } -> { rev }     (409 { rev, data } if rev is stale)
// State is a single JSON file. Set DATA_FILE to a path on a Railway Volume (e.g.
// /data/org.json) so it survives redeploys; otherwise it lives next to the app and
// is lost when the container is rebuilt.

import { createServer } from "node:http";
import { readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || join(ROOT, ".data", "org.json");
const MAX_BODY = 8 * 1024 * 1024; // 8MB cap

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

async function readState() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { rev: parsed.rev || 0, data: parsed.data ?? null, savedAt: parsed.savedAt || null };
  } catch (e) {
    return { rev: 0, data: null, savedAt: null }; // nothing saved yet
  }
}

async function writeState(state) {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(state));
  await rename(tmp, DATA_FILE); // atomic replace
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname !== "/api/org") {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if (req.method === "GET") {
    const s = await readState();
    sendJson(res, 200, { rev: s.rev, data: s.data, savedAt: s.savedAt });
    return;
  }
  if (req.method === "PUT") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      sendJson(res, 400, { error: "invalid JSON" });
      return;
    }
    const current = await readState();
    const sentRev = Number(body.rev) || 0;
    if (sentRev !== current.rev) {
      // someone else saved since this client last loaded
      sendJson(res, 409, { rev: current.rev, data: current.data });
      return;
    }
    const next = { rev: current.rev + 1, savedAt: new Date().toISOString(), data: body.data ?? null };
    await writeState(next);
    sendJson(res, 200, { rev: next.rev, savedAt: next.savedAt });
    return;
  }
  res.writeHead(405, { Allow: "GET, PUT" }).end("Method not allowed");
}

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);

    if (pathname === "/api/org" || pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    let filePath = pathname === "/" || pathname.endsWith("/") ? pathname + "index.html" : pathname;
    filePath = normalize(join(ROOT, filePath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    const bodyBuf = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(bodyBuf);
  } catch (err) {
    console.error("Request failed:", req.method, req.url, err);
    // Only send a response if we haven't already started one — otherwise writeHead
    // throws ("headers already sent") and that error escapes as an unhandled rejection.
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" }).end("Server error");
    } else {
      res.end();
    }
  }
});

// A dropped/aborted client socket emits 'error' on the request; if nothing listens,
// Node treats it as uncaught and kills the process. Swallow it — it's not our bug.
server.on("clientError", (err, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

// Last-resort safety net: keep one bad request (or a transient disk error during a
// save) from taking the whole server down. This is the most common reason a deploy
// reports "successful" and then the app shows up as "crashed" minutes later.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OrgDraft running on http://0.0.0.0:${PORT}  (data: ${DATA_FILE})`);
});
