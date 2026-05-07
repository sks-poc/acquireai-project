import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

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

const API_BASE = import.meta.env.VITE_API_BASE || "";
const HOME_STATE_KEY = "acquireai.home.state.v1";

/** Clears persisted assistant query / results (shared with /assistant). */
export function clearAssistantSessionState() {
  try {
    sessionStorage.removeItem(HOME_STATE_KEY);
  } catch (_) {}
}

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

const SCROLL_TOP_THRESHOLD_PX = 200;

export function HomePage({ embedded = false } = {}) {
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    if (embedded) return undefined;
    document.body.classList.remove("bk-landing-active");
    document.body.classList.add("assistant-view");
    document.documentElement.classList.remove("bk-landing-html");
    return () => {
      document.body.classList.remove("assistant-view");
    };
  }, [embedded]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return undefined;

    const scrollEl = embedded
      ? main.closest(".bk-chat-sheet__scroll")
      : null;
    if (embedded && !scrollEl) return undefined;

    function onScroll() {
      const y = scrollEl ? scrollEl.scrollTop : window.scrollY;
      setShowScrollTop(y > SCROLL_TOP_THRESHOLD_PX);
    }

    const target = scrollEl ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => target.removeEventListener("scroll", onScroll);
  }, [embedded]);

  function scrollAssistantToTop() {
    const main = mainRef.current;
    const scrollEl = embedded
      ? main?.closest(".bk-chat-sheet__scroll")
      : null;
    if (scrollEl) {
      scrollEl.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const [query, setQuery] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HOME_STATE_KEY) || "{}");
      return saved.query || examples[0];
    } catch (_) {
      return examples[0];
    }
  });
  const [riskProfile, setRiskProfile] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HOME_STATE_KEY) || "{}");
      return saved.riskProfile || "balanced";
    } catch (_) {
      return "balanced";
    }
  });
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HOME_STATE_KEY) || "{}");
      return saved.response || null;
    } catch (_) {
      return null;
    }
  });
  const [error, setError] = useState(null);
  const [loadingStageText, setLoadingStageText] = useState("");

  useEffect(() => {
    try {
      sessionStorage.setItem(
        HOME_STATE_KEY,
        JSON.stringify({ query, riskProfile, response }),
      );
    } catch (_) {}
  }, [query, riskProfile, response]);

  async function submit(event) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    setLoadingStageText("Generating recommendation...");

    try {
      const res = await fetch(`${API_BASE}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context: { riskProfile } }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate recommendation");
      }
      setResponse(normalizeResponse(data));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStageText("");
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
    const directEventId = toText(odd.event || odd.eventId || "").trim();
    if (directEventId) {
      return {
        matchId: directEventId,
        eventId: directEventId,
        market: toText(odd.market || odd.marketKey || odd.marketName || ""),
        outcome: toText(odd.selection || odd.selectionName || odd.outcome || ""),
      };
    }

    const eventText = toText(odd.event || odd.eventName || odd.bet || "");
    const matchId = findMatchId(eventText);
    if (!matchId) return null;
    // Pass market NAME (what the LLM returns) — MatchPage handles name-vs-key matching
    const market = toText(odd.market || odd.marketKey || odd.marketName || "");
    const outcome = toText(
      odd.selection || odd.selectionName || odd.outcome || "",
    );
    return { matchId, eventId: matchId, market, outcome };
  }

  // Collect all recs for the primary match from oddsUsed entries
  function primaryMatchCta() {
    if (!response?.oddsUsed?.length) return null;
    let firstMatchId = null;
    const recs = [];

    for (const odd of response.oddsUsed) {
      if (!odd || typeof odd === "string") continue;

      const eventId = toText(odd.event || odd.eventId || "").trim();
      const market = toText(odd.market || odd.marketKey || odd.marketName || "");
      const outcome = toText(
        odd.selection || odd.selectionName || odd.outcome || odd.pick || "",
      );
      if (!outcome) continue;

      // Keep every pick from oddsUsed even when event resolution is partial.
      recs.push({
        eventId,
        market,
        outcome,
        selection: outcome,
      });

      if (!firstMatchId) {
        if (eventId) {
          firstMatchId = eventId;
        } else {
          const info = viewOnBoard(odd);
          if (info?.matchId) firstMatchId = info.matchId;
        }
      }
    }

    if (!recs.length) return null;
    if (!firstMatchId) {
      firstMatchId = recs[0]?.eventId || null;
    }
    if (!firstMatchId) return null;

    return { matchId: firstMatchId, recs };
  }

  return (
    <>
    <main
      ref={mainRef}
      className={
        embedded ? "page page--assistant page--assistant-embedded" : "page page--assistant"
      }
    >
      <section className="hero hero--assistant">
        <div className="assistant-hero-top">
          <p className="eyebrow">AcquireAI</p>
          {!embedded && (
            <Link to="/" className="assistant-home-link">
              Home
            </Link>
          )}
        </div>
        <h2
          className="hero--assistant__heading"
          id="betting-assistant-panel-title"
        >
          Natural language betting recommendations
        </h2>
        <p className="subtitle">
          Live odds, structured output, and responsible gambling safeguards.
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
            <label className="controls-field">
              <span className="controls-caption">Risk profile</span>
              <select
                className="controls-select"
                value={riskProfile}
                onChange={(e) => setRiskProfile(e.target.value)}
              >
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Aggressive demo only</option>
              </select>
            </label>
            <button
              className="controls-submit-btn"
              disabled={loading || !query.trim()}
              type="submit"
            >
              {loading ? "Working..." : "Get recommendation"}
            </button>
          </div>
          {loading && (
            <p className="loading-status" aria-live="polite">
              {loadingStageText}
            </p>
          )}
        </form>
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
                      <div className="match-cta-selection">
                        {cta.recs[0]?.outcome}
                      </div>
                      {cta.recs[0]?.market && (
                        <div className="match-cta-market">
                          {cta.recs[0].market}
                        </div>
                      )}
                      {cta.recs.length > 1 && (
                        <div className="match-cta-market">
                          +{cta.recs.length - 1} alternatives highlighted
                        </div>
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
                        search: {
                          recs: JSON.stringify(cta.recs),
                          market: cta.recs[0]?.market || "",
                          outcome: cta.recs[0]?.outcome || "",
                        },
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
                                      recs: JSON.stringify([
                                        {
                                          market: onView.market,
                                          outcome: onView.outcome,
                                        },
                                      ]),
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

                {response.debug?.llmOutput && (
                  <details className="debug">
                    <summary>GPT output payload (debug)</summary>
                    <pre>
                      {JSON.stringify(response.debug.llmOutput, null, 2)}
                    </pre>
                  </details>
                )}
              </section>
            </>
          );
        })()}
    </main>
    {showScrollTop && (
      <button
        type="button"
        className="assistant-scroll-top"
        onClick={scrollAssistantToTop}
        aria-label="Back to top of assistant"
      >
        <svg
          className="assistant-scroll-top__icon"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 19V5M5 12l7-7 7 7"
          />
        </svg>
      </button>
    )}
    </>
  );
}
