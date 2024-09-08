# Task API

A REST API for managing tasks, built with **Node.js** and **Express 5**, with no other dependencies.

You can create, read, change and delete tasks. The task list can be filtered, searched, sorted and paged. Tasks are saved to a JSON file so they survive restarts, and every answer, error included, has the same predictable JSON shape. 206 tests cover it.

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Write the report", "priority": "high", "dueDate": "2026-11-10"}'
```

```json
{
  "data": {
    "id": "7ca2caa0-60c1-4166-8fa2-765e955bc116",
    "title": "Write the report",
    "description": "",
    "status": "todo",
    "priority": "high",
    "dueDate": "2026-11-10",
    "createdAt": "2026-10-21T09:00:00.000Z",
    "updatedAt": "2026-10-21T09:00:00.000Z"
  }
}
```

## Features

- **Full CRUD:** `GET`, `POST`, `PATCH` (change some fields), `PUT` (replace) and `DELETE`, with the right status codes (`201` + `Location`, `204`, `404`, `405` + `Allow`...).
- **Listing:**
  - **filters:** `?status=todo,in_progress&priority=high&dueBefore=2026-11-30`
  - **search:** `?q=report q3`, where every word must match and case and accents are ignored
  - **sorting:** `?sort=-priority,dueDate`, by rank, with tasks that have no due date last
  - **pages:** `?page=2&limit=10`, with `next`, `previous`, `first` and `last` links
- **Validation:** every problem is reported at once, field by field. Unknown fields and unknown query parameters are refused, not silently ignored.
- **One response shape:** `{ data }` for success and `{ error: { code, message, details?, requestId } }` for any error.
- **Saved to a file with atomic writes and a save queue.** A crash mid-save can't corrupt the file, and changes that arrive together can't overwrite each other.
- **Production basics:**
  - request ids and request logging
  - central error handling, so a `500` never shows internal details to the client
  - graceful shutdown
  - settings checked when the server starts
- **HTTP done properly:**
  - content negotiation (`406`, `415`)
  - a body size limit (`413`)
  - per-client rate limiting (`429` + `Retry-After`)
  - CORS for browser apps

## Quick start

You need **Node.js 22 or newer**.

```bash
git clone https://github.com/vincentonyenze/task-api.git
cd task-api
npm install
cp .env.example .env      # optional: the defaults work without it
npm run dev
```

The API is now at **http://localhost:3000**. In development, an empty store starts with five example tasks:

```bash
curl http://localhost:3000/tasks
curl "http://localhost:3000/tasks?status=todo&sort=-priority"
curl http://localhost:3000/health
```

On Windows PowerShell, type `curl.exe` instead of `curl`: plain `curl` there is a different command. There's more in [`docs/curl-cheatsheet.md`](docs/curl-cheatsheet.md).

## Documentation

- **[API reference](docs/api.md):** every endpoint, field, query parameter, status code and error code, with real examples.
- **[curl cheatsheet](docs/curl-cheatsheet.md):** how to call the API by hand, and what the status codes mean.

### Endpoints at a glance

| Method | Path | What it does | Success |
|---|---|---|---|
| `GET` | `/tasks` | List tasks (filter, search, sort, page) | `200` |
| `POST` | `/tasks` | Create a task | `201` |
| `GET` | `/tasks/:id` | Get one task | `200` |
| `PATCH` | `/tasks/:id` | Change some fields | `200` |
| `PUT` | `/tasks/:id` | Replace the whole task | `200` |
| `DELETE` | `/tasks/:id` | Delete a task | `204` |
| `GET` | `/health` | Is the server up? (for monitoring) | `200` |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the server and restart it whenever a file changes |
| `npm start` | Start the server (as in production) |
| `npm test` | Run every test (unit + integration) |
| `npm run test:unit` | Only the unit tests in `src/` (fast, no HTTP) |
| `npm run test:integration` | Only the integration tests in `test/` (the whole app over real HTTP) |
| `npm run test:watch` | Re-run the tests whenever a file changes |

## Settings

Settings come from environment variables. Locally, they're read from a `.env` file; copy [`.env.example`](.env.example) to start one. Every value is checked when the server starts, and a wrong one stops it with a clear message.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | The port to listen on |
| `NODE_ENV` | `development` | `development`, `test` or `production`. Development adds example tasks to an empty store and turns on `/echo`, a debugging aid that shows what a request sent. |
| `STORAGE` | `file` | `file` (survives restarts) or `memory` (forgotten on exit) |
| `DATA_FILE` | `data/tasks.json` | Where the file store saves tasks |
| `CORS_ORIGINS` | `http://localhost:5173` in development, none otherwise | Web pages allowed to call the API from a browser: comma-separated origins, or `*` |
| `RATE_LIMIT_MAX` | `100` | Requests each client may send per window (`0` turns rate limiting off) |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | The length of the rate-limit window |

## How it's built

### Project layout

```
src/
  server.js          starts the app: reads settings, opens the store, listens, shuts down cleanly
  app.js             builds the Express app: middleware in order, routes, error handler
  config.js          reads and checks the environment variables
  seed.js            example tasks for development
  routes/            which URL + method goes to which handler
  controllers/       HTTP in, HTTP out: read the request, call the store, send the answer
  validation/        what a valid task and a valid query look like (pure functions)
  models/            the task rules, filtering, sorting, paging, and the two stores
  middleware/        request ids, logging, CORS, rate limiting, 405s, errors
  http/errors.js     the errors the API can send, by name
test/
  helpers/testApi.js starts the whole app on a free port for a test
  *.test.js          integration tests: real HTTP against the whole app
docs/                the API reference and the curl cheatsheet
```

Unit tests sit next to the code they test (`src/**/*.test.js`). Integration tests are in `test/`.

### A request's journey

Each request passes through the middleware in this order:

```
request
  -> request id      gives the request an id (X-Request-Id)
  -> logger          logs it when the answer is sent: "GET /tasks 200 1.2ms [id]"
  -> CORS            browser permissions; answers preflight OPTIONS requests
  -> rate limit      429 when a client sends too many requests
  -> Accept check    406 if the client can't read JSON
  -> JSON parser     reads the body (16 KB at most: 413 beyond that)
  -> routes          /, /health, /tasks -> the tasks router -> the controller
                       controller: validate -> store -> { data }
  -> 404             no route matched
  -> error handler   any thrown error becomes { error: { code, message, ... } }
response
```

### Design decisions

- **Layers:** routes, then controllers, then validation and models. Each layer only knows the next one. Validation, filtering and sorting are pure functions, so they're easy to test without HTTP.
- **Dependency injection:**
  - `createApp()` receives its store, logger and settings. Tests can give each app a fresh store, a fake clock and predictable ids, then compare whole answers exactly.
  - The stores take a clock and an id maker in the same way.
- **One store interface, two stores:**
  - The memory store and the file store are both async and offer the same methods.
  - One shared *contract test* (`src/models/storeContract.js`) holds both stores to the same rules. A database store could be added the same way.
- **Errors are thrown, not built in each route.** Routes throw named errors (`taskNotFound(id)`), and one error handler turns every error into the same JSON. Unexpected errors are logged in full for the server, with the request id, and the client only gets a generic `500`.
- **Mistakes are refused loudly.** An unknown field, a misspelled query parameter, or a broken data file at start-up is an error, not silently ignored. A filter that quietly did nothing would look as if it had worked.
- **Safe writes:** every save writes a temporary file, flushes it to disk, then renames it over the real one. Saves run one at a time, and memory only changes after a save succeeds.

## Testing

```bash
npm test
```

There are **206 tests**, using Node's built-in test runner (`node:test`), with no test framework to install:

- **Unit tests (105)** cover validation, query parsing, sorting, paging, and both stores. The two stores also run through the shared store contract.
- **Integration tests (101)** start the whole app on a free port and use real HTTP:
  - CRUD, listing, every error path (including a real `500`), request ids and logging
  - CORS, rate limiting and the body limit
  - the file store across a restart
  - checks that [`docs/api.md`](docs/api.md) still matches the code

While the tests were being written, each new test was checked by breaking the code on purpose and confirming the test failed.

## What I learned

This was Project 20 of my web development roadmap, my first backend project. Along the way I learned:

- **HTTP:** methods and their meanings (PUT vs PATCH, idempotency), status codes, headers (`Location`, `Allow`, `Retry-After`), content negotiation, and CORS.
- **Express 5:** routing, routers, middleware order, error-handling middleware, and async handlers.
- **API design:** response envelopes, validation that reports everything at once, filtering, search, sorting and pagination with links, and stable error codes.
- **Reliability:** checking settings when the server starts, graceful shutdown, atomic file writes, a save queue for changes that arrive together, rate limiting, and size limits.
- **Testing:** unit vs integration tests, contract tests, fake clocks, proving a test can fail, and testing the documentation against the code.

## License

MIT
