import { readFile } from "node:fs/promises";

export async function readJsonFile(pathname) {
  const raw = await readFile(pathname, "utf8");
  return JSON.parse(raw);
}