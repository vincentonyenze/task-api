// Picking tasks out of a list. Pure: a list and some (already checked)
// filters in, a new list out. Nothing about HTTP or query strings, so the
// same function could serve a command-line tool or a different API.
//
// filters: { status?: [...], priority?: [...], dueBefore?: "YYYY-MM-DD" }
// A task must match EVERY filter given (AND). Within one filter, any of
// the listed values will do (OR): status todo OR in_progress.
export function filterTasks(tasks, { status, priority, dueBefore } = {}) {
  return tasks.filter(
    (task) =>
      (!status || status.includes(task.status)) &&
      (!priority || priority.includes(task.priority)) &&
      // "YYYY-MM-DD" text compares correctly as text: "2026-11-05" < "2026-11-30"
      (!dueBefore || (task.dueDate !== null && task.dueDate <= dueBefore))
  );
}
