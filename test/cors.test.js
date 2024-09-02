import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "./helpers/testApi.js";

// Node's fetch lets a test set the Origin header itself (a browser never
// would), so these tests can play every part: a page on an allowed origin,
// a page on a stranger's origin, and a non-browser client with no Origin.
const ALLOWED = "http://localhost:5173";
const STRANGER = "https://evil.example";

const startApp = (corsOrigins) => startTestApi({ corsOrigins });

// What a browser sends before a PATCH with a JSON body
const preflight = (base, origin, method = "PATCH") =>
  fetch(`${base}/tasks/some-id`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": "content-type",
    },
  });

describe("CORS with an allowed list of origins", () => {
  let app;
  before(async () => {
    app = await startApp([ALLOWED]);
  });
  after(() => app.close());

  it("lets an allowed page read answers, and the useful headers", async () => {
    const res = await fetch(`${app.base}/tasks`, { headers: { Origin: ALLOWED } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.match(res.headers.get("access-control-expose-headers"), /Location/);
    assert.match(res.headers.get("vary"), /Origin/);
  });

  it("puts the CORS headers on errors too, so the page can read them", async () => {
    const res = await fetch(`${app.base}/tasks/no-such-id`, { headers: { Origin: ALLOWED } });
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
  });

  it("answers an allowed preflight with what's permitted", async () => {
    const res = await preflight(app.base, ALLOWED);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.match(res.headers.get("access-control-allow-methods"), /PATCH/);
    assert.match(res.headers.get("access-control-allow-headers"), /Content-Type/);
    assert.equal(res.headers.get("access-control-max-age"), "600");
    assert.equal(await res.text(), "");
  });

  it("gives a stranger's page no CORS headers (the browser then hides the answer)", async () => {
    const res = await fetch(`${app.base}/tasks`, { headers: { Origin: STRANGER } });
    assert.equal(res.status, 200); // the server still answers: CORS isn't a lock
    assert.equal(res.headers.get("access-control-allow-origin"), null);

    const pre = await preflight(app.base, STRANGER);
    assert.equal(pre.headers.get("access-control-allow-origin"), null);
    assert.equal(pre.headers.get("access-control-allow-methods"), null);
  });

  it("only matches whole origins exactly", async () => {
    for (const origin of [`${ALLOWED}/`, "http://localhost:5174", "https://localhost:5173", `${ALLOWED}.evil.example`]) {
      const res = await fetch(`${app.base}/tasks`, { headers: { Origin: origin } });
      assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
    }
  });

  it("leaves clients with no Origin (curl, servers) alone", async () => {
    const res = await fetch(`${app.base}/tasks`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("still answers a plain OPTIONS (not a preflight) with Allow", async () => {
    const res = await fetch(`${app.base}/tasks`, { method: "OPTIONS", headers: { Origin: ALLOWED } });
    assert.equal(res.status, 204);
    assert.match(res.headers.get("allow"), /POST/);
    assert.equal(res.headers.get("access-control-allow-methods"), null);
  });
});

describe("CORS for any origin (*)", () => {
  let app;
  before(async () => {
    app = await startApp(["*"]);
  });
  after(() => app.close());

  it("allows every page, with *", async () => {
    const res = await fetch(`${app.base}/tasks`, { headers: { Origin: STRANGER } });
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal((await preflight(app.base, STRANGER)).status, 204);
  });
});

describe("CORS with no origins (the default)", () => {
  let app;
  before(async () => {
    app = await startApp([]);
  });
  after(() => app.close());

  it("allows no other origin", async () => {
    const res = await fetch(`${app.base}/tasks`, { headers: { Origin: ALLOWED } });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });
});
