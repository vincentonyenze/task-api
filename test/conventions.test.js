import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "./helpers/testApi.js";

// The response conventions and content types, checked through REAL HTTP
// requests. Plain fetch here (not the helper's request()), to send bodies
// exactly as given, with exactly the headers given.
let api;

before(async () => {
  api = await startTestApi();
});
after(() => api.close());

const send = (method, path, { body, headers = {} } = {}) => fetch(api.base + path, { method, body, headers });
const JSON_TYPE = { "Content-Type": "application/json" };

describe("request bodies (415 Unsupported Media Type)", () => {
  it("accepts JSON", async () => {
    const res = await send("POST", "/tasks", { body: '{"title":"JSON"}', headers: JSON_TYPE });
    assert.equal(res.status, 201);
  });

  it("refuses a body that isn't JSON, and says what would work", async () => {
    const res = await send("POST", "/tasks", { body: '{"title":"x"}', headers: { "Content-Type": "text/plain" } });
    assert.equal(res.status, 415);
    assert.equal(res.headers.get("accept-post"), "application/json");
    const { error } = await res.json();
    assert.equal(error.code, "UNSUPPORTED_MEDIA_TYPE");
    assert.match(error.message, /not "text\/plain"/);
  });

  it("refuses a body with no Content-Type at all", async () => {
    // A Uint8Array body: fetch adds no Content-Type for raw bytes
    const res = await send("POST", "/tasks", { body: new TextEncoder().encode('{"title":"x"}') });
    assert.equal(res.status, 415);
    assert.match((await res.json()).error.message, /no Content-Type/);
  });

  it("refuses a form, too (only JSON is understood)", async () => {
    const res = await send("POST", "/tasks", { body: new URLSearchParams({ title: "x" }) });
    assert.equal(res.status, 415);
  });

  it("says Accept-Patch on a PATCH", async () => {
    const created = await (await send("POST", "/tasks", { body: '{"title":"Patch me"}', headers: JSON_TYPE })).json();
    const res = await send("PATCH", `/tasks/${created.data.id}`, { body: "status=done", headers: { "Content-Type": "text/plain" } });
    assert.equal(res.status, 415);
    assert.equal(res.headers.get("accept-patch"), "application/json");
  });

  it("refuses JSON in another text encoding", async () => {
    const res = await send("POST", "/tasks", {
      body: '{"title":"x"}',
      headers: { "Content-Type": "application/json; charset=latin1" },
    });
    assert.equal(res.status, 415);
    assert.equal((await res.json()).error.code, "UNSUPPORTED_MEDIA_TYPE");
  });

  it("answers NO body with a 400, not a 415 (nothing was sent: the type doesn't matter)", async () => {
    const res = await send("POST", "/tasks");
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "INVALID_BODY");
  });

  it("checks the method before the body (405 beats 415)", async () => {
    const res = await send("POST", "/tasks/some-id", { body: "x", headers: { "Content-Type": "text/plain" } });
    assert.equal(res.status, 405);
  });
});

describe("the Accept header (406 Not Acceptable)", () => {
  it("answers clients that accept JSON, anything, or don't say", async () => {
    for (const accept of ["application/json", "*/*", "text/html,application/xhtml+xml,*/*;q=0.8", undefined]) {
      const res = await send("GET", "/tasks", { headers: accept ? { Accept: accept } : {} });
      assert.equal(res.status, 200, `Accept: ${accept}`);
    }
  });

  it("refuses a client that only accepts something else", async () => {
    const res = await send("GET", "/tasks", { headers: { Accept: "text/html" } });
    assert.equal(res.status, 406);
    assert.equal((await res.json()).error.code, "NOT_ACCEPTABLE");
  });
});

describe("the response shape", () => {
  it("wraps every success in data, always as JSON", async () => {
    for (const path of ["/", "/health", "/tasks"]) {
      const res = await send("GET", path);
      assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8", path);
      assert.ok("data" in (await res.json()), `${path} has data`);
    }
  });

  it("wraps every error in error, with a code, a message and the request id", async () => {
    const res = await send("GET", "/nowhere");
    const body = await res.json();
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(typeof body.error.message, "string");
    assert.equal(body.error.requestId, res.headers.get("x-request-id"));
  });

  it("sends no body at all with a 204", async () => {
    const created = await (await send("POST", "/tasks", { body: '{"title":"Delete me"}', headers: JSON_TYPE })).json();
    const res = await send("DELETE", `/tasks/${created.data.id}`);
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "");
  });
});
