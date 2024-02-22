import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterTasks } from "../models/taskFilters.js";
import { parseTaskQuery } from "./taskQuery.js";

const fields = (query) => parseTaskQuery(query).errors.map((error) => error.field);

describe("parseTaskQuery", () => {
  it("accepts no filters at all", () => {
    assert.deepEqual(parseTaskQuery({}), { value: {}, errors: [] });
  });

  it("reads one value, a comma list, or a repeated parameter", () => {
    assert.deepEqual(parseTaskQuery({ status: "done" }).value, { status: ["done"] });
    assert.deepEqual(parseTaskQuery({ status: "todo, in_progress" }).value, { status: ["todo", "in_progress"] });
    assert.deepEqual(parseTaskQuery({ priority: ["low", "high"] }).value, { priority: ["low", "high"] });
  });

  it("drops repeats", () => {
    assert.deepEqual(parseTaskQuery({ status: "done,done" }).value, { status: ["done"] });
  });

  it("rejects unknown values, and says what IS allowed", () => {
    assert.deepEqual(parseTaskQuery({ status: "todo,finished" }).errors, [
      { field: "status", message: "Unknown status: finished. Use one or more of: todo, in_progress, done" },
    ]);
  });

  it("rejects empty values", () => {
    assert.deepEqual(fields({ status: "" }), ["status"]);
    assert.deepEqual(fields({ priority: " , " }), ["priority"]);
  });

  it("rejects parameters it doesn't know: usually typos", () => {
    assert.deepEqual(parseTaskQuery({ staus: "done" }).errors, [
      { field: "staus", message: '"staus" isn\'t something tasks can be filtered by' },
    ]);
  });

  it("checks dueBefore is a real date", () => {
    assert.deepEqual(parseTaskQuery({ dueBefore: "2026-11-30" }).value, { dueBefore: "2026-11-30" });
    assert.deepEqual(fields({ dueBefore: "2026-02-30" }), ["dueBefore"]);
    assert.deepEqual(fields({ dueBefore: "next week" }), ["dueBefore"]);
  });

  it("reports every problem at once", () => {
    assert.deepEqual(fields({ status: "nope", priority: "urgent", colour: "red" }), ["status", "priority", "colour"]);
  });
});

describe("filterTasks", () => {
  const tasks = [
    { title: "A", status: "todo", priority: "high", dueDate: "2026-11-01" },
    { title: "B", status: "done", priority: "high", dueDate: null },
    { title: "C", status: "in_progress", priority: "low", dueDate: "2026-12-24" },
    { title: "D", status: "todo", priority: "low", dueDate: "2026-11-30" },
  ];
  const titles = (filters) => filterTasks(tasks, filters).map((task) => task.title);

  it("returns everything with no filters", () => {
    assert.deepEqual(titles({}), ["A", "B", "C", "D"]);
  });

  it("matches ANY of the values within one filter (OR)", () => {
    assert.deepEqual(titles({ status: ["todo", "in_progress"] }), ["A", "C", "D"]);
  });

  it("matches EVERY filter given (AND)", () => {
    assert.deepEqual(titles({ status: ["todo"], priority: ["low"] }), ["D"]);
  });

  it("finds tasks due on or before a day, skipping those with no due date", () => {
    assert.deepEqual(titles({ dueBefore: "2026-11-30" }), ["A", "D"]);
  });

  it("can match nothing", () => {
    assert.deepEqual(titles({ status: ["done"], priority: ["low"] }), []);
  });

  it("doesn't change the list it was given", () => {
    filterTasks(tasks, { status: ["done"] });
    assert.equal(tasks.length, 4);
  });
});
