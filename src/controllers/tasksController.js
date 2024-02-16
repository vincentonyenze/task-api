import { invalidBody, taskNotFound, validationFailed } from "../http/errors.js";
import { validateTask } from "../validation/taskValidation.js";

// WHAT HAPPENS for each task request: the "controller".
//
// Each handler does the same three things:
//   1. read the request (params, body)
//   2. ask for the work to be done (validation, the store)
//   3. answer: on success, send the result; on a problem, THROW an error
//      (http/errors.js) and let the central error handler answer
//
// The layers, each knowing only about the next:
//   routes      -> which URL + method goes to which handler
//   controllers -> HTTP in, HTTP out (this file)
//   validation  -> what's allowed
//   models      -> the data and its rules

// Express 5: req.body stays undefined when no JSON was read: no body, or
// the Content-Type header is missing. (Step 29 makes the second a 415.)
function requireBody(req) {
  if (req.body === undefined) {
    throw invalidBody('Send the task as JSON, with the header "Content-Type: application/json".');
  }
}

// The task, or a 404 if there's no such id
function findTask(store, id) {
  const task = store.get(id);
  if (!task) throw taskNotFound(id);
  return task;
}

// Checked, cleaned values, or a 400 listing every problem
function checkTask(body, options) {
  const { value, errors } = validateTask(body, options);
  if (errors.length > 0) throw validationFailed(errors);
  return value;
}

export function createTasksController({ store }) {
  return {
    // GET /tasks  ->  every task, wrapped as { data, meta } so meta can grow
    list(req, res) {
      const tasks = store.list();
      res.json({ data: tasks, meta: { total: tasks.length } });
    },

    // GET /tasks/:id  ->  one task (findTask throws the 404)
    getOne(req, res) {
      res.json({ data: findTask(store, req.params.id) });
    },

    // POST /tasks  ->  201 Created + Location, with the new task
    create(req, res) {
      requireBody(req);
      // Only the CLEANED values reach the store (trimmed, checked)
      const task = store.create(checkTask(req.body));
      res.status(201).location(`${req.baseUrl}/${task.id}`).json({ data: task });
    },

    // PATCH /tasks/:id  ->  change SOME fields; the rest stay as they were.
    // The checks run in order, and the first problem found is the answer:
    // no body (400), no such task (404), invalid change (400).
    update(req, res) {
      requireBody(req);
      findTask(store, req.params.id);
      const changes = checkTask(req.body, { partial: true });
      res.json({ data: store.update(req.params.id, changes) });
    },

    // PUT /tasks/:id  ->  REPLACE a whole task (anything left out goes back
    // to its default). Only replaces tasks that exist.
    replace(req, res) {
      requireBody(req);
      findTask(store, req.params.id);
      const task = checkTask(req.body); // a whole task: title required
      res.json({ data: store.replace(req.params.id, task) });
    },

    // DELETE /tasks/:id  ->  204 No Content, or 404 if it's already gone
    remove(req, res) {
      if (!store.remove(req.params.id)) throw taskNotFound(req.params.id);
      res.status(204).end();
    },
  };
}
