import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectories = [".astro", "dist", "node_modules/.vite"];

for (const directory of generatedDirectories) {
  await rm(resolve(projectRoot, directory), { force: true, recursive: true });
  console.log(`Removed ${directory}/`);
}

console.log("Generated app cache cleared. Restart the dev server or rebuild the app.");
