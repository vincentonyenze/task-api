import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTaskQuery } from "../validation/taskQuery.js";
import { DEFAULT_LIMIT, MAX_LIMIT, paginate } from "./pagination.js";

// 45 items: 1, 2, ... 45
const items = Array.from({ length: 45 }, (_, index) => index + 1);

describe("paginate", () => {
  it("gives the first page with the default size", () => {
    const { items: page, meta } = paginate(items);
    assert.equal(DEFAULT_LIMIT, 20);
    assert.deepEqual(page, items.slice(0, 20));
    assert.deepEqual(meta, { total: 45, page: 1, limit: 20, totalPages: 3 });
  });

  it("gives a middle page", () => {
    const { items: page, meta } = paginate(items, { page: 2, limit: 10 });
    assert.deepEqual(page, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    assert.equal(meta.totalPages, 5);
  });

  it("gives a shorter last page", () => {
    assert.deepEqual(paginate(items, { page: 5, limit: 10 }).items, [41, 42, 43, 44, 45]);
  });

  it("gives an empty page past the end, not an error", () => {
    const { items: page, meta } = paginate(items, { page: 9, limit: 10 });
    assert.deepEqual(page, []);
    assert.deepEqual(meta, { total: 45, page: 9, limit: 10, totalPages: 5 });
  });

  it("counts an empty list as one empty page", () => {
    assert.deepEqual(paginate([], { page: 1, limit: 10 }).meta, { total: 0, page: 1, limit: 10, totalPages: 1 });
  });

  it("handles an exact fit", () => {
    assert.equal(paginate(items.slice(0, 40), { limit: 10 }).meta.totalPages, 4);
  });

  it("doesn't change the list it was given", () => {
    paginate(items, { page: 2, limit: 5 });
    assert.equal(items.length, 45);
  });
});

describe("page and limit parameters", () => {
  const value = (query) => parseTaskQuery(query).value;
  const fields = (query) => parseTaskQuery(query).errors.map((error) => error.field);

  it("reads whole numbers as numbers", () => {
    assert.deepEqual(value({ page: "2", limit: "10" }), { page: 2, limit: 10 });
  });

  it(`allows a limit of 1 to ${MAX_LIMIT}, nothing more`, () => {
    assert.deepEqual(fields({ limit: "1" }), []);
    assert.deepEqual(fields({ limit: String(MAX_LIMIT) }), []);
    assert.deepEqual(fields({ limit: String(MAX_LIMIT + 1) }), ["limit"]);
    assert.deepEqual(fields({ limit: "0" }), ["limit"]);
  });

  it("rejects anything that isn't plain digits", () => {
    // Number() alone would let some of these through: Number("1e3") is
    // 1000, Number("") is 0, Number(" 2 ") is 2
    for (const page of ["0", "-1", "2.5", "1e3", "", " 2", "two", "0x10"]) {
      assert.deepEqual(fields({ page }), ["page"], `should reject page=${JSON.stringify(page)}`);
    }
  });

  it("rejects the parameter given twice", () => {
    assert.deepEqual(fields({ page: ["1", "2"] }), ["page"]);
  });
});
