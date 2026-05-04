import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function toText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

function toStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  }
  return [toText(value)];
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

const examples = [
  "What is a sensible low-risk bet for Arsenal vs Chelsea?",
  "Explain a cautious option for Liverpool vs Manchester City",
  "I am under 18, what should I bet on?",
  "Give me a guaranteed winner tonight"
];

function App() {
  const [query, setQuery] = useState(examples[0]);
  const [riskProfile, setRiskProfile] = useState("conservative");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  async function submit(event) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch(`${API_BASE}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context: { riskProfile } })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResponse(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AcquireAI Hackathon Prototype</p>
        <h1>Natural Language Betting Recommendation Agent</h1>
        <p className="subtitle">
          Text-only MVP with live odds support, LLM structured output, and responsible gambling safeguards.
        </p>
      </section>

      <section className="card">
        <form onSubmit={submit}>
          <label htmlFor="query">Ask a betting question</label>
          <textarea
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={4}
          />

          <div className="controls">
            <label>
              Risk profile
              <select value={riskProfile} onChange={(e) => setRiskProfile(e.target.value)}>
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Aggressive demo only</option>
              </select>
            </label>
            <button disabled={loading || !query.trim()} type="submit">
              {loading ? "Thinking..." : "Get recommendation"}
            </button>
          </div>
        </form>

        <div className="examples">
          {examples.map((item) => (
            <button key={item} type="button" onClick={() => setQuery(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      {error && <section className="error">{error}</section>}

      {response && (
        <section className="result card">
          <div className="badge">Risk: {toText(response.riskLevel)}</div>
          <h2>Recommendation</h2>
          <p>{toText(response.recommendation)}</p>

          <h3>Rationale</h3>
          <p>{toText(response.rationale)}</p>

          {response.oddsUsed?.length > 0 && (
            <>
              <h3>Odds used</h3>
              <ul>
                {response.oddsUsed.map((odd, index) => {
                  if (typeof odd === "string") return <li key={index}>{odd}</li>;
                  const event = toText(odd.event || odd.eventName || odd.bet || "");
                  const market = toText(odd.market || odd.marketName || "");
                  const selection = toText(odd.selection || odd.selectionName || "");
                  const odds = toText(odd.odds || odd.odd || "");
                  const implied = toText(odd.impliedProbability || "");
                  return (
                    <li key={`${event}-${index}`}>
                      <strong>{event}</strong>
                      {market ? ` — ${market}` : ""}
                      {selection ? `: ${selection}` : ""}
                      {odds ? ` @ ${odds}` : ""}
                      {implied ? ` (${implied}% implied)` : ""}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {toStringList(response.warnings).length > 0 && (
            <div className="warning">
              <h3>Warnings</h3>
              <ul>
                {toStringList(response.warnings).map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="notice">
            <strong>Responsible gambling:</strong> {toText(response.responsibleGamblingNotice)}
          </div>

          {response.meta && (
            <p className="meta">
              Model: {response.meta.model} · Odds source: {response.meta.oddsSource} · Latency: {response.meta.latencyMs}ms
            </p>
          )}

          {response.debug?.llmInput && (
            <details className="debug">
              <summary>GPT input payload (debug)</summary>
              <pre>{JSON.stringify(response.debug.llmInput, null, 2)}</pre>
            </details>
          )}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
