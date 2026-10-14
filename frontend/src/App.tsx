import { useEffect, useState } from "react";

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

/**
 * Root component. It asks the backend which UI flags this request may see
 * (GET /api/ui-flags) and renders either the todo page or the unchanged
 * Starter Template placeholder. The flag is evaluated server-side, so the
 * Preview Token override decides which page a visitor gets.
 */
export function App() {
  const [todoUi, setTodoUi] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/ui-flags")
      .then((res) => res.json())
      .then((data: { "todo-ui"?: boolean }) => setTodoUi(data["todo-ui"] === true))
      .catch(() => setTodoUi(false));
  }, []);

  if (todoUi === null) {
    return (
      <main>
        <p>Loading...</p>
      </main>
    );
  }

  return <main>{todoUi ? <TodosPage /> : <PlaceholderPage />}</main>;
}

/**
 * The original placeholder page, shown whenever the `todo-ui` flag is off.
 * This preserves the behaviour the app had before the flag existed: the
 * "Starter Template" heading and the backend health line.
 */
function PlaceholderPage() {
  const [status, setStatus] = useState<string>("loading...");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data: { status: string }) => setStatus(data.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <>
      <h1>Starter Template</h1>
      <p>Backend health status: {status}</p>
    </>
  );
}

/** The todo page, shown when the `todo-ui` flag is on. */
function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/todos")
      .then((res) => res.json())
      .then((data: Todo[]) => setTodos(data))
      .catch(() => setTodos([]));
  }, []);

  async function addTodo() {
    if (newTitle.trim() === "") {
      setError("Enter some text");
      return;
    }
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    if (!res.ok) {
      setError("Enter some text");
      return;
    }
    const created = (await res.json()) as Todo;
    setTodos((current) => [...current, created]);
    setNewTitle("");
    setError("");
  }

  async function toggleTodo(todo: Todo) {
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !todo.done }),
    });
    if (!res.ok) return;
    const updated = (await res.json()) as Todo;
    setTodos((current) => current.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function deleteTodo(id: number) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setTodos((current) => current.filter((t) => t.id !== id));
  }

  return (
    <>
      <h1>Todos</h1>
      <div>
        <label htmlFor="new-todo">New todo</label>
        <input id="new-todo" type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button onClick={addTodo}>Add</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {todos.length === 0 ? (
        <p>No todos yet</p>
      ) : (
        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>
              <label>
                <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo)} />
                {todo.title}
              </label>
              <button onClick={() => deleteTodo(todo.id)}>Delete {todo.title}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
