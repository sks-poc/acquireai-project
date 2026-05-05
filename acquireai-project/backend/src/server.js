import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { buildOddsContext, getEvents } from "./odds.js";
import {
  fetchAllSportsMarketTypesAndOdds,
  fetchPrematchNavigationRaw,
} from "./kingmakers.js";
import {
  buildLlmInput,
  fallbackRecommendation,
  generateRecommendation,
} from "./llm.js";
import { logInteraction } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const oddsPath = path.join(__dirname, "../data/mock_odds.json");
function readMockOdds() {
  return JSON.parse(fs.readFileSync(oddsPath, "utf8"));
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function splitParticipants(eventName) {
  const separators = [" vs ", " v ", " - "];
  const name = String(eventName || "").trim();
  for (const separator of separators) {
    if (name.toLowerCase().includes(separator)) {
      const [left, right] = name.split(new RegExp(separator, "i"));
      return {
        homeTeam: (left || name).trim(),
        awayTeam: (right || "").trim(),
      };
    }
  }
  return { homeTeam: name, awayTeam: "" };
}

function inferTabFromMarketName(name) {
  const market = String(name || "").toLowerCase();
  if (!market) return "popular";
  if (market.includes("corner")) return "corners";
  if (market.includes("first half") || market.includes("1st half")) return "first_half";
  if (market.includes("second half") || market.includes("2nd half")) return "second_half";
  if (market.includes("goal") || market.includes("btts") || market.includes("both teams")) return "goals";
  if (market.includes("player") || market.includes("scorer")) return "player";
  if (market.includes("double") || market.includes("draw no bet") || market.includes("handicap")) return "combo";
  return "popular";
}

async function findLiveMatchByEventId(eventId) {
  const snapshot = await fetchAllSportsMarketTypesAndOdds({
    includeOdds: true,
    maxSports: toPositiveInt(process.env.KINGMAKERS_QUERY_MAX_SPORTS, 8),
    maxPagesPerMarketType: toPositiveInt(
      process.env.KINGMAKERS_QUERY_MAX_PAGES_PER_MARKET_TYPE,
      3,
    ),
    pageSize: toPositiveInt(process.env.KINGMAKERS_QUERY_PAGE_SIZE, 30),
    cacheTtlMs: toPositiveInt(process.env.KINGMAKERS_QUERY_CACHE_TTL_MS, 60000),
  });

  const eventKey = String(eventId);
  for (const sport of snapshot.sports || []) {
    const byMarket = new Map();
    let base = null;

    for (const marketType of sport.oddsByMarketType || []) {
      for (const odd of marketType.odds || []) {
        if (String(odd.eventId) !== eventKey) continue;

        if (!base) {
          base = {
            id: eventKey,
            sport: String(sport.sportName || "unknown").toLowerCase(),
            league: odd.tournamentName || odd.categoryName || "unknown",
            commenceTime: odd.eventDate,
            ...splitParticipants(odd.eventName),
            source: "kingmakers",
          };
        }

        const key = String(odd.marketTypeId);
        const marketName = odd.marketName || odd.marketTranslationKey || `Market ${key}`;
        if (!byMarket.has(key)) {
          byMarket.set(key, {
            key,
            tab: inferTabFromMarketName(marketName),
            name: marketName,
            outcomes: [],
          });
        }

        const market = byMarket.get(key);
        const outcomeName = odd.selectionName || odd.selectionTranslationKey || "Selection";
        const exists = market.outcomes.some((item) => item.name === outcomeName);
        if (!exists) {
          market.outcomes.push({
            name: outcomeName,
            label: outcomeName,
            price: Number(odd.odd),
          });
        }
      }
    }

    if (base && byMarket.size > 0) {
      return {
        ...base,
        markets: Array.from(byMarket.values()),
      };
    }
  }

  return null;
}

const app = express();
const port = process.env.PORT || 8080;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "acquireai-backend" });
});

app.get("/api/events", async (req, res) => {
  try {
    const result = await getEvents();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/match/:id", async (req, res) => {
  try {
    const events = readMockOdds();
    const match = events.find((m) => m.id === req.params.id);
    if (match) return res.json(match);

    const liveMatch = await findLiveMatchByEventId(req.params.id);
    if (liveMatch) return res.json(liveMatch);

    return res.status(404).json({ error: "Match not found" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/odds/navigation", async (req, res) => {
  try {
    const result = await fetchPrematchNavigationRaw({
      locale: req.query.locale,
      scheduleTimeFrame: req.query.scheduleTimeFrame,
      contentLanguage: req.query.contentLanguage,
      discriminationId: req.query.discriminationId,
    });
    res.json({
      source: "kingmakers",
      fetchedAt: new Date().toISOString(),
      totalSports: result.sports.length,
      data: result.payload?.data || { sports: [] },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/odds/snapshot", async (req, res) => {
  try {
    const result = await fetchAllSportsMarketTypesAndOdds({
      baseUrl: req.query.baseUrl,
      locale: req.query.locale,
      contentLanguage: req.query.contentLanguage,
      discriminationId: req.query.discriminationId,
      scheduleTimeFrame: req.query.scheduleTimeFrame,
      areaId: req.query.areaId,
      dateFilterType: req.query.dateFilterType,
      dateFilterRange: req.query.dateFilterRange,
      pageSize: req.query.pageSize,
      maxPagesPerMarketType: req.query.maxPagesPerMarketType,
      includeOdds: req.query.includeOdds,
      sportsConcurrency: req.query.sportsConcurrency,
      marketTypesConcurrency: req.query.marketTypesConcurrency,
      cacheTtlMs: req.query.cacheTtlMs,
      maxSports: req.query.maxSports,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/query", async (req, res) => {
  const startedAt = Date.now();

  try {
    const { query, context = {} } = req.body || {};

    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return res
        .status(400)
        .json({
          error: "Request body must include a non-empty 'query' string.",
        });
    }
    if (query.length > 500) {
      return res
        .status(400)
        .json({ error: "Query must be 500 characters or fewer." });
    }
    // Block obviously non-natural-language input (code, GraphQL, JSON, brackets)
    if (/[{}<>]|query\s*\{|fragment\s+\w+|__schema/.test(query)) {
      return res
        .status(400)
        .json({ error: "Query must be a natural language betting question." });
    }

    const oddsContext = await buildOddsContext(query);
    const llmInput = buildLlmInput({
      userQuery: query,
      userContext: context,
      oddsContext,
    });

    const result = await generateRecommendation({
      userQuery: query,
      userContext: context,
      oddsContext,
    });

    const payload = {
      query,
      transcript: null,
      ...result,
      meta: {
        model: process.env.LLM_MODEL_NAME || "gpt-4.1-mini",
        oddsSource: oddsContext.source,
        oddsEventsProvided: oddsContext.events.length,
        latencyMs: Date.now() - startedAt,
      },
      debug: {
        llmInput,
        llmOutput: result,
      },
    };

    logInteraction({ query, context, response: payload });
    res.json(payload);
  } catch (error) {
    console.error(error);
    const fallback = fallbackRecommendation(error.message);
    logInteraction({
      query: req.body?.query,
      error: error.message,
      response: fallback,
    });
    res
      .status(500)
      .json({ error: "Failed to generate recommendation", ...fallback });
  }
});

app.listen(port, () => {
  console.log(`AcquireAI backend running on http://localhost:${port}`);
});

export default app;
