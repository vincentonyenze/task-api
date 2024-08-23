import express from "express";
// Importing a JSON file needs the "with { type: 'json' }" part (an import
// ATTRIBUTE): it tells Node to read the file as data, never run it as code
import packageInfo from "../package.json" with { type: "json" };
import { notAcceptable, routeNotFound } from "./http/errors.js";
import { allowOnly } from "./middleware/allowMethods.js";
import { createCors } from "./middleware/cors.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import { createRequestId } from "./middleware/requestId.js";
import { createRequestLogger } from "./middleware/requestLogger.js";
import { createMemoryTaskStore } from "./models/memoryTaskStore.js";
import { createTasksRouter } from "./routes/tasks.js";

// Builds the Express application: its settings and routes. It does NOT
// start listening: that's server.js's job.
//
// Why keep them apart? Tests (Step 32) can create the app, start it on a
// spare port, send requests, and stop it again, without the real server
// running and without fighting over port 3000.
//
// A function (a "factory") instead of one shared app: every call builds a
// fresh, separate app. Each test gets its own.
//
// options.environment: "development" turns on the learning aids (/echo)
// options.store: where tasks live. Given to the app (dependency injection
// again), so each test can hand its app a fresh, empty store.
// options.log: where the request log goes. Off in tests (so test output
// stays readable) unless a test passes its own function to collect lines.
// options.logError: where unexpected errors (bugs) are reported
// options.corsOrigins: the web pages allowed to call the API from a
// browser (see middleware/cors.js). None by default.
// options.rateLimit: { max, windowMs } per client (middleware/rateLimit.js),
// or null for no limit. Off by default, so tests aren't slowed by it;
// server.js turns it on from the settings.
export const BODY_LIMIT = "16kb";

export function createApp({
  environment = "development",
  corsOrigins = [],
  rateLimit = null,
  store = createMemoryTaskStore(),
  log = environment === "test" ? null : console.log,
  logError = console.error,
} = {}) {
  const app = express();

  // Express adds "X-Powered-By: Express" to every response. It tells anyone
  // probing the server what software it runs (useful for finding known
  // weaknesses), and helps nobody else. Switch it off.
  app.disable("x-powered-by");

  // ORDER MATTERS: middleware runs in the order it's added, top to bottom.
  //   1. request id: first, so everything after can use req.id
  //   2. logger: early, so it sees every request, even ones a later step
  //      rejects (like broken JSON in express.json())
  //   3. CORS: before anything that can answer, so EVERY answer, errors
  //      included, carries the CORS headers. Without them, a page would
  //      get an unreadable "CORS error" instead of the API's helpful
  //      400 or 404. It also answers browsers' preflight requests.
  app.use(createRequestId());
  if (log) app.use(createRequestLogger({ log }));
  app.use(createCors({ origins: corsOrigins }));

  //   4. rate limit: after CORS (so a page can read the 429 and its
  //      Retry-After), before the body is read (no work for a client
  //      that's already over its limit). The health check doesn't count:
  //      monitoring calls it constantly and must never be refused.
  //
  // req.ip is the address the request came from. BEHIND A PROXY (most
  // hosting), that's the proxy's address for EVERY client, so everyone
  // would share one limit: then set app.set("trust proxy", 1) so Express
  // reads the real client from the X-Forwarded-For header. (Only behind a
  // proxy you trust: anyone can send that header and claim any address.)
  if (rateLimit) {
    app.use(createRateLimiter({ ...rateLimit, skip: (req) => req.path === "/health" }));
  }

  // CONTENT NEGOTIATION: the client's Accept header says what it can read.
  // This API only speaks JSON, so a client that rules JSON out gets a 406
  // straight away. (Browsers send "...*/*", curl sends "*/*", and no
  // Accept header at all means "anything": all fine.)
  // The 406 itself is still JSON: there's nothing better to send.
  app.use((req, res, next) => {
    if (!req.accepts("json")) return next(notAcceptable(req));
    next();
  });

  // MIDDLEWARE: code that runs on requests BEFORE the routes do (more in
  // Step 19). express.json() reads the request's body and, if the client
  // said it's JSON (Content-Type: application/json), turns it into an
  // object at req.body. Without it, routes can't see what was sent.
  //
  // limit: the biggest body it will read. Bigger: 413, and reading stops
  // there (otherwise one huge request could fill the server's memory).
  // The largest real task is under 7 KB (2,200 characters counted by
  // .length, at most 3 bytes each in UTF-8), so 16 KB leaves room without
  // inviting abuse.
  app.use(express.json({ limit: BODY_LIMIT }));

  // THE RESPONSE CONVENTIONS (the same everywhere, so a client needs
  // only one way of reading answers):
  //   success       -> { "data": ... }   (lists add "meta" and "links")
  //   created       -> 201, { "data": the new task }, Location header
  //   deleted       -> 204, no body at all
  //   any error     -> { "error": { code, message, details?, requestId } }
  //   always JSON: Content-Type: application/json; charset=utf-8

  // GET /  ->  a small JSON welcome
  //
  // Express calls the handler with two objects:
  //   req (request):  what the client sent: method, path, headers, body...
  //   res (response): what we send back
  // app.route(): every method for one address. Only GET (and HEAD) here;
  // the final .all() answers anything else with 405 Method Not Allowed.
  app
    .route("/")
    .get((req, res) => {
      // res.json() turns the object into JSON text, and sets the
      // Content-Type header to application/json so the client knows what it is
      res.json({
        data: {
          name: "Task API",
          message: "Hello! This API manages tasks. Try GET /tasks.",
        },
      });
    })
    .all(allowOnly("GET"));

  // GET /health  ->  "I'm alive", with a few facts about this server.
  //
  // A HEALTH CHECK: hosting services call it every few seconds and restart
  // the app if it stops answering; monitoring tools graph it; and it's how
  // you check which version is actually running. It must be FAST and never
  // fail for a silly reason, so it does as little as possible.
  const startedAt = new Date();
  app
    .route("/health")
    .get((req, res) => {
      // Never cached: an old "ok" saved by some proxy would be worse than useless
      res.set("Cache-Control", "no-store");
      res.json({
        data: {
          status: "ok",
          version: packageInfo.version, // from package.json, so it can't drift
          environment,
          startedAt: startedAt.toISOString(),
          uptimeSeconds: Math.round(process.uptime()),
        },
      });
    })
    .all(allowOnly("GET"));

  // ===== Tasks =====
  // Every /tasks route lives in routes/tasks.js. app.use() MOUNTS the
  // router: requests whose path starts with /tasks go to it.
  app.use("/tasks", createTasksRouter({ store }));

  // A learning aid: answers ANY method on /echo with what it received.
  // Only in development: a real API shouldn't show visitors its headers.
  // app.all matches every method (GET, POST, PATCH, DELETE...).
  if (environment === "development") {
    app.all("/echo", (req, res) => {
      res.json({
        method: req.method, // GET, POST...
        path: req.path, // /echo
        query: req.query, // ?status=done&page=2 -> { status: "done", page: "2" }
        headers: {
          // A few of the headers the client sent (names are lower-case)
          host: req.get("host"),
          "user-agent": req.get("user-agent"),
          accept: req.get("accept"),
          "content-type": req.get("content-type") ?? null,
        },
      });
    });
  }

  // No route matched: a 404 in JSON (instead of Express's HTML page).
  // Placed after every route, so it only runs when nothing else answered.
  app.use((req, res, next) => next(routeNotFound(req)));

  // LAST: the error handler. Any error thrown above (or passed to
  // next(error)) ends up here and becomes a JSON answer.
  app.use(createErrorHandler({ logError }));

  return app;
}
