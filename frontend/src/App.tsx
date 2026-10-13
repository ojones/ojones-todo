import { useEffect, useState } from "react";
import { TodoPage } from "./TodoPage";

/**
 * The page is gated by the `todo-ui` feature flag. The flag is evaluated on
 * the server (GET /api/ui-flags) for each request, so a visitor carrying the
 * Preview Token sees the to-do UI while everyone else keeps the Starter
 * Template. Until the flag is resolved we render nothing, so the wrong page
 * never flashes.
 */
export function App() {
  const [status, setStatus] = useState<string>("loading...");
  const [todoUi, setTodoUi] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data: { status: string }) => setStatus(data.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  useEffect(() => {
    fetch("/api/ui-flags")
      .then((res) => res.json())
      .then((data: { "todo-ui"?: boolean }) => setTodoUi(data["todo-ui"] === true))
      .catch(() => setTodoUi(false));
  }, []);

  if (todoUi === null) {
    return <main />;
  }

  if (!todoUi) {
    return (
      <main>
        <h1>Starter Template</h1>
        <p>Backend health status: {status}</p>
      </main>
    );
  }

  return <TodoPage />;
}
