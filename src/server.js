import express from "express";
import { config } from "./config.js";

// The application: a list of "when a request like THIS arrives, do THAT".
const app = express();

// Express adds "X-Powered-By: Express" to every response. It tells anyone
// probing the server what software it runs (useful for finding known
// weaknesses), and helps nobody else. Switch it off.
app.disable("x-powered-by");

// A ROUTE: a method + a path, and the function that handles it.
//   GET /  ->  answer with a small JSON welcome
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
if (config.environment === "development") {
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

// Start listening for requests. A PORT is like a door number on this
// computer: requests to http://localhost:3000 arrive at door 3000.
// The number comes from the settings (config.js), not from the code.
app.listen(config.port, () => {
  console.log(`Task API (${config.environment}) listening on http://localhost:${config.port}`);
});
