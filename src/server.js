import { createApp } from "./app.js";
import { config } from "./config.js";
import { createFileTaskStore } from "./models/fileTaskStore.js";
import { createMemoryTaskStore } from "./models/memoryTaskStore.js";
import { seed } from "./seed.js";

// Starts the API: builds the app, listens on the port, and stops cleanly.
// This is the file `npm start` runs. Everything about WHAT the API does is
// in app.js; this file is only about RUNNING it.

// Where the tasks live (STORAGE in .env). The rest of the API doesn't know
// or care which store it is: they share one interface.
// (Top-level await: allowed in ES modules, so the file is read before the
// server starts answering. A broken file stops the server right here.)
const store =
  config.storage === "file"
    ? await createFileTaskStore({ file: config.dataFile })
    : createMemoryTaskStore();
console.log(config.storage === "file" ? `Tasks are saved in ${config.dataFile}` : "Tasks are kept in memory only");

// In development, an EMPTY store gets a few examples so there's something
// to see. Only when empty: a restart mustn't add them again every time.
if (config.environment === "development" && (await store.count()) === 0) await seed(store);

const app = createApp({ environment: config.environment, store, corsOrigins: config.corsOrigins });

// app.listen gives back the underlying Node HTTP server, which we need in
// order to stop it later. A PORT is like a door number on this computer:
// requests to http://localhost:3000 arrive at door 3000.
const server = app.listen(config.port, () => {
  console.log(`Task API (${config.environment}) listening on http://localhost:${config.port}`);
});

// Listening can fail. The usual reason: something else (another copy of
// this server, perhaps) is already using the port. Say so plainly.
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Stop the other program, or set PORT in .env.`);
  } else {
    console.error("The server couldn't start:", error.message);
  }
  process.exit(1); // a non-zero exit code means "it failed"
});

// ===== Stopping cleanly =====
// Ctrl+C sends the program a SIGINT signal; hosting services send SIGTERM
// when they stop or restart an app. Instead of dying mid-request:
//   1. stop accepting NEW connections
//   2. let requests already in progress finish
//   3. wait until every accepted change is saved
//   4. then exit
function shutDown(signal) {
  console.log(`${signal} received: shutting down...`);
  server.close(async () => {
    await store.close();
    console.log("Server stopped. Bye!");
    process.exit(0);
  });
  // A request that never finishes mustn't keep the server alive forever.
  // unref(): this timer alone won't keep Node running.
  setTimeout(() => {
    console.error("Still busy after 10 seconds: forcing the exit.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutDown("SIGINT"));
process.on("SIGTERM", () => shutDown("SIGTERM"));
