import { HttpError } from "../http/errors.js";

// THE ERROR HANDLER: one place that turns ANY error into a JSON answer.
//
// Express knows it's an error handler because it takes FOUR arguments:
// (error, req, res, next). It must be added AFTER all the routes. When a
// route throws (or calls next(error)), Express skips every remaining
// normal route and middleware and comes straight here. Express 5 also
// catches errors from async routes (rejected promises) by itself, which
// Express 4 didn't: there, an error in an async route crashed the server
// or left the request hanging.
//
// Three kinds of error:
//   1. HttpError: thrown on purpose (404, 400...). Its status and message
//      were written for the client: send them.
//   2. Errors from Express's own middleware, like express.json() on broken
//      JSON: translated into the same shape.
//   3. Anything else is a BUG. The client gets a plain 500 with no
//      details (the inside of the code is none of their business, and
//      could help an attacker); the full error goes to the server's log,
//      with the request id to find it.
//
// logError: where bug reports go (console.error normally)
export function createErrorHandler({ logError = console.error } = {}) {
  // All four arguments must be listed, even `next` when unused: Express
  // counts them to recognise an error handler
  return function errorHandler(error, req, res, next) {
    // An answer was already partly sent: too late to send a different one.
    // Hand over to Express, which closes the connection.
    if (res.headersSent) return next(error);

    let status = 500;
    let body = {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our side. Please try again later.",
    };

    if (error instanceof HttpError) {
      status = error.status;
      body = { code: error.code, message: error.message, details: error.details };
      res.set(error.headers); // e.g. Allow, for a 405
    } else if (error.type === "entity.parse.failed") {
      // express.json() couldn't read the body: it isn't valid JSON
      status = 400;
      body = { code: "INVALID_JSON", message: "The request body isn't valid JSON." };
    } else {
      // A bug: tell the server's log everything, the client nothing
      logError(`Unexpected error [${req.id}] during ${req.method} ${req.originalUrl}:`, error);
    }

    res.status(status).json({ error: { ...body, requestId: req.id } });
  };
}
