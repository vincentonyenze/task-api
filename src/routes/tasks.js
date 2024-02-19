import express from "express";
import { createTasksController } from "../controllers/tasksController.js";
import { allowOnly } from "../middleware/allowMethods.js";

// Every /tasks route: WHICH URL + method goes to which handler. That's all.
// What each one DOES is in controllers/tasksController.js.
//
// express.Router() makes a ROUTER: a mini-app holding a group of routes.
// app.js MOUNTS it at "/tasks", so the paths here are RELATIVE to that:
// "/" here is /tasks, and "/:id" is /tasks/:id.
//
//   curl http://localhost:3000/tasks
//   curl -X POST http://localhost:3000/tasks \
//     -H "Content-Type: application/json" -d '{"title": "Buy milk"}'
//   curl -X PATCH http://localhost:3000/tasks/<id> \
//     -H "Content-Type: application/json" -d '{"status": "done"}'
export function createTasksRouter({ store }) {
  const router = express.Router();
  const tasks = createTasksController({ store });

  // router.route(path) groups every method for ONE address. The final
  // .all() catches any other method: 405 Method Not Allowed.
  router
    .route("/")
    .get(tasks.list) //                 GET    /tasks      every task
    .post(tasks.create) //              POST   /tasks      create one
    .all(allowOnly("GET", "POST"));

  router
    .route("/:id")
    .get(tasks.getOne) //               GET    /tasks/:id  one task
    .patch(tasks.update) //             PATCH  /tasks/:id  change some fields
    .put(tasks.replace) //              PUT    /tasks/:id  replace it
    .delete(tasks.remove) //            DELETE /tasks/:id  delete it
    .all(allowOnly("GET", "PATCH", "PUT", "DELETE"));

  return router;
}
