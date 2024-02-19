import { methodNotAllowed } from "../http/errors.js";

// For the END of a route's list of methods: any OTHER method gets a 405
// Method Not Allowed, with an Allow header saying what IS possible.
//
//   router.route("/")
//     .get(tasks.list)
//     .post(tasks.create)
//     .all(allowOnly("GET", "POST"));    // DELETE /tasks -> 405, Allow: GET, HEAD, POST
//
// HEAD is added automatically wherever GET is allowed: Express answers HEAD
// for every GET route by itself (Step 4).
//
// OPTIONS ("what can I do here?") is answered properly instead of refused:
// 204 No Content with the Allow header.
export function allowOnly(...methods) {
  const allowed = methods.includes("GET") ? [...methods.slice(0, 1), "HEAD", ...methods.slice(1)] : methods;

  return function allowOnlyHandler(req, res) {
    if (req.method === "OPTIONS") {
      res.set("Allow", [...allowed, "OPTIONS"].join(", "));
      return res.status(204).end();
    }
    throw methodNotAllowed(req, allowed);
  };
}
