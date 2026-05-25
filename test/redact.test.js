import test from "node:test";
import assert from "node:assert/strict";

import { redactSecrets } from "../src/redact.js";

test("redacts common secret assignments without changing ordinary text", () => {
  const fakeOpenAiKey = `sk-${"abc123456789"}`;
  const fakeGithubToken = `gh${"p_"}${"abcdefghijklmnopqrstuvwxyz"}`;
  const input = [
    `DEEPSEEK_API_KEY=${fakeOpenAiKey}`,
    "password: my-password",
    `token = ${fakeGithubToken}`,
    "normal line stays visible"
  ].join("\n");

  const output = redactSecrets(input);

  assert.match(output, /DEEPSEEK_API_KEY=\[REDACTED\]/);
  assert.match(output, /password: \[REDACTED\]/);
  assert.match(output, /token = \[REDACTED\]/);
  assert.match(output, /normal line stays visible/);
  assert.doesNotMatch(output, new RegExp(fakeOpenAiKey));
  assert.doesNotMatch(output, /my-password/);
  assert.doesNotMatch(output, new RegExp(fakeGithubToken));
});
