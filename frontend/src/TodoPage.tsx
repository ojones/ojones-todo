import { useEffect, useState } from "react";

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

/**
 * The to-do UI, shown only while the `todo-ui` flag is on. It drives the
 * existing /api/todos routes: add (POST), mark done/undone (PUT), delete
 * (DELETE), and list (GET). Blank text is rejected locally with the
 * "Enter some text" message and never reaches the API.
 */
export function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [message, setMessage] = useState("");

  async function loadTodos() {
    const res = await fetch("/api/todos");
    if (res.ok) {
      setTodos((await res.json()) as Todo[]);
    }
  }

  useEffect(() => {
    void loadTodos();
  }, []);

  async function addTodo() {
    if (newTitle.trim() === "") {
      setMessage("Enter some text");
      return;
    }
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) {
      setNewTitle("");
      setMessage("");
      await loadTodos();
    }
  }

  async function toggleDone(todo: Todo) {
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !todo.done }),
    });
    if (res.ok) {
      await loadTodos();
    }
  }

  async function deleteTodo(id: number) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadTodos();
    }
  }

  return (
    <main>
      <h1>Todos</h1>
      <label htmlFor="new-todo">New todo</label>
      <input id="new-todo" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
      <button onClick={() => void addTodo()}>Add</button>
      {message && <p>{message}</p>}
      {todos.length === 0 ? (
        <p>No todos yet</p>
      ) : (
        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>
              <input
                type="checkbox"
                id={`todo-${todo.id}`}
                checked={todo.done}
                aria-label={todo.title}
                onChange={() => void toggleDone(todo)}
              />
              <label htmlFor={`todo-${todo.id}`}>{todo.title}</label>
              <button onClick={() => void deleteTodo(todo.id)}>Delete {todo.title}</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
