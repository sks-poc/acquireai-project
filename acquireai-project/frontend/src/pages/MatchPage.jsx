import React, { useState, useEffect, useRef } from "react";
import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { matchRoute } from "../router.js";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

const TAB_LABELS = {
  popular: "Popular",
  goals: "Goals",
  combo: "Combo",
  first_half: "First Half",
  second_half: "Second Half",
  player: "Player",
  corners: "Corners",
  other: "Other",
};

function formatDate(iso) {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} ${month} ${time}`;
}

export function MatchPage() {
  const { id } = useParams({ from: matchRoute.id });
  const { market: recMarket = "", outcome: recOutcome = "" } = useSearch({
    from: matchRoute.id,
  });
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("popular");
  const highlightRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/match/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setMatch(data);
        // Auto-switch to the tab containing the recommended market.
        // recMarket may be a market NAME (from LLM) or a market KEY — try both.
        if (recMarket) {
          const needle = recMarket.toLowerCase();
          const found = data.markets.find(
            (m) =>
              m.key.toLowerCase() === needle ||
              (m.name || "").toLowerCase() === needle,
          );
          if (found?.tab) {
            setActiveTab(found.tab);
            return;
          }
        }
        // Fallback: find by outcome label/name
        if (recOutcome) {
          const needle = recOutcome.toLowerCase();
          for (const m of data.markets) {
            const hit = m.outcomes.find(
              (o) =>
                (o.name || "").toLowerCase() === needle ||
                (o.label || "").toLowerCase() === needle,
            );
            if (hit && m.tab) {
              setActiveTab(m.tab);
              break;
            }
          }
        }
      })
      .catch((e) => setError(e.message));
  }, [id, recMarket, recOutcome]);

  // Scroll the highlighted outcome into view once it's rendered
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [match, activeTab]);

  function isRecommended(market, outcome) {
    if (!recOutcome) return false;
    // recMarket may be a NAME (from LLM) or a KEY — accept both
    const mNeedle = (recMarket || "").toLowerCase();
    const marketOk =
      !mNeedle ||
      market.key.toLowerCase() === mNeedle ||
      (market.name || "").toLowerCase() === mNeedle;
    const oNeedle = recOutcome.toLowerCase();
    const outcomeOk =
      (outcome.name || "").toLowerCase() === oNeedle ||
      (outcome.label || "").toLowerCase() === oNeedle;
    return marketOk && outcomeOk;
  }

  if (error)
    return (
      <div className="match-page">
        <button className="back-btn" onClick={() => navigate({ to: "/" })}>
          ← Back
        </button>
        <div className="error">{error}</div>
      </div>
    );

  if (!match)
    return (
      <div className="match-page">
        <button className="back-btn" onClick={() => navigate({ to: "/" })}>
          ← Back
        </button>
        <div className="loading-pulse">Loading odds…</div>
      </div>
    );

  const tabs = [...new Set(match.markets.map((m) => m.tab).filter(Boolean))];
  const visibleMarkets = match.markets.filter((m) => m.tab === activeTab);

  return (
    <div className="match-page">
      {/* Header */}
      <div className="match-header">
        <button className="back-btn" onClick={() => navigate({ to: "/" })}>
          ← Back
        </button>
        <span className="match-badge">Pre-Match</span>
      </div>

      <div className="match-meta">
        <span>{formatDate(match.commenceTime)}</span>
        <span className="match-sep">|</span>
        <span>{match.league}</span>
      </div>

      <div className="match-teams">
        <div className="team-icon">⚽</div>
        <div>
          <div className="team-name">{match.homeTeam}</div>
          <div className="team-name away">{match.awayTeam}</div>
        </div>
      </div>

      {/* AI recommendation banner */}
      {recOutcome && (
        <div className="rec-banner">
          <span className="rec-star">★</span>
          AI Recommendation: <strong>{recOutcome}</strong>
          {recMarket && (
            <span className="rec-market">
              {" "}
              · {recMarket.replace(/_/g, " ")}
            </span>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`tab-btn${activeTab === tab ? " tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab] || tab}
          </button>
        ))}
      </div>

      {/* Markets */}
      <div className="markets">
        {visibleMarkets.map((market) => (
          <div key={market.key} className="market-block">
            <div className="market-name">
              <span className="market-info">ⓘ</span> {market.name}
            </div>
            <div className={`outcomes outcomes-${market.outcomes.length}`}>
              {market.outcomes.map((outcome) => {
                const rec = isRecommended(market, outcome);
                return (
                  <div
                    key={outcome.name}
                    ref={rec ? highlightRef : null}
                    className={`outcome-btn${rec ? " outcome-recommended outcome-pulse" : ""}`}
                  >
                    <span className="outcome-label">
                      {outcome.label || outcome.name}
                    </span>
                    <span className="outcome-price">
                      {outcome.price.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
