// Regenerates src/lib/api-schema.ts from the FastAPI OpenAPI document.
// Run with `npm run gen:api` after changing a backend request/response model.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, "../../backend");
const python = [".venv/Scripts/python.exe", ".venv/bin/python"]
  .map((relative) => join(backend, relative))
  .find((candidate) => existsSync(candidate)) ?? "python";

const workDir = mkdtempSync(join(tmpdir(), "code-tutor-openapi-"));
const spec = join(workDir, "openapi.json");
const output = resolve(here, "../src/lib/api-schema.ts");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    rmSync(workDir, { recursive: true, force: true });
    process.exit(result.status ?? 1);
  }
}

run(python, [join(backend, "scripts/export_openapi.py"), spec]);
run(process.execPath, [resolve(here, "../node_modules/openapi-typescript/bin/cli.js"), spec, "-o", output]);
rmSync(workDir, { recursive: true, force: true });
console.log(`Wrote ${output}`);
