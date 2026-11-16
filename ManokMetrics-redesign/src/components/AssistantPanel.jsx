import React, { useEffect, useMemo, useState } from "react";
import { Bot, Check, LoaderCircle, RotateCcw, Send, ShieldAlert, X } from "lucide-react";
import { buildAssistantContext } from "../utils/assistant.js";

const CONSENT_KEY = "manok-ai-consent-v1";

function renderMessage(text) {
  return String(text).split(/\n{2,}/).map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
  ));
}

export default function AssistantPanel({ t, lang, product, scope, unit, rows, engine, recommendation, events, farmOverride, horizon, predictedMarket, predictedFarmgate }) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(null);
  const [consent, setConsent] = useState(() => {
    try { return window.localStorage.getItem(CONSENT_KEY) || null; } catch { return null; }
  });
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const context = useMemo(() => buildAssistantContext({
    product, scope, unit, rows, engine, recommendation, events, farmOverride, horizon, language: lang, predictedMarket, predictedFarmgate,
  }), [product, scope, unit, rows, engine, recommendation, events, farmOverride, horizon, lang, predictedMarket, predictedFarmgate]);

  useEffect(() => {
    let active = true;
    fetch("/api/assistant", { headers: { Accept: "application/json" } })
      .then(response => response.ok ? response.json() : { enabled: false })
      .then(result => { if (active) setAvailable(result.enabled === true); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);

  const suggestions = [
    t("ai.suggest.forecast"),
    t("ai.suggest.reliable"),
    t("ai.suggest.difference"),
    t("ai.suggest.metrics"),
    t("ai.suggest.trend"),
  ];

  const chooseConsent = value => {
    setConsent(value ? "accepted" : "declined");
    try { window.localStorage.setItem(CONSENT_KEY, value ? "accepted" : "declined"); } catch { /* optional preference */ }
  };

  const send = async value => {
    const text = String(value ?? question).trim();
    if (!text || loading || consent !== "accepted") return;
    setQuestion("");
    setError("");
    setMessages(current => [...current, { role: "user", content: text }]);
    setLoading(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          question: text,
          language: lang,
          context,
          messages: messages.slice(-8),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.answer !== "string" || !result.answer.trim()) {
        throw new Error(result.message || t("ai.error.unavailable"));
      }
      setMessages(current => [...current, { role: "assistant", content: result.answer.trim() }]);
    } catch (requestError) {
      setError(requestError.message || t("ai.error.unavailable"));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setMessages([]); setQuestion(""); setError(""); };

  return (
    <section className="card assistant-panel">
      <button type="button" className="assistant-summary" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <span className="assistant-title"><span className="assistant-icon"><Bot size={18} /></span><span><b>{t("ai.title")}</b><small>{t("ai.subtitle")}</small></span></span>
        <span className="assistant-toggle">{open ? <X size={18} /> : <Bot size={18} />}</span>
      </button>
      {open && (
        <div className="assistant-body">
          <p className="assistant-intro">{t("ai.intro")}</p>
          {available === false && <div className="assistant-notice"><ShieldAlert size={16} />{t("ai.disabled")}</div>}
          {consent === null && (
            <div className="assistant-consent">
              <p>{t("ai.consent")}</p>
              <div><button className="btn btn-primary" type="button" onClick={() => chooseConsent(true)}><Check size={15} />{t("ai.allow")}</button><button className="btn btn-ghost" type="button" onClick={() => chooseConsent(false)}>{t("ai.decline")}</button></div>
            </div>
          )}
          {consent === "declined" && <div className="assistant-notice">{t("ai.declined")} <button type="button" className="link-button" onClick={() => chooseConsent(true)}>{t("ai.enable")}</button></div>}
          {consent === "accepted" && (
            <>
              <div className="assistant-messages" aria-live="polite">
                {!messages.length && <div className="assistant-suggestions">{suggestions.map(suggestion => <button key={suggestion} type="button" onClick={() => send(suggestion)} disabled={available !== true}>{suggestion}</button>)}</div>}
                {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`assistant-message ${message.role}`}>{renderMessage(message.content)}</div>)}
                {loading && <div className="assistant-message assistant loading"><LoaderCircle size={16} className="spin" />{t("ai.loading")}</div>}
              </div>
              {error && <div className="assistant-error">{error}</div>}
              <form className="assistant-form" onSubmit={event => { event.preventDefault(); send(); }}>
                <textarea value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={t("ai.placeholder")} aria-label={t("ai.placeholder")} disabled={loading || available !== true} rows="2" />
                <button className="btn btn-primary assistant-send" type="submit" disabled={loading || available !== true || !question.trim()}><Send size={15} />{t("ai.send")}</button>
              </form>
              <div className="assistant-footer"><small>{t("ai.privacy")}</small><button type="button" className="link-button" onClick={reset}><RotateCcw size={13} />{t("ai.new")}</button></div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
