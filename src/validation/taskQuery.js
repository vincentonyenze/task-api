import { MAX_LIMIT } from "../models/pagination.js";
import { SORT_FIELDS } from "../models/taskSorting.js";
import { TASK_PRIORITIES, TASK_STATUSES } from "../models/task.js";
import { isRealDate } from "./taskValidation.js";

// Checks the QUERY STRING of GET /tasks: ?status=done&priority=high...
//
// Query values are client input, so they're checked like bodies are
// (Step 12). In particular, a mistake is an ERROR, not ignored:
// ?staus=done (typo) or ?status=finished answer 400. Ignoring them would
// silently show EVERY task, and look as if the filter had worked.
//
// Every query value arrives as TEXT: ?limit=5 gives "5", not 5.

export const SEARCH_MAX = 100;

// Each parameter the list understands
const PARAMETERS = {
  // Pages: ?page=2&limit=10 (defaults: page 1, 20 per page)
  page: (raw) => wholeNumber(raw, "page", 1, 100_000),
  limit: (raw) => wholeNumber(raw, "limit", 1, MAX_LIMIT),
  // Order: ?sort=title, ?sort=-createdAt (minus: descending),
  // ?sort=-priority,dueDate (several: the first matters most)
  sort: parseSort,
  // Search words: ?q=report q3. An EMPTY q means "no search" (search
  // boxes often send q= when nothing was typed), so it isn't an error.
  q: (raw) => {
    if (typeof raw !== "string") return { error: "q must be given once, as text" };
    const words = raw.trim();
    if (words.length > SEARCH_MAX) return { error: `q must be ${SEARCH_MAX} characters or fewer` };
    return { value: words };
  },
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

// "2" -> 2, within min..max. Only plain digits: "2.5", "-1", "1e3", " 2"
// and "two" are all rejected (Number() alone would happily accept some of
// them: Number("1e3") is 1000, Number("") is 0).
function wholeNumber(raw, name, min, max) {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    return { error: `${name} must be a whole number from ${min} to ${max}` };
  }
  const number = Number(raw);
  if (number < min || number > max) return { error: `${name} must be a whole number from ${min} to ${max}` };
  return { value: number };
}

// "-priority,dueDate" -> [{ field: "priority", direction: "desc" },
//                         { field: "dueDate", direction: "asc" }]
function parseSort(raw) {
  if (typeof raw !== "string") return { error: "sort must be given once, e.g. sort=-priority,dueDate" };
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { error: "sort can't be empty" };

  const sort = [];
  for (const part of parts) {
    const direction = part.startsWith("-") ? "desc" : "asc";
    const field = part.replace(/^-/, "");
    if (field === "") return { error: "sort needs a field name after the -, e.g. sort=-createdAt" };
    if (!Object.hasOwn(SORT_FIELDS, field)) {
      return { error: `Can't sort by "${field}". Use: ${Object.keys(SORT_FIELDS).join(", ")} (add - in front for descending)` };
    }
    if (sort.some((existing) => existing.field === field)) {
      return { error: `"${field}" appears twice in sort` };
    }
    sort.push({ field, direction });
  }
  return { value: sort };
}

// req.query -> { value, errors }, like validateTask
//   value:  e.g. { status: ["todo", "in_progress"], priority: ["high"] }
//   errors: [{ field, message }] for every problem
export function parseTaskQuery(query) {
  const value = {};
  const errors = [];
  for (const [name, raw] of Object.entries(query)) {
    const parse = Object.hasOwn(PARAMETERS, name) ? PARAMETERS[name] : undefined;
    if (!parse) {
      errors.push({
        field: name,
        message: `"${name}" isn't a query option for tasks. Use: ${Object.keys(PARAMETERS).join(", ")}`,
      });
      continue;
    }
    const result = parse(raw);
    if (result.error) errors.push({ field: name, message: result.error });
    else if (result.value !== "") value[name] = result.value; // empty q: no search
  }
  return { value, errors };
}
