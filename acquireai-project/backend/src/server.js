import "dotenv/config";
import express from "express";
import cors from "cors";
import { buildOddsContext, getEvents } from "./odds.js";
import { fallbackRecommendation, generateRecommendation } from "./llm.js";
import { logInteraction } from "./logger.js";

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

app.post("/api/query", async (req, res) => {
  const startedAt = Date.now();

  try {
    const { query, context = {} } = req.body || {};

    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return res.status(400).json({ error: "Request body must include a non-empty 'query' string." });
    }

    const oddsContext = await buildOddsContext(query);
    const result = await generateRecommendation({
      userQuery: query,
      userContext: context,
      oddsContext
    });

    const payload = {
      query,
      transcript: null,
      ...result,
      meta: {
        model: process.env.LLM_MODEL_NAME || "gpt-4.1-mini",
        oddsSource: oddsContext.source,
        oddsEventsProvided: oddsContext.events.length,
        latencyMs: Date.now() - startedAt
      }
    };

    logInteraction({ query, context, response: payload });
    res.json(payload);
  } catch (error) {
    console.error(error);
    const fallback = fallbackRecommendation(error.message);
    logInteraction({ query: req.body?.query, error: error.message, response: fallback });
    res.status(500).json({ error: "Failed to generate recommendation", ...fallback });
  }
});

app.listen(port, () => {
  console.log(`AcquireAI backend running on http://localhost:${port}`);
});

export default app;
