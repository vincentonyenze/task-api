# Task API reference

A JSON API for creating, finding, changing and deleting tasks.

- **Base URL (local):** `http://localhost:3000`
- **Format:** JSON in, JSON out (UTF-8)
- **Authentication:** none

## Contents

- [Conventions](#conventions): the response shape, ids, dates, headers
- [The task object](#the-task-object)
- [Endpoints](#endpoints)
  - [`GET /tasks`](#get-tasks): list, filter, search, sort, page
  - [`POST /tasks`](#post-tasks): create
  - [`GET /tasks/:id`](#get-tasksid): read one
  - [`PATCH /tasks/:id`](#patch-tasksid): change some fields
  - [`PUT /tasks/:id`](#put-tasksid): replace a whole task
  - [`DELETE /tasks/:id`](#delete-tasksid): delete
  - [`GET /health`](#get-health) and [`GET /`](#get-)
- [Errors](#errors): every status and error code
- [Limits](#limits): body size and rate limiting
- [Browsers (CORS)](#browsers-cors)

---

## Conventions

### Every answer has the same shape

| Answer | Status | Body |
|---|---|---|
| Success | `200` | `{ "data": ... }` |
| A list | `200` | `{ "data": [...], "meta": {...}, "links": {...} }` |
| Created | `201` | `{ "data": the new task }`, plus a `Location` header |
| Deleted | `204` | no body at all |
| Any error | `4xx` / `5xx` | `{ "error": { "code", "message", "details"?, "requestId" } }` |

So a client can always check for `error` first, then read `data`.

### Requests

- **Bodies** (POST, PATCH, PUT) are JSON, sent with `Content-Type: application/json`. Anything else gets `415`.
- **Responses** are always `application/json; charset=utf-8`. A request whose `Accept` header rules out JSON gets `406`. No `Accept` header, `*/*`, or a browser's usual header are all fine.
- **HEAD** works wherever GET does: the same status and headers, no body.
- **OPTIONS** on any address answers `204` with an `Allow` header listing its methods.

### Ids, dates and times

- **Ids** are chosen by the server (UUIDs, e.g. `"3f0c2a9e-..."`). Treat them as opaque text.
- **`dueDate`** is a calendar day, `YYYY-MM-DD` (e.g. `"2026-11-30"`), or `null`.
- **`createdAt` / `updatedAt`** are moments in UTC, ISO 8601 (e.g. `"2026-10-21T09:00:00.000Z"`).

### Headers on every answer

| Header | Meaning |
|---|---|
| `X-Request-Id` | This request's id. Send your own (`X-Request-Id: my-app-42`: letters, digits, `.`, `_`, `-`, up to 100 characters) to follow a request through your logs and ours; otherwise one is made up. It's also in every error body as `requestId`: quote it when reporting a problem. |
| `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | Where you stand with the [rate limit](#rate-limiting). |

---

## The task object

```json
{
  "id": "task-1",
  "title": "Write the report",
  "description": "Q3 numbers",
  "status": "todo",
  "priority": "high",
  "dueDate": "2026-11-10",
  "createdAt": "2026-10-21T09:00:00.000Z",
  "updatedAt": "2026-10-21T09:00:00.000Z"
}
```

| Field | Type | Rules | Default |
|---|---|---|---|
| `id` | text | Set by the server; can't be chosen or changed | |
| `title` | text | **Required.** 1–200 characters, after trimming spaces | |
| `description` | text | Up to 2,000 characters, trimmed | `""` |
| `status` | text | `todo`, `in_progress` or `done` | `"todo"` |
| `priority` | text | `low`, `medium` or `high` | `"medium"` |
| `dueDate` | text or `null` | A real day, `YYYY-MM-DD` (`2026-02-30` is refused) | `null` |
| `createdAt` | text | Set by the server when created; never changes | |
| `updatedAt` | text | Set by the server on every change | |

When you send a task:

- **Server fields** (`id`, `createdAt`, `updatedAt`) are ignored, not refused. You can send back a task exactly as you got it.
- **Unknown fields** are refused (`400`). They're usually typos (`"titel"`), and ignoring them would lose data silently.
- **Text** is trimmed: `"  Buy milk "` is saved as `"Buy milk"`.

Lengths are counted in UTF-16 units, JavaScript's `.length`. Most characters count as 1, but an emoji such as 😀 counts as 2.

---

## Endpoints

### `GET /tasks`

Lists tasks: optionally filtered, searched and sorted, always one page at a time.

**Query parameters** (all optional, all combinable):

| Parameter | Example | Meaning |
|---|---|---|
| `status` | `status=todo,in_progress` | Only these statuses. Comma-separated, or repeated (`status=todo&status=done`). |
| `priority` | `priority=high` | Only these priorities. Same format as `status`. |
| `dueBefore` | `dueBefore=2026-11-30` | Due on or before this day. Tasks with no due date are left out. |
| `q` | `q=report q3` | Search title and description. Every word must appear, in any order. Case and accents are ignored (`cafe` finds `Café`). Up to 100 characters. Empty means no search. |
| `sort` | `sort=-priority,dueDate` | The order (see below). Default: `createdAt` (oldest first). |
| `page` | `page=2` | Which page, from 1. Default `1`. |
| `limit` | `limit=50` | Tasks per page, 1–100. Default `20`. |

**Sorting.** `sort` takes one field or several, separated by commas. Put `-` in front of a field for descending order. The first field matters most, and later fields only break ties.

- Fields: `title`, `priority`, `status`, `dueDate`, `createdAt`, `updatedAt`.
- `priority` sorts by rank (`low` < `medium` < `high`), not alphabetically. So does `status` (`todo` < `in_progress` < `done`). Titles sort A–Z, ignoring case.
- Tasks with no `dueDate` always come **last**, in both directions.
- Tasks that tie on every sort field keep their created order.

How the parameters combine: filters and search pick the tasks, then `sort` orders them, then `page` and `limit` cut out one page.

A mistake in the query (an unknown parameter, `status=finished`, `page=0`, `sort=size`) gets `400 INVALID_QUERY` listing **every** problem. It's never ignored: a filter that silently did nothing would look as if it had worked.

**Example**

```bash
curl "http://localhost:3000/tasks?priority=high&sort=-dueDate&limit=1"
```

`200 OK`:

```json
{
  "data": [
    {
      "id": "task-1",
      "title": "Write the report",
      "description": "Q3 numbers",
      "status": "todo",
      "priority": "high",
      "dueDate": "2026-11-10",
      "createdAt": "2026-10-21T09:00:00.000Z",
      "updatedAt": "2026-10-21T09:00:00.000Z"
    }
  ],
  "meta": { "total": 2, "page": 1, "limit": 1, "totalPages": 2 },
  "links": {
    "self": "/tasks?priority=high&sort=-dueDate&limit=1&page=1",
    "first": "/tasks?priority=high&sort=-dueDate&limit=1&page=1",
    "last": "/tasks?priority=high&sort=-dueDate&limit=1&page=2",
    "next": "/tasks?priority=high&sort=-dueDate&limit=1&page=2",
    "previous": null
  }
}
```

- **`meta.total`** counts the tasks that match the filters and search, across all pages.
- **`totalPages`** is at least 1.
- **`links`** keep your filters and sort. `next` and `previous` are `null` when there's no such page, so a client can follow `next` until it's `null` to get everything.
- **A page past the end** is a `200` with an empty `data`. Its `previous` points to the real last page.

**Errors:** `400 INVALID_QUERY`.

---

### `POST /tasks`

Creates a task. Send at least a `title`; every other field takes its [default](#the-task-object).

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Write the report", "description": "Q3 numbers", "priority": "high", "dueDate": "2026-11-10"}'
```

`201 Created`, with `Location: /tasks/task-1`:

```json
{
  "data": {
    "id": "task-1",
    "title": "Write the report",
    "description": "Q3 numbers",
    "status": "todo",
    "priority": "high",
    "dueDate": "2026-11-10",
    "createdAt": "2026-10-21T09:00:00.000Z",
    "updatedAt": "2026-10-21T09:00:00.000Z"
  }
}
```

**Errors:**

- `400`: `VALIDATION_FAILED`, `INVALID_JSON` or `INVALID_BODY`
- `413 BODY_TOO_LARGE`
- `415 UNSUPPORTED_MEDIA_TYPE`

---

### `GET /tasks/:id`

Returns one task: `200` with `{ "data": task }`.

**Errors:** `404 NOT_FOUND` if there's no task with that id.

---

### `PATCH /tasks/:id`

Changes **only the fields you send**; the rest stay as they are. Send at least one field. To clear the due date, send `"dueDate": null`.

```bash
curl -X PATCH http://localhost:3000/tasks/task-1 \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```

`200 OK`, with the whole updated task. Only `status` and `updatedAt` changed:

```json
{
  "data": {
    "id": "task-1",
    "title": "Write the report",
    "description": "Q3 numbers",
    "status": "done",
    "priority": "high",
    "dueDate": "2026-11-10",
    "createdAt": "2026-10-21T09:00:00.000Z",
    "updatedAt": "2026-10-21T09:00:03.000Z"
  }
}
```

**Errors:**

- `400`: `VALIDATION_FAILED` (including an empty `{}`), `INVALID_JSON` or `INVALID_BODY`
- `404 NOT_FOUND`
- `413 BODY_TOO_LARGE`
- `415 UNSUPPORTED_MEDIA_TYPE`

The checks run in order, and the first problem found is the answer: a missing body, then a missing task, then invalid fields. A missing task is `404` even if the body is also wrong.

---

### `PUT /tasks/:id`

**Replaces** the whole task. `title` is required, as with POST. Every field you leave out goes back to its default; `id` and `createdAt` are kept. Use it to send back a whole task you edited. Use PATCH to change a field or two.

```bash
curl -X PUT http://localhost:3000/tasks/task-1 \
  -H "Content-Type: application/json" \
  -d '{"title": "Write the final report", "priority": "high"}'
```

`200 OK`, with the replaced task. Here `description`, `status` and `dueDate` are back to `""`, `"todo"` and `null`.

PUT only replaces tasks that exist. It never creates one, because ids are chosen by the server.

**Errors:** the same as [PATCH](#patch-tasksid).

---

### `DELETE /tasks/:id`

Deletes the task: `204 No Content`, with no body.

**Errors:** `404 NOT_FOUND`, including when the task was already deleted.

---

### `GET /health`

Whether the server is up, for monitoring. It's never cached, and it's never [rate limited](#rate-limiting).

```json
{
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "environment": "production",
    "startedAt": "2026-10-22T00:48:35.818Z",
    "uptimeSeconds": 3600
  }
}
```

### `GET /`

A short welcome: `{ "data": { "name": "Task API", "message": "..." } }`.

---

## Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The task has 2 problems.",
    "details": [
      { "field": "title", "message": "Title can't be empty" },
      { "field": "priority", "message": "Priority must be one of: low, medium, high" }
    ],
    "requestId": "req-123"
  }
}
```

- **`code`** is fixed: write your program's logic against it.
- **`message`** is for people. It may be reworded at any time, so don't match on it.
- **`details`** appears only on validation and query errors. It lists **every** problem, each with the `field` it's about, or `null` when it's about the whole body.
- **`requestId`** matches the `X-Request-Id` header.

| Status | `code` | When | What to do |
|---|---|---|---|
| `400` | `VALIDATION_FAILED` | A task field is missing, wrong or unknown | Fix the fields listed in `details` |
| `400` | `INVALID_JSON` | The body isn't valid JSON | Check the JSON's quotes, commas and brackets |
| `400` | `INVALID_BODY` | POST, PATCH or PUT with no body at all | Send the task as JSON |
| `400` | `INVALID_QUERY` | A query parameter is unknown or has a wrong value | Fix the parameters listed in `details` |
| `404` | `NOT_FOUND` | No task with that id, or no such address | Check the id or the path |
| `405` | `METHOD_NOT_ALLOWED` | The address exists, but not with this method | Use a method from the `Allow` header |
| `406` | `NOT_ACCEPTABLE` | The `Accept` header rules out JSON | Accept `application/json` |
| `413` | `BODY_TOO_LARGE` | The body is over 16 KB | Send less |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | The body isn't JSON, or isn't UTF-8 | Send `Content-Type: application/json` (an `Accept-Post` or `Accept-Patch` header says so too) |
| `429` | `TOO_MANY_REQUESTS` | Over the rate limit | Wait `Retry-After` seconds |
| `500` | `INTERNAL_ERROR` | A problem on the server | Try again later. If it keeps happening, report the `requestId`. |

Examples:

```jsonc
// 404: GET /tasks/nope
{ "error": { "code": "NOT_FOUND", "message": "There's no task with the id \"nope\".", "requestId": "req-123" } }

// 405: DELETE /tasks (with the header Allow: GET, HEAD, POST)
{ "error": { "code": "METHOD_NOT_ALLOWED", "message": "DELETE isn't allowed on /tasks. Allowed: GET, HEAD, POST.", "requestId": "req-123" } }

// 400: GET /tasks?status=finished&page=0
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "The query has 2 problems.",
    "details": [
      { "field": "status", "message": "Unknown status: finished. Use one or more of: todo, in_progress, done" },
      { "field": "page", "message": "page must be a whole number from 1 to 100000" }
    ],
    "requestId": "req-123"
  }
}
```

A `500` never contains internal details such as file paths or stack traces. Those go to the server's log, under the same `requestId`.

---

## Limits

### Body size

Request bodies are limited to **16 KB**, which is plenty for any task. Bigger bodies get `413 BODY_TOO_LARGE`, and the server stops reading them at the limit.

### Rate limiting

Each client (by IP address) may send **100 requests per 60 seconds** by default. The server's settings can change both numbers. `/health` doesn't count.

Every answer says where you stand:

```http
RateLimit-Limit: 100
RateLimit-Remaining: 88
RateLimit-Reset: 60
```

- **`RateLimit-Limit`** is the number of requests allowed per window.
- **`RateLimit-Remaining`** is how many are left in this window.
- **`RateLimit-Reset`** is the number of seconds until the window starts over.

Past the limit, every request gets `429 TOO_MANY_REQUESTS` until the window ends, with `Retry-After: <seconds>`. A good client slows down as `RateLimit-Remaining` gets low, and waits `Retry-After` seconds after a `429` instead of retrying straight away.

---

## Browsers (CORS)

Web pages on **other origins** may call the API from a browser only if the server lists their origin in its `CORS_ORIGINS` setting. In development, `http://localhost:5173` (a Vite dev server) is allowed by default.

For an allowed page, the API:

- answers the browser's preflight `OPTIONS` requests;
- allows the methods `GET`, `HEAD`, `POST`, `PUT`, `PATCH` and `DELETE`, and the request headers `Content-Type` and `X-Request-Id`;
- lets the page read the `Location`, `X-Request-Id`, `Retry-After` and `RateLimit-*` headers.

Errors carry the CORS headers too, so a page can read the API's error messages.

CORS only affects browsers: curl, servers and mobile apps can always call the API. See [`curl-cheatsheet.md`](curl-cheatsheet.md#checking-cors) to check it with curl.
