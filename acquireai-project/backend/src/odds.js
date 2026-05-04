import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server.js is in backend/src, so go one level up to backend/data
const oddsPath = path.join(__dirname, "../data/mock_odds.json");

function readMockEvents() {
  return JSON.parse(fs.readFileSync(oddsPath, "utf8"));
}

export function impliedProbability(decimalOdds) {
  if (!decimalOdds || Number(decimalOdds) <= 0) return null;
  return Number(((1 / Number(decimalOdds)) * 100).toFixed(2));
}

function normalizeOddsApiEvent(event) {
  const markets = [];

  for (const bookmaker of event.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      markets.push({
        key: market.key,
        name: market.key === "h2h" ? "Match Winner" : market.key,
        bookmaker: bookmaker.title,
        outcomes: (market.outcomes || []).map((outcome) => ({
          name: outcome.name,
          price: outcome.price,
          impliedProbability: impliedProbability(outcome.price)
        }))
      });
    }
  }

  return {
    id: event.id,
    sport: event.sport_title,
    league: event.sport_key,
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    markets,
    source: "live"
  };
}

export async function fetchLiveEvents() {
  if (!process.env.ODDS_API_KEY) {
    return null;
  }

  const base = process.env.ODDS_API_BASE || "https://api.the-odds-api.com/v4";
  const sportKey = process.env.ODDS_SPORT_KEY || "soccer_epl";
  const url = new URL(`${base}/sports/${sportKey}/odds`);

  url.searchParams.set("apiKey", process.env.ODDS_API_KEY);
  url.searchParams.set("regions", process.env.ODDS_REGIONS || "uk,eu");
  url.searchParams.set("markets", process.env.ODDS_MARKETS || "h2h,totals");
  url.searchParams.set("oddsFormat", process.env.ODDS_FORMAT || "decimal");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Live odds request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.map(normalizeOddsApiEvent);
}

export async function getEvents() {
  try {
    const live = await fetchLiveEvents();
    if (live && live.length > 0) return { events: live, source: "live" };
  } catch (error) {
    console.warn("Using mock odds fallback:", error.message);
  }

  return {
    events: readMockEvents().map((event) => ({
      ...event,
      markets: event.markets.map((market) => ({
        ...market,
        outcomes: market.outcomes.map((outcome) => ({
          ...outcome,
          impliedProbability: impliedProbability(outcome.price)
        }))
      }))
    })),
    source: "mock"
  };
}

export async function buildOddsContext(userQuery, limit = 5) {
  const { events, source } = await getEvents();
  const q = String(userQuery || "").toLowerCase();

  const matched = events.filter((event) => {
    const searchable = [
      event.sport,
      event.league,
      event.homeTeam,
      event.awayTeam,
      event.commenceTime
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable
      .split(/\s+/)
      .filter((term) => term.length > 2)
      .some((term) => q.includes(term));
  });

  return {
    source,
    events: (matched.length > 0 ? matched : events).slice(0, limit)
  };
}
