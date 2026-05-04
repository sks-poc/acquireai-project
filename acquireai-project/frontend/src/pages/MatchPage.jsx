import React, { useState, useEffect, useRef, useMemo } from "react";
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
  const {
    market: recMarket = "",
    outcome: recOutcome = "",
    recs: recsJson = "",
  } = useSearch({
    from: matchRoute.id,
  });
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("popular");
  const highlightRef = useRef(null);
  // { key: "marketKey|outcomeName", marketName, outcomeName, price }
  const [selections, setSelections] = useState({});

  // All recommended outcomes: index 0 = primary (orange), rest = alternatives (blue)
  const allRecs = useMemo(() => {
    if (recsJson) {
      try {
        const parsed = JSON.parse(recsJson);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    if (recOutcome) return [{ market: recMarket, outcome: recOutcome }];
    return [];
  }, [recsJson, recMarket, recOutcome]);

  useEffect(() => {
    fetch(`${API_BASE}/api/match/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setMatch(data);
        // Auto-switch to the tab containing the primary recommendation.
        let pMarket = recMarket;
        let pOutcome = recOutcome;
        if (recsJson) {
          try {
            const parsed = JSON.parse(recsJson);
            if (Array.isArray(parsed) && parsed[0]) {
              pMarket = parsed[0].market || recMarket;
              pOutcome = parsed[0].outcome || recOutcome;
            }
          } catch (_) {}
        }
        if (pMarket) {
          const needle = pMarket.toLowerCase();
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
        if (pOutcome) {
          const needle = pOutcome.toLowerCase();
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
  }, [id, recMarket, recOutcome, recsJson]);

  // Scroll the highlighted outcome into view once it's rendered
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [match, activeTab]);

  // Returns "primary" | "alt" | false
  function isRecommended(market, outcome) {
    for (let i = 0; i < allRecs.length; i++) {
      const { market: rm, outcome: ro } = allRecs[i];
      if (!ro) continue;
      const mNeedle = (rm || "").toLowerCase();
      const marketOk =
        !mNeedle ||
        market.key.toLowerCase() === mNeedle ||
        (market.name || "").toLowerCase() === mNeedle;
      const oNeedle = ro.toLowerCase();
      const outcomeOk =
        (outcome.name || "").toLowerCase() === oNeedle ||
        (outcome.label || "").toLowerCase() === oNeedle;
      if (marketOk && outcomeOk) return i === 0 ? "primary" : "alt";
    }
    return false;
  }

  function selectionKey(marketKey, outcomeName) {
    return `${marketKey}|${outcomeName}`;
  }

  function toggleSelection(market, outcome) {
    const key = selectionKey(market.key, outcome.name);
    setSelections((prev) => {
      // Only one outcome per market — deselect others in same market
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(market.key + "|")) delete next[k];
      });
      if (prev[key]) return next; // was selected → deselect
      next[key] = {
        marketKey: market.key,
        marketName: market.name,
        outcomeName: outcome.label || outcome.name,
        price: outcome.price,
      };
      return next;
    });
  }

  const selectedList = Object.values(selections);
  const totalOdds = selectedList.reduce((acc, s) => acc * s.price, 1);

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
      {allRecs.length > 0 && (
        <div className="rec-banner">
          <span className="rec-star">★</span>
          AI pick: <strong>{allRecs[0].outcome}</strong>
          {allRecs[0].market && (
            <span className="rec-market">
              {" "}
              · {allRecs[0].market.replace(/_/g, " ")}
            </span>
          )}
          {allRecs.length > 1 && (
            <span className="rec-alts">
              {" "}
              +{allRecs.length - 1} more highlighted
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
                const key = selectionKey(market.key, outcome.name);
                const selected = !!selections[key];
                return (
                  <button
                    key={outcome.name}
                    ref={rec === "primary" ? highlightRef : null}
                    className={[
                      "outcome-btn",
                      rec === "primary"
                        ? "outcome-recommended outcome-pulse"
                        : "",
                      rec === "alt" ? "outcome-alt" : "",
                      selected ? "outcome-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => toggleSelection(market, outcome)}
                    type="button"
                  >
                    <span className="outcome-label">
                      {outcome.label || outcome.name}
                    </span>
                    <span className="outcome-price">
                      {outcome.price.toFixed(2)}
                    </span>
                    {selected && <span className="outcome-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bet Slip */}
      {selectedList.length > 0 && (
        <div className="betslip">
          <div className="betslip-header">
            <span className="betslip-title">Bet Slip</span>
            <span className="betslip-count">{selectedList.length}</span>
          </div>
          <ul className="betslip-list">
            {selectedList.map((s) => (
              <li
                key={`${s.marketKey}|${s.outcomeName}`}
                className="betslip-item"
              >
                <div className="betslip-item-info">
                  <span className="betslip-outcome">{s.outcomeName}</span>
                  <span className="betslip-market">{s.marketName}</span>
                </div>
                <div className="betslip-item-right">
                  <span className="betslip-price">{s.price.toFixed(2)}</span>
                  <button
                    className="betslip-remove"
                    type="button"
                    onClick={() =>
                      setSelections((prev) => {
                        const next = { ...prev };
                        delete next[
                          `${s.marketKey}|${s.outcomeName.replace(s.outcomeName, "")}`
                        ];
                        // find and remove by marketKey
                        Object.keys(next).forEach((k) => {
                          if (
                            next[k].marketKey === s.marketKey &&
                            next[k].outcomeName === s.outcomeName
                          )
                            delete next[k];
                        });
                        return next;
                      })
                    }
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {selectedList.length > 1 && (
            <div className="betslip-total">
              Combined odds: <strong>{totalOdds.toFixed(2)}</strong>
            </div>
          )}
          <button className="betslip-cta" type="button">
            Place Bet{selectedList.length > 1 ? "s" : ""} ·{" "}
            {selectedList.length} selection{selectedList.length > 1 ? "s" : ""}
          </button>
          <button
            className="betslip-clear"
            type="button"
            onClick={() => setSelections({})}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
