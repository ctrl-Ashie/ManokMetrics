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

function assistantApi() {
  const providerUrl = process.env.AI_API_URL || "";
  const apiKey = process.env.AI_API_KEY || "";
  const model = process.env.AI_MODEL || "";
  const enabled = Boolean(providerUrl && apiKey && model);
  return {
    name: "manokmetrics-assistant-api",
    configureServer(server) {
      server.middlewares.use("/api/assistant", (request, response, next) => {
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET") {
          response.end(JSON.stringify({ enabled }));
          return;
        }
        if (request.method !== "POST") {
          next();
          return;
        }
        if (!enabled) {
          response.statusCode = 503;
          response.end(JSON.stringify({ message: "The AI assistant is not configured.", code: "CONFIGURATION_MISSING" }));
          return;
        }
        const chunks = [];
        request.on("data", chunk => chunks.push(chunk));
        request.on("end", async () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!payload.question || typeof payload.question !== "string" || payload.question.length > 2000) {
              throw new Error("Please enter a shorter question.");
            }
            const language = payload.language === "fil" ? "Filipino" : "English";
            const context = JSON.stringify(payload.context || {});
            const history = Array.isArray(payload.messages) ? payload.messages.slice(-8) : [];
            const system = `You are the ManokMetrics AI Assistant. Answer in ${language} for a beginner audience. Explain the dashboard's existing data; never replace its forecasting engine. Never invent numbers, observations, model metrics, causes, current news, or PSA data. Distinguish observed prices, engine predictions, and user-entered assumptions. If a value is null or absent, say it is unavailable. External-event impacts are assumptions, not verified effects. Historical association is not causation. Use only the supplied dashboard context and conversation. Keep answers concise and readable.`;
            const providerResponse = await fetch(providerUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model,
                temperature: 0.2,
                messages: [
                  { role: "system", content: system },
                  { role: "system", content: `Dashboard context (use the latest values only): ${context}` },
                  ...history.filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string"),
                  { role: "user", content: payload.question },
                ],
              }),
              signal: AbortSignal.timeout(30000),
            });
            const providerBody = await providerResponse.json().catch(() => ({}));
            if (!providerResponse.ok) {
              response.statusCode = providerResponse.status === 429 ? 429 : 502;
              response.end(JSON.stringify({ message: providerResponse.status === 429 ? "The AI service is busy. Please try again shortly." : "The AI service could not answer this request." }));
              return;
            }
            const content = providerBody.choices?.[0]?.message?.content;
            const answer = Array.isArray(content) ? content.map(part => part?.text || "").join("") : content;
            if (typeof answer !== "string" || !answer.trim()) throw new Error("The AI service returned an empty answer.");
            response.end(JSON.stringify({ answer: answer.trim() }));
          } catch (error) {
            response.statusCode = error.name === "TimeoutError" ? 504 : 400;
            response.end(JSON.stringify({ message: error.name === "TimeoutError" ? "The AI service took too long to respond." : "The assistant could not process that request." }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), importedDatasetsApi(), assistantApi(), viteSingleFile()],
  base: "./",
  build: {
    cssCodeSplit: false,
  },
});
