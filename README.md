# To-Do List — REST API + Minimalist UI

A full-stack To-Do List app built with **only Node.js core modules** (`http`, `fs`, `path`, `url`) — no frameworks, no dependencies. Data is stored **in-memory** in a simple array.

## Run

```bash
node server.js
```

- UI:  [http://localhost:3000](http://localhost:3000)
- API: `http://localhost:3000/api/todos`

Set a custom port with `PORT=8080 node server.js`. Restarting the server resets the list.

## Task shape

```json
{ "id": 1, "title": "Learn HTTP", "completed": false }
```

- `id` — unique integer, assigned by the server
- `title` — required non-empty string (max 200 chars)
- `completed` — optional boolean, defaults to `false`

## API reference

| Method | Path             | Description                        | Success   |
| ------ | ---------------- | ---------------------------------- | --------- |
| GET    | `/api/todos`     | List all (optional `?completed=`)  | `200`     |
| GET    | `/api/todos/:id` | Get one task                       | `200`     |
| POST   | `/api/todos`     | Create (`{ title, completed? }`)   | `201` + `Location` |
| PUT    | `/api/todos/:id` | Replace (`title` required)         | `200`     |
| PATCH  | `/api/todos/:id` | Partial update (`title`/`completed`) | `200`   |
| DELETE | `/api/todos/:id` | Delete                             | `204`     |

Error responses return JSON: `{ "error": "message" }`.

| Status | Meaning                                              |
| ------ | ---------------------------------------------------- |
| `400`  | Invalid JSON, or validation failed                    |
| `404`  | Unknown route or unknown id                           |
| `405`  | Wrong method (includes an `Allow` header)             |
| `413`  | Body larger than 100 KB                               |
| `500`  | Unexpected server error                               |

## Try it with curl

```bash
# Create
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Learn REST"}'

# List
curl http://localhost:3000/api/todos

# Mark done
curl -X PATCH http://localhost:3000/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'

# Delete
curl -X DELETE http://localhost:3000/api/todos/1
```

## Project structure

```
node-restful-todo/
├── server.js          # HTTP server, router, REST API, static file serving
├── public/
│   ├── index.html     # Minimalist UI
│   ├── styles.css
│   └── app.js         # Frontend logic (fetch → CRUD)
└── README.md
```