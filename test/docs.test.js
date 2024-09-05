import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, describe, it } from "node:test";
import { BODY_LIMIT } from "../src/app.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../src/models/pagination.js";
import { TASK_PRIORITIES, TASK_STATUSES } from "../src/models/task.js";
import { SORT_FIELDS } from "../src/models/taskSorting.js";
import { parseTaskQuery, SEARCH_MAX } from "../src/validation/taskQuery.js";
import { DESCRIPTION_MAX, TITLE_MAX } from "../src/validation/taskValidation.js";

// Documentation goes out of date quietly: someone adds an error code or a
// query parameter and forgets docs/api.md. These tests compare the docs
// with the CODE, so a mismatch fails `npm test` like any other bug.

let docs;
let errorCodesInCode;

before(async () => {
  docs = await readFile(new URL("../docs/api.md", import.meta.url), "utf8");
  // Every error code the code can send: written as HttpError(status, "CODE"
  // in http/errors.js, and as code: "CODE" in the error handler
  const sources = await Promise.all(
    ["../src/http/errors.js", "../src/middleware/errorHandler.js"].map((path) =>
      readFile(new URL(path, import.meta.url), "utf8")
    )
  );
  errorCodesInCode = new Set(
    sources.join("\n").matchAll(/(?:HttpError\(\s*\d{3},\s*|code: )"([A-Z_]+)"/g).map((match) => match[1])
  );
});

describe("docs/api.md", () => {
  it("documents every error code the API can send", () => {
    assert.ok(errorCodesInCode.size >= 10, "found the codes in the source");
    for (const code of errorCodesInCode) {
      assert.match(docs, new RegExp(`\\| \`${code}\` \\|`), `${code} is missing from the errors table`);
    }
  });

  it("documents no error code that doesn't exist", () => {
    const documented = docs.matchAll(/\| `([A-Z_]{4,})` \|/g).map((match) => match[1]);
    for (const code of documented) {
      assert.ok(errorCodesInCode.has(code), `docs mention ${code}, which the code never sends`);
    }
  });

  it("documents every query parameter of GET /tasks", () => {
    // The API's own error message lists them all
    const { errors } = parseTaskQuery({ "not-a-parameter": "x" });
    const names = errors[0].message.split("Use: ")[1].split(", ");
    assert.ok(names.length >= 7);
    for (const name of names) assert.match(docs, new RegExp(`\\| \`${name}\` \\|`), `?${name} is missing`);
  });

  it("documents every sort field, status and priority", () => {
    for (const field of Object.keys(SORT_FIELDS)) assert.ok(docs.includes(`\`${field}\``), `sort field ${field}`);
    for (const value of [...TASK_STATUSES, ...TASK_PRIORITIES]) assert.ok(docs.includes(`\`${value}\``), value);
  });

  it("states the same limits as the code", () => {
    assert.ok(docs.includes(`Default \`${DEFAULT_LIMIT}\``), `default limit ${DEFAULT_LIMIT}`);
    assert.ok(docs.includes(`1–${MAX_LIMIT}`), `maximum limit ${MAX_LIMIT}`);
    assert.ok(docs.includes(`1–${TITLE_MAX} characters`), `title ${TITLE_MAX}`);
    assert.ok(docs.includes(`${DESCRIPTION_MAX.toLocaleString("en")} characters`), `description ${DESCRIPTION_MAX}`);
    assert.ok(docs.includes(`Up to ${SEARCH_MAX} characters`), `search ${SEARCH_MAX}`);
    assert.ok(docs.includes(`**${BODY_LIMIT.replace("kb", " KB")}**`), `body limit ${BODY_LIMIT}`);
  });

  it("has no links to sections that don't exist", () => {
    // GitHub's rule for heading anchors: lower case, drop punctuation
    // except - and _, spaces become -
    const anchors = new Set(
      docs.matchAll(/^#{2,4} (.+)$/gm).map((match) =>
        match[1]
          .toLowerCase()
          .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
          .replace(/\s/g, "-")
      )
    );
    for (const [, anchor] of docs.matchAll(/\]\(#([^)]+)\)/g)) {
      assert.ok(anchors.has(anchor), `#${anchor} doesn't match any heading`);
    }
  });
});
