import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

function toText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

function toStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  }
  return [toText(value)];
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

const KNOWN_MATCHES = [
  { id: "ars-che-demo", teams: ["arsenal", "chelsea"] },
  { id: "liv-mci-demo", teams: ["liverpool", "manchester city", "man city"] },
];

function findMatchId(eventText) {
  if (!eventText) return null;
  const lower = eventText.toLowerCase();
  for (const m of KNOWN_MATCHES) {
    if (m.teams.some((t) => lower.includes(t))) return m.id;
  }
  return null;
}

const examples = [
  "What is a sensible low-risk bet for Arsenal vs Chelsea?",
  "Explain a cautious option for Liverpool vs Manchester City",
  "I am under 18, what should I bet on?",
  "Give me a guaranteed winner tonight",
];

export function HomePage() {
  const navigate = useNavigate();
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
        body: JSON.stringify({ query, context: { riskProfile } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResponse(normalizeResponse(data));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Normalize different LLM response shapes into a single canonical format:
  // { recommendation: string, riskLevel, rationale, oddsUsed[], warnings[], responsibleGamblingNotice }
  function normalizeResponse(r) {
    if (!r) return null;
    // Already in canonical shape (has oddsUsed array)
    if (Array.isArray(r.oddsUsed)) return r;
    // Shape where recommendation is an object {eventId, market, selection, odds, impliedProbability}
    const rec =
      r.recommendation && typeof r.recommendation === "object"
        ? r.recommendation
        : null;
    const oddsUsed = rec
      ? [
          {
            event: rec.eventId || "",
            market: rec.market || "",
            selection: rec.selection || "",
            odds: rec.odds ?? "",
            impliedProbability: rec.impliedProbability ?? "",
          },
          ...(Array.isArray(r.alternatives)
            ? r.alternatives.map((a) => ({
                event: rec.eventId || "",
                market: a.market || "",
                selection: a.selection || "",
                odds: a.odds ?? "",
                impliedProbability: a.impliedProbability ?? "",
              }))
            : []),
        ]
      : [];
    return {
      ...r,
      recommendation:
        r.reasoning ||
        r.rationale ||
        (rec ? `${rec.selection} @ ${rec.odds} (${rec.market})` : ""),
      riskLevel: r.riskLevel || r.confidence || "unknown",
      rationale: r.rationale || r.reasoning || r.risk || "",
      oddsUsed,
      warnings: Array.isArray(r.warnings) ? r.warnings : [],
      responsibleGamblingNotice:
        r.responsibleGamblingNotice || r.responsibleGambling || "",
    };
  }

  function viewOnBoard(odd) {
    const eventText = toText(odd.event || odd.eventName || odd.bet || "");
    const matchId = findMatchId(eventText);
    if (!matchId) return null;
    // Pass market NAME (what the LLM returns) — MatchPage handles name-vs-key matching
    const market = toText(odd.market || odd.marketKey || odd.marketName || "");
    const outcome = toText(
      odd.selection || odd.selectionName || odd.outcome || "",
    );
    return { matchId, market, outcome };
  }

  // Collect the first unique match CTA from all oddsUsed entries
  function primaryMatchCta() {
    if (!response?.oddsUsed?.length) return null;
    for (const odd of response.oddsUsed) {
      if (typeof odd === "string") continue;
      // Direct eventId from normalized response
      if (odd.event && odd.event.includes("-demo")) {
        return {
          matchId: odd.event,
          market: odd.market || "",
          outcome: odd.selection || "",
        };
      }
      const info = viewOnBoard(odd);
      if (info) return info;
    }
    return null;
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AcquireAI Hackathon Prototype</p>
        <h1>Natural Language Betting Recommendation Agent</h1>
        <p className="subtitle">
          Text-only MVP with live odds support, LLM structured output, and
          responsible gambling safeguards.
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
              <select
                value={riskProfile}
                onChange={(e) => setRiskProfile(e.target.value)}
              >
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

      <section className="matches-row">
        <p className="matches-row-label">Browse live odds boards</p>
        {KNOWN_MATCHES.map((m) => (
          <button
            key={m.id}
            className="match-pill"
            type="button"
            onClick={() => navigate({ to: "/match/$id", params: { id: m.id } })}
          >
            {m.id === "ars-che-demo"
              ? "Arsenal vs Chelsea"
              : "Liverpool vs Man City"}
            <span className="match-pill-arrow">→</span>
          </button>
        ))}
      </section>

      {error && <section className="error">{error}</section>}

      {response &&
        (() => {
          const cta = primaryMatchCta();
          return (
            <>
              {cta && (
                <div className="match-cta-card">
                  <div className="match-cta-left">
                    <span className="match-cta-icon">⚽</span>
                    <div>
                      <div className="match-cta-label">AI picked</div>
                      <div className="match-cta-selection">{cta.outcome}</div>
                      {cta.market && (
                        <div className="match-cta-market">{cta.market}</div>
                      )}
                    </div>
                  </div>
                  <button
                    className="match-cta-btn"
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/match/$id",
                        params: { id: cta.matchId },
                        search: { market: cta.market, outcome: cta.outcome },
                      })
                    }
                  >
                    View on odds board →
                  </button>
                </div>
              )}
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
                        if (typeof odd === "string")
                          return <li key={index}>{odd}</li>;
                        const event = toText(
                          odd.event || odd.eventName || odd.bet || "",
                        );
                        const market = toText(
                          odd.market || odd.marketName || "",
                        );
                        const selection = toText(
                          odd.selection || odd.selectionName || "",
                        );
                        const odds = toText(odd.odds || odd.odd || "");
                        const implied = toText(odd.impliedProbability || "");
                        const onView = viewOnBoard(odd);
                        return (
                          <li key={`${event}-${index}`}>
                            <strong>{event}</strong>
                            {market ? ` — ${market}` : ""}
                            {selection ? `: ${selection}` : ""}
                            {odds ? ` @ ${odds}` : ""}
                            {implied ? ` (${implied}% implied)` : ""}
                            {onView && (
                              <button
                                className="view-odds-btn"
                                type="button"
                                onClick={() =>
                                  navigate({
                                    to: "/match/$id",
                                    params: { id: onView.matchId },
                                    search: {
                                      market: onView.market,
                                      outcome: onView.outcome,
                                    },
                                  })
                                }
                              >
                                ↗
                              </button>
                            )}
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
                  <strong>Responsible gambling:</strong>{" "}
                  {toText(response.responsibleGamblingNotice)}
                </div>

                {response.meta && (
                  <p className="meta">
                    Model: {response.meta.model} · Odds source:{" "}
                    {response.meta.oddsSource} · Latency:{" "}
                    {response.meta.latencyMs}ms
                  </p>
                )}

                {response.debug?.llmInput && (
                  <details className="debug">
                    <summary>GPT input payload (debug)</summary>
                    <pre>
                      {JSON.stringify(response.debug.llmInput, null, 2)}
                    </pre>
                  </details>
                )}
              </section>
            </>
          );
        })()}
    </main>
  );
}
