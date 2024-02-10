import { rejectMissingBody, sendTaskNotFound, sendValidationErrors } from "../http/responses.js";
import { validateTask } from "../validation/taskValidation.js";

// WHAT HAPPENS for each task request: the "controller".
//
// Each handler does the same three things:
//   1. read the request (params, body)
//   2. ask for the work to be done (validation, the store)
//   3. choose the answer (status code + JSON)
// It decides nothing about URLs: routes/tasks.js maps URLs to these.
//
// The layers so far, each knowing only about the next:
//   routes      -> which URL + method goes to which handler
//   controllers -> HTTP in, HTTP out (this file)
//   validation  -> what's allowed
//   models      -> the data and its rules
export function createTasksController({ store }) {
  return {
    // GET /tasks  ->  every task
    //
    // The answer is wrapped: { data: [...], meta: {...} }, not a bare array.
    // That leaves room to grow: pagination (Step 26) adds page details to
    // meta, and clients reading "data" keep working.
    list(req, res) {
      const tasks = store.list();
      res.json({ data: tasks, meta: { total: tasks.length } });
    },

    // GET /tasks/:id  ->  one task, or 404 Not Found
    //
    // req.params.id comes from the ":id" in the route's path
    getOne(req, res) {
      const task = store.get(req.params.id);
      if (!task) return sendTaskNotFound(res, req.params.id);
      res.json({ data: task }); // 200 OK is the default
    },

    // POST /tasks  ->  create a task from the JSON body
    create(req, res) {
      if (rejectMissingBody(req, res)) return;

      // Check EVERYTHING that was sent (Step 12's rules)
      const { value, errors } = validateTask(req.body);
      if (errors.length > 0) return sendValidationErrors(res, errors);

      // Only the CLEANED values reach the store (trimmed, checked)
      const task = store.create(value);

      // 201 Created + Location: where the new task lives. req.baseUrl is
      // where the router is mounted ("/tasks").
      res.status(201).location(`${req.baseUrl}/${task.id}`).json({ data: task });
    },

    // PATCH /tasks/:id  ->  change SOME fields; the rest stay as they were
    update(req, res) {
      if (rejectMissingBody(req, res)) return;
      if (!store.get(req.params.id)) return sendTaskNotFound(res, req.params.id);

      // partial: nothing is required, but whatever is sent must be valid
      const { value, errors } = validateTask(req.body, { partial: true });
      if (errors.length > 0) return sendValidationErrors(res, errors);

      // 200 with the whole updated task, so no second request is needed
      res.json({ data: store.update(req.params.id, value) });
    },

    // PUT /tasks/:id  ->  REPLACE a whole task
    //
    // Anything left out goes back to its default (PATCH would keep it).
    // Only replaces tasks that exist: ids belong to the server (Step 7).
    replace(req, res) {
      if (rejectMissingBody(req, res)) return;
      if (!store.get(req.params.id)) return sendTaskNotFound(res, req.params.id);

      // Not partial: a whole task, so the title is required
      const { value, errors } = validateTask(req.body);
      if (errors.length > 0) return sendValidationErrors(res, errors);

      res.json({ data: store.replace(req.params.id, value) });
    },

    // DELETE /tasks/:id  ->  204 No Content, or 404 if it's already gone.
    // Either way the task doesn't exist afterwards: safe to retry.
    remove(req, res) {
      if (!store.remove(req.params.id)) return sendTaskNotFound(res, req.params.id);
      res.status(204).end(); // no body at all
    },
  };
}
