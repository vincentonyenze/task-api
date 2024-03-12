import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryTaskStore } from "./memoryTaskStore.js";
import { describeTaskStore } from "./storeContract.js";
import { TASK_PRIORITIES, TASK_STATUSES } from "./task.js";

// The memory store must pass the same contract as every other store
describeTaskStore("memory store", (options) => createMemoryTaskStore(options));

describe("the allowed values", () => {
  it("are what the rest of the API expects", () => {
    assert.deepEqual(TASK_STATUSES, ["todo", "in_progress", "done"]);
    assert.deepEqual(TASK_PRIORITIES, ["low", "medium", "high"]);
  });
});
