import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { arch, platform } from "node:process";

const resolve = createRequire(import.meta.url).resolve;
const binary = platform === "win32" ? "esbuild.exe" : "bin/esbuild";
const esbuild = resolve(`@esbuild/${platform}-${arch}/${binary}`);
const flags = ["--bundle", "--platform=browser", "--target=chrome120"];

for (const args of [
  ["src/extension/content.ts", "src/extension/popup.ts", "--outdir=extension/dist", "--loader:.css=text"],
  ["src/sites/a/app.ts", "--outdir=src/sites/a/dist"],
]) {
  const result = spawnSync(esbuild, [...flags, ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`esbuild exited with status ${result.status}`);
}
