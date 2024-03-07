// Cutting a long list into pages. Pure, and not about tasks at all: it
// would page any list.

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// items: the whole (filtered, sorted) list
// page:  which page, starting at 1
// limit: how many per page
//
// Returns { items, meta }:
//   items: just this page's items
//   meta:  { total, page, limit, totalPages }
//
// A page past the end (page 9 of 3) is NOT an error: it's simply empty.
// The list can shrink between two requests (someone deletes tasks), and a
// client already holding a "page 3" link shouldn't get a 404 for it.
export function paginate(items, { page = 1, limit = DEFAULT_LIMIT } = {}) {
  const start = (page - 1) * limit; // page 1 starts at 0, page 2 at limit...
  return {
    items: items.slice(start, start + limit),
    meta: {
      total: items.length,
      page,
      limit,
      // At least 1: an empty list still has one (empty) page
      totalPages: Math.max(1, Math.ceil(items.length / limit)),
    },
  };
}
