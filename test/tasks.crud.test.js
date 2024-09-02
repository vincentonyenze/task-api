import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FIRST_TIME, startTestApi, timeAfter } from "./helpers/testApi.js";

// Every task endpoint, through real HTTP: what a client sends, and
// EXACTLY what it gets back. A fresh app (and empty store) for every test,
// so no test depends on what another one left behind.

let api;
beforeEach(async () => {
  api = await startTestApi();
});
afterEach(() => api.close());

// A task with every field, as the API returns it
const fullTask = (fields) => ({
  id: "task-1",
  title: "Buy milk",
  description: "",
  status: "todo",
  priority: "medium",
  dueDate: null,
  createdAt: FIRST_TIME,
  updatedAt: FIRST_TIME,
  ...fields,
});

describe("POST /tasks", () => {
  it("creates a task: 201, the whole task, and where to find it", async () => {
    const res = await api.post("/tasks", { title: "Buy milk" });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("location"), "/tasks/task-1");
    assert.deepEqual(res.body, { data: fullTask() });
  });

  it("keeps every field it's given, cleaned up", async () => {
    const res = await api.post("/tasks", {
      title: "  Report  ",
      description: " Q3 numbers ",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-11-30",
    });
    assert.deepEqual(res.body.data, {
      ...fullTask(),
      title: "Report",
      description: "Q3 numbers",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-11-30",
    });
  });

  it("ignores fields the server owns", async () => {
    const res = await api.post("/tasks", { title: "Mine", id: "chosen-id", createdAt: "1999-01-01T00:00:00.000Z" });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.id, "task-1");
    assert.equal(res.body.data.createdAt, FIRST_TIME);
  });

  it("the Location really leads to the new task", async () => {
    const created = await api.post("/tasks", { title: "Follow me" });
    const found = await api.get(created.headers.get("location"));
    assert.equal(found.status, 200);
    assert.deepEqual(found.body, created.body);
  });

  it("reports every problem at once, by field (400)", async () => {
    const res = await api.post("/tasks", { title: "", priority: "urgent", colour: "red" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_FAILED");
    assert.equal(res.body.error.message, "The task has 3 problems.");
    assert.deepEqual(res.body.error.details, [
      { field: "title", message: "Title can't be empty" },
      { field: "priority", message: "Priority must be one of: low, medium, high" },
      { field: "colour", message: '"colour" isn\'t a task field' },
    ]);
  });

  it("requires a title", async () => {
    const res = await api.post("/tasks", { priority: "high" });
    assert.deepEqual(res.body.error.details, [{ field: "title", message: "Title is required" }]);
  });

  it("refuses broken JSON, a JSON list, and no body at all (400)", async () => {
    const broken = await api.post("/tasks", '{"title": "Buy milk"', { headers: { "Content-Type": "application/json" } });
    assert.equal(broken.body.error.code, "INVALID_JSON");

    const list = await api.post("/tasks", [{ title: "Buy milk" }]);
    assert.equal(list.status, 400);
    assert.equal(list.body.error.details[0].message, "The task must be a JSON object");

    const empty = await api.request("POST", "/tasks");
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error.code, "INVALID_BODY");
  });

  it("saves nothing when the request is refused", async () => {
    await api.post("/tasks", { title: "" });
    await api.post("/tasks", "not json", { headers: { "Content-Type": "application/json" } });
    assert.equal(await api.store.count(), 0);
  });
});

describe("GET /tasks/:id", () => {
  it("returns the task", async () => {
    await api.post("/tasks", { title: "Buy milk" });
    const res = await api.get("/tasks/task-1");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { data: fullTask() });
  });

  it("answers 404 for an id that doesn't exist, naming it", async () => {
    const res = await api.get("/tasks/no-such-task");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NOT_FOUND");
    assert.match(res.body.error.message, /"no-such-task"/);
  });

  it("answers HEAD with the headers only", async () => {
    await api.post("/tasks", { title: "Buy milk" });
    const res = await api.request("HEAD", "/tasks/task-1");
    assert.equal(res.status, 200);
    assert.equal(res.text, "");
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  });
});

describe("PATCH /tasks/:id", () => {
  beforeEach(async () => {
    await api.post("/tasks", { title: "Buy milk", priority: "high" });
  });

  it("changes only the fields sent, and moves updatedAt", async () => {
    const res = await api.patch("/tasks/task-1", { status: "done" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { data: fullTask({ priority: "high", status: "done", updatedAt: timeAfter(1) }) });
  });

  it("really saves the change", async () => {
    await api.patch("/tasks/task-1", { title: "Buy oat milk" });
    assert.equal((await api.get("/tasks/task-1")).body.data.title, "Buy oat milk");
  });

  it("can clear the due date with null", async () => {
    await api.patch("/tasks/task-1", { dueDate: "2026-12-01" });
    const res = await api.patch("/tasks/task-1", { dueDate: null });
    assert.equal(res.body.data.dueDate, null);
  });

  it("needs at least one field, and checks what's sent (400)", async () => {
    const empty = await api.patch("/tasks/task-1", {});
    assert.deepEqual(empty.body.error.details, [{ field: null, message: "Send at least one field to change" }]);

    const wrong = await api.patch("/tasks/task-1", { status: "finished" });
    assert.equal(wrong.status, 400);
    assert.equal((await api.get("/tasks/task-1")).body.data.status, "todo"); // unchanged
  });

  it("answers 404 for a missing task, even with a bad body (it can't be fixed anyway)", async () => {
    const res = await api.patch("/tasks/nope", { status: "finished" });
    assert.equal(res.status, 404);
  });
});

describe("PUT /tasks/:id", () => {
  beforeEach(async () => {
    await api.post("/tasks", { title: "Report", priority: "high", status: "in_progress", dueDate: "2026-11-30" });
  });

  it("replaces the whole task: fields not sent go back to their defaults", async () => {
    const res = await api.put("/tasks/task-1", { title: "New report" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { data: fullTask({ title: "New report", updatedAt: timeAfter(1) }) });
  });

  it("accepts the task exactly as GET returned it (round trip)", async () => {
    const { data } = (await api.get("/tasks/task-1")).body;
    const res = await api.put("/tasks/task-1", { ...data, status: "done" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "done");
    assert.equal(res.body.data.priority, "high");
  });

  it("requires a title, like POST (400)", async () => {
    const res = await api.put("/tasks/task-1", { status: "done" });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details, [{ field: "title", message: "Title is required" }]);
  });

  it("answers 404 for a missing task (PUT doesn't create)", async () => {
    const res = await api.put("/tasks/task-99", { title: "Not created" });
    assert.equal(res.status, 404);
    assert.equal(await api.store.count(), 1);
  });
});

describe("DELETE /tasks/:id", () => {
  it("deletes: 204 with no body, then the task is gone", async () => {
    await api.post("/tasks", { title: "Delete me" });
    const res = await api.delete("/tasks/task-1");
    assert.equal(res.status, 204);
    assert.equal(res.text, "");
    assert.equal((await api.get("/tasks/task-1")).status, 404);
    assert.equal((await api.get("/tasks")).body.meta.total, 0);
  });

  it("answers 404 the second time, and for ids that never existed", async () => {
    await api.post("/tasks", { title: "Delete me" });
    await api.delete("/tasks/task-1");
    assert.equal((await api.delete("/tasks/task-1")).status, 404);
    assert.equal((await api.delete("/tasks/never")).status, 404);
  });

  it("deletes only the one task", async () => {
    await api.post("/tasks", { title: "Keep" });
    await api.post("/tasks", { title: "Delete" });
    await api.delete("/tasks/task-2");
    const titles = (await api.get("/tasks")).body.data.map((task) => task.title);
    assert.deepEqual(titles, ["Keep"]);
  });
});

describe("a task's whole life", () => {
  it("create -> read -> change -> replace -> delete", async () => {
    const created = await api.post("/tasks", { title: "Plan the trip", dueDate: "2026-12-20" });
    const path = created.headers.get("location");

    assert.equal((await api.get(path)).body.data.status, "todo");

    await api.patch(path, { status: "in_progress" });
    await api.patch(path, { description: "Book train tickets" });
    const changed = (await api.get(path)).body.data;
    assert.equal(changed.status, "in_progress");
    assert.equal(changed.description, "Book train tickets");
    assert.equal(changed.dueDate, "2026-12-20");

    const replaced = (await api.put(path, { title: "Trip: done", status: "done" })).body.data;
    assert.equal(replaced.description, ""); // PUT reset it
    assert.equal(replaced.createdAt, created.body.data.createdAt); // never changes
    assert.equal(replaced.updatedAt, timeAfter(3)); // the third change

    assert.equal((await api.delete(path)).status, 204);
    assert.equal((await api.get(path)).status, 404);
  });
});
