#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FILES } from "./files.js";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");

const type = process.argv[2] || "patch";

function bump(version, type) {
  const [maj, min, pat] = version.split(".").map(Number);
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  if (type === "patch") return `${maj}.${min}.${pat + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  throw new Error(`Unknown bump type: ${type}`);
}

for (const { rel, get, set } of FILES) {
  const file = path.join(ROOT, rel);
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const next = bump(get(pkg), type);
  console.log(`${rel}: ${get(pkg)} → ${next}`);
  set(pkg, next);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
