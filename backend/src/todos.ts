/**
 * In-memory todo store. Todos live only for the lifetime of the process —
 * there is no database or persistence layer.
 */
export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

/**
 * A per-instance store. `createApp()` builds one of these so tests (and
 * anything else creating multiple apps) never share mutable state.
 */
export class TodoStore {
  private readonly todos: Todo[] = [];
  private readonly deletedIds = new Set<number>();
  private nextId = 1;

  /** Live todos only — soft-deleted ones are kept but never listed. */
  list(): Todo[] {
    return this.todos.filter((t) => !this.deletedIds.has(t.id));
  }

  /**
   * Number of live todos, counting both done and not-done. Derived from
   * list(), so soft-deleted todos are excluded, consistent with the API.
   */
  count(): number {
    return this.list().length;
  }

  /**
   * Soft-deletes a todo: it stops appearing in list() and the API, but the
   * record stays in the store for audit/history. Returns `false` when no live
   * todo has that id (unknown, or already deleted).
   */
  delete(id: number): boolean {
    const todo = this.todos.find((t) => t.id === id);
    if (!todo || this.deletedIds.has(id)) {
      return false;
    }
    this.deletedIds.add(id);
    return true;
  }

  /**
   * Every soft-deleted todo still on record, for audit/history. There is no
   * API route for this and no way to recover a deleted todo.
   */
  listDeleted(): Todo[] {
    return this.todos.filter((t) => this.deletedIds.has(t.id));
  }

  add(title: string): Todo {
    const todo: Todo = { id: this.nextId++, title, done: false };
    this.todos.push(todo);
    return todo;
  }

  /**
   * Sets a todo's done status and returns the updated todo, or `null` when no
   * todo has that id. The lookup is an exact id match, so a non-integer or
   * unknown id finds nothing rather than updating the wrong todo.
   */
  update(id: number, changes: { done: boolean }): Todo | null {
    const todo = this.todos.find((t) => t.id === id);
    if (!todo) {
      return null;
    }
    todo.done = changes.done;
    return todo;
  }
}
