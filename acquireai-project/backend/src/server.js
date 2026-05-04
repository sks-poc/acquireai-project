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

app.get("/api/match/:id", (req, res) => {
  try {
    const events = readMockOdds();
    const match = events.find((m) => m.id === req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });
    res.json(match);
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
