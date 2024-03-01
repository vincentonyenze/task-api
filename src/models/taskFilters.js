// Picking tasks out of a list. Pure: a list and some (already checked)
// filters in, a new list out. Nothing about HTTP or query strings, so the
// same function could serve a command-line tool or a different API.

// For comparing text loosely: lower case, and accents removed, so "Café"
// and "cafe" match. normalize("NFD") splits "é" into "e" + an accent mark,
// then the marks (\p{Diacritic}: any accent-like mark) are dropped.
function simplify(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Does the task contain EVERY word of the search, in its title or its
// description, in any order? "report q3" finds "Write the Q3 report".
// \s+ : one or more spaces (or tabs...) between the words.
function matchesSearch(task, q) {
  const words = simplify(q).split(/\s+/).filter(Boolean);
  const text = simplify(`${task.title} ${task.description}`);
  return words.every((word) => text.includes(word));
}

// filters: { q?: "words", status?: [...], priority?: [...], dueBefore?: "YYYY-MM-DD" }
// A task must match EVERY filter given (AND). Within one filter, any of
// the listed values will do (OR): status todo OR in_progress.
export function filterTasks(tasks, { q, status, priority, dueBefore } = {}) {
  return tasks.filter(
    (task) =>
      (!q || matchesSearch(task, q)) &&
      (!status || status.includes(task.status)) &&
      (!priority || priority.includes(task.priority)) &&
      // "YYYY-MM-DD" text compares correctly as text: "2026-11-05" < "2026-11-30"
      (!dueBefore || (task.dueDate !== null && task.dueDate <= dueBefore))
  );
}
