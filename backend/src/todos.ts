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
  private nextId = 1;

  list(): Todo[] {
    return this.todos;
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
