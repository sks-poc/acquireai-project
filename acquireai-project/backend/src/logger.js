import fs from "fs";
import path from "path";

const logDir = path.resolve("backend/logs");
const logFile = path.join(logDir, "interactions.jsonl");

export function logInteraction(record) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify({ timestamp: new Date().toISOString(), ...record })}\n`);
  } catch (error) {
    console.warn("Failed to write interaction log:", error.message);
  }
}
