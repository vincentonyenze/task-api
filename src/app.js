import express from "express";

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
export function createApp({ environment = "development" } = {}) {
  const app = express();

  // Express adds "X-Powered-By: Express" to every response. It tells anyone
  // probing the server what software it runs (useful for finding known
  // weaknesses), and helps nobody else. Switch it off.
  app.disable("x-powered-by");

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
      message: "Hello! This API will manage tasks. Try GET /tasks soon.",
    });
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
