'use strict';

const API = '/api/todos';

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const emptyMsg = document.getElementById('empty');
const countEl = document.getElementById('count');
const errorEl = document.getElementById('error');
const filterButtons = document.querySelectorAll('.filters button');

let todos = [];
let filter = 'all';
let editingId = null;

// --- API helper -----------------------------------------------------------

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  setTimeout(() => { errorEl.hidden = true; }, 4000);
}

// --- Rendering ------------------------------------------------------------

function visibleTodos() {
  if (filter === 'active') return todos.filter((t) => !t.completed);
  if (filter === 'completed') return todos.filter((t) => t.completed);
  return todos;
}

function render() {
  list.textContent = '';

  for (const todo of visibleTodos()) {
    const li = document.createElement('li');
    li.className = 'todo' + (todo.completed ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.setAttribute('aria-label', `Mark "${todo.title}" as ${todo.completed ? 'active' : 'done'}`);
    checkbox.addEventListener('change', () => toggleTodo(todo));
    li.appendChild(checkbox);

    if (editingId === todo.id) {
      const editInput = document.createElement('input');
      editInput.className = 'edit-input';
      editInput.value = todo.title;
      editInput.maxLength = 200;
      const save = () => saveEdit(todo, editInput.value);
      editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') { editingId = null; render(); }
      });
      editInput.addEventListener('blur', save);
      li.appendChild(editInput);
      setTimeout(() => { editInput.focus(); editInput.select(); }, 0);
    } else {
      const span = document.createElement('span');
      span.className = 'title';
      span.textContent = todo.title;
      span.title = 'Double-click to edit';
      span.addEventListener('dblclick', () => { editingId = todo.id; render(); });
      li.appendChild(span);
    }

    const del = document.createElement('button');
    del.className = 'delete';
    del.innerHTML = '&times;';
    del.setAttribute('aria-label', `Delete "${todo.title}"`);
    del.addEventListener('click', () => removeTodo(todo.id));
    li.appendChild(del);

    list.appendChild(li);
  }

  emptyMsg.hidden = visibleTodos().length > 0;

  const remaining = todos.filter((t) => !t.completed).length;
  countEl.textContent = `${remaining} ${remaining === 1 ? 'task' : 'tasks'} left · ${todos.length} total`;
}

// --- CRUD actions (mirror the REST API) -----------------------------------

async function loadTodos() {
  try {
    const data = await api(API);
    todos = data.todos;
    render();
  } catch (err) {
    showError(err.message);
  }
}

async function addTodo(title) {
  try {
    const data = await api(API, { method: 'POST', body: JSON.stringify({ title }) });
    todos.push(data.todo);
    render();
  } catch (err) {
    showError(err.message);
  }
}

async function toggleTodo(todo) {
  try {
    const data = await api(`${API}/${todo.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: !todo.completed }),
    });
    Object.assign(todo, data.todo);
    render();
  } catch (err) {
    showError(err.message);
  }
}

async function saveEdit(todo, newTitle) {
  editingId = null;
  const title = newTitle.trim();
  if (title === todo.title) return render();
  if (title === '') return render(); // empty title is invalid — keep the old one
  try {
    const data = await api(`${API}/${todo.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    Object.assign(todo, data.todo);
    render();
  } catch (err) {
    showError(err.message);
    render();
  }
}

async function removeTodo(id) {
  try {
    await api(`${API}/${id}`, { method: 'DELETE' });
    todos = todos.filter((t) => t.id !== id);
    render();
  } catch (err) {
    showError(err.message);
  }
}

// --- Events ---------------------------------------------------------------

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  addTodo(title);
});

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    filterButtons.forEach((b) => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    render();
  });
});

document.getElementById('date').textContent = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

loadTodos();