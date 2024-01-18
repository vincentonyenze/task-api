import express from "express";

// The application: a list of "when a request like THIS arrives, do THAT".
const app = express();

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

// Start listening for requests. A PORT is like a door number on this
// computer: requests to http://localhost:3000 arrive at door 3000.
// (Step 3 reads the port from settings instead of fixing it here.)
const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Task API listening on http://localhost:${PORT}`);
});
