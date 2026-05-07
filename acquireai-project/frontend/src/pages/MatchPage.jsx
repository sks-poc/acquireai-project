import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { matchRoute } from "../router.js";

const API_BASE = import.meta.env.VITE_API_BASE || "";

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
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${month} ${time}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSportIcon(match) {
  const sport = normalizeText(match?.sport);
  const league = normalizeText(match?.league);
  const text = `${sport} ${league}`.trim();

  if (text.includes("football") || text.includes("soccer")) return "⚽";
  if (text.includes("basketball") || text.includes("nba")) return "🏀";
  if (text.includes("tennis") || text.includes("atp") || text.includes("wta")) return "🎾";
  if (text.includes("baseball") || text.includes("mlb")) return "⚾";
  if (text.includes("hockey") || text.includes("nhl") || text.includes("ice")) return "🏒";
  if (text.includes("cricket") || text.includes("ipl")) return "🏏";
  if (text.includes("volleyball")) return "🏐";
  if (text.includes("handball")) return "🤾";
  if (text.includes("rugby")) return "🏉";
  if (text.includes("american") || text.includes("nfl")) return "🏈";
  if (text.includes("esports") || text.includes("e sports")) return "🎮";
  return "🏅";
}

function parseRecsParam(raw) {
  if (!raw) return [];

  let value = raw;
  for (let i = 0; i < 3; i++) {
    if (typeof value !== "string") break;
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      break;
    }
  }

  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.oddsUsed)) {
    return value.oddsUsed;
  }
  return [];
}

function normalizeRecEntry(rec, fallbackEventId) {
  if (!rec || typeof rec !== "object") {
    return {
      eventId: String(fallbackEventId),
      market: "",
      outcome: "",
    };
  }

  const eventId = String(rec.eventId || rec.event || fallbackEventId);
  const market = String(rec.market || rec.marketName || rec.marketKey || "");
  const outcome = String(
    rec.outcome || rec.selection || rec.pick || rec.selectionName || "",
  );

  return { eventId, market, outcome };
}

function isSymbolicOutcome(text) {
  const compact = String(text || "").toLowerCase().replace(/\s+/g, "");
  if (!compact) return false;
  return /^(1|2|x|1\/1|1\/x|1\/2|x\/1|x\/x|x\/2|2\/1|2\/x|2\/2|\d+:\d+)$/.test(compact);
}

function marketMatches(recommendedMarket, market) {
  const rec = normalizeText(recommendedMarket);
  if (!rec) return true;
  const key = normalizeText(market?.key);
  const name = normalizeText(market?.name);
  return key === rec || name === rec || key.includes(rec) || name.includes(rec) || rec.includes(name);
}

function outcomeMatches(recommendedOutcome, outcome) {
  const rec = normalizeText(recommendedOutcome);
  if (!rec) return false;
  const name = normalizeText(outcome?.name);
  const label = normalizeText(outcome?.label);

  if (name === rec || label === rec) return true;

  // For symbolic outcomes (1, X, 2, 1/2, 0:4...), avoid fuzzy matching.
  if (isSymbolicOutcome(rec)) {
    return false;
  }

  return name === rec || label === rec || name.includes(rec) || label.includes(rec) || rec.includes(name) || rec.includes(label);
}

export function MatchPage() {
  const { id } = useParams({ from: matchRoute.id });
  const { market: recMarket = "", outcome: recOutcome = "", recs: recsJson = "" } = useSearch({ from: matchRoute.id });
  const navigate = useNavigate();

  const [matchesById, setMatchesById] = useState({});
  const [error, setError] = useState(null);
  const [activeMarketTab, setActiveMarketTab] = useState("popular");
  const [activeRecTab, setActiveRecTab] = useState(0);
  const [selections, setSelections] = useState({}); // key = `${eventId}|${marketKey}|${outcomeName}`
  const highlightRef = useRef(null);
  const recTabsScrollRef = useRef(null);
  const [canScrollRecLeft, setCanScrollRecLeft] = useState(false);
  const [canScrollRecRight, setCanScrollRecRight] = useState(false);
  const isDraggingRecTabsRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const dragMovedRef = useRef(false);

  const allRecs = useMemo(() => {
    const parsedRecs = parseRecsParam(recsJson);
    if (parsedRecs.length > 0) {
      if (!recOutcome) return parsedRecs;

      const primaryNormalized = normalizeRecEntry(
        { eventId: id, market: recMarket, outcome: recOutcome },
        id,
      );
      const existsPrimary = parsedRecs.some((rec) => {
        const n = normalizeRecEntry(rec, id);
        return (
          n.eventId === primaryNormalized.eventId &&
          normalizeText(n.market) === normalizeText(primaryNormalized.market) &&
          normalizeText(n.outcome) === normalizeText(primaryNormalized.outcome)
        );
      });

      return existsPrimary ? parsedRecs : [primaryNormalized, ...parsedRecs];
    }
    if (recOutcome) return [{ market: recMarket, outcome: recOutcome, eventId: id }];
    return [];
  }, [recsJson, recMarket, recOutcome, id]);

  const recObjects = useMemo(
    () => allRecs.map((rec) => normalizeRecEntry(rec, id)),
    [allRecs, id],
  );

  async function fetchMatchById(matchId) {
    const res = await fetch(`${API_BASE}/api/match/${encodeURIComponent(matchId)}`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Failed to load match ${matchId}`);
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    const primaryEventId = String(id);
    const eventIds = [...new Set([primaryEventId, ...recObjects.map((r) => r.eventId)])];

    setError(null);
    setMatchesById((prev) => {
      const next = {};
      for (const eventId of eventIds) {
        if (prev[eventId]) next[eventId] = prev[eventId];
      }
      return next;
    });

    (async () => {
      try {
        const primary = await fetchMatchById(primaryEventId);
        if (cancelled) return;
        setMatchesById((prev) => ({ ...prev, [primaryEventId]: primary }));

        // Load linked events in background to avoid blocking first render.
        const secondaryEventIds = eventIds.filter((eventId) => eventId !== primaryEventId);
        secondaryEventIds.forEach((eventId) => {
          fetchMatchById(eventId)
            .then((data) => {
              if (cancelled) return;
              setMatchesById((prev) => {
                if (prev[eventId]) return prev;
                return { ...prev, [eventId]: data };
              });
            })
            .catch(() => {
              // Ignore individual secondary event failures.
            });
        });
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, recObjects]);

  const recTabs = useMemo(() => {
    if (recObjects.length === 0) return [];
    return recObjects.map((rec, index) => {
      const m = matchesById[rec.eventId];
      const eventLabel = m ? `${m.homeTeam} vs ${m.awayTeam}` : `Event ${rec.eventId}`;
      return { ...rec, index, eventLabel };
    });
  }, [recObjects, matchesById]);

  function updateRecTabsScrollState() {
    const node = recTabsScrollRef.current;
    if (!node) {
      setCanScrollRecLeft(false);
      setCanScrollRecRight(false);
      return;
    }

    const left = node.scrollLeft;
    const maxLeft = node.scrollWidth - node.clientWidth;
    setCanScrollRecLeft(left > 2);
    setCanScrollRecRight(left < maxLeft - 2);
  }

  function scrollRecTabs(direction) {
    const node = recTabsScrollRef.current;
    if (!node) return;
    const delta = Math.max(180, Math.floor(node.clientWidth * 0.72));
    node.scrollBy({ left: direction * delta, behavior: "smooth" });
  }

  function startRecTabsDrag(event) {
    if (event.button !== 0) return;
    const node = recTabsScrollRef.current;
    if (!node) return;
    isDraggingRecTabsRef.current = true;
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = node.scrollLeft;
    dragMovedRef.current = false;
    node.classList.add("is-dragging");
  }

  function moveRecTabsDrag(event) {
    const node = recTabsScrollRef.current;
    if (!node || !isDraggingRecTabsRef.current) return;

    const delta = event.clientX - dragStartXRef.current;
    if (Math.abs(delta) > 5) {
      dragMovedRef.current = true;
    }
    node.scrollLeft = dragStartScrollLeftRef.current - delta;
  }

  function endRecTabsDrag() {
    const node = recTabsScrollRef.current;
    isDraggingRecTabsRef.current = false;
    if (node) {
      node.classList.remove("is-dragging");
    }
    window.setTimeout(() => {
      dragMovedRef.current = false;
    }, 0);
  }

  const activeRec = recTabs[activeRecTab] || null;
  const currentMatch = activeRec ? matchesById[activeRec.eventId] : matchesById[String(id)] || null;

  useEffect(() => {
    if (!activeRec || !currentMatch) return;
    const found = (currentMatch.markets || []).find((m) => marketMatches(activeRec.market, m));
    if (found?.tab) {
      setActiveMarketTab(found.tab || "popular");
      return;
    }
    const tabs = [...new Set((currentMatch.markets || []).map((m) => m.tab || "popular"))];
    setActiveMarketTab(tabs[0] || "popular");
  }, [activeRecTab, activeRec, currentMatch]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeRecTab, activeMarketTab, currentMatch]);

  useEffect(() => {
    const node = recTabsScrollRef.current;
    if (!node) return;

    const onScroll = () => updateRecTabsScrollState();
    const raf = window.requestAnimationFrame(updateRecTabsScrollState);

    node.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.cancelAnimationFrame(raf);
      node.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [recTabs]);

  useEffect(() => {
    const node = recTabsScrollRef.current;
    if (!node) return;
    const activeNode = node.querySelector(`[data-rec-index="${activeRecTab}"]`);
    if (activeNode && typeof activeNode.scrollIntoView === "function") {
      activeNode.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeRecTab]);

  function selectionKey(eventId, marketKey, outcomeName) {
    return `${eventId}|${marketKey}|${outcomeName}`;
  }

  function addSpecificRecommendation(rec) {
    const match = matchesById[rec.eventId];
    if (!match) return;
    const market = (match.markets || []).find((m) => marketMatches(rec.market, m));
    if (!market) return;
    const recNormalized = normalizeText(rec.outcome);
    const outcome =
      (market.outcomes || []).find(
        (o) => normalizeText(o?.name) === recNormalized || normalizeText(o?.label) === recNormalized,
      ) || (market.outcomes || []).find((o) => outcomeMatches(rec.outcome, o));
    if (!outcome) return;

    const key = selectionKey(rec.eventId, market.key, outcome.name);
    setSelections((prev) => ({
      ...prev,
      [key]: {
        key,
        eventId: rec.eventId,
        eventLabel: `${match.homeTeam} vs ${match.awayTeam}`,
        marketKey: market.key,
        marketName: market.name,
        outcomeName: outcome.label || outcome.name,
        price: Number(outcome.price),
      },
    }));
  }

  function addAllRecommendations() {
    recTabs.forEach((rec) => addSpecificRecommendation(rec));
  }

  function toggleSelection(market, outcome) {
    if (!currentMatch) return;
    const eventId = String(currentMatch.id);
    const key = selectionKey(eventId, market.key, outcome.name);

    setSelections((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${eventId}|${market.key}|`)) delete next[k];
      });
      if (prev[key]) return next;
      next[key] = {
        key,
        eventId,
        eventLabel: `${currentMatch.homeTeam} vs ${currentMatch.awayTeam}`,
        marketKey: market.key,
        marketName: market.name,
        outcomeName: outcome.label || outcome.name,
        price: Number(outcome.price),
      };
      return next;
    });
  }

  const selectedList = Object.values(selections);
  const totalOdds = selectedList.reduce((acc, s) => acc * Number(s.price || 1), 1);

  if (error) {
    return (
      <div className="match-page">
        <button className="back-btn" onClick={() => navigate({ to: "/" })}>← Back</button>
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!currentMatch) {
    return (
      <div className="match-page">
        <button className="back-btn" onClick={() => navigate({ to: "/" })}>← Back</button>
        <div className="loading-pulse">Loading odds…</div>
      </div>
    );
  }

  const marketTabs = [...new Set((currentMatch.markets || []).map((m) => m.tab || "popular").filter(Boolean))];
  const visibleMarkets = (currentMatch.markets || []).filter((m) => (m.tab || "popular") === activeMarketTab);

  return (
    <div className="match-page">
      <div className="match-header">
        <button className="back-btn" onClick={() => navigate({ to: "/" })}>← Back</button>
        <span className="match-badge">Pre-Match</span>
      </div>

      {recTabs.length > 0 && (
        <>
          <div className="rec-tabs-row">
            <button
              className="rec-tabs-nav"
              type="button"
              onClick={() => scrollRecTabs(-1)}
              disabled={!canScrollRecLeft}
              aria-label="Scroll picks left"
            >
              ◀
            </button>
            <div
              className="tabs rec-tabs-scroll"
              ref={recTabsScrollRef}
              onMouseDown={startRecTabsDrag}
              onMouseMove={moveRecTabsDrag}
              onMouseUp={endRecTabsDrag}
              onMouseLeave={endRecTabsDrag}
            >
              {recTabs.map((rec) => (
                <button
                  key={`${rec.eventId}-${rec.index}`}
                  data-rec-index={rec.index}
                  className={`tab-btn${activeRecTab === rec.index ? " tab-active" : ""}`}
                  onClick={() => setActiveRecTab(rec.index)}
                >
                  Pick {rec.index + 1}: {rec.eventLabel}
                </button>
              ))}
            </div>
            <button
              className="rec-tabs-nav"
              type="button"
              onClick={() => scrollRecTabs(1)}
              disabled={!canScrollRecRight}
              aria-label="Scroll picks right"
            >
              ▶
            </button>
          </div>
          <div className="rec-banner">
            <span className="rec-star">★</span>
            <strong>{activeRec?.outcome || "(no outcome label)"}</strong>
            {activeRec?.market && <span className="rec-market"> · {activeRec.market}</span>}
            <div className="rec-actions">
              <button className="rec-action-btn" type="button" onClick={() => addSpecificRecommendation(activeRec)}>
                Add pick
              </button>
              {recTabs.length > 1 && (
                <button className="rec-action-btn rec-action-btn-secondary" type="button" onClick={addAllRecommendations}>
                  Add all ({recTabs.length})
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="match-meta">
        <span>{formatDate(currentMatch.commenceTime)}</span>
        <span className="match-sep">|</span>
        <span>{currentMatch.league}</span>
      </div>

      <div className="match-teams">
        <div className="team-icon" aria-label={`Sport icon: ${currentMatch.sport || "unknown"}`}>
          {getSportIcon(currentMatch)}
        </div>
        <div>
          <div className="team-name">{currentMatch.homeTeam}</div>
          <div className="team-name away">{currentMatch.awayTeam}</div>
        </div>
      </div>

      <div className="tabs">
        {marketTabs.map((tab) => (
          <button
            key={tab}
            className={`tab-btn${activeMarketTab === tab ? " tab-active" : ""}`}
            onClick={() => setActiveMarketTab(tab)}
          >
            {TAB_LABELS[tab] || tab}
          </button>
        ))}
      </div>

      <div className="markets">
        {visibleMarkets.map((market) => (
          <div key={market.key} className="market-block">
            <div className="market-name">
              <span className="market-info">ⓘ</span> {market.name}
            </div>
            <div className={`outcomes outcomes-${market.outcomes.length}`}>
              {(market.outcomes || []).map((outcome) => {
                const isActiveRec = activeRec && marketMatches(activeRec.market, market) && outcomeMatches(activeRec.outcome, outcome);
                const key = selectionKey(currentMatch.id, market.key, outcome.name);
                const selected = !!selections[key];

                return (
                  <button
                    key={outcome.name}
                    ref={isActiveRec ? highlightRef : null}
                    className={[
                      "outcome-btn",
                      isActiveRec ? "outcome-recommended outcome-pulse" : "",
                      selected ? "outcome-selected" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => toggleSelection(market, outcome)}
                    type="button"
                  >
                    <span className="outcome-label">{outcome.label || outcome.name}</span>
                    <span className="outcome-price">{Number(outcome.price).toFixed(2)}</span>
                    {selected && <span className="outcome-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedList.length > 0 && (
        <div className="betslip">
          <div className="betslip-header">
            <span className="betslip-title">Bet Slip</span>
            <span className="betslip-count">{selectedList.length}</span>
          </div>
          <ul className="betslip-list">
            {selectedList.map((s) => (
              <li key={s.key} className="betslip-item">
                <div className="betslip-item-info">
                  <span className="betslip-outcome">{s.outcomeName}</span>
                  <span className="betslip-market">{s.marketName}</span>
                  <span className="betslip-market">{s.eventLabel}</span>
                </div>
                <div className="betslip-item-right">
                  <span className="betslip-price">{Number(s.price).toFixed(2)}</span>
                  <button
                    className="betslip-remove"
                    type="button"
                    onClick={() => {
                      setSelections((prev) => {
                        const next = { ...prev };
                        delete next[s.key];
                        return next;
                      });
                    }}
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
            Place Bet{selectedList.length > 1 ? "s" : ""} · {selectedList.length} selection{selectedList.length > 1 ? "s" : ""}
          </button>
          <button className="betslip-clear" type="button" onClick={() => setSelections({})}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
