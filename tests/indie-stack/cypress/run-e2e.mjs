// codegraph: tooling
// The click-through tests against a built app: start it with its mocks, wait
// until it answers, run Cypress, then stop it. Works the same on Windows and
// macOS, where start-server-and-test cannot stop the server on Windows 11.
import { spawn, spawnSync } from "node:child_process";

const port = process.env.PORT ?? "8811";
const url = `http://localhost:${port}`;

const server = spawn(
  process.execPath,
  ["--import", "./mocks/index.js", "node_modules/@remix-run/serve/dist/cli.js", "./build/index.js"],
  { env: { ...process.env, PORT: port }, stdio: "inherit" },
);

async function answers() {
  for (let tries = 0; tries < 120; tries++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  return false;
}

let status = 1;
try {
  if (await answers()) {
    // Cypress runs its commands in SHELL, and Git Bash's path has a space in it
    const env = { ...process.env, PORT: port };
    delete env.SHELL;
    status = spawnSync("npx", ["cypress", "run"], { env, shell: true, stdio: "inherit" }).status ?? 1;
  } else {
    console.error(`The app did not answer at ${url}`);
  }
} finally {
  server.kill();
}
process.exit(status);
