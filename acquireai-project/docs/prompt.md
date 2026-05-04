# LLM Prompt Design

The backend system prompt is implemented in `backend/src/llm.js`.

Core principles:

- The LLM is a responsible betting recommendation prototype.
- It uses only supplied odds/events data.
- It never guarantees outcomes.
- It refuses underage or harmful requests.
- It avoids personalized financial advice.
- It always includes a responsible gambling notice.

The LLM returns strict JSON for frontend rendering.
