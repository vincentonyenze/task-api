import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createFileTaskStore } from "./fileTaskStore.js";
import { describeTaskStore } from "./storeContract.js";

// Every test works in its own folder inside the system's temp folder, so
// tests never touch the real data/tasks.json (or each other's files).
let folder;
let files = 0;
const newFile = () => join(folder, `tasks-${++files}.json`);

before(async () => {
  folder = await mkdtemp(join(tmpdir(), "task-api-test-"));
});
after(async () => {
  await rm(folder, { recursive: true, force: true });
});

// 1. Everything the memory store promises, the file store promises too
describeTaskStore("file store", (options) => createFileTaskStore({ file: newFile(), ...options }));

// 2. What only a file store can promise
describe("file store: the file", () => {
  it("keeps tasks after the store is opened again (a restart)", async () => {
    const file = newFile();
    const first = await createFileTaskStore({ file });
    const task = await first.create({ title: "Survive a restart" });
    await first.update(task.id, { status: "done" });

    const reopened = await createFileTaskStore({ file });
    assert.deepEqual(await reopened.list(), await first.list());
  });

  it("starts empty when there's no file yet, and makes its folder when needed", async () => {
    const file = join(folder, "new-folder", "deeper", "tasks.json");
    const store = await createFileTaskStore({ file });
    assert.equal(await store.count(), 0);
    await store.create({ title: "First" });
    assert.equal(JSON.parse(await readFile(file, "utf8")).length, 1);
  });

  it("writes readable JSON: a list of tasks", async () => {
    const file = newFile();
    const store = await createFileTaskStore({ file });
    await store.create({ title: "Readable" });
    const text = await readFile(file, "utf8");
    assert.match(text, /^\[\n {2}\{/); // indented, one field per line
    assert.equal(JSON.parse(text)[0].title, "Readable");
  });

  it("refuses to start from a broken file, instead of overwriting it", async () => {
    const file = newFile();
    await writeFile(file, '[{"id": "a", "title": "cut off mid-wr');
    await assert.rejects(createFileTaskStore({ file }), /isn't valid JSON/);
    // ...and the broken file is still there for a person to rescue
    assert.equal(await readFile(file, "utf8"), '[{"id": "a", "title": "cut off mid-wr');
  });

  it("refuses a file that isn't a list of tasks", async () => {
    const file = newFile();
    await writeFile(file, '{"tasks": []}');
    await assert.rejects(createFileTaskStore({ file }), /should hold a list of tasks/);
  });

  it("saves every change when many arrive at once (the queue)", async () => {
    const file = newFile();
    const store = await createFileTaskStore({ file });
    // 25 creates at the SAME time: without the queue, writes would
    // overwrite each other and the file would lose tasks
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.create({ title: `Task ${i}` })));
    const reopened = await createFileTaskStore({ file });
    assert.equal(await reopened.count(), 25);
  });

  it("leaves no temporary files behind", async () => {
    const own = await mkdtemp(join(folder, "clean-"));
    const store = await createFileTaskStore({ file: join(own, "tasks.json") });
    const task = await store.create({ title: "A" });
    await store.update(task.id, { title: "B" });
    await store.remove(task.id);
    assert.deepEqual(await readdir(own), ["tasks.json"]);
  });

  it("doesn't write anything when the task doesn't exist", async () => {
    const own = await mkdtemp(join(folder, "nothing-"));
    const store = await createFileTaskStore({ file: join(own, "tasks.json") });
    assert.equal(await store.update("no-such-id", { title: "x" }), undefined);
    assert.equal(await store.remove("no-such-id"), false);
    assert.deepEqual(await readdir(own), []); // no file was ever created
  });

  it("forgets a change whose write failed, and keeps working", async () => {
    // A store whose folder is replaced by a FILE after it starts: every
    // write fails (you can't put a file inside a file)
    const own = await mkdtemp(join(folder, "failing-"));
    const inner = join(own, "data");
    const store = await createFileTaskStore({ file: join(inner, "tasks.json") });
    await store.create({ title: "Saved" });

    await rm(inner, { recursive: true });
    await writeFile(inner, "I'm a file now");
    await assert.rejects(store.create({ title: "Never saved" }));
    assert.deepEqual(
      (await store.list()).map((task) => task.title),
      ["Saved"] // memory still matches what was last saved
    );

    // Fix the folder: the store carries on (the failure didn't jam the queue)
    await rm(inner);
    await store.create({ title: "Saved again" });
    assert.equal(await store.count(), 2);
  });

  it("close() waits for changes still being saved", async () => {
    const file = newFile();
    const store = await createFileTaskStore({ file });
    store.create({ title: "Not awaited" }); // deliberately no await
    await store.close();
    assert.equal(JSON.parse(await readFile(file, "utf8")).length, 1);
  });
});
