import { describe, expect, it } from "vitest";
import { TodoStore } from "../todos";

describe("TodoStore.update", () => {
  it("returns the updated todo for a valid id", () => {
    const store = new TodoStore();
    store.add("write tests");

    const updated = store.update(1, { done: true });

    expect(updated).toEqual({ id: 1, title: "write tests", done: true });
  });

  it("stores the new done status, visible through list()", () => {
    const store = new TodoStore();
    store.add("write tests");

    store.update(1, { done: true });

    expect(store.list()).toEqual([{ id: 1, title: "write tests", done: true }]);
  });

  it("can set done back to false", () => {
    const store = new TodoStore();
    store.add("write tests");
    store.update(1, { done: true });

    const updated = store.update(1, { done: false });

    expect(updated).toEqual({ id: 1, title: "write tests", done: false });
  });

  it("leaves other todos untouched", () => {
    const store = new TodoStore();
    store.add("first");
    store.add("second");

    store.update(2, { done: true });

    expect(store.list()).toEqual([
      { id: 1, title: "first", done: false },
      { id: 2, title: "second", done: true },
    ]);
  });

  it("returns null for an unknown id and does not change the store", () => {
    const store = new TodoStore();
    store.add("write tests");

    const updated = store.update(999, { done: true });

    expect(updated).toBeNull();
    expect(store.list()).toEqual([{ id: 1, title: "write tests", done: false }]);
  });

  it("returns null on an empty store", () => {
    const store = new TodoStore();

    expect(store.update(1, { done: true })).toBeNull();
    expect(store.list()).toEqual([]);
  });
});

describe("TodoStore.delete", () => {
  it("returns true for a live todo and removes it from list()", () => {
    const store = new TodoStore();
    store.add("write tests");

    expect(store.delete(1)).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it("leaves other todos untouched", () => {
    const store = new TodoStore();
    store.add("first");
    store.add("second");

    store.delete(1);

    expect(store.list()).toEqual([{ id: 2, title: "second", done: false }]);
  });

  it("returns false for an unknown id and does not change the store", () => {
    const store = new TodoStore();
    store.add("write tests");

    expect(store.delete(999)).toBe(false);
    expect(store.list()).toEqual([{ id: 1, title: "write tests", done: false }]);
  });

  it("returns false on an empty store", () => {
    const store = new TodoStore();

    expect(store.delete(1)).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it("returns false when deleting an already-deleted todo", () => {
    const store = new TodoStore();
    store.add("write tests");
    store.delete(1);

    expect(store.delete(1)).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it("keeps deleted todos on record for audit/history", () => {
    const store = new TodoStore();
    store.add("keep me");
    store.add("delete me");

    store.delete(2);

    expect(store.listDeleted()).toEqual([
      { id: 2, title: "delete me", done: false },
    ]);
    // The record survives: it is only hidden from list(), never removed.
    expect(store.listDeleted().some((t) => t.id === 2)).toBe(true);
  });

  it("does not let a deleted id be reused or recovered", () => {
    const store = new TodoStore();
    store.add("write tests");
    store.delete(1);

    // A new todo gets the next id; the deleted one is gone from the API.
    const created = store.add("new todo");
    expect(created.id).toBe(2);
    expect(store.list()).toEqual([{ id: 2, title: "new todo", done: false }]);
    expect(store.listDeleted()).toEqual([
      { id: 1, title: "write tests", done: false },
    ]);
  });
});

describe("TodoStore.count", () => {
  it("returns 0 on an empty store", () => {
    const store = new TodoStore();

    expect(store.count()).toBe(0);
  });

  it("counts every live todo regardless of done status", () => {
    const store = new TodoStore();
    store.add("first");
    store.add("second");
    store.update(2, { done: true });

    expect(store.count()).toBe(2);
  });

  it("excludes soft-deleted todos", () => {
    const store = new TodoStore();
    store.add("first");
    store.add("second");
    store.delete(1);

    expect(store.count()).toBe(1);
  });

  it("returns to 0 once every todo is deleted", () => {
    const store = new TodoStore();
    store.add("only");
    store.delete(1);

    expect(store.count()).toBe(0);
  });
});
