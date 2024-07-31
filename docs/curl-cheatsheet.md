# curl cheat sheet

`curl` sends HTTP requests from the terminal. It's already on Windows (and in Git Bash), so it's the quickest way to try the API without writing a front-end.

Start the server first (`npm run dev`), then try these in a second terminal.

| Command | What it does |
|---|---|
| `curl http://localhost:3000/` | GET, and print the response body |
| `curl -i http://localhost:3000/` | also show the **status line and headers** (`HTTP/1.1 200 OK`, `Content-Type: ...`) |
| `curl -v http://localhost:3000/` | show the **whole conversation**: `>` lines are what curl sent, `<` lines what came back |
| `curl -I http://localhost:3000/` | a **HEAD** request: headers only, no body |
| `curl -X DELETE http://localhost:3000/echo` | use another **method** (`-X POST`, `-X PATCH`, `-X DELETE`...) |
| `curl "http://localhost:3000/echo?status=done&page=2"` | send a **query string** (quote the address: `&` means something to the terminal) |
| `curl -H "Accept: application/json" http://localhost:3000/echo` | send a **header** |
| `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/` | print **only the status code** (`-s` silent, `-o /dev/null` throw the body away) |

From Step 11 on, sending JSON in a request body:

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy milk"}'
```

`-d` sends the body. The `Content-Type` header tells the server it's JSON.

> **In Windows PowerShell**, `curl` may be a different command (an alias for `Invoke-WebRequest`). Type `curl.exe` instead, or use Git Bash.

## Status codes you'll meet in this project

| Code | Name | Means |
|---|---|---|
| 200 | OK | It worked; here's the result |
| 201 | Created | A new thing was made (with a `Location` header saying where) |
| 204 | No Content | It worked; nothing to send back (e.g. after a delete) |
| 400 | Bad Request | Something in your request is wrong (with details of what) |
| 404 | Not Found | No such thing |
| 405 | Method Not Allowed | That address exists, but not with this method |
| 406 | Not Acceptable | Your `Accept` header rules out JSON, the only thing this API sends |
| 415 | Unsupported Media Type | The body isn't JSON: add `-H "Content-Type: application/json"` |
| 429 | Too Many Requests | Slow down (with `Retry-After` saying how long) |
| 500 | Internal Server Error | A bug on the server: not your fault |

The first digit says who it's about: **2xx** success, **4xx** a problem with the request (the client's side), **5xx** a problem on the server.
