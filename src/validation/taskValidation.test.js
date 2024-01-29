import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESCRIPTION_MAX, TITLE_MAX, validateTask } from "./taskValidation.js";

// The fields that have problems, e.g. ["title", "priority"]
const badFields = (input, options) => validateTask(input, options).errors.map((error) => error.field);

describe("a whole task (POST and PUT)", () => {
  it("accepts a valid task and cleans it up", () => {
    assert.deepEqual(
      validateTask({ title: "  Buy milk  ", description: " Oat ", status: "done", priority: "low", dueDate: "2026-11-15" }),
      {
        value: { title: "Buy milk", description: "Oat", status: "done", priority: "low", dueDate: "2026-11-15" },
        errors: [],
      }
    );
  });

  it("needs only a title", () => {
    assert.deepEqual(validateTask({ title: "Buy milk" }), { value: { title: "Buy milk" }, errors: [] });
  });

  it("requires a title", () => {
    assert.deepEqual(validateTask({ priority: "high" }).errors, [{ field: "title", message: "Title is required" }]);
  });

  it("reports EVERY problem at once", () => {
    assert.deepEqual(badFields({ title: "", status: "finished", priority: "urgent", dueDate: "tomorrow" }), [
      "title",
      "status",
      "priority",
      "dueDate",
    ]);
  });

  it("rejects things that aren't a JSON object", () => {
    for (const input of [null, "Buy milk", 42, ["Buy milk"]]) {
      assert.deepEqual(badFields(input), [null]);
    }
  });
});

describe("title", () => {
  it("must be text", () => {
    assert.equal(validateTask({ title: 42 }).errors[0].message, "Title must be text");
  });

  it("can't be empty or only spaces", () => {
    assert.deepEqual(badFields({ title: "" }), ["title"]);
    assert.deepEqual(badFields({ title: "    " }), ["title"]);
  });

  it(`allows exactly ${TITLE_MAX} characters, not one more`, () => {
    assert.deepEqual(badFields({ title: "x".repeat(TITLE_MAX) }), []);
    assert.deepEqual(badFields({ title: "x".repeat(TITLE_MAX + 1) }), ["title"]);
  });

  it("doesn't count the spaces around it", () => {
    assert.deepEqual(badFields({ title: `  ${"x".repeat(TITLE_MAX)}  ` }), []);
  });
});

describe("description", () => {
  it(`allows up to ${DESCRIPTION_MAX} characters, and must be text`, () => {
    assert.deepEqual(badFields({ title: "x", description: "y".repeat(DESCRIPTION_MAX) }), []);
    assert.deepEqual(badFields({ title: "x", description: "y".repeat(DESCRIPTION_MAX + 1) }), ["description"]);
    assert.deepEqual(badFields({ title: "x", description: null }), ["description"]);
  });

  it("may be empty", () => {
    assert.deepEqual(badFields({ title: "x", description: "" }), []);
  });
});

describe("status and priority", () => {
  it("accept only the known values, exactly", () => {
    for (const status of ["todo", "in_progress", "done"]) assert.deepEqual(badFields({ title: "x", status }), []);
    for (const status of ["Done", "finished", "", null, 1]) assert.deepEqual(badFields({ title: "x", status }), ["status"]);
    for (const priority of ["low", "medium", "high"]) assert.deepEqual(badFields({ title: "x", priority }), []);
    assert.deepEqual(badFields({ title: "x", priority: "urgent" }), ["priority"]);
  });

  it("say what IS allowed", () => {
    assert.equal(
      validateTask({ title: "x", status: "finished" }).errors[0].message,
      "Status must be one of: todo, in_progress, done"
    );
  });
});

describe("dueDate", () => {
  it("accepts real dates and null", () => {
    for (const dueDate of ["2026-11-15", "2028-02-29", null]) assert.deepEqual(badFields({ title: "x", dueDate }), []);
  });

  it("rejects days that don't exist and other formats", () => {
    for (const dueDate of ["2026-02-30", "2027-02-29", "2026-13-01", "15/11/2026", "2026-11-15T10:00:00Z", "tomorrow", 20261115]) {
      assert.deepEqual(badFields({ title: "x", dueDate }), ["dueDate"], `should reject ${dueDate}`);
    }
  });
});

describe("fields that aren't allowed", () => {
  it("rejects unknown fields, which are usually typos", () => {
    assert.deepEqual(validateTask({ titel: "Buy milk" }).errors, [
      { field: "titel", message: '"titel" isn\'t a task field' },
      { field: "title", message: "Title is required" },
    ]);
  });

  it("quietly ignores the server's own fields", () => {
    assert.deepEqual(validateTask({ id: "abc", title: "Buy milk", createdAt: "x", updatedAt: "y" }), {
      value: { title: "Buy milk" },
      errors: [],
    });
  });
});

describe("a partial change (PATCH)", () => {
  it("doesn't require a title", () => {
    assert.deepEqual(validateTask({ status: "done" }, { partial: true }), { value: { status: "done" }, errors: [] });
  });

  it("still checks whatever is sent", () => {
    assert.deepEqual(badFields({ title: "" }, { partial: true }), ["title"]);
  });

  it("needs at least one field to change", () => {
    assert.deepEqual(validateTask({}, { partial: true }).errors, [{ field: null, message: "Send at least one field to change" }]);
    assert.deepEqual(badFields({ id: "abc" }, { partial: true }), [null]);
  });
});
