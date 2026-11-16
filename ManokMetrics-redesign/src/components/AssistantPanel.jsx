import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Bot, Check, Compass, Lightbulb, LineChart, LoaderCircle, RotateCcw, Send, ShieldAlert, Store, TrendingUp, X } from "lucide-react";
import { buildAssistantContext } from "../utils/assistant.js";

const CONSENT_KEY = "manok-ai-consent-v1";

function renderMessage(text) {
const lines = String(text).split(/\r?\n/);
return lines.map((line, index) => {
  const heading = line.match(/^(?:#{1,4}\s*)?\*{0,2}([^:*]+):\*{0,2}\s*(.*)$/);
  if (heading) return <div className="assistant-section" key={`${index}-${line}`}><h4>{heading[1]}</h4>{heading[2] && <p>{heading[2]}</p>}</div>;
  if (/^\s*[-*]\s+/.test(line)) return <div className="assistant-bullet" key={`${index}-${line}`}>• {line.replace(/^\s*[-*]\s+/, "")}</div>;
  if (!line.trim()) return <span className="assistant-break" key={`${index}-break`} />;
  return <p key={`${index}-${line.slice(0, 12)}`}>{line}</p>;
});
}

export default function AssistantPanel({
  t, lang, page, product, scope, unit, rows, engine, recommendation, events,
  farmOverride, horizon, predictedMarket, predictedFarmgate, stats, analysis,
  dataInfo, settings, visible,
}) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(null);
  const [consent, setConsent] = useState(() => {
    try { return window.localStorage.getItem(CONSENT_KEY) || null; } catch { return null; }
  });
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const messagesRef = useRef(null);
  const buttonRef = useRef(null);

  const context = useMemo(() => buildAssistantContext({
    page, product, scope, unit, rows, engine, recommendation, events, farmOverride,
    horizon, language: lang, predictedMarket, predictedFarmgate, stats, analysis, dataInfo, settings,
  }), [page, product, scope, unit, rows, engine, recommendation, events, farmOverride, horizon, lang, predictedMarket, predictedFarmgate, stats, analysis, dataInfo, settings]);

  useEffect(() => {
    let active = true;
    fetch("/api/assistant", { headers: { Accept: "application/json" } })
      .then(response => response.ok ? response.json() : { enabled: false })
      .then(result => { if (active) setAvailable(result.enabled === true); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const closeOnEscape = event => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (open && messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, loading, open]);

  const tasksByPage = {
    dashboard: [
      ["ai.task.conditions", Store, "conditions"],
      ["ai.task.movements", TrendingUp, "movements"],
      ["ai.task.compare", BarChart3, "compare"],
    ],
    predict: [
      ["ai.task.forecast", LineChart, "forecast"],
      ["ai.task.reliability", Compass, "reliability"],
      ["ai.task.recommendations", Lightbulb, "recommendations"],
    ],
    analysis: [
      ["ai.task.patterns", TrendingUp, "patterns"],
      ["ai.task.indicators", BarChart3, "indicators"],
      ["ai.task.correlation", Compass, "correlation"],
    ],
    data: [
      ["ai.task.records", Store, "records"],
      ["ai.task.trends", TrendingUp, "trends"],
      ["ai.task.unusual", Lightbulb, "unusual"],
    ],
    settings: [
      ["ai.task.settings", Compass, "settings"],
      ["ai.task.models", LineChart, "models"],
      ["ai.task.changes", Lightbulb, "changes"],
    ],
    faq: [
      ["ai.task.using", Compass, "using"],
      ["ai.task.features", BarChart3, "features"],
      ["ai.task.sources", Store, "sources"],
    ],
  };
  const tasks = tasksByPage[page] || tasksByPage.dashboard;

  const chooseConsent = value => {
    setConsent(value ? "accepted" : "declined");
    try { window.localStorage.setItem(CONSENT_KEY, value ? "accepted" : "declined"); } catch { /* optional preference */ }
  };

  const send = async value => {
    const text = String(value ?? question).trim();
    if (!text || loading || consent !== "accepted") return;
    setShowTasks(false);
    setQuestion("");
    setError("");
    setMessages(current => [...current, { role: "user", content: text }]);
    setLoading(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question: text, language: lang, context, messages: messages.slice(-8) }),
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

  const [showTasks, setShowTasks] = useState(true);
  const selectTask = task => {
    const title = t(`ai.task.${task.key}`);
    send(`${title}\n\n${t(`ai.task.${task.key}.prompt`)} ${t("ai.structured")}`);
  };
  const reset = () => { setMessages([]); setQuestion(""); setError(""); setShowTasks(true); };
  if (!visible) return null;

  return (
    <div className={`assistant-dock ${open ? "is-open" : ""}`}>
      {open && (
        <section className="assistant-drawer" role="dialog" aria-modal="false" aria-labelledby="assistant-title">
          <div className="assistant-drawer-head">
            <span className="assistant-title"><span className="assistant-icon"><Bot size={18} /></span><span><b id="assistant-title">{t("ai.title")}</b><small>{t("ai.subtitle")}</small></span></span>
            <button type="button" className="assistant-close" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} aria-label={t("ai.close")}><X size={18} /></button>
          </div>
          <div className="assistant-body">
            <p className="assistant-intro">{t("ai.intro")}</p>
            {available === false && <div className="assistant-notice"><ShieldAlert size={16} />{t("ai.disabled")}</div>}
            {consent === null && <div className="assistant-consent"><p>{t("ai.consent")}</p><div><button className="btn btn-primary" type="button" onClick={() => chooseConsent(true)}><Check size={15} />{t("ai.allow")}</button><button className="btn btn-ghost" type="button" onClick={() => chooseConsent(false)}>{t("ai.decline")}</button></div></div>}
            {consent === "declined" && <div className="assistant-notice">{t("ai.declined")} <button type="button" className="link-button" onClick={() => chooseConsent(true)}>{t("ai.enable")}</button></div>}
            {consent === "accepted" && (
              <>
                <div className="assistant-messages" ref={messagesRef} aria-live="polite">
                  {(showTasks || !messages.length) && <div className="assistant-guided"><h3>{t("ai.question")}</h3><div className="assistant-task-grid">{tasks.map(([key, Icon, taskKey]) => <button className="assistant-task" key={key} type="button" onClick={() => selectTask({ key: taskKey })} disabled={available !== true}><span className="assistant-task-icon"><Icon size={16} /></span><span><b>{t(key)}</b><small>{t(`${key}.description`)}</small></span></button>)}</div></div>}
                  {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`assistant-message ${message.role}`}>{renderMessage(message.content)}</div>)}
                  {loading && <div className="assistant-message assistant loading"><LoaderCircle size={16} className="spin" />{t("ai.loading")}</div>}
                </div>
                {error && <div className="assistant-error">{error}</div>}
                <form className="assistant-form" onSubmit={event => { event.preventDefault(); send(); }}>
                  <textarea ref={inputRef} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={t("ai.placeholder")} aria-label={t("ai.placeholder")} disabled={loading || available !== true} rows="2" />
                  <button className="btn btn-primary assistant-send" type="submit" disabled={loading || available !== true || !question.trim()}><Send size={15} />{t("ai.send")}</button>
                </form>
                <div className="assistant-footer"><small>{t("ai.privacy")}</small><span className="assistant-footer-actions">{messages.length > 0 && !showTasks && <button type="button" className="link-button" onClick={() => setShowTasks(true)}>{t("ai.more")}</button>}<button type="button" className="link-button" onClick={reset}><RotateCcw size={13} />{t("ai.new")}</button></span></div>
              </>
            )}
          </div>
        </section>
      )}
      <button ref={buttonRef} type="button" className="assistant-fab" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={open ? t("ai.close") : t("ai.open")}><Bot size={20} /><span>{t("ai.open")}</span></button>
    </div>
  );
}
