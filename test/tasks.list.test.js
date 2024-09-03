import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "./helpers/testApi.js";

// GET /tasks with everything a client can ask for: filters, search,
// sorting and pages, alone and together, through real HTTP.
//
// The tasks are only READ here, so one app with one set of tasks serves
// every test in this file (made once, in `before`).

const TASKS = [
  { title: "Write the report", description: "Q3 numbers", status: "in_progress", priority: "high", dueDate: "2026-11-10" },
  { title: "Café order", description: "Beans for the office", status: "todo", priority: "low" },
  { title: "Book flights", status: "todo", priority: "high", dueDate: "2026-12-01" },
  { title: "Fix the printer", status: "done", priority: "medium" },
  { title: "Annual report review", description: "Read the draft", status: "todo", priority: "medium", dueDate: "2026-11-05" },
  { title: "Buy milk", status: "done", priority: "low", dueDate: "2026-10-20" },
];

let api;
before(async () => {
  api = await startTestApi();
  // One at a time, so they're created (and listed) in this order
  for (const task of TASKS) await api.post("/tasks", task);
});
after(() => api.close());

const titles = (res) => res.body.data.map((task) => task.title);

describe("GET /tasks: the plain list", () => {
  it("lists every task, oldest first, with meta and links", async () => {
    const res = await api.get("/tasks");
    assert.equal(res.status, 200);
    assert.deepEqual(titles(res), TASKS.map((task) => task.title));
    assert.deepEqual(res.body.meta, { total: 6, page: 1, limit: 20, totalPages: 1 });
    assert.deepEqual(res.body.links, {
      self: "/tasks?page=1&limit=20",
      first: "/tasks?page=1&limit=20",
      last: "/tasks?page=1&limit=20",
      next: null,
      previous: null,
    });
  });

  it("answers HEAD with no body", async () => {
    const res = await api.request("HEAD", "/tasks");
    assert.equal(res.status, 200);
    assert.equal(res.text, "");
  });
});

describe("GET /tasks: filters", () => {
  it("by status, one or several", async () => {
    assert.deepEqual(titles(await api.get("/tasks?status=done")), ["Fix the printer", "Buy milk"]);
    assert.equal((await api.get("/tasks?status=todo,in_progress")).body.meta.total, 4);
    assert.equal((await api.get("/tasks?status=todo&status=in_progress")).body.meta.total, 4); // repeated
  });

  it("by priority", async () => {
    assert.deepEqual(titles(await api.get("/tasks?priority=high")), ["Write the report", "Book flights"]);
  });

  it("by due date, leaving out tasks with none", async () => {
    assert.deepEqual(titles(await api.get("/tasks?dueBefore=2026-11-10")), [
      "Write the report", // due ON the day counts
      "Annual report review",
      "Buy milk",
    ]);
  });

  it("several filters together: a task must pass them all", async () => {
    const res = await api.get("/tasks?status=todo&priority=high,medium&dueBefore=2026-12-31");
    assert.deepEqual(titles(res), ["Book flights", "Annual report review"]);
  });

  it("a filter nothing matches: an empty list, not an error", async () => {
    const res = await api.get("/tasks?status=done&priority=high");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.deepEqual(res.body.meta, { total: 0, page: 1, limit: 20, totalPages: 1 });
  });
});

describe("GET /tasks: search (?q=)", () => {
  it("searches titles and descriptions, ignoring case", async () => {
    assert.deepEqual(titles(await api.get("/tasks?q=REPORT")), ["Write the report", "Annual report review"]);
    assert.deepEqual(titles(await api.get("/tasks?q=q3")), ["Write the report"]); // in the description
  });

  it("ignores accents both ways", async () => {
    assert.deepEqual(titles(await api.get("/tasks?q=cafe")), ["Café order"]);
    assert.deepEqual(titles(await api.get(`/tasks?q=${encodeURIComponent("BÉANS")}`)), ["Café order"]);
  });

  it("needs EVERY word to match, in any order", async () => {
    assert.deepEqual(titles(await api.get("/tasks?q=report+draft")), ["Annual report review"]);
    assert.deepEqual(titles(await api.get("/tasks?q=draft%20report")), ["Annual report review"]);
    assert.deepEqual(titles(await api.get("/tasks?q=report+printer")), []);
  });

  it("an empty q means no search", async () => {
    assert.equal((await api.get("/tasks?q=")).body.meta.total, 6);
    assert.equal((await api.get("/tasks?q=%20%20")).body.meta.total, 6);
  });

  it("combines with filters", async () => {
    assert.deepEqual(titles(await api.get("/tasks?q=report&status=todo")), ["Annual report review"]);
  });
});

describe("GET /tasks: sorting (?sort=)", () => {
  it("by title, A to Z and Z to A", async () => {
    const az = titles(await api.get("/tasks?sort=title"));
    assert.deepEqual(az, ["Annual report review", "Book flights", "Buy milk", "Café order", "Fix the printer", "Write the report"]);
    assert.deepEqual(titles(await api.get("/tasks?sort=-title")), az.toReversed());
  });

  it("by priority by RANK (high, medium, low), not alphabetically", async () => {
    const res = await api.get("/tasks?sort=-priority");
    assert.deepEqual(
      res.body.data.map((task) => task.priority),
      ["high", "high", "medium", "medium", "low", "low"]
    );
    // Ties keep their created order (a stable sort)
    assert.deepEqual(titles(res).slice(0, 2), ["Write the report", "Book flights"]);
  });

  it("by several fields: the first matters most", async () => {
    assert.deepEqual(titles(await api.get("/tasks?sort=status,-priority,title")), [
      "Book flights", // todo, high
      "Annual report review", // todo, medium
      "Café order", // todo, low
      "Write the report", // in_progress
      "Fix the printer", // done, medium
      "Buy milk", // done, low
    ]);
  });

  it("puts tasks with no due date LAST in both directions", async () => {
    const soonest = titles(await api.get("/tasks?sort=dueDate"));
    const latest = titles(await api.get("/tasks?sort=-dueDate"));
    assert.deepEqual(soonest, ["Buy milk", "Annual report review", "Write the report", "Book flights", "Café order", "Fix the printer"]);
    assert.deepEqual(latest, ["Book flights", "Write the report", "Annual report review", "Buy milk", "Café order", "Fix the printer"]);
  });
});

describe("GET /tasks: pages", () => {
  it("cuts the list into pages, with links that keep the filters and sort", async () => {
    const res = await api.get("/tasks?status=todo,done&sort=title&limit=2&page=2");
    // todo + done, by title: Annual, Book, | Buy milk, Café, | Fix
    assert.deepEqual(titles(res), ["Buy milk", "Café order"]);
    assert.deepEqual(res.body.meta, { total: 5, page: 2, limit: 2, totalPages: 3 });
    assert.deepEqual(res.body.links, {
      self: "/tasks?status=todo%2Cdone&sort=title&limit=2&page=2",
      first: "/tasks?status=todo%2Cdone&sort=title&limit=2&page=1",
      last: "/tasks?status=todo%2Cdone&sort=title&limit=2&page=3",
      next: "/tasks?status=todo%2Cdone&sort=title&limit=2&page=3",
      previous: "/tasks?status=todo%2Cdone&sort=title&limit=2&page=1",
    });
  });

  it("following `next` until it's null visits every task exactly once", async () => {
    const seen = [];
    let path = "/tasks?sort=-priority&limit=4";
    while (path) {
      const res = await api.get(path);
      seen.push(...titles(res));
      path = res.body.links.next;
    }
    assert.deepEqual(seen, titles(await api.get("/tasks?sort=-priority")));
  });

  it("a page past the end is empty, with a way back", async () => {
    const res = await api.get("/tasks?limit=5&page=9");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.links.next, null);
    assert.equal(res.body.links.previous, "/tasks?limit=5&page=2"); // the real last page
  });
});

describe("GET /tasks: a bad query (400)", () => {
  it("reports every problem at once, by parameter", async () => {
    const res = await api.get("/tasks?status=finished&limit=0&colour=red&sort=size");
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_QUERY");
    assert.equal(res.body.error.message, "The query has 4 problems.");
    assert.deepEqual(
      res.body.error.details.map((problem) => problem.field),
      ["status", "limit", "colour", "sort"]
    );
  });

  it("refuses numbers that aren't plain whole numbers", async () => {
    for (const page of ["0", "-1", "1.5", "1e3", "two", ""]) {
      const res = await api.get(`/tasks?page=${page}`);
      assert.equal(res.status, 400, `page=${page}`);
    }
    assert.equal((await api.get("/tasks?limit=101")).status, 400);
  });

  it("doesn't mistake built-in names for parameters", async () => {
    const res = await api.get("/tasks?toString=1&__proto__=x");
    assert.equal(res.status, 400);
    assert.deepEqual(
      res.body.error.details.map((problem) => problem.field),
      ["toString", "__proto__"]
    );
  });
});
