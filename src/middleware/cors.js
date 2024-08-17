// CORS: Cross-Origin Resource Sharing.
//
// An ORIGIN is scheme + host + port: http://localhost:5173 and
// http://localhost:3000 are DIFFERENT origins. Browsers follow the
// "same-origin policy": a page may SEND a request to another origin, but
// may not READ the answer, unless that other origin says it's allowed.
// It protects users: a random website can't read your bank's API using
// your logged-in browser.
//
// CORS is how this API says "these origins are allowed". It's only about
// BROWSERS: curl, Node, phones and other servers ignore it completely. So
// it's NOT security for the API itself (anyone can still call it); it
// decides which web pages may use it from a visitor's browser.
//
// Two kinds of request:
//   SIMPLE (a GET, for example): the browser just sends it, with an
//   Origin header. If the answer has Access-Control-Allow-Origin naming
//   that origin, the page may read it; if not, the browser hides it.
//
//   PREFLIGHTED (a JSON POST, a PATCH, a DELETE...): FIRST the browser asks
//   permission with an OPTIONS request:
//     Origin: http://localhost:5173
//     Access-Control-Request-Method: PATCH
//     Access-Control-Request-Headers: content-type
//   Only if the answer allows all of that does the real request follow.
//
// origins: the allowed origins, e.g. ["http://localhost:5173"], or ["*"]
// for any origin (fine for a public API with no logins or cookies).
// Empty: no cross-origin access at all (only same-origin pages and
// non-browser clients).

const ALLOWED_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE";
// Headers a page may SEND (Content-Type: application/json isn't one of the
// few "safe" ones browsers allow without asking)
const ALLOWED_HEADERS = "Content-Type, X-Request-Id";
// Headers a page may READ from the answer. Without this, a page sees only
// a few basic headers: not Location (where a new task is) or the request id.
const EXPOSED_HEADERS = "Location, X-Request-Id";
// How long (seconds) a browser may remember a preflight answer, instead
// of asking again before every request
const PREFLIGHT_MAX_AGE = "600";

export function createCors({ origins = [] } = {}) {
  const anyOrigin = origins.includes("*");
  const allowed = new Set(origins);

  return function cors(req, res, next) {
    const origin = req.get("origin");

    // The answer depends on the Origin header, so tell caches: never hand
    // the answer meant for one origin to a request from another
    if (!anyOrigin) res.vary("Origin");

    // No Origin (curl, a server, a same-origin page's GET) or an origin
    // that isn't allowed: no CORS headers. The request still runs normally
    // (CORS doesn't block anything server-side); the BROWSER then refuses
    // to show the answer to the page.
    if (!origin || !(anyOrigin || allowed.has(origin))) return next();

    // Name the ONE origin that asked (or *). The header can't hold a list.
    res.set("Access-Control-Allow-Origin", anyOrigin ? "*" : origin);
    res.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);

    // A preflight: OPTIONS + Access-Control-Request-Method. Answer it here,
    // with no body. (A plain OPTIONS without that header isn't a
    // preflight: it carries on to the routes, which answer it with Allow.)
    if (req.method === "OPTIONS" && req.get("access-control-request-method")) {
      res.set({
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Access-Control-Allow-Headers": ALLOWED_HEADERS,
        "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
      });
      return res.status(204).end();
    }

    next();
  };
}
