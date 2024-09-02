import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createRateLimiter } from "../src/middleware/rateLimit.js";
import { startTestApi as startApp } from "./helpers/testApi.js";

describe("the body size limit (413)", () => {
  let app;
  before(async () => {
    app = await startApp();
  });
  after(() => app.close());

  const post = (body) =>
    fetch(`${app.base}/tasks`, { method: "POST", body, headers: { "Content-Type": "application/json" } });

  it("accepts the biggest real task (every field at its maximum, in the heaviest characters)", async () => {
    // Lengths are counted in UTF-16 units (JavaScript's .length). The most
    // bytes one unit can need in UTF-8 is 3, e.g. "中". (An emoji is 4
    // bytes but counts as 2 units, so it's lighter per unit.)
    const res = await post(JSON.stringify({ title: "中".repeat(200), description: "中".repeat(2000) }));
    assert.equal(res.status, 201);
  });

  it("refuses a body over 16 KB, before reading it", async () => {
    const res = await post(JSON.stringify({ title: "x", description: "x".repeat(20_000) }));
    assert.equal(res.status, 413);
    const { error } = await res.json();
    assert.equal(error.code, "BODY_TOO_LARGE");
    assert.match(error.message, /16384 bytes/);
  });
});

describe("rate limiting (429)", () => {
  // A FAKE clock: `time` only moves when a test moves it
  let time;
  let app;

  // Requests from a pretend client: the test names it in a header, so one
  // test can play several clients from the same computer
  const from = (client, path = "/tasks", init = {}) =>
    fetch(app.base + path, { ...init, headers: { "X-Test-Client": client, ...init.headers } });

  beforeEach(async () => {
    time = 1_000_000;
    app?.close();
    app = await startApp({
      corsOrigins: ["http://localhost:5173"],
      rateLimit: { max: 3, windowMs: 60_000, now: () => time, keyOf: (req) => req.get("x-test-client") },
    });
  });
  after(() => app.close());

  it("allows `max` requests, counting down in RateLimit-Remaining", async () => {
    const remaining = [];
    for (let i = 0; i < 3; i++) {
      const res = await from("alice");
      assert.equal(res.status, 200);
      remaining.push(res.headers.get("ratelimit-remaining"));
    }
    assert.deepEqual(remaining, ["2", "1", "0"]);
  });

  it("refuses the next one with 429 and says how long to wait", async () => {
    for (let i = 0; i < 3; i++) await from("alice");
    time += 15_000; // 15 seconds into the 60-second window
    const res = await from("alice");
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "45");
    assert.equal(res.headers.get("ratelimit-limit"), "3");
    assert.equal(res.headers.get("ratelimit-remaining"), "0");
    const { error } = await res.json();
    assert.equal(error.code, "TOO_MANY_REQUESTS");
    assert.match(error.message, /45 seconds/);
  });

  it("refuses every kind of request once over the limit (not only GET)", async () => {
    for (let i = 0; i < 3; i++) await from("alice");
    const res = await from("alice", "/tasks", {
      method: "POST",
      body: '{"title":"one too many"}',
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(res.status, 429);
    // ...and nothing was created
    const list = await (await from("bob")).json();
    assert.equal(list.meta.total, 0);
  });

  it("starts again when the window ends", async () => {
    for (let i = 0; i < 4; i++) await from("alice");
    time += 60_000;
    const res = await from("alice");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("ratelimit-remaining"), "2");
  });

  it("starts again when the window ends between two clean-ups", async () => {
    // The clean-up (sweep) runs at most once a window. Here alice's window
    // ends AFTER one clean-up and BEFORE the next, so only the limiter's
    // own "has this window ended?" check can let her in again.
    time += 50_000;
    for (let i = 0; i < 4; i++) await from("alice"); // window: 50s -> 110s
    time += 10_000;
    await from("bob"); // at 60s: a clean-up runs (alice's window is still open)
    time += 50_000; // at 110s: alice's window has ended; the next clean-up is at 120s
    const res = await from("alice");
    assert.equal(res.status, 200);
  });

  it("counts each client separately", async () => {
    for (let i = 0; i < 4; i++) await from("alice");
    assert.equal((await from("bob")).status, 200);
  });

  it("never limits the health check", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await from("monitor", "/health");
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("ratelimit-limit"), null);
    }
  });

  it("lets a browser page read the 429 and its Retry-After (CORS)", async () => {
    const page = { headers: { Origin: "http://localhost:5173" } };
    for (let i = 0; i < 3; i++) await from("alice", "/tasks", page);
    const res = await from("alice", "/tasks", page);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.match(res.headers.get("access-control-expose-headers"), /Retry-After/);
  });
});

describe("rate limiting: forgetting old clients", () => {
  it("drops clients whose window has ended, so memory doesn't grow forever", async () => {
    // Uses the limiter directly, with pretend requests, to see inside it
    let time = 0;
    const limiter = createRateLimiter({ max: 5, windowMs: 1000, now: () => time, keyOf: (req) => req.ip });
    const res = { set() {} };
    const call = (ip) => limiter({ ip }, res, () => {});

    for (let i = 0; i < 50; i++) call(`10.0.0.${i}`);
    assert.equal(limiter.trackedClients(), 50);

    time = 1000; // every window has ended
    call("10.0.1.1");
    assert.equal(limiter.trackedClients(), 1); // only the newest is left
  });
});
