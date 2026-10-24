/**
 * To-Do List REST API — Node.js core modules only (no frameworks).
 *
 * Data is stored in-memory in an array. Restarting the server resets the list.
 *
 *   GET    /api/todos        -> 200  list all todos (optional ?completed=true|false)
 *   GET    /api/todos/:id    -> 200  get one todo | 404
 *   POST   /api/todos        -> 201  create a todo   | 400 / 415
 *   PUT    /api/todos/:id    -> 200  full update     | 400 / 404
 *   PATCH  /api/todos/:id    -> 200  partial update  | 400 / 404
 *   DELETE /api/todos/:id    -> 204  delete a todo   | 404
 *
 * Any other method on a known /api route -> 405 with an Allow header.
 * Unknown /api routes                    -> 404.
 * Everything else is served statically from ./public (the UI).
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_SIZE = 100 * 1024; // 100 KB
const MAX_TITLE_LENGTH = 200;

// ---------------------------------------------------------------------------
// In-memory "database"
// ---------------------------------------------------------------------------

let nextId = 1;
const todos = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Small error class carrying an HTTP status code and a message. */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Send a JSON response. */
function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

/** Read and parse the request body as JSON. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > MAX_BODY_SIZE) {
        tooLarge = true;
        reject(new ApiError(413, 'Request body is too large.'));
      }
    });

    req.on('end', () => {
      if (tooLarge) return;
      if (raw.trim() === '') {
        reject(new ApiError(400, 'Request body is empty. Expected a JSON object.'));
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new ApiError(400, 'Request body must be a JSON object.'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new ApiError(400, 'Request body is not valid JSON.'));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

/**
 * Validate user input shared by POST (create) and PUT/PATCH (update).
 * Returns a clean { title?, completed? } object or throws an ApiError.
 */
function validateFields(body, { requireTitle }) {
  const clean = {};

  if ('title' in body || requireTitle) {
    const { title } = body;
    if (typeof title !== 'string') {
      throw new ApiError(400, 'Field "title" must be a string.');
    }
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new ApiError(400, 'Field "title" must not be empty.');
    }
    if (trimmed.length > MAX_TITLE_LENGTH) {
      throw new ApiError(400, `Field "title" must be at most ${MAX_TITLE_LENGTH} characters.`);
    }
    clean.title = trimmed;
  }

  if ('completed' in body) {
    if (typeof body.completed !== 'boolean') {
      throw new ApiError(400, 'Field "completed" must be a boolean.');
    }
    clean.completed = body.completed;
  }

  return clean;
}

function findTodo(id) {
  return todos.find((t) => t.id === id);
}

function parseId(param) {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, `No todo with id "${param}".`);
  }
  return id;
}

// ---------------------------------------------------------------------------
// API handlers (one per REST action)
// ---------------------------------------------------------------------------

/** GET /api/todos — list all todos, optionally filtered by ?completed=true|false */
function listTodos(url, res) {
  let result = todos;

  const completed = url.searchParams.get('completed');
  if (completed !== null) {
    if (completed !== 'true' && completed !== 'false') {
      throw new ApiError(400, 'Query "completed" must be "true" or "false".');
    }
    result = todos.filter((t) => t.completed === (completed === 'true'));
  }

  sendJson(res, 200, { count: result.length, todos: result });
}

/** GET /api/todos/:id — get a single todo */
function getTodo(param, res) {
  const todo = findTodo(parseId(param));
  if (!todo) throw new ApiError(404, `No todo with id "${param}".`);
  sendJson(res, 200, { todo });
}

/** POST /api/todos — create a todo */
async function createTodo(req, res) {
  const body = await readJsonBody(req);
  const { title, completed = false } = validateFields(body, { requireTitle: true });

  const todo = { id: nextId++, title, completed };
  todos.push(todo);

  sendJson(res, 201, { todo }, { Location: `/api/todos/${todo.id}` });
}

/** PUT /api/todos/:id — replace a todo (title required) */
async function replaceTodo(req, res, param) {
  const todo = findTodo(parseId(param));
  if (!todo) throw new ApiError(404, `No todo with id "${param}".`);

  const body = await readJsonBody(req);
  const { title, completed = false } = validateFields(body, { requireTitle: true });

  todo.title = title;
  todo.completed = completed;
  sendJson(res, 200, { todo });
}

/** PATCH /api/todos/:id — partially update a todo */
async function updateTodo(req, res, param) {
  const todo = findTodo(parseId(param));
  if (!todo) throw new ApiError(404, `No todo with id "${param}".`);

  const body = await readJsonBody(req);
  const clean = validateFields(body, { requireTitle: false });

  if (Object.keys(clean).length === 0) {
    throw new ApiError(400, 'Provide at least one of: "title", "completed".');
  }
  Object.assign(todo, clean);
  sendJson(res, 200, { todo });
}

/** DELETE /api/todos/:id — delete a todo */
function deleteTodo(res, param) {
  const id = parseId(param);
  const index = todos.findIndex((t) => t.id === id);
  if (index === -1) throw new ApiError(404, `No todo with id "${param}".`);

  todos.splice(index, 1);
  res.writeHead(204);
  res.end();
}

// ---------------------------------------------------------------------------
// Static file serving (the minimalist UI)
// ---------------------------------------------------------------------------

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const filePath = path.join(PUBLIC_DIR, relative);

  // Path-traversal guard: the resolved path must stay inside PUBLIC_DIR.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { method } = req;

  try {
    // --- API ---
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const segments = url.pathname.split('/').filter(Boolean); // e.g. ['api', 'todos', '3']

      if (segments[1] === 'todos') {
        const idParam = segments[2]; // undefined for the collection

        if (idParam === undefined) {
          if (method === 'GET') return listTodos(url, res);
          if (method === 'POST') return await createTodo(req, res);
          res.setHeader('Allow', 'GET, POST');
          return sendJson(res, 405, { error: `Method ${method} is not allowed on /api/todos.` });
        }

        if (segments.length === 3) {
          if (method === 'GET') return getTodo(idParam, res);
          if (method === 'PUT') return await replaceTodo(req, res, idParam);
          if (method === 'PATCH') return await updateTodo(req, res, idParam);
          if (method === 'DELETE') return deleteTodo(res, idParam);
          res.setHeader('Allow', 'GET, PUT, PATCH, DELETE');
          return sendJson(res, 405, { error: `Method ${method} is not allowed on /api/todos/:id.` });
        }
      }

      return sendJson(res, 404, { error: `Cannot ${method} ${url.pathname}.` });
    }

    // --- UI (static) ---
    if (method === 'GET' || method === 'HEAD') return serveStatic(res, url.pathname);
    return sendJson(res, 405, { error: `Method ${method} is not allowed.` });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : 'Internal server error.';
    if (!(err instanceof ApiError)) console.error(err);
    sendJson(res, status, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`To-Do API running at http://localhost:${PORT}`);
  console.log(`Try it:  curl http://localhost:${PORT}/api/todos`);
});
