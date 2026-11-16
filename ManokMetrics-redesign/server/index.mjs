import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  answerAssistant,
  assistantEnabled,
  checkRateLimit,
  getAssistantConfig,
  isAllowedOrigin,
} from "./assistant-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(root, "dist");
const config = getAssistantConfig();
const rateLimit = new Map();
const port = Number(process.env.PORT) || 3000;

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function readBody(request, maxBytes = 128 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("Invalid JSON request.")); }
    });
    request.on("error", reject);
  });
}

function contentType(filePath) {
  return { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" }[path.extname(filePath)] || "application/octet-stream";
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  if (requestUrl.pathname === "/api/assistant") {
    response.setHeader("Vary", "Origin");
    if (request.method === "GET") {
      sendJson(response, 200, { enabled: assistantEnabled(config) });
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { message: "Method not allowed." });
      return;
    }
    if (!isAllowedOrigin(request.headers.origin, config, request.headers.host)) {
      sendJson(response, 403, { message: "Request origin is not allowed." });
      return;
    }
    if (!checkRateLimit(rateLimit, request.socket.remoteAddress || "unknown")) {
      sendJson(response, 429, { message: "Too many assistant requests. Please try again shortly." });
      return;
    }
    try {
      const result = await answerAssistant(await readBody(request), config);
      sendJson(response, result.status, result.body);
    } catch {
      sendJson(response, 400, { message: "The assistant could not process that request." });
    }
    return;
  }

  const requested = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.replace(/^\/+/, "");
  const filePath = path.resolve(distDirectory, requested);
  if (!(filePath === distDirectory || filePath.startsWith(`${distDirectory}${path.sep}`)) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.statusCode = 404;
    response.end("Not found.");
    return;
  }
  response.setHeader("Content-Type", contentType(filePath));
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`ManokMetrics server listening on port ${port}`);
});
