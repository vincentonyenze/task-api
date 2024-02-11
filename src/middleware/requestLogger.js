// MIDDLEWARE: a function that runs on requests BEFORE the routes do.
// It receives (req, res, next) and can:
//   - look at the request (this one does)
//   - change req or res (Step 20's request ids)
//   - answer early, without the routes (Step 31's rate limit)
//   - call next() to pass the request on to the next middleware or route
// Forgetting next() (and not answering) leaves the request hanging forever.
//
// This one logs every request, AFTER it's answered, as one line:
//   GET /tasks 200 1.4ms
//
// log: where lines go. console.log normally; tests can pass their own
// function to collect the lines (dependency injection again).
export function createRequestLogger({ log = console.log } = {}) {
  return function requestLogger(req, res, next) {
    // A precise clock reading, in nanoseconds (BigInt). Unlike Date.now(),
    // it can't jump if the computer's clock is adjusted mid-request.
    const start = process.hrtime.bigint();

    // The status and time are only known once the response is SENT, which
    // happens later, inside a route. So: register a listener now, and do
    // the logging when the response finishes.
    res.on("finish", () => {
      const milliseconds = Number(process.hrtime.bigint() - start) / 1_000_000;
      // originalUrl: the full address as requested, query string included
      // (req.url inside a mounted router is only the part after the mount)
      log(`${req.method} ${req.originalUrl} ${res.statusCode} ${milliseconds.toFixed(1)}ms`);
    });

    // "close" without "finish": the connection ended before an answer was
    // sent (the client gave up, or the network dropped). Worth knowing.
    res.on("close", () => {
      if (!res.writableFinished) log(`${req.method} ${req.originalUrl} (client disconnected before the answer)`);
    });

    next(); // on to the next middleware or route
  };
}
