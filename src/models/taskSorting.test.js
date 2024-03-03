import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTaskQuery } from "../validation/taskQuery.js";
import { sortTasks } from "./taskSorting.js";

// Created in this order: A first, E last
const tasks = [
  { id: "a", title: "banana", priority: "low", status: "done", dueDate: "2026-12-01", createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-05T09:00:00.000Z" },
  { id: "b", title: "Apple", priority: "high", status: "todo", dueDate: null, createdAt: "2026-10-02T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z" },
  { id: "c", title: "cherry", priority: "medium", status: "in_progress", dueDate: "2026-11-01", createdAt: "2026-10-03T09:00:00.000Z", updatedAt: "2026-10-09T09:00:00.000Z" },
  { id: "d", title: "apple pie", priority: "high", status: "todo", dueDate: "2026-11-20", createdAt: "2026-10-04T09:00:00.000Z", updatedAt: "2026-10-04T09:00:00.000Z" },
  { id: "e", title: "date", priority: "medium", status: "done", dueDate: null, createdAt: "2026-10-05T09:00:00.000Z", updatedAt: "2026-10-05T09:00:00.000Z" },
];

// Sort by a query string's sort value, the way the API does
const order = (sort) => sortTasks(tasks, parseTaskQuery({ sort }).value.sort).map((task) => task.id).join("");

describe("sortTasks", () => {
  it("keeps creation order by default", () => {
    assert.equal(sortTasks(tasks).map((task) => task.id).join(""), "abcde");
  });

  it("sorts newest first with a minus sign", () => {
    assert.equal(order("-createdAt"), "edcba");
  });

  it("sorts titles A to Z, ignoring capitals", () => {
    assert.equal(order("title"), "bdace"); // Apple, apple pie, banana, cherry, date
  });

  it("sorts priority by meaning, not alphabet", () => {
    assert.equal(order("priority"), "acebd"); // low, medium, medium, high, high
    assert.equal(order("-priority"), "bdcea"); // high first
  });

  it("sorts status in the order work moves", () => {
    assert.equal(order("status"), "bdcae"); // todo, todo, in_progress, done, done
  });

  it("puts tasks with no due date last, in BOTH directions", () => {
    assert.equal(order("dueDate"), "cdabe"); // Nov 1, Nov 20, Dec 1, then the two without
    assert.equal(order("-dueDate"), "adcbe"); // Dec 1, Nov 20, Nov 1, then the two without
  });

  it("uses later fields only to break ties", () => {
    // high (b, d) before medium (c, e) before low (a); within each, soonest due first
    assert.equal(order("-priority,dueDate"), "dbcea");
  });

  it("returns a NEW list and leaves the original alone", () => {
    const sorted = sortTasks(tasks, [{ field: "title", direction: "asc" }]);
    assert.notEqual(sorted, tasks);
    assert.equal(tasks.map((task) => task.id).join(""), "abcde");
  });
});

describe("the sort parameter", () => {
  const errorFor = (sort) => parseTaskQuery({ sort }).errors[0]?.message;

  it("reads fields, directions and several fields", () => {
    assert.deepEqual(parseTaskQuery({ sort: "-priority, dueDate" }).value.sort, [
      { field: "priority", direction: "desc" },
      { field: "dueDate", direction: "asc" },
    ]);
  });

  it("rejects unknown fields, and lists the ones it knows", () => {
    assert.equal(
      errorFor("colour"),
      'Can\'t sort by "colour". Use: title, priority, status, dueDate, createdAt, updatedAt (add - in front for descending)'
    );
    assert.match(errorFor("-toString"), /Can't sort by "toString"/);
  });

  it("rejects empty values, repeats, and the parameter given twice", () => {
    assert.equal(errorFor(""), "sort can't be empty");
    assert.equal(errorFor("title,-title"), '"title" appears twice in sort');
    assert.match(errorFor(["title", "priority"]), /given once/);
  });
});

describe("ties", () => {
  // Tasks created in the same millisecond have equal createdAt values,
  // which really happens (the example tasks, a quick script). Equal tasks
  // must come out in the order they were created, every single time.
  const sameMoment = "2026-10-21T09:00:00.000Z";
  const twins = ["z", "m", "a", "q"].map((id, index) => ({
    id, // random-looking ids: they must NOT decide the order
    title: `Task ${index + 1}`,
    priority: "high",
    status: "todo",
    dueDate: null,
    createdAt: sameMoment,
    updatedAt: sameMoment,
  }));
  const titles = (sort) => sortTasks(twins, sort).map((task) => task.title).join(", ");

  it("keeps creation order for tasks that are equal", () => {
    assert.equal(titles(), "Task 1, Task 2, Task 3, Task 4");
    assert.equal(titles([{ field: "priority", direction: "desc" }]), "Task 1, Task 2, Task 3, Task 4");
  });
});

describe("a sort with only a minus", () => {
  it("explains what's missing", () => {
    assert.equal(parseTaskQuery({ sort: "-" }).errors[0].message, "sort needs a field name after the -, e.g. sort=-createdAt");
  });
});
