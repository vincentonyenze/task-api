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
      { field: "staus", message: '"staus" isn\'t a query option for tasks. Use: sort, q, status, priority, dueBefore' },
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

describe("search (q)", () => {
  const tasks = [
    { title: "Write the Q3 report", description: "", status: "todo", priority: "high", dueDate: null },
    { title: "Buy milk", description: "Oat milk from the café", status: "todo", priority: "low", dueDate: null },
    { title: "Report a bug", description: "", status: "done", priority: "medium", dueDate: null },
  ];
  const titles = (query) => filterTasks(tasks, parseTaskQuery(query).value).map((task) => task.title);

  it("finds every word, in any order, ignoring case", () => {
    assert.deepEqual(titles({ q: "REPORT q3" }), ["Write the Q3 report"]);
    assert.deepEqual(titles({ q: "report" }), ["Write the Q3 report", "Report a bug"]);
  });

  it("looks in the description too, and ignores accents", () => {
    assert.deepEqual(titles({ q: "cafe" }), ["Buy milk"]);
    assert.deepEqual(titles({ q: "CAFÉ oat" }), ["Buy milk"]);
  });

  it("combines with the other filters", () => {
    assert.deepEqual(titles({ q: "report", status: "done" }), ["Report a bug"]);
  });

  it("treats an empty search as no search", () => {
    assert.deepEqual(parseTaskQuery({ q: "   " }), { value: {}, errors: [] });
    assert.equal(titles({ q: "" }).length, 3);
  });

  it("rejects a search that's too long, or given twice", () => {
    assert.deepEqual(fields({ q: "x".repeat(101) }), ["q"]);
    assert.deepEqual(fields({ q: "x".repeat(100) }), []);
    assert.deepEqual(fields({ q: ["milk", "report"] }), ["q"]);
  });

  it("can find nothing", () => {
    assert.deepEqual(titles({ q: "holiday" }), []);
  });
});

describe("parameter names", () => {
  // Every object inherits names like toString and constructor. A plain
  // PARAMETERS[name] lookup would find them and treat them as parameters.
  it("doesn't mistake built-in object names for parameters", () => {
    assert.deepEqual(fields({ toString: "x" }), ["toString"]);
    assert.deepEqual(fields({ constructor: "x", __proto__: "x" }), ["constructor"]);
  });
});

describe("search words", () => {
  // Words containing "s", and extra spaces: these would break if the words
  // were split on anything other than whitespace
  it("splits the search on spaces only", () => {
    const tasks = [{ title: "Read about HTTP status codes", description: "", status: "todo", priority: "low", dueDate: null }];
    const found = (q) => filterTasks(tasks, { q }).length;
    assert.equal(found("status codes"), 1);
    assert.equal(found("  codes    status  "), 1);
    assert.equal(found("status missing"), 0);
  });
});
