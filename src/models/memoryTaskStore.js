import { newTask, RANDOM_IDS, REAL_CLOCK, replacedTask, updatedTask } from "./task.js";

// A task store that keeps tasks IN MEMORY (gone when the server stops).
//
// THE STORE INTERFACE. Every store (this one, the file store of Step 28,
// a database store in Project 21) offers exactly these methods, so the
// rest of the API can use any of them without knowing which:
//
//   list()               -> every task, oldest first
//   get(id)              -> one task, or undefined
//   create(data)         -> the new task
//   update(id, changes)  -> the updated task, or undefined (PATCH)
//   replace(id, data)    -> the replaced task, or undefined (PUT)
//   remove(id)           -> true if it existed, false if not
//   count()              -> how many tasks there are
//   close()              -> waits until every change is saved (call it
//                           before the program exits)
//
// Every method is ASYNC: it returns a promise. Memory doesn't need to wait
// for anything, but a file or a database does, so the interface allows for
// it from the start. Callers always `await`, whichever store it is.
//
// storeContract.js holds the tests ANY store must pass.
export function createMemoryTaskStore({ now = REAL_CLOCK, generateId = RANDOM_IDS } = {}) {
  // id -> task. A Map keeps insertion order and finds an id instantly.
  const tasks = new Map();

  // Every task handed OUT is a copy: a caller changing what it got back
  // must not quietly change the stored task.
  const copy = (task) => structuredClone(task);

  return {
    async list() {
      return [...tasks.values()].map(copy);
    },

    async get(id) {
      const task = tasks.get(id);
      return task ? copy(task) : undefined;
    },

    async create(data) {
      const task = newTask(data, { now, generateId });
      tasks.set(task.id, task);
      return copy(task);
    },

    async update(id, changes) {
      const task = tasks.get(id);
      if (!task) return undefined;
      const updated = updatedTask(task, changes, { now });
      tasks.set(id, updated);
      return copy(updated);
    },

    async replace(id, data) {
      const task = tasks.get(id);
      if (!task) return undefined;
      const replaced = replacedTask(task, data, { now });
      tasks.set(id, replaced);
      return copy(replaced);
    },

    async remove(id) {
      return tasks.delete(id);
    },

    async count() {
      return tasks.size;
    },

    // Nothing to wait for: memory is "saved" instantly
    async close() {},
  };
}
