import { TASK_PRIORITIES, TASK_STATUSES } from "../models/taskStore.js";
import { isRealDate } from "./taskValidation.js";

// Checks the QUERY STRING of GET /tasks: ?status=done&priority=high...
//
// Query values are client input, so they're checked like bodies are
// (Step 12). In particular, a mistake is an ERROR, not ignored:
// ?staus=done (typo) or ?status=finished answer 400. Ignoring them would
// silently show EVERY task, and look as if the filter had worked.
//
// Every query value arrives as TEXT: ?limit=5 gives "5", not 5.

// Each parameter the list understands. Steps 24-26 add q, sort, page, limit.
const PARAMETERS = {
  // One status, or several separated by commas: ?status=todo,in_progress
  status: (raw) => oneOrMore(raw, TASK_STATUSES, "status"),
  priority: (raw) => oneOrMore(raw, TASK_PRIORITIES, "priority"),
  // Due on or before this day (tasks with no due date are left out)
  dueBefore: (raw) => {
    if (typeof raw !== "string" || !isRealDate(raw)) return { error: "dueBefore must be a real date written YYYY-MM-DD" };
    return { value: raw };
  },
};

// "todo,in_progress" -> ["todo", "in_progress"], every one checked.
// Also accepts the parameter repeated (?status=todo&status=done), which
// arrives as an array.
function oneOrMore(raw, allowed, name) {
  const values = [raw]
    .flat()
    .flatMap((part) => String(part).split(","))
    .map((part) => part.trim())
    .filter(Boolean);
  if (values.length === 0) return { error: `${name} can't be empty` };
  const wrong = values.filter((value) => !allowed.includes(value));
  if (wrong.length > 0) {
    return { error: `Unknown ${name}: ${wrong.join(", ")}. Use one or more of: ${allowed.join(", ")}` };
  }
  return { value: [...new Set(values)] };
}

// req.query -> { value, errors }, like validateTask
//   value:  e.g. { status: ["todo", "in_progress"], priority: ["high"] }
//   errors: [{ field, message }] for every problem
export function parseTaskQuery(query) {
  const value = {};
  const errors = [];
  for (const [name, raw] of Object.entries(query)) {
    const parse = PARAMETERS[name];
    if (!parse) {
      errors.push({ field: name, message: `"${name}" isn't something tasks can be filtered by` });
      continue;
    }
    const result = parse(raw);
    if (result.error) errors.push({ field: name, message: result.error });
    else value[name] = result.value;
  }
  return { value, errors };
}
