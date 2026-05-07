import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
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

const QUERY_JOB_TTL_MS = toPositiveInt(process.env.QUERY_JOB_TTL_MS, 5 * 60 * 1000);
const queryJobs = new Map();

function cleanupQueryJobs() {
  const now = Date.now();
  for (const [jobId, job] of queryJobs.entries()) {
    if (job.expiresAt <= now) {
      queryJobs.delete(jobId);
    }
  }
}

function createQueryJob({ query, context }) {
  cleanupQueryJobs();
  const jobId = randomUUID();
  const now = Date.now();
  queryJobs.set(jobId, {
    id: jobId,
    query,
    context,
    status: "queued",
    stage: "queued",
    message: "Queued",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + QUERY_JOB_TTL_MS,
    result: null,
    error: null,
  });
  return jobId;
}

function updateQueryJob(jobId, patch) {
  const job = queryJobs.get(jobId);
  if (!job) return;
  const now = Date.now();
  Object.assign(job, patch, {
    updatedAt: now,
    expiresAt: now + QUERY_JOB_TTL_MS,
  });
}

function validateQueryInput(query) {
  if (!query || typeof query !== "string" || query.trim().length < 3) {
    return "Request body must include a non-empty 'query' string.";
  }
  if (query.length > 500) {
    return "Query must be 500 characters or fewer.";
  }
  if (/[{}<>]|query\s*\{|fragment\s+\w+|__schema/.test(query)) {
    return "Query must be a natural language betting question.";
  }
  return null;
}

async function runRecommendationPipeline({ query, context = {}, onStage }) {
  const startedAt = Date.now();

  onStage?.("fetching_data", "Fetching live odds and event data");
  const oddsContext = await buildOddsContext(query);

  onStage?.("building_prompt", "Preparing model context");
  const llmInput = buildLlmInput({
    userQuery: query,
    userContext: context,
    oddsContext,
  });

  onStage?.("generating_recommendation", "Generating recommendation");
  const result = await generateRecommendation({
    userQuery: query,
    userContext: context,
    oddsContext,
  });

  onStage?.("finalizing", "Finalizing response");
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
  return payload;
}

const LIVE_MATCH_CACHE_TTL_MS = toPositiveInt(
  process.env.LIVE_MATCH_CACHE_TTL_MS,
  120000,
);
const LIVE_MATCH_MISS_TTL_MS = toPositiveInt(
  process.env.LIVE_MATCH_MISS_TTL_MS,
  15000,
);

const liveMatchCache = new Map();
let liveSnapshotIndexCache = {
  expiresAt: 0,
  index: new Map(),
};
let liveSnapshotIndexPromise = null;

function getCachedLiveMatch(eventKey) {
  const now = Date.now();
  const hit = liveMatchCache.get(eventKey);
  if (!hit) return undefined;
  if (hit.expiresAt <= now) {
    liveMatchCache.delete(eventKey);
    return undefined;
  }
  return hit.data;
}

function setCachedLiveMatch(eventKey, data) {
  const ttl = data ? LIVE_MATCH_CACHE_TTL_MS : LIVE_MATCH_MISS_TTL_MS;
  liveMatchCache.set(eventKey, {
    expiresAt: Date.now() + ttl,
    data,
  });
}

function buildLiveMatchIndex(snapshot) {
  const byEvent = new Map();

  for (const sport of snapshot.sports || []) {
    for (const marketType of sport.oddsByMarketType || []) {
      for (const odd of marketType.odds || []) {
        const eventKey = String(odd.eventId || "");
        if (!eventKey) continue;

        if (!byEvent.has(eventKey)) {
          byEvent.set(eventKey, {
            id: eventKey,
            sport: String(sport.sportName || "unknown").toLowerCase(),
            league: odd.tournamentName || odd.categoryName || "unknown",
            commenceTime: odd.eventDate,
            ...splitParticipants(odd.eventName),
            source: "kingmakers",
            marketsByKey: new Map(),
          });
        }

        const event = byEvent.get(eventKey);
        const marketKey = String(odd.marketTypeId);
        const marketName =
          odd.marketName || odd.marketTranslationKey || `Market ${marketKey}`;

        if (!event.marketsByKey.has(marketKey)) {
          event.marketsByKey.set(marketKey, {
            key: marketKey,
            tab: inferTabFromMarketName(marketName),
            name: marketName,
            outcomes: [],
          });
        }

        const market = event.marketsByKey.get(marketKey);
        const outcomeName =
          odd.selectionName || odd.selectionTranslationKey || "Selection";
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
  }

  const index = new Map();
  for (const [eventKey, rawEvent] of byEvent.entries()) {
    const { marketsByKey, ...event } = rawEvent;
    if (!marketsByKey || marketsByKey.size === 0) continue;
    index.set(eventKey, {
      ...event,
      markets: Array.from(marketsByKey.values()),
    });
  }

  return index;
}

async function getLiveSnapshotIndex() {
  const now = Date.now();
  if (liveSnapshotIndexCache.expiresAt > now) {
    return liveSnapshotIndexCache.index;
  }

  if (liveSnapshotIndexPromise) {
    return liveSnapshotIndexPromise;
  }

  liveSnapshotIndexPromise = (async () => {
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

    const index = buildLiveMatchIndex(snapshot);
    liveSnapshotIndexCache = {
      expiresAt: Date.now() + LIVE_MATCH_CACHE_TTL_MS,
      index,
    };
    return index;
  })();

  try {
    return await liveSnapshotIndexPromise;
  } finally {
    liveSnapshotIndexPromise = null;
  }
}

async function findLiveMatchByEventId(eventId) {
  const eventKey = String(eventId);
  const cached = getCachedLiveMatch(eventKey);
  if (cached !== undefined) return cached;

  const index = await getLiveSnapshotIndex();
  const liveMatch = index.get(eventKey) || null;
  setCachedLiveMatch(eventKey, liveMatch);
  return liveMatch;
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

app.post("/api/query/start", async (req, res) => {
  const { query, context = {} } = req.body || {};
  const validationError = validateQueryInput(query);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const jobId = createQueryJob({ query, context });
  res.status(202).json({ jobId, status: "queued" });

  (async () => {
    updateQueryJob(jobId, {
      status: "running",
      stage: "starting",
      message: "Starting analysis",
    });

    try {
      const payload = await runRecommendationPipeline({
        query,
        context,
        onStage: (stage, message) => {
          updateQueryJob(jobId, {
            status: "running",
            stage,
            message,
          });
        },
      });

      updateQueryJob(jobId, {
        status: "completed",
        stage: "completed",
        message: "Completed",
        result: payload,
        error: null,
      });
    } catch (error) {
      console.error(error);
      const fallback = fallbackRecommendation(error.message);
      logInteraction({ query, context, error: error.message, response: fallback });

      updateQueryJob(jobId, {
        status: "failed",
        stage: "failed",
        message: "Failed to generate recommendation",
        error: error.message,
        result: null,
      });
    }
  })();
});

app.get("/api/query/status/:jobId", (req, res) => {
  cleanupQueryJobs();
  const job = queryJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found or expired" });
  }

  return res.json({
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    message: job.message,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

app.post("/api/query", async (req, res) => {
  try {
    const { query, context = {} } = req.body || {};
    const validationError = validateQueryInput(query);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const payload = await runRecommendationPipeline({ query, context });
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

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`AcquireAI backend running on http://localhost:${port}`);
  });
}

export default app;
