import { once } from "node:events";
import { createApp } from "../../src/app.js";
import { createMemoryTaskStore } from "../../src/models/memoryTaskStore.js";

// INTEGRATION TESTS run the WHOLE app (every middleware, the router, the
// controller, the store) and talk to it over real HTTP, exactly like a
// client would. Unit tests check one piece; these check the pieces are
// connected correctly: the right order, the right headers, the right status.
//
// startTestApi() starts a fresh app on a free port and gives back:
//   request(method, path, { body, headers })  -> { status, headers, body, text }
//   get / post / patch / put / delete          -> the same, shorter
//   store                                      -> the app's store, to look inside
//   close()                                    -> stops the server
//
// Its store has a FAKE clock (2026-10-21 09:00:00, then one second later
// for each change) and FAKE ids (task-1, task-2...), so whole answers can
// be compared exactly. Pass your own `store` (or any createApp option) to
// change that.

export const FIRST_TIME = "2026-10-21T09:00:00.000Z";

// "2026-10-21T09:00:05.000Z": the time after `seconds` changes
export const timeAfter = (seconds) => new Date(Date.UTC(2026, 9, 21, 9, 0, seconds)).toISOString();

export function createPredictableStore() {
  let seconds = 0;
  let count = 0;
  return createMemoryTaskStore({
    now: () => new Date(Date.UTC(2026, 9, 21, 9, 0, seconds++)),
    generateId: () => `task-${++count}`,
  });
}

export async function startTestApi({ store = createPredictableStore(), ...options } = {}) {
  // Port 0: the operating system picks any free port, so tests never
  // collide with a running server or with each other
  const server = createApp({ environment: "test", store, ...options }).listen(0);
  await once(server, "listening");
  const base = `http://localhost:${server.address().port}`;

  async function request(method, path, { body, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) {
      // Objects are sent as JSON. Strings, bytes and forms are sent as
      // they are, for tests about broken or non-JSON bodies.
      const raw = typeof body === "string" || body instanceof Uint8Array || body instanceof URLSearchParams;
      init.body = raw ? body : JSON.stringify(body);
      if (!raw) init.headers["Content-Type"] ??= "application/json";
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // not JSON: the test can look at `text`
    }
    return { status: res.status, headers: res.headers, body: parsed, text };
  }

  return {
    base,
    store,
    request,
    get: (path, options) => request("GET", path, options),
    post: (path, body, options) => request("POST", path, { ...options, body }),
    patch: (path, body, options) => request("PATCH", path, { ...options, body }),
    put: (path, body, options) => request("PUT", path, { ...options, body }),
    delete: (path, options) => request("DELETE", path, options),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
