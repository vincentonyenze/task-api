import { randomUUID } from "node:crypto";

// Gives every request an id, so one request can be traced: in the logs, in
// the response headers, and (Step 21) in error responses.
//   "I got an error"           -> hard to find among thousands of requests
//   "Error, request id 7f3a…"  -> exactly that request's log line
//
// If the client sent its own X-Request-Id (a front-end or another service
// tracking its requests across systems), it's kept, so both sides talk
// about the same id. But only if it's SAFE: short, and only letters,
// digits and - _ . characters.
//
// Why so strict? The id goes into log lines. Without a check, a client
// could send an "id" containing a line break and invent fake log lines
// ("LOG INJECTION"), or a huge one to bloat the logs.
const SAFE_ID = /^[A-Za-z0-9._-]{1,100}$/;

export function createRequestId({ generateId = randomUUID } = {}) {
  return function requestId(req, res, next) {
    const sent = req.get("x-request-id");
    req.id = sent && SAFE_ID.test(sent) ? sent : generateId();
    // Sent back with EVERY response, so the client can quote it
    res.set("X-Request-Id", req.id);
    next();
  };
}
