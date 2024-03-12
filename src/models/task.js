import { randomUUID } from "node:crypto";

// WHAT A TASK IS, and the rules for making and changing one. Pure
// functions, shared by every store (memory now, a file in Step 28, a
// database in Project 21), so the rules can never differ between them.

export const TASK_STATUSES = ["todo", "in_progress", "done"];
export const TASK_PRIORITIES = ["low", "medium", "high"];

// Fields a client may set. id, createdAt and updatedAt belong to the
// server: nobody gets to choose their own id or fake a creation date.
const EDITABLE_FIELDS = ["title", "description", "status", "priority", "dueDate"];

// Also sets the ORDER fields appear in, so a task reads naturally in JSON
// (title first). Order doesn't matter to programs, but people read these.
const DEFAULTS = { title: "", description: "", status: "todo", priority: "medium", dueDate: null };

// Where the time and new ids come from. Stores take these as options so
// tests can use a fixed clock and predictable ids (dependency injection).
export const REAL_CLOCK = () => new Date();
export const RANDOM_IDS = randomUUID;

// Only the editable fields from some input (anything else is ignored)
function pickEditable(data) {
  return Object.fromEntries(EDITABLE_FIELDS.filter((field) => field in data).map((field) => [field, data[field]]));
}

// A brand-new task from { title, ... }. The defaults fill the gaps.
export function newTask(data, { now = REAL_CLOCK, generateId = RANDOM_IDS } = {}) {
  const timestamp = now().toISOString();
  return { id: generateId(), ...DEFAULTS, ...pickEditable(data), createdAt: timestamp, updatedAt: timestamp };
}

// The task with SOME fields changed (PATCH)
export function updatedTask(task, changes, { now = REAL_CLOCK } = {}) {
  return { ...task, ...pickEditable(changes), updatedAt: now().toISOString() };
}

// The task with ALL editable fields replaced (PUT): anything not given
// goes back to its default. id and createdAt stay.
export function replacedTask(task, data, { now = REAL_CLOCK } = {}) {
  return {
    id: task.id,
    ...DEFAULTS,
    ...pickEditable(data),
    createdAt: task.createdAt,
    updatedAt: now().toISOString(),
  };
}
