import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

// THE STORE CONTRACT: the tests ANY task store must pass.
//
// Not a test file itself (no ".test" in the name, so `npm test` doesn't
// run it directly). Each store's own test file calls it:
//   describeTaskStore("memory store", (options) => createMemoryTaskStore(options));
// so the memory store, the file store (Step 28) and a future database
// store are all held to EXACTLY the same rules.
//
// makeStore(options): builds a new, empty store with the given fake clock
// and ids. It may be async (a file store has to prepare its file).
export function describeTaskStore(name, makeStore) {
  describe(name, () => {
    let store;

    // A brand-new, empty store before EVERY test, with a FAKE clock (each
    // call one second later) and FAKE ids: every result is predictable
    beforeEach(async () => {
      let seconds = 0;
      let count = 0;
      store = await makeStore({
        now: () => new Date(Date.UTC(2026, 9, 21, 9, 0, seconds++)),
        generateId: () => `task-${++count}`,
      });
    });

    describe("create", () => {
      it("makes a task with defaults, an id and timestamps", async () => {
        assert.deepEqual(await store.create({ title: "Buy milk" }), {
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

      it("keeps the fields it's given", async () => {
        const task = await store.create({
          title: "Report",
          description: "Q3",
          status: "in_progress",
          priority: "high",
          dueDate: "2026-11-01",
        });
        assert.equal(task.status, "in_progress");
        assert.equal(task.priority, "high");
        assert.equal(task.dueDate, "2026-11-01");
      });

      it("ignores fields the server owns, and unknown ones", async () => {
        const task = await store.create({ title: "Sneaky", id: "my-id", createdAt: "1999-01-01", admin: true });
        assert.equal(task.id, "task-1");
        assert.equal(task.createdAt, "2026-10-21T09:00:00.000Z");
        assert.equal("admin" in task, false);
      });

      it("gives every task its own id", async () => {
        const a = await store.create({ title: "A" });
        const b = await store.create({ title: "B" });
        assert.notEqual(a.id, b.id);
        assert.equal(await store.count(), 2);
      });
    });

    describe("list and get", () => {
      it("lists tasks oldest first", async () => {
        await store.create({ title: "First" });
        await store.create({ title: "Second" });
        assert.deepEqual(
          (await store.list()).map((task) => task.title),
          ["First", "Second"]
        );
      });

      it("finds one task by id, or returns undefined", async () => {
        const task = await store.create({ title: "Find me" });
        assert.equal((await store.get(task.id)).title, "Find me");
        assert.equal(await store.get("no-such-id"), undefined);
      });

      it("hands out copies: changing one doesn't change the store", async () => {
        const task = await store.create({ title: "Original" });
        (await store.get(task.id)).title = "Changed outside";
        (await store.list())[0].title = "Changed outside too";
        assert.equal((await store.get(task.id)).title, "Original");
      });
    });

    describe("update (PATCH)", () => {
      it("changes only the fields given, and moves updatedAt", async () => {
        const task = await store.create({ title: "Buy milk", priority: "high" });
        const updated = await store.update(task.id, { status: "done" });
        assert.equal(updated.status, "done");
        assert.equal(updated.priority, "high"); // untouched
        assert.equal(updated.createdAt, task.createdAt);
        assert.equal(updated.updatedAt, "2026-10-21T09:00:01.000Z");
        assert.deepEqual(await store.get(task.id), updated); // really stored
      });

      it("can't change the id or createdAt", async () => {
        const task = await store.create({ title: "Buy milk" });
        const updated = await store.update(task.id, { id: "other", createdAt: "1999-01-01" });
        assert.equal(updated.id, task.id);
        assert.equal(updated.createdAt, task.createdAt);
      });

      it("returns undefined for a missing task", async () => {
        assert.equal(await store.update("no-such-id", { title: "x" }), undefined);
      });
    });

    describe("replace (PUT)", () => {
      it("resets every field it isn't given", async () => {
        const task = await store.create({ title: "Report", priority: "high", status: "in_progress", dueDate: "2026-11-01" });
        const replaced = await store.replace(task.id, { title: "New report" });
        assert.deepEqual(
          { ...replaced, updatedAt: undefined },
          { ...task, title: "New report", priority: "medium", status: "todo", dueDate: null, updatedAt: undefined }
        );
        assert.deepEqual(await store.get(task.id), replaced); // really stored
      });

      it("returns undefined for a missing task", async () => {
        assert.equal(await store.replace("no-such-id", { title: "x" }), undefined);
      });
    });

    describe("remove", () => {
      it("deletes a task, and says whether it existed", async () => {
        const task = await store.create({ title: "Delete me" });
        assert.equal(await store.remove(task.id), true);
        assert.equal(await store.get(task.id), undefined);
        assert.equal(await store.remove(task.id), false); // already gone
        assert.equal(await store.count(), 0);
      });
    });

    describe("separate stores", () => {
      it("don't share tasks", async () => {
        const other = await makeStore();
        await store.create({ title: "Only in the first" });
        assert.equal(await other.count(), 0);
      });
    });
  });
}
