import { tooManyRequests } from "../http/errors.js";

// RATE LIMITING: each client may make `max` requests per time window.
// Past that, 429 Too Many Requests until the window ends.
//
// Why: one client (a buggy script stuck in a loop, or someone trying to
// overload the server, or guessing ids) mustn't use up the server for
// everyone else.
//
// The method is a FIXED WINDOW, the simplest there is: a client's first
// request starts a window (say 60 seconds) with a counter; every request
// adds 1; at `max` the client is refused until the window ends, then it
// starts over. (Its weakness: a client can send `max` at the very end of
// one window and `max` again at the start of the next. Fine here; "sliding
// window" and "token bucket" smooth that out.)
//
// Every answer says where the client stands, so well-behaved clients can
// slow down BEFORE being refused (header names from the IETF draft that
// most APIs use):
//   RateLimit-Limit: 100       requests allowed per window
//   RateLimit-Remaining: 42    left in this window
//   RateLimit-Reset: 17        seconds until the window ends
// and a 429 adds Retry-After: 17 (a standard HTTP header).
//
// The counters live in this process's memory: a restart forgets them, and
// several copies of the server would each count separately. Bigger APIs
// keep them in a shared store (often Redis).
//
// options:
//   max:      requests allowed per window per client
//   windowMs: the window's length, in milliseconds
//   now:      the clock (a fake one in tests: no waiting a real minute)
//   keyOf:    who the client is. Its IP address by default.
//   skip:     requests that don't count (the health check, see app.js)
export function createRateLimiter({
  max,
  windowMs,
  now = () => Date.now(),
  keyOf = (req) => req.ip,
  skip = () => false,
}) {
  // client key -> { count, resetAt }
  const clients = new Map();
  let nextSweep = now() + windowMs;

  // Forget clients whose window has ended, so the Map doesn't grow forever
  // (every IP that ever called would stay in memory). Done at most once a
  // window, during a request: no timer to keep the process alive.
  function sweep(time) {
    if (time < nextSweep) return;
    for (const [key, entry] of clients) {
      if (entry.resetAt <= time) clients.delete(key);
    }
    nextSweep = time + windowMs;
  }

  function rateLimit(req, res, next) {
    if (skip(req)) return next();

    const time = now();
    sweep(time);

    const key = keyOf(req);
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= time) {
      entry = { count: 0, resetAt: time + windowMs }; // a new window
      clients.set(key, entry);
    }
    entry.count += 1;

    // Rounded UP: "0 seconds" while there's still time left would invite
    // an immediate retry that fails again
    const secondsLeft = Math.ceil((entry.resetAt - time) / 1000);
    res.set({
      "RateLimit-Limit": String(max),
      "RateLimit-Remaining": String(Math.max(0, max - entry.count)),
      "RateLimit-Reset": String(secondsLeft),
    });

    if (entry.count > max) return next(tooManyRequests(secondsLeft));
    next();
  }

  // For tests: how many clients are being tracked
  rateLimit.trackedClients = () => clients.size;
  return rateLimit;
}
