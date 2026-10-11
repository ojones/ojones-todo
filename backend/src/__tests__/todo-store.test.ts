import { readFileSync } from "node:fs";
import path from "node:path";
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

describe("update-todo-store flag", () => {
  it("is recorded in flags.json with a description", () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../flags.json"), "utf8")
    ) as Array<{ slug: string; description: string }>;

    const entry = list.find((f) => f.slug === "update-todo-store");

    expect(entry).toBeTruthy();
    expect(String(entry?.description).length).toBeGreaterThan(0);
  });
});
