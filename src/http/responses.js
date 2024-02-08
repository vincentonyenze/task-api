// Answers shared by several routes, so the wording and shape live in ONE
// place. (Step 21 replaces most of these with a central error handler.)

// 404 for a task id that doesn't exist
export function sendTaskNotFound(res, id) {
  return res.status(404).json({
    error: { code: "NOT_FOUND", message: `There's no task with the id "${id}".` },
  });
}

// Express 5: req.body stays undefined when no JSON was read: no body, or
// the Content-Type header is missing. Answers 400 and returns true if so.
// (Step 29 turns the "wrong Content-Type" case into a 415.)
export function rejectMissingBody(req, res) {
  if (req.body !== undefined) return false;
  res.status(400).json({
    error: { code: "INVALID_BODY", message: 'Send the task as JSON, with the header "Content-Type: application/json".' },
  });
  return true;
}

// 400 Bad Request: the request itself is wrong, and sending it again
// unchanged won't help. "details" lists every problem, by field.
export function sendValidationErrors(res, errors) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_FAILED",
      message: errors.length === 1 ? "The task has a problem." : `The task has ${errors.length} problems.`,
      details: errors,
    },
  });
}
