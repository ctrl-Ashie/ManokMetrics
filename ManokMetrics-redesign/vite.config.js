import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import {
  answerAssistant,
  assistantEnabled,
  checkRateLimit,
  getAssistantConfig,
  isAllowedOrigin,
} from "./server/assistant-service.mjs";

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
    plugins: [react(), assistantApi(environment), viteSingleFile()],
    base: "./",
    build: {
      cssCodeSplit: false,
    },
  };
});
