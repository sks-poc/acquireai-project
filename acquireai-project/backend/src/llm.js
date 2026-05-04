import { AzureOpenAI } from "openai";

function deploymentFromEnv() {
  return (
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    process.env.LLM_MODEL_NAME ||
    "gpt-5.4-hackathlon"
  );
}

let client;

function getClient() {
  if (!client) {
    client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, ""),
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
      deployment: deploymentFromEnv(),
    });
  }
  return client;
}

const systemPrompt = `
You are AcquireAI, a responsible betting recommendation prototype for a hackathon demo.

Your job:
- Interpret the user's betting-related question.
- Use only the supplied odds/events context.
- Provide a clear, human-readable recommendation when appropriate.
- Explain uncertainty and risk.

Hard rules:
- Never guarantee an outcome.
- Never use words like sure win, guaranteed, risk-free, lock, banker, or cannot lose.
- Refuse underage gambling requests or requests that imply harmful gambling behavior.
- Do not provide personalized financial advice.
- If the supplied data is insufficient, recommend no bet or say more event data is needed.
- Always include responsible gambling guidance.
- Always respond with a valid JSON object matching the required schema.

Risk profile rules (read userContext.riskProfile). These are HARD CONSTRAINTS on the oddsUsed array length:
- "conservative": return EXACTLY 1 item in oddsUsed — the single lowest-risk outcome (highest impliedProbability, lowest decimal odds). Prefer markets like total goals under, first half under, or draw no bet.
- "balanced": return EXACTLY 2 or 3 items in oddsUsed — spread across different markets (e.g. one goals market, one 1X2, one first half). Moderate risk/reward.
- "aggressive": return EXACTLY 3, 4, or 5 items in oddsUsed — prioritise higher-odds selections across as many different markets as possible.

CRITICAL — exact name matching rules:
- For the "event" field: use the exact event "id" value from the supplied oddsContext (e.g. "ars-che-demo").
- For the "market" field: use the exact "name" value of the market from the supplied oddsContext (e.g. "First Half Total Goals", "1X2").
- For the "selection" field: use the exact "name" value of the outcome from the supplied oddsContext (e.g. "Under 1.5", "1", "X"). Do NOT use the "label" or any paraphrase — copy the name character-for-character.
- For "odds": use the exact numeric "price" from the supplied oddsContext.
- For "impliedProbability": use the exact numeric "impliedProbability" from the supplied oddsContext.
- Only include outcomes that actually exist in the supplied oddsContext.
`;

const jsonSchema = {
  type: "json_schema",
  json_schema: {
    name: "acquireai_recommendation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommendation: { type: "string" },
        riskLevel: {
          type: "string",
          enum: ["low", "medium", "high", "refused", "unknown"],
        },
        rationale: { type: "string" },
        oddsUsed: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              event: { type: "string" },
              market: { type: "string" },
              selection: { type: "string" },
              odds: { type: "number" },
              impliedProbability: { type: "number" },
            },
            required: [
              "event",
              "market",
              "selection",
              "odds",
              "impliedProbability",
            ],
          },
        },
        warnings: {
          type: "array",
          items: { type: "string" },
        },
        responsibleGamblingNotice: { type: "string" },
      },
      required: [
        "recommendation",
        "riskLevel",
        "rationale",
        "oddsUsed",
        "warnings",
        "responsibleGamblingNotice",
      ],
    },
  },
};

function validateConfig() {
  if (!process.env.AZURE_OPENAI_API_KEY) {
    throw new Error("AZURE_OPENAI_API_KEY is missing. Add it to backend/.env");
  }
  if (!process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error("AZURE_OPENAI_ENDPOINT is missing. Add it to backend/.env");
  }
}

export function buildLlmInput({ userQuery, userContext, oddsContext }) {
  return {
    userQuery,
    userContext,
    oddsContext,
  };
}

export async function generateRecommendation({
  userQuery,
  userContext,
  oddsContext,
}) {
  validateConfig();
  const llmInput = buildLlmInput({ userQuery, userContext, oddsContext });

  const response = await getClient().chat.completions.create({
    model: deploymentFromEnv(),
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify(llmInput),
      },
    ],
    response_format: jsonSchema,
    max_completion_tokens: 16384,
  });

  return JSON.parse(response.choices[0].message.content);
}

export function fallbackRecommendation(
  message = "The recommendation service is unavailable.",
) {
  return {
    recommendation:
      "No recommendation is available right now. Please review event data manually or try again later.",
    riskLevel: "unknown",
    rationale: message,
    oddsUsed: [],
    warnings: [
      "Do not place bets based on incomplete, unavailable, or unverified information.",
    ],
    responsibleGamblingNotice:
      "This prototype is for demonstration and education only. Only bet if you are legally allowed to do so, and never stake more than you can afford to lose.",
  };
}
