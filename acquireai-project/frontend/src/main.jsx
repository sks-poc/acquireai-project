import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

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
          <div className="badge">Risk: {response.riskLevel}</div>
          <h2>Recommendation</h2>
          <p>{response.recommendation}</p>

          <h3>Rationale</h3>
          <p>{response.rationale}</p>

          {response.oddsUsed?.length > 0 && (
            <>
              <h3>Odds used</h3>
              <ul>
                {response.oddsUsed.map((odd, index) => (
                  <li key={`${odd.event}-${index}`}>
                    <strong>{odd.event}</strong> — {odd.market}: {odd.selection} @ {odd.odds} ({odd.impliedProbability}% implied)
                  </li>
                ))}
              </ul>
            </>
          )}

          {response.warnings?.length > 0 && (
            <div className="warning">
              <h3>Warnings</h3>
              <ul>
                {response.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="notice">
            <strong>Responsible gambling:</strong> {response.responsibleGamblingNotice}
          </div>

          {response.meta && (
            <p className="meta">
              Model: {response.meta.model} · Odds source: {response.meta.oddsSource} · Latency: {response.meta.latencyMs}ms
            </p>
          )}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
