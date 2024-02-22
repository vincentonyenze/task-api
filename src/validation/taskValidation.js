import { TASK_PRIORITIES, TASK_STATUSES } from "../models/taskStore.js";

// What counts as a valid task, checked BEFORE anything reaches the store.
// Pure functions: input in, answer out. No Express, no requests, so the
// rules are easy to test (taskValidation.test.js) and to reuse.
//
// Rule number one of a server: NEVER trust what clients send. A request
// can come from anywhere (curl, a script, a buggy front-end) and contain
// anything.

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;

// Fields that belong to the server. Clients often send a task back exactly
// as they got it (say, for PUT), so these are quietly ignored, not errors.
const SERVER_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

// "2026-11-15": the right shape AND a real day (no 2026-02-30).
// Exported: the query checks (taskQuery.js) use it too.
export function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // A made-up day "rolls over" (Feb 30 becomes Mar 2): check it didn't
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// One checker per field: (value) -> { value } when fine, { error } when not.
// Each returns the CLEANED value (trimmed text, for example).
const FIELDS = {
  title(value) {
    if (typeof value !== "string") return { error: "Title must be text" };
    const title = value.trim();
    if (title === "") return { error: "Title can't be empty" };
    if (title.length > TITLE_MAX) return { error: `Title must be ${TITLE_MAX} characters or fewer` };
    return { value: title };
  },
  description(value) {
    if (typeof value !== "string") return { error: "Description must be text" };
    const description = value.trim();
    if (description.length > DESCRIPTION_MAX) {
      return { error: `Description must be ${DESCRIPTION_MAX} characters or fewer` };
    }
    return { value: description };
  },
  status(value) {
    if (!TASK_STATUSES.includes(value)) return { error: `Status must be one of: ${TASK_STATUSES.join(", ")}` };
    return { value };
  },
  priority(value) {
    if (!TASK_PRIORITIES.includes(value)) {
      return { error: `Priority must be one of: ${TASK_PRIORITIES.join(", ")}` };
    }
    return { value };
  },
  dueDate(value) {
    if (value === null) return { value: null }; // no due date
    if (typeof value !== "string" || !isRealDate(value)) {
      return { error: "Due date must be a real date written YYYY-MM-DD, or null" };
    }
    return { value };
  },
};

// Checks a task sent by a client.
//
// input: the request body
// options.partial: true for PATCH (changing some fields: nothing is
//   required, but at least one field must be sent); false for POST and
//   PUT (a whole task: title is required)
//
// Returns { value, errors }:
//   value:  the cleaned fields, ready for the store (when errors is empty)
//   errors: [{ field, message }], one per problem, so a client can show
//           every problem at once instead of one per attempt
export function validateTask(input, { partial = false } = {}) {
  const errors = [];
  const value = {};

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { value, errors: [{ field: null, message: "The task must be a JSON object" }] };
  }

  for (const [field, raw] of Object.entries(input)) {
    if (SERVER_FIELDS.has(field)) continue;
    const check = FIELDS[field];
    if (!check) {
      errors.push({ field, message: `"${field}" isn't a task field` });
      continue;
    }
    const result = check(raw);
    if (result.error) errors.push({ field, message: result.error });
    else value[field] = result.value;
  }

  if (!partial && !("title" in input)) {
    errors.push({ field: "title", message: "Title is required" });
  }
  if (partial && Object.keys(input).every((field) => SERVER_FIELDS.has(field))) {
    errors.push({ field: null, message: "Send at least one field to change" });
  }

  return { value, errors };
}
