import express from "express";
import { rejectMissingBody, sendTaskNotFound, sendValidationErrors } from "../http/responses.js";
import { validateTask } from "../validation/taskValidation.js";

// Every /tasks route, in one module.
//
// express.Router() makes a ROUTER: a mini-app that holds a group of routes.
// app.js MOUNTS it at "/tasks":
//     app.use("/tasks", createTasksRouter({ store }))
// so the paths here are RELATIVE to that: "/" here is /tasks, and "/:id"
// is /tasks/:id. Moving the whole group to /api/v1/tasks one day would be
// a one-word change in app.js.
//
// A function, handed its store (dependency injection, as in Steps 7 and 9).
export function createTasksRouter({ store }) {
  const router = express.Router();

  // GET /tasks  ->  every task
  //
  // The answer is wrapped: { data: [...], meta: {...} }, not a bare array.
  // That leaves room to grow: pagination (Step 26) adds page details to
  // meta, and clients reading "data" keep working. A bare array can't
  // grow without breaking every client.
  router.get("/", (req, res) => {
    const tasks = store.list();
    res.json({ data: tasks, meta: { total: tasks.length } });
  });

  // GET /tasks/:id  ->  one task
  //
  // ":id" is a ROUTE PARAMETER: it matches whatever is in that part of the
  // address, and Express puts it in req.params. On /tasks/abc-123,
  // req.params.id is "abc-123". (Like :courseId in React Router.)
  router.get("/:id", (req, res) => {
    const task = store.get(req.params.id);

    // 404 Not Found: the address is fine, but there's no such task.
    // Answered in JSON like everything else, with a "code" for programs
    // and a "message" for people.
    if (!task) return sendTaskNotFound(res, req.params.id);

    // 200 OK is the default status, so it doesn't need setting
    res.json({ data: task });
  });

  // POST /tasks  ->  create a task from the JSON body
  //
  //   curl -X POST http://localhost:3000/tasks \
  //     -H "Content-Type: application/json" -d '{"title": "Buy milk"}'
  router.post("/", (req, res) => {
    if (rejectMissingBody(req, res)) return;

    // Check EVERYTHING that was sent (Step 12's rules)
    const { value, errors } = validateTask(req.body);
    if (errors.length > 0) return sendValidationErrors(res, errors);

    // Only the CLEANED values reach the store (trimmed, checked)
    const task = store.create(value);

    // 201 Created: something new exists now. Location says WHERE: the
    // address to GET it from. Clients (and people) can follow it.
    // req.baseUrl is where this router is mounted ("/tasks").
    res.status(201).location(`${req.baseUrl}/${task.id}`).json({ data: task });
  });

  // PATCH /tasks/:id  ->  change SOME fields of a task
  //
  //   curl -X PATCH http://localhost:3000/tasks/<id> \
  //     -H "Content-Type: application/json" -d '{"status": "done"}'
  //
  // Only the fields sent change; everything else stays as it was.
  router.patch("/:id", (req, res) => {
    if (rejectMissingBody(req, res)) return;

    // No such task: 404, whatever the body says
    if (!store.get(req.params.id)) return sendTaskNotFound(res, req.params.id);

    // partial: nothing is required, but whatever is sent must be valid
    const { value, errors } = validateTask(req.body, { partial: true });
    if (errors.length > 0) return sendValidationErrors(res, errors);

    // 200 OK with the whole updated task, so the client doesn't need a
    // second request to see the result (updatedAt, for example)
    res.json({ data: store.update(req.params.id, value) });
  });

  // PUT /tasks/:id  ->  REPLACE a whole task
  //
  // The body is the complete new version. Anything left out goes back to
  // its default: PUT {"title": "x"} also resets priority, status, the
  // description and the due date. (PATCH {"title": "x"} changes only the
  // title.) id and createdAt never change.
  //
  // PUT here only replaces tasks that exist: 404 otherwise. Some APIs let
  // PUT create a task at an id the client chose; this one doesn't, because
  // ids belong to the server (Step 7).
  router.put("/:id", (req, res) => {
    if (rejectMissingBody(req, res)) return;
    if (!store.get(req.params.id)) return sendTaskNotFound(res, req.params.id);

    // Not partial: it's a whole task, so the title is required
    const { value, errors } = validateTask(req.body);
    if (errors.length > 0) return sendValidationErrors(res, errors);

    res.json({ data: store.replace(req.params.id, value) });
  });

  // DELETE /tasks/:id  ->  delete a task
  //
  // 204 No Content: it worked, and there's nothing to send back (the task
  // is gone). A 204 response has NO body at all.
  //
  // Deleting the same task twice: the second time it's already gone, so
  // 404. The END STATE is the same either way (no such task), which is why
  // DELETE still counts as idempotent: safe to retry.
  router.delete("/:id", (req, res) => {
    if (!store.remove(req.params.id)) return sendTaskNotFound(res, req.params.id);
    res.status(204).end(); // end(): send the response with no body
  });

  return router;
}
