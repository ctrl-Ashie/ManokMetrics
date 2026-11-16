import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";
import {
  answerAssistant,
  assistantEnabled,
  checkRateLimit,
  getAssistantConfig,
  isAllowedOrigin,
} from "./server/assistant-service.mjs";

const importedDirectory = path.resolve("public/data/imported");
const metadataPath = path.join(importedDirectory, "datasets.json");

function readMetadata() {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch {
    return [];
  }
}

function writeMetadata(metadata) {
  fs.mkdirSync(importedDirectory, { recursive: true });
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

function importedDatasetsApi() {
  return {
    name: "manokmetrics-imported-datasets",
    configureServer(server) {
      server.middlewares.use("/api/imported-datasets", (request, response, next) => {
        const requestUrl = new URL(request.url || "/", "http://localhost");
        const requestedId = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ""));
        const metadata = readMetadata();
        if (request.method === "GET" && !requestedId) {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(metadata));
          return;
        }
        if (request.method === "GET" && requestedId) {
          const entry = metadata.find(item => item.id === requestedId);
          if (!entry) {
            response.statusCode = 404;
            response.end("Dataset not found.");
            return;
          }
          const filePath = path.join(importedDirectory, entry.file);
          if (!fs.existsSync(filePath)) {
            response.statusCode = 404;
            response.end("Dataset file is missing.");
            return;
          }
          response.setHeader("Content-Type", "text/csv");
          fs.createReadStream(filePath).pipe(response);
          return;
        }
        if (request.method === "DELETE" && requestedId) {
          const entry = metadata.find(item => item.id === requestedId);
          if (!entry) {
            response.statusCode = 404;
            response.end("Dataset not found.");
            return;
          }
          try {
            fs.rmSync(path.join(importedDirectory, entry.file), { force: true });
            writeMetadata(metadata.filter(item => item.id !== requestedId));
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ ok: true }));
          } catch (error) {
            response.statusCode = 500;
            response.end(`Dataset deletion failed: ${error.message}`);
          }
          return;
        }
        if (request.method === "POST" && !requestedId) {
          const chunks = [];
          request.on("data", chunk => chunks.push(chunk));
          request.on("end", () => {
            try {
              const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              if (!payload.filename || typeof payload.csv !== "string" || !payload.metadata) throw new Error("Invalid dataset payload.");
              const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              const safeName = path.basename(payload.filename).replace(/[^a-zA-Z0-9._-]/g, "_") || "dataset.csv";
              const file = `${id}-${safeName}`;
              fs.mkdirSync(importedDirectory, { recursive: true });
              fs.writeFileSync(path.join(importedDirectory, file), payload.csv, "utf8");
              const entry = { ...payload.metadata, id, originalFilename: payload.filename, file, storedAt: new Date().toISOString() };
              writeMetadata([...metadata, entry]);
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify(entry));
            } catch (error) {
              response.statusCode = 400;
              response.end(`Dataset storage failed: ${error.message}`);
            }
          });
          return;
        }
        next();
      });
    },
  };
}

function assistantApi(environment) {
  const config = getAssistantConfig(environment);
  const rateLimit = new Map();
  return {
    name: "manokmetrics-assistant-api",
    configureServer(server) {
      server.middlewares.use("/api/assistant", (request, response, next) => {
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET") {
          response.end(JSON.stringify({ enabled: assistantEnabled(config) }));
          return;
        }
        if (request.method !== "POST") {
          next();
          return;
        }
        if (!isAllowedOrigin(request.headers.origin, config, request.headers.host)) {
          response.statusCode = 403;
          response.end(JSON.stringify({ message: "Request origin is not allowed." }));
          return;
        }
        if (!checkRateLimit(rateLimit, request.socket.remoteAddress || "unknown")) {
          response.statusCode = 429;
          response.end(JSON.stringify({ message: "Too many assistant requests. Please try again shortly." }));
          return;
        }
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        request.on("data", chunk => {
          size += chunk.length;
          if (size <= 128 * 1024) chunks.push(chunk);
          else tooLarge = true;
        });
        request.on("end", async () => {
          try {
            if (tooLarge) {
              response.statusCode = 413;
              response.end(JSON.stringify({ message: "Request too large." }));
              return;
            }
            const result = await answerAssistant(JSON.parse(Buffer.concat(chunks).toString("utf8")), config);
            response.statusCode = result.status;
            response.end(JSON.stringify(result.body));
          } catch {
            response.statusCode = 400;
            response.end(JSON.stringify({ message: "The assistant could not process that request." }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [react(), importedDatasetsApi(), assistantApi(environment), viteSingleFile()],
    base: "./",
    build: {
      cssCodeSplit: false,
    },
  };
});
