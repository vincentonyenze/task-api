import express from "express";
// Importing a JSON file needs the "with { type: 'json' }" part (an import
// ATTRIBUTE): it tells Node to read the file as data, never run it as code
import packageInfo from "../package.json" with { type: "json" };
import { createTaskStore } from "./models/taskStore.js";
import { validateTask } from "./validation/taskValidation.js";

// ===== Answers shared by several routes =====
// (Step 21 replaces these with one central error handler.)

// 404 for a task id that doesn't exist
function sendTaskNotFound(res, id) {
  return res.status(404).json({
    error: { code: "NOT_FOUND", message: `There's no task with the id "${id}".` },
  });
}

// Express 5: req.body stays undefined when no JSON was read: no body, or
// the Content-Type header is missing. Answers 400 and returns true if so.
// (Step 29 turns the "wrong Content-Type" case into a 415.)
function rejectMissingBody(req, res) {
  if (req.body !== undefined) return false;
  res.status(400).json({
    error: { code: "INVALID_BODY", message: 'Send the task as JSON, with the header "Content-Type: application/json".' },
  });
  return true;
}

// 400 Bad Request: the request itself is wrong, and sending it again
// unchanged won't help. "details" lists every problem, by field.
function sendValidationErrors(res, errors) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_FAILED",
      message: errors.length === 1 ? "The task has a problem." : `The task has ${errors.length} problems.`,
      details: errors,
    },
  });
}

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

  // GET /tasks  ->  every task
  //
  // The answer is wrapped: { data: [...], meta: {...} }, not a bare array.
  // That leaves room to grow: pagination (Step 26) adds page details to
  // meta, and clients reading "data" keep working. A bare array can't
  // grow without breaking every client.
  app.get("/tasks", (req, res) => {
    const tasks = store.list();
    res.json({ data: tasks, meta: { total: tasks.length } });
  });

  // GET /tasks/:id  ->  one task
  //
  // ":id" is a ROUTE PARAMETER: it matches whatever is in that part of the
  // address, and Express puts it in req.params. On /tasks/abc-123,
  // req.params.id is "abc-123". (Like :courseId in React Router.)
  app.get("/tasks/:id", (req, res) => {
    const task = store.get(req.params.id);

    // 404 Not Found: the address is fine, but there's no such task.
    // Answered in JSON like everything else, with a "code" for programs
    // and a "message" for people.
    if (!task) return sendTaskNotFound(res, req.params.id);

    // 200 OK is the default status, so it doesn't need setting
    res.json({ data: task });
  });

  // POST /tasks  ->  create a task from the JSON body
  //
  //   curl -X POST http://localhost:3000/tasks   //     -H "Content-Type: application/json" -d '{"title": "Buy milk"}'
  app.post("/tasks", (req, res) => {
    if (rejectMissingBody(req, res)) return;

    // Check EVERYTHING that was sent (Step 12's rules)
    const { value, errors } = validateTask(req.body);
    if (errors.length > 0) return sendValidationErrors(res, errors);

    // Only the CLEANED values reach the store (trimmed, checked)
    const task = store.create(value);

    // 201 Created: something new exists now. Location says WHERE: the
    // address to GET it from. Clients (and people) can follow it.
    res.status(201).location(`/tasks/${task.id}`).json({ data: task });
  });

  // PATCH /tasks/:id  ->  change SOME fields of a task
  //
  //   curl -X PATCH http://localhost:3000/tasks/<id>   //     -H "Content-Type: application/json" -d '{"status": "done"}'
  //
  // Only the fields sent change; everything else stays as it was.
  app.patch("/tasks/:id", (req, res) => {
    if (rejectMissingBody(req, res)) return;

    // No such task: 404, whatever the body says
    if (!store.get(req.params.id)) return sendTaskNotFound(res, req.params.id);

    // partial: nothing is required, but whatever is sent must be valid
    const { value, errors } = validateTask(req.body, { partial: true });
    if (errors.length > 0) return sendValidationErrors(res, errors);

    // 200 OK with the whole updated task, so the client doesn't need a
    // second request to see the result (updatedAt, for example)
    res.json({ data: store.update(req.params.id, value) });
  });

  // PUT /tasks/:id  ->  REPLACE a whole task
  //
  // The body is the complete new version. Anything left out goes back to
  // its default: PUT {"title": "x"} also resets priority, status, the
  // description and the due date. (PATCH {"title": "x"} changes only the
  // title.) id and createdAt never change.
  //
  // PUT here only replaces tasks that exist: 404 otherwise. Some APIs let
  // PUT create a task at an id the client chose; this one doesn't, because
  // ids belong to the server (Step 7).
  app.put("/tasks/:id", (req, res) => {
    if (rejectMissingBody(req, res)) return;
    if (!store.get(req.params.id)) return sendTaskNotFound(res, req.params.id);

    // Not partial: it's a whole task, so the title is required
    const { value, errors } = validateTask(req.body);
    if (errors.length > 0) return sendValidationErrors(res, errors);

    res.json({ data: store.replace(req.params.id, value) });
  });

  // DELETE /tasks/:id  ->  delete a task
  //
  // 204 No Content: it worked, and there's nothing to send back (the task
  // is gone). A 204 response has NO body at all.
  //
  // Deleting the same task twice: the second time it's already gone, so
  // 404. The END STATE is the same either way (no such task), which is why
  // DELETE still counts as idempotent: safe to retry.
  app.delete("/tasks/:id", (req, res) => {
    if (!store.remove(req.params.id)) return sendTaskNotFound(res, req.params.id);
    res.status(204).end(); // end(): send the response with no body
  });

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
