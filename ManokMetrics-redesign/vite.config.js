import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";

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

export default defineConfig({
  plugins: [react(), importedDatasetsApi(), viteSingleFile()],
  base: "./",
  build: {
    cssCodeSplit: false,
  },
});
