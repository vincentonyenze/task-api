// Putting tasks in order. Pure: a list and an (already checked) sort order
// in, a NEW sorted list out. The list given is never changed.

// Fields tasks can be sorted by, and how to compare two values of each.
// Each compare(a, b) returns a negative number if a comes first, a positive
// number if b comes first, and 0 if they're equal.
const RANKS = {
  priority: { low: 0, medium: 1, high: 2 }, // by meaning, not alphabet
  status: { todo: 0, in_progress: 1, done: 2 }, // the order work moves in
};

const compareText = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" }); // "apple" next to "Apple"
const compareRank = (field) => (a, b) => RANKS[field][a] - RANKS[field][b];

export const SORT_FIELDS = {
  title: compareText,
  priority: compareRank("priority"),
  status: compareRank("status"),
  // Dates as ISO text ("2026-11-15", "2026-10-21T09:30:00.000Z") sort
  // correctly as text
  dueDate: compareText,
  createdAt: compareText,
  updatedAt: compareText,
};

// The order used when none is asked for: oldest first, as before
export const DEFAULT_SORT = [{ field: "createdAt", direction: "asc" }];

// sort: [{ field, direction: "asc" | "desc" }, ...], most important first.
// Later fields only decide between tasks the earlier ones call equal:
// sort by priority, and within the same priority, by due date.
export function sortTasks(tasks, sort = DEFAULT_SORT) {
  return tasks.toSorted((a, b) => {
    for (const { field, direction } of sort) {
      const valueA = a[field];
      const valueB = b[field];
      if (valueA === valueB) continue; // equal here: let the next field decide

      // A missing value (no due date) always goes LAST, whichever direction:
      // "soonest first" and "latest first" both want undated tasks at the end
      if (valueA === null) return 1;
      if (valueB === null) return -1;

      const order = SORT_FIELDS[field](valueA, valueB);
      if (order !== 0) return direction === "desc" ? -order : order;
    }
    // Equal on every field asked for: say so (0). toSorted is STABLE: equal
    // tasks keep the order they came in, which is creation order (the
    // store lists them that way). So ties always come out the same way,
    // even for tasks created in the same millisecond. (An earlier version
    // broke ties by the random ids, which shuffled equal tasks on every run.)
    return 0;
  });
}
