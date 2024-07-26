import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { newTask, RANDOM_IDS, REAL_CLOCK, replacedTask, updatedTask } from "./task.js";

// A task store that keeps tasks in a JSON FILE, so they survive a restart.
// Same interface as the memory store (see memoryTaskStore.js), and held to
// the same contract tests (storeContract.js).
//
// How it works:
//   - On start, the whole file is read into a Map (a small API's tasks fit
//     in memory easily). Reads (list, get, count) then never touch the disk.
//   - Every change is WRITTEN to the file before it counts. If the write
//     fails, the change is thrown away and the caller gets the error (the
//     API answers 500), so memory and file never disagree.
//
// Two dangers, and what this file does about them:
//
// 1. A HALF-WRITTEN FILE. Writing straight into tasks.json and crashing
//    halfway (power cut, Ctrl+C at the wrong moment) leaves broken JSON:
//    every task lost. Instead, an ATOMIC WRITE:
//      write tasks.json.<random>.tmp -> flush it to the disk -> rename it
//      over tasks.json
//    A rename replaces the file in one step: anyone reading tasks.json sees
//    the old version or the new one, never half of one.
//
// 2. TWO CHANGES AT ONCE. Two requests arrive together; both read the
//    tasks, both write: the second write loses the first one's change. So
//    changes wait in a QUEUE and run one at a time (see `inTurn`).
//
// It's async to create (the file has to be read first):
//   const store = await createFileTaskStore({ file: "data/tasks.json" });
export async function createFileTaskStore({ file, now = REAL_CLOCK, generateId = RANDOM_IDS }) {
  if (!file) throw new Error("createFileTaskStore needs a file path");

  // id -> task: the tasks as they are IN THE FILE (only ever replaced
  // after a successful write)
  let tasks = await load(file);
  const copy = (task) => structuredClone(task);

  // The queue: a promise chain. Each change starts when the one before it
  // has finished (whether it worked or failed).
  let queue = Promise.resolve();
  function inTurn(job) {
    const result = queue.then(job);
    queue = result.catch(() => {}); // one failure mustn't block the rest
    return result;
  }

  // Runs one change: works on a COPY of the tasks, saves the copy, and
  // only then makes it the real thing. `change` returns what the caller
  // gets back, or undefined for "no such task" (nothing is written then).
  function change(makeChange) {
    return inTurn(async () => {
      const next = new Map(tasks);
      const result = makeChange(next);
      if (result === undefined) return undefined;
      await save(file, next);
      tasks = next;
      return result;
    });
  }

  return {
    async list() {
      return [...tasks.values()].map(copy);
    },

    async get(id) {
      const task = tasks.get(id);
      return task ? copy(task) : undefined;
    },

    async create(data) {
      return change((next) => {
        const task = newTask(data, { now, generateId });
        next.set(task.id, task);
        return copy(task);
      });
    },

    async update(id, changes) {
      return change((next) => {
        const task = next.get(id);
        if (!task) return undefined;
        const updated = updatedTask(task, changes, { now });
        next.set(id, updated);
        return copy(updated);
      });
    },

    async replace(id, data) {
      return change((next) => {
        const task = next.get(id);
        if (!task) return undefined;
        const replaced = replacedTask(task, data, { now });
        next.set(id, replaced);
        return copy(replaced);
      });
    },

    async remove(id) {
      const removed = await change((next) => (next.delete(id) ? true : undefined));
      return removed === true;
    },

    async count() {
      return tasks.size;
    },

    // Waits for changes still in the queue: the server calls this before
    // exiting, so a change it already accepted is really saved.
    async close() {
      await queue;
    },
  };
}

// Reads the file into a Map. No file yet: no tasks (it's created on the
// first change). A broken file STOPS the server with a clear message:
// starting empty would look fine, then overwrite every task on the first
// change.
async function load(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return new Map(); // doesn't exist yet
    throw error;
  }

  let saved;
  try {
    saved = JSON.parse(text);
  } catch {
    throw new Error(`${file} isn't valid JSON. Fix it or move it away, then start again.`);
  }
  if (!Array.isArray(saved) || !saved.every((task) => typeof task?.id === "string")) {
    throw new Error(`${file} should hold a list of tasks, each with an "id".`);
  }
  return new Map(saved.map((task) => [task.id, task]));
}

// The atomic write
async function save(file, tasks) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  const text = JSON.stringify([...tasks.values()], null, 2) + "\n";

  try {
    const handle = await open(temporary, "w");
    try {
      await handle.writeFile(text, "utf8");
      // The operating system keeps writes in memory for a while; sync()
      // waits until the bytes are really on the disk.
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }); // don't leave .tmp files behind
    throw error;
  }
}

// On Windows, a rename can fail for a moment if another program (an
// antivirus scanner, an editor) has the file open. Trying again shortly
// after usually works.
async function renameWithRetry(from, to, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (error) {
      const busy = error.code === "EPERM" || error.code === "EBUSY" || error.code === "EACCES";
      if (!busy || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
}
