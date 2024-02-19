// Errors that know what the client should be told.
//
// Routes don't build error responses any more: they THROW one of these,
// and the central error handler (middleware/errorHandler.js) turns every
// error into the same JSON shape:
//   { "error": { "code", "message", "details"?, "requestId" } }
//
// Throwing works anywhere: inside helpers, several functions deep. The
// error travels up until Express hands it to the error handler.
export class HttpError extends Error {
  // status:  the HTTP status code (404, 400...)
  // code:    a fixed, machine-readable name ("NOT_FOUND") that never changes
  // message: for people; can be reworded any time
  // details: optional extra information (e.g. which fields are wrong)
  // headers: optional response headers that belong with this error
  //          (405 must say which methods ARE allowed)
  constructor(status, code, message, details, headers = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

// ===== The errors this API uses, by name =====

export function notFound(message) {
  return new HttpError(404, "NOT_FOUND", message);
}

// No route at all for this address
export function routeNotFound(req) {
  return notFound(`There's nothing at ${req.method} ${req.path}.`);
}

// 405: the address exists, but not with this method. The Allow header is
// REQUIRED with a 405: it tells the client what it could do instead.
export function methodNotAllowed(req, allowed) {
  return new HttpError(
    405,
    "METHOD_NOT_ALLOWED",
    `${req.method} isn't allowed on ${req.originalUrl.split("?")[0]}. Allowed: ${allowed.join(", ")}.`,
    undefined,
    { Allow: allowed.join(", ") }
  );
}

export function taskNotFound(id) {
  return notFound(`There's no task with the id "${id}".`);
}

export function invalidBody(message) {
  return new HttpError(400, "INVALID_BODY", message);
}

// 400 with every validation problem, by field (Step 12's errors)
export function validationFailed(errors) {
  const message = errors.length === 1 ? "The task has a problem." : `The task has ${errors.length} problems.`;
  return new HttpError(400, "VALIDATION_FAILED", message, errors);
}
