import express from "express";
// Importing a JSON file needs the "with { type: 'json' }" part (an import
// ATTRIBUTE): it tells Node to read the file as data, never run it as code
import packageInfo from "../package.json" with { type: "json" };
import { createTaskStore } from "./models/taskStore.js";
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
export function createApp({ environment = "development", store = createTaskStore() } = {}) {
  const app = express();

  // Express adds "X-Powered-By: Express" to every response. It tells anyone
  // probing the server what software it runs (useful for finding known
  // weaknesses), and helps nobody else. Switch it off.
  app.disable("x-powered-by");

  // MIDDLEWARE: code that runs on requests BEFORE the routes do (more in
  // Step 19). express.json() reads the request's body and, if the client
  // said it's JSON (Content-Type: application/json), turns it into an
  // object at req.body. Without it, routes can't see what was sent.
  app.use(express.json());

  // GET /  ->  a small JSON welcome
  //
  // Express calls the handler with two objects:
  //   req (request):  what the client sent: method, path, headers, body...
  //   res (response): what we send back
  app.get("/", (req, res) => {
    // res.json() turns the object into JSON text, and sets the
    // Content-Type header to application/json so the client knows what it is
    res.json({
      name: "Task API",
      message: "Hello! This API manages tasks. Try GET /tasks.",
    });
  });

  // GET /health  ->  "I'm alive", with a few facts about this server.
  //
  // A HEALTH CHECK: hosting services call it every few seconds and restart
  // the app if it stops answering; monitoring tools graph it; and it's how
  // you check which version is actually running. It must be FAST and never
  // fail for a silly reason, so it does as little as possible.
  const startedAt = new Date();
  app.get("/health", (req, res) => {
    // Never cached: an old "ok" saved by some proxy would be worse than useless
    res.set("Cache-Control", "no-store");
    res.json({
      status: "ok",
      version: packageInfo.version, // from package.json, so it can't drift
      environment,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

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

  return app;
}
