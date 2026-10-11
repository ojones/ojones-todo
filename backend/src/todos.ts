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
}
