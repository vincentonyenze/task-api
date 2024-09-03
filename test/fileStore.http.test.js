import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createFileTaskStore } from "../src/models/fileTaskStore.js";
import { startTestApi } from "./helpers/testApi.js";

// The whole API on the FILE store, as `npm start` runs it: what a client
// changes must still be there after the server restarts.

let folder;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "task-api-http-"));
});
after(async () => {
  await rm(folder, { recursive: true, force: true });
});

// "Starts the server" on the given file
async function startOn(file, options = {}) {
  return startTestApi({ store: await createFileTaskStore({ file }), ...options });
}

describe("the file store over HTTP", () => {
  it("keeps every change across a restart", async () => {
    const file = join(folder, "restart.json");

    const first = await startOn(file);
    const a = (await first.post("/tasks", { title: "Keep me", priority: "high" })).body.data;
    const b = (await first.post("/tasks", { title: "Delete me" })).body.data;
    await first.patch(`/tasks/${a.id}`, { status: "done" });
    await first.delete(`/tasks/${b.id}`);
    const before = (await first.get("/tasks")).body;
    await first.store.close();
    await first.close();

    const second = await startOn(file); // a "restart": a new app reading the same file
    assert.deepEqual((await second.get("/tasks")).body, before);
    assert.equal((await second.get(`/tasks/${a.id}`)).body.data.status, "done");
    assert.equal((await second.get(`/tasks/${b.id}`)).status, 404);
    await second.close();

    // ...and the file itself is plain, readable JSON
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(saved.map((task) => task.title), ["Keep me"]);
  });

  it("saves every one of many requests sent at once", async () => {
    const file = join(folder, "busy.json");
    const api = await startOn(file);
    const answers = await Promise.all(
      Array.from({ length: 20 }, (_, i) => api.post("/tasks", { title: `Task ${i + 1}` }))
    );
    assert.ok(answers.every((res) => res.status === 201));
    assert.equal(new Set(answers.map((res) => res.body.data.id)).size, 20); // all different
    await api.close();

    const restarted = await startOn(file);
    assert.equal((await restarted.get("/tasks")).body.meta.total, 20);
    await restarted.close();
  });

  it("answers 500 when the file can't be written, and changes nothing", async () => {
    const own = await mkdtemp(join(folder, "failing-"));
    const inner = join(own, "data");
    const reported = [];
    const api = await startOn(join(inner, "tasks.json"), { logError: (...args) => reported.push(args) });
    await api.post("/tasks", { title: "Saved" });

    // Break the disk: the folder becomes a file, so every write fails
    await rm(inner, { recursive: true });
    await writeFile(inner, "not a folder");

    const res = await api.post("/tasks", { title: "Never saved" });
    assert.equal(res.status, 500);
    assert.equal(res.body.error.code, "INTERNAL_ERROR");
    assert.equal(reported.length, 1); // the server's log heard about it
    assert.deepEqual(
      (await api.get("/tasks")).body.data.map((task) => task.title),
      ["Saved"] // what the API shows still matches the file
    );
    await api.close();
  });
});
