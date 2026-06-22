#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FILES } from "./files.js";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");

const versions = FILES.map(({ rel, get }) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  return { rel, version: get(pkg) };
});

versions.forEach(({ rel, version }) => console.log(`${version}  ${rel}`));

const unique = new Set(versions.map((v) => v.version));
if (unique.size > 1) {
  console.error("\nversions are misaligned");
  process.exit(1);
}
console.log("\nall versions aligned");
