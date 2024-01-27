import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createTaskStore, TASK_PRIORITIES, TASK_STATUSES } from "./taskStore.js";

// Tests with Node's BUILT-IN runner: `npm test` finds every *.test.js file.
//   describe: a group of tests      it: one test
//   assert.equal / deepEqual: "this should be exactly that", or the test fails

// A store with a FAKE clock and FAKE ids (Step 7's dependency injection):
// every result is predictable. Each call to now() is one second later.
function makeStore() {
  let seconds = 0;
  let count = 0;
  return createTaskStore({
    now: () => new Date(Date.UTC(2026, 9, 21, 9, 0, seconds++)),
    generateId: () => `task-${++count}`,
  });
}

let store;
// A brand-new, empty store before EVERY test: no test can affect another
beforeEach(() => {
  store = makeStore();
});

describe("create", () => {
  it("makes a task with defaults, an id and timestamps", () => {
    assert.deepEqual(store.create({ title: "Buy milk" }), {
      id: "task-1",
      title: "Buy milk",
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: null,
      createdAt: "2026-10-21T09:00:00.000Z",
      updatedAt: "2026-10-21T09:00:00.000Z",
    });
  });

  it("keeps the fields it's given", () => {
    const task = store.create({ title: "Report", description: "Q3", status: "in_progress", priority: "high", dueDate: "2026-11-01" });
    assert.equal(task.status, "in_progress");
    assert.equal(task.priority, "high");
    assert.equal(task.dueDate, "2026-11-01");
  });

  it("ignores fields the server owns, and unknown ones", () => {
    const task = store.create({ title: "Sneaky", id: "my-id", createdAt: "1999-01-01", admin: true });
    assert.equal(task.id, "task-1");
    assert.equal(task.createdAt, "2026-10-21T09:00:00.000Z");
    assert.equal("admin" in task, false);
  });

  it("gives every task its own id", () => {
    const a = store.create({ title: "A" });
    const b = store.create({ title: "B" });
    assert.notEqual(a.id, b.id);
    assert.equal(store.count(), 2);
  });
});

describe("list and get", () => {
  it("lists tasks oldest first", () => {
    store.create({ title: "First" });
    store.create({ title: "Second" });
    assert.deepEqual(
      store.list().map((task) => task.title),
      ["First", "Second"]
    );
  });

  it("finds one task by id, or returns undefined", () => {
    const task = store.create({ title: "Find me" });
    assert.equal(store.get(task.id).title, "Find me");
    assert.equal(store.get("no-such-id"), undefined);
  });

  it("hands out copies: changing one doesn't change the store", () => {
    const task = store.create({ title: "Original" });
    store.get(task.id).title = "Changed outside";
    store.list()[0].title = "Changed outside too";
    assert.equal(store.get(task.id).title, "Original");
  });
});

describe("update (PATCH)", () => {
  it("changes only the fields given, and moves updatedAt", () => {
    const task = store.create({ title: "Buy milk", priority: "high" });
    const updated = store.update(task.id, { status: "done" });
    assert.equal(updated.status, "done");
    assert.equal(updated.priority, "high"); // untouched
    assert.equal(updated.createdAt, task.createdAt);
    assert.equal(updated.updatedAt, "2026-10-21T09:00:01.000Z");
  });

  it("can't change the id or createdAt", () => {
    const task = store.create({ title: "Buy milk" });
    const updated = store.update(task.id, { id: "other", createdAt: "1999-01-01" });
    assert.equal(updated.id, task.id);
    assert.equal(updated.createdAt, task.createdAt);
  });

  it("returns undefined for a missing task", () => {
    assert.equal(store.update("no-such-id", { title: "x" }), undefined);
  });
});

describe("replace (PUT)", () => {
  it("resets every field it isn't given", () => {
    const task = store.create({ title: "Report", priority: "high", status: "in_progress", dueDate: "2026-11-01" });
    const replaced = store.replace(task.id, { title: "New report" });
    assert.deepEqual(
      { ...replaced, updatedAt: undefined },
      { ...task, title: "New report", priority: "medium", status: "todo", dueDate: null, updatedAt: undefined }
    );
  });

  it("returns undefined for a missing task", () => {
    assert.equal(store.replace("no-such-id", { title: "x" }), undefined);
  });
});

describe("remove", () => {
  it("deletes a task, and says whether it existed", () => {
    const task = store.create({ title: "Delete me" });
    assert.equal(store.remove(task.id), true);
    assert.equal(store.get(task.id), undefined);
    assert.equal(store.remove(task.id), false); // already gone
    assert.equal(store.count(), 0);
  });
});

describe("the allowed values", () => {
  it("are what the rest of the API expects", () => {
    assert.deepEqual(TASK_STATUSES, ["todo", "in_progress", "done"]);
    assert.deepEqual(TASK_PRIORITIES, ["low", "medium", "high"]);
  });
});

describe("separate stores", () => {
  it("don't share tasks", () => {
    const other = makeStore();
    store.create({ title: "Only in the first" });
    assert.equal(other.count(), 0);
  });
});
