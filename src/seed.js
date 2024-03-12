// A few example tasks, so a freshly started development server has
// something to show. Only used in development (see server.js): tests and
// production start empty.
export const EXAMPLE_TASKS = [
  { title: "Read about HTTP status codes", status: "done", priority: "medium" },
  { title: "Build the GET /tasks endpoint", status: "in_progress", priority: "high" },
  { title: "Write tests for the task store", status: "done", priority: "high" },
  { title: "Add filtering by status", status: "todo", priority: "medium", dueDate: "2026-11-15" },
  { title: "Buy milk", description: "Oat milk, two cartons", status: "todo", priority: "low" },
];

// Adds the examples to a store (one at a time, in order: awaiting each
// keeps them in this order in the list)
export async function seed(store) {
  for (const task of EXAMPLE_TASKS) await store.create(task);
}
