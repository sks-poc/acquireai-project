import test from "node:test";
import assert from "node:assert/strict";
import { impliedProbability } from "../src/odds.js";

test("calculates implied probability from decimal odds", () => {
  assert.equal(impliedProbability(2), 50);
  assert.equal(impliedProbability(1.25), 80);
});
