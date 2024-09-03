import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { after, before, describe, it } from "node:test";
import { createPredictableStore, startTestApi } from "./helpers/testApi.js";

// Every way a request can go wrong, and what surrounds every answer:
// request ids and the request log.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("addresses and methods (404, 405, OPTIONS)", () => {
  let api;
  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("answers an unknown address with a JSON 404, whatever the method", async () => {
    for (const method of ["GET", "POST", "DELETE"]) {
      const res = await api.request(method, "/nowhere?x=1");
      assert.equal(res.status, 404);
      assert.equal(res.body.error.message, `There's nothing at ${method} /nowhere.`);
    }
  });

  it("answers a known address with the wrong method with 405 and Allow", async () => {
    const cases = [
      ["DELETE", "/tasks", "GET, HEAD, POST"],
      ["POST", "/tasks/task-1", "GET, HEAD, PATCH, PUT, DELETE"],
      ["POST", "/", "GET, HEAD"],
      ["PUT", "/health", "GET, HEAD"],
    ];
    for (const [method, path, allow] of cases) {
      const res = await api.request(method, path);
      assert.equal(res.status, 405, `${method} ${path}`);
      assert.equal(res.headers.get("allow"), allow);
      assert.equal(res.body.error.code, "METHOD_NOT_ALLOWED");
    }
  });

  it("answers OPTIONS with what's allowed", async () => {
    const res = await api.request("OPTIONS", "/tasks/task-1");
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("allow"), "GET, HEAD, PATCH, PUT, DELETE, OPTIONS");
  });

  it("hides the development-only /echo outside development", async () => {
    assert.equal((await api.get("/echo")).status, 404);
  });

  it("never says which framework it runs on", async () => {
    assert.equal((await api.get("/")).headers.get("x-powered-by"), null);
  });
});

describe("a bug on the server (500)", () => {
  let api;
  const reported = [];

  before(async () => {
    // A store with a bug: listing throws, with details nobody outside
    // should ever see
    const store = {
      ...createPredictableStore(),
      async list() {
        throw new Error("Disk failure reading C:/secret/tasks.json");
      },
    };
    api = await startTestApi({ store, logError: (...args) => reported.push(args) });
  });
  after(() => api.close());

  it("tells the client only that something went wrong, plus the request id", async () => {
    const res = await api.get("/tasks", { headers: { "X-Request-Id": "bug-report-1" } });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong on our side. Please try again later.",
        requestId: "bug-report-1",
      },
    });
    assert.doesNotMatch(res.text, /secret|Disk|at /); // no message, no stack trace
  });

  it("tells the server's log everything, with the same request id", () => {
    const [message, error] = reported.at(-1);
    assert.match(message, /\[bug-report-1\] during GET \/tasks/);
    assert.match(error.message, /Disk failure/);
  });

  it("keeps working for everything else", async () => {
    assert.equal((await api.post("/tasks", { title: "Still fine" })).status, 201);
  });
});

describe("request ids", () => {
  let api;
  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("gives every answer a new id", async () => {
    const first = (await api.get("/")).headers.get("x-request-id");
    const second = (await api.get("/")).headers.get("x-request-id");
    assert.match(first, UUID);
    assert.notEqual(first, second);
  });

  it("keeps a safe id the client sent, in the header and in errors", async () => {
    const res = await api.get("/tasks/missing", { headers: { "X-Request-Id": "web-app.42_a" } });
    assert.equal(res.headers.get("x-request-id"), "web-app.42_a");
    assert.equal(res.body.error.requestId, "web-app.42_a");
  });

  it("replaces an unsafe or overlong id with its own", async () => {
    for (const sent of ["has spaces", "<script>", "x".repeat(101)]) {
      const res = await api.get("/", { headers: { "X-Request-Id": sent } });
      assert.match(res.headers.get("x-request-id"), UUID, sent);
    }
  });
});

describe("the request log", () => {
  let api;
  const lines = [];

  before(async () => {
    api = await startTestApi({ log: (line) => lines.push(line) });
  });
  after(() => api.close());

  // The log line is written when the answer FINISHES sending, which can be
  // a moment after the client has it: wait (briefly) for it
  async function lineFor(id) {
    for (let i = 0; i < 100; i++) {
      const line = lines.find((entry) => entry.endsWith(`[${id}]`));
      if (line) return line;
      await nextTurn();
    }
    throw new Error(`no log line for ${id}`);
  }

  it("logs method, address, status, time and request id", async () => {
    await api.get("/tasks?status=todo", { headers: { "X-Request-Id": "log-1" } });
    assert.match(await lineFor("log-1"), /^GET \/tasks\?status=todo 200 \d+\.\dms \[log-1\]$/);
  });

  it("logs refused requests too, with their real status", async () => {
    await api.post("/tasks", "{broken", { headers: { "Content-Type": "application/json", "X-Request-Id": "log-2" } });
    assert.match(await lineFor("log-2"), /^POST \/tasks 400 /);
    await api.get("/nowhere", { headers: { "X-Request-Id": "log-3" } });
    assert.match(await lineFor("log-3"), /^GET \/nowhere 404 /);
  });
});
