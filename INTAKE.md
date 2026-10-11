# Intake

Source: https://github.com/ojones/ai-factory/issues/45
Cost cap: $1.00 (override)

## Spec

A tiny in-memory todo API.

- GET /api/todos returns the list of todos as JSON. Each todo has an integer id, a string title and a boolean done (false when created).
- POST /api/todos with a JSON body {"title": "..."} creates a todo and returns it with status 201. A missing, non-string or empty title returns 400.
- Todos live in memory only.
