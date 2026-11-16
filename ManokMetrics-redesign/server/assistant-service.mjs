function configuredValue(environment, name) {
  return typeof environment[name] === "string" ? environment[name].trim() : "";
}

export function getAssistantConfig(environment = process.env) {
  return {
    providerUrl: configuredValue(environment, "AI_API_URL"),
    apiKey: configuredValue(environment, "AI_API_KEY"),
    model: configuredValue(environment, "AI_MODEL"),
    allowedOrigins: configuredValue(environment, "AI_ALLOWED_ORIGINS")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean),
  };
}

export function assistantEnabled(config) {
  return Boolean(config.providerUrl && config.apiKey && config.model);
}

export function isAllowedOrigin(origin, config, host) {
  if (!origin) return true;
  if (config.allowedOrigins.includes(origin)) return true;
  return !config.allowedOrigins.length && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    && origin.endsWith(host ? `:${host.split(":").pop()}` : origin.split(":").pop());
}

export function checkRateLimit(rateLimit, key, now = Date.now()) {
  const windowMs = 60 * 1000;
  const maxRequests = 20;
  const current = rateLimit.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateLimit.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= maxRequests) return false;
  current.count += 1;
  return true;
}

function failure(status, message) {
  return { status, body: { message } };
}

export async function answerAssistant(payload, config) {
  if (!assistantEnabled(config)) return failure(503, "The AI assistant is not configured.");
  if (!payload || typeof payload.question !== "string" || !payload.question.trim() || payload.question.length > 2000) {
    return failure(400, "Please enter a valid question of 2,000 characters or fewer.");
  }

  const language = payload.language === "fil" ? "Filipino" : "English";
  const context = JSON.stringify(payload.context || {});
  const history = Array.isArray(payload.messages) ? payload.messages.slice(-8) : [];
  const system = `You are the ManokMetrics AI Assistant. Answer in ${language} for a beginner audience. Explain the dashboard's existing data; never replace its forecasting engine. Never invent numbers, observations, model metrics, causes, current news, or PSA data. Distinguish observed prices, engine predictions, and user-entered assumptions. If a value is null or absent, say it is unavailable. External-event impacts are assumptions, not verified effects. Historical association is not causation. Use only the supplied dashboard context and conversation. Keep answers concise and readable.`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const providerResponse = await fetch(config.providerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "system", content: `Dashboard context (use the latest values only): ${context}` },
          ...history.filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string"),
          { role: "user", content: payload.question },
        ],
      }),
      signal: controller.signal,
    });
    const providerBody = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      return failure(providerResponse.status === 429 ? 429 : 502, providerResponse.status === 429
        ? "The AI service is busy. Please try again shortly."
        : "The AI service could not answer this request.");
    }
    const content = providerBody.choices?.[0]?.message?.content;
    const answer = Array.isArray(content) ? content.map(part => part?.text || "").join("") : content;
    if (typeof answer !== "string" || !answer.trim()) return failure(502, "The AI service returned an empty answer.");
    return { status: 200, body: { answer: answer.trim() } };
  } catch (error) {
    return failure(error.name === "AbortError" ? 504 : 502, error.name === "AbortError"
      ? "The AI service took too long to respond."
      : "The assistant could not reach the AI service.");
  } finally {
    clearTimeout(timeout);
  }
}
