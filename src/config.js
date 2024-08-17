// Settings, read from the ENVIRONMENT: values given to the program from
// outside, instead of being written into the code.
//
// Locally they come from the .env file (Node reads it: see the scripts in
// package.json). On a real server, the hosting service sets them. The code
// is the same everywhere; only the environment changes.
//
// Everything is checked here, ONCE, when the server starts. A wrong
// setting should stop the server immediately with a clear message, not
// cause a strange failure an hour later.

function readPort(value) {
  if (value === undefined || value === "") return 3000; // the default
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535, but it was "${value}"`);
  }
  return port;
}

function readEnvironment(value) {
  const allowed = ["development", "test", "production"];
  const environment = value || "development";
  if (!allowed.includes(environment)) {
    throw new Error(`NODE_ENV must be one of ${allowed.join(", ")}, but it was "${value}"`);
  }
  return environment;
}

// Where tasks are kept: "file" (data/tasks.json, survives a restart) or
// "memory" (gone when the server stops: handy for a quick experiment)
function readStorage(value) {
  const allowed = ["file", "memory"];
  const storage = value || "file";
  if (!allowed.includes(storage)) {
    throw new Error(`STORAGE must be one of ${allowed.join(", ")}, but it was "${value}"`);
  }
  return storage;
}

// Which web pages (ORIGINS) may call the API from a browser: CORS, see
// middleware/cors.js. A comma-separated list, e.g.
//   CORS_ORIGINS=http://localhost:5173,https://tasks.example.com
// or * for any origin. Each must be an origin ONLY: scheme, host and port,
// no path and no trailing slash ("http://localhost:5173/" would never
// match, because browsers send it without the slash).
// Default: in development, Vite's dev server (http://localhost:5173);
// otherwise none.
function readCorsOrigins(value, environment) {
  if (value === undefined) return environment === "development" ? ["http://localhost:5173"] : [];
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of origins) {
    if (origin === "*") continue;
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.origin !== origin) {
      throw new Error(
        `CORS_ORIGINS has "${origin}", which isn't an origin. Write it like http://localhost:5173 (no path, no trailing slash).`
      );
    }
  }
  return origins;
}

// Object.freeze: settings can be read anywhere, but changed nowhere
const environment = readEnvironment(process.env.NODE_ENV);
export const config = Object.freeze({
  port: readPort(process.env.PORT),
  environment,
  corsOrigins: readCorsOrigins(process.env.CORS_ORIGINS, environment),
  storage: readStorage(process.env.STORAGE),
  // The tasks file (only used when storage is "file"). A relative path
  // starts from the folder the server is started in.
  dataFile: process.env.DATA_FILE || "data/tasks.json",
});
