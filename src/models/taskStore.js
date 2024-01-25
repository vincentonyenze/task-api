import { randomUUID } from "node:crypto";

// THE TASK MODEL: what a task is, and the only code allowed to create,
// change or delete one. Routes (Step 9 on) ASK the store; they never touch
// the data themselves. One place holds the rules, so they can't be
// forgotten somewhere.
//
// For now tasks live in memory (gone when the server stops). Steps 27-28
// save them to a file, without the routes noticing the difference.

export const TASK_STATUSES = ["todo", "in_progress", "done"];
export const TASK_PRIORITIES = ["low", "medium", "high"];

// Fields a client may set. id, createdAt and updatedAt belong to the
// server: nobody gets to choose their own id or fake a creation date.
const EDITABLE_FIELDS = ["title", "description", "status", "priority", "dueDate"];

// Also sets the ORDER fields appear in, so a task reads naturally in JSON
// (title first). Order doesn't matter to programs, but people read these.
const DEFAULTS = { title: "", description: "", status: "todo", priority: "medium", dueDate: null };

// Only the editable fields from some input (anything else is ignored)
function pickEditable(data) {
  return Object.fromEntries(EDITABLE_FIELDS.filter((field) => field in data).map((field) => [field, data[field]]));
}

// Makes a task store.
//
// options.now / options.generateId: where the time and new ids come from.
// Normally the real clock and random ids; tests (Step 8) pass fixed ones,
// so results are predictable ("DEPENDENCY INJECTION": a part is handed
// what it depends on, instead of reaching out for it).
//
// It trusts that input has already been CHECKED (validation is Step 12):
// the store's job is the rules of the data, not checking requests.
export function createTaskStore({ now = () => new Date(), generateId = randomUUID } = {}) {
  // id -> task. A Map keeps insertion order and finds an id instantly.
  const tasks = new Map();

  // Every task handed OUT is a copy. If a caller changed the object it got
  // back, that must not quietly change the stored task.
  const copy = (task) => structuredClone(task);

  return {
    // Every task, oldest first
    list() {
      return [...tasks.values()].map(copy);
    },

    // One task, or undefined if there's no such id
    get(id) {
      const task = tasks.get(id);
      return task ? copy(task) : undefined;
    },

    // A new task from { title, ... }. The defaults fill the gaps.
    create(data) {
      const timestamp = now().toISOString();
      const task = {
        id: generateId(),
        ...DEFAULTS,
        ...pickEditable(data),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      tasks.set(task.id, task);
      return copy(task);
    },

    // Change SOME fields (PATCH). Returns the updated task, or undefined.
    update(id, changes) {
      const task = tasks.get(id);
      if (!task) return undefined;
      const updated = { ...task, ...pickEditable(changes), updatedAt: now().toISOString() };
      tasks.set(id, updated);
      return copy(updated);
    },

    // Replace ALL editable fields (PUT): anything not given goes back to
    // its default. id and createdAt stay. Returns the task, or undefined.
    replace(id, data) {
      const task = tasks.get(id);
      if (!task) return undefined;
      const replaced = {
        id: task.id,
        ...DEFAULTS,
        ...pickEditable(data),
        createdAt: task.createdAt,
        updatedAt: now().toISOString(),
      };
      tasks.set(id, replaced);
      return copy(replaced);
    },

    // Delete a task. true if it existed, false if not.
    remove(id) {
      return tasks.delete(id);
    },

    // How many tasks there are
    count() {
      return tasks.size;
    },
  };
}
