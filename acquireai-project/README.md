# AcquireAI - Natural Language Betting Recommendation Agent

A 2-day hackathon prototype for a responsible-gambling-focused assistant. Users can type a betting-related question and receive a structured recommendation, rationale, warnings, and responsible gambling guidance.

This project implements the text-only MVP path from the plan:

```
User input -> Backend API -> Odds lookup -> LLM recommendation -> UI response
```

## Features

- React chat-style frontend
- Express backend
- `/api/query` text endpoint
- `/api/events` endpoint
- OpenAI LLM integration via structured JSON output
- Live odds API support via The Odds API
- Mock odds fallback when no odds API key is configured
- Conservative safety rules and responsible gambling notice on every response
- Simple interaction logging for demo/debugging

## Requirements

- Node.js 18+
- npm
- OpenAI API key
- Optional: The Odds API key for live odds

## Quick start

```bash
npm run install:all
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:

```bash
OPENAI_API_KEY=your_openai_key
LLM_MODEL_NAME=gpt-4.1-mini
```

Optional live odds:

```bash
ODDS_API_KEY=your_the_odds_api_key
ODDS_SPORT_KEY=soccer_epl
```

Run both apps:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

Backend runs on:

```text
http://localhost:8080
```

## Test backend directly

```bash
curl -X POST http://localhost:8080/api/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is a sensible low-risk bet for Arsenal vs Chelsea?"}'
```

## Backend endpoints

### `GET /health`

Health check.

### `GET /api/events`

Returns current events from live odds if configured, otherwise mock events.

### `POST /api/query`

Request:

```json
{
  "query": "What is a sensible low-risk bet for Arsenal vs Chelsea?",
  "context": {
    "riskProfile": "conservative"
  }
}
```

Response:

```json
{
  "recommendation": "...",
  "riskLevel": "low",
  "rationale": "...",
  "oddsUsed": [],
  "warnings": [],
  "responsibleGamblingNotice": "..."
}
```

## Notes

This is a prototype for demonstration and educational purposes only. It does not handle real-money transactions, account management, age verification, or production compliance.
