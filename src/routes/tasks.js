import express from "express";
import { createTasksController } from "../controllers/tasksController.js";

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

  router.get("/", tasks.list); //            GET    /tasks      every task
  router.post("/", tasks.create); //         POST   /tasks      create one
  router.get("/:id", tasks.getOne); //       GET    /tasks/:id  one task
  router.patch("/:id", tasks.update); //     PATCH  /tasks/:id  change some fields
  router.put("/:id", tasks.replace); //      PUT    /tasks/:id  replace it
  router.delete("/:id", tasks.remove); //    DELETE /tasks/:id  delete it

  return router;
}
