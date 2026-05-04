import { AzureOpenAI } from "openai";

function deploymentFromEnv() {
  return process.env.AZURE_OPENAI_DEPLOYMENT || process.env.LLM_MODEL_NAME || "gpt-5.4-hackathlon";
}

let client;

function getClient() {
  if (!client) {
    client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, ""),
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
      deployment: deploymentFromEnv()
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
- Prefer conservative, lower-risk choices when the user asks for sensible, safe, cautious, or low-risk options.
- If the supplied data is insufficient, recommend no bet or say more event data is needed.
- Always include responsible gambling guidance.
- Always respond with a valid JSON object matching the required schema.
`;

const jsonSchema = {
  type: "json_schema",
  name: "acquireai_recommendation",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      recommendation: { type: "string" },
      riskLevel: {
        type: "string",
        enum: ["low", "medium", "high", "refused", "unknown"]
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
            impliedProbability: { type: "number" }
          },
          required: ["event", "market", "selection", "odds", "impliedProbability"]
        }
      },
      warnings: {
        type: "array",
        items: { type: "string" }
      },
      responsibleGamblingNotice: { type: "string" }
    },
    required: [
      "recommendation",
      "riskLevel",
      "rationale",
      "oddsUsed",
      "warnings",
      "responsibleGamblingNotice"
    ]
  },
  strict: true
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
    oddsContext
  };
}

export async function generateRecommendation({ userQuery, userContext, oddsContext }) {
  validateConfig();
  const llmInput = buildLlmInput({ userQuery, userContext, oddsContext });

  const response = await getClient().chat.completions.create({
    model: deploymentFromEnv(),
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify(llmInput)
      }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 16384
  });

  return JSON.parse(response.choices[0].message.content);
}

export function fallbackRecommendation(message = "The recommendation service is unavailable.") {
  return {
    recommendation: "No recommendation is available right now. Please review event data manually or try again later.",
    riskLevel: "unknown",
    rationale: message,
    oddsUsed: [],
    warnings: ["Do not place bets based on incomplete, unavailable, or unverified information."],
    responsibleGamblingNotice: "This prototype is for demonstration and education only. Only bet if you are legally allowed to do so, and never stake more than you can afford to lose."
  };
}
