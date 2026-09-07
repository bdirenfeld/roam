import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SCHEMA, BUCKETS } from "./schemaSnapshot";

/**
 * Every `.select()` in the app is checked against the real column list, and
 * every `.from()` against the real tables and buckets.
 *
 * PostgREST does not throw on a wrong column name — it returns
 * `{ data: null, error }`, and a caller that reads `data` without checking
 * `error` renders an empty screen rather than a failure. That is not
 * hypothetical: the guest itinerary asked `days` for `title`, a column it does
 * not have, and showed a journey with NO DAYS. Nothing looked broken.
 *
 * On its first run this found two live faults: `trips.kanban_background_url`,
 * a column that never existed behind the board background, and the
 * `trip-covers` bucket, which was never created and made every cover-photo
 * upload fail.
 *
 * It reads source text rather than calling the database, so it needs no secret
 * and runs in the checks workflow like everything else. The cost is a snapshot
 * that must be refreshed alongside migrations — see schemaSnapshot.ts.
 *
 * Written without dotAll, matchAll-spreading or iterable spreading: this
 * project sets no `target`, so TypeScript compiles it as ES5.
 */

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (let i = 0; i < entries.length; i++) {
    const full = path.join(dir, entries[i]);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entries[i]) && !/\.test\.tsx?$/.test(entries[i])) out.push(full);
  }
  return out;
}

function rel(file: string): string {
  return path.relative(SRC, file).replace(/\\/g, "/");
}

/** Split on commas that sit outside parentheses. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(current); current = ""; continue; }
    current += ch;
  }
  if (current.replace(/\s/g, "")) parts.push(current);
  const trimmed: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i].trim();
    if (t) trimmed.push(t);
  }
  return trimmed;
}

interface Problem { file: string; table: string; column: string; select: string; }

/**
 * Walks a select string against `table`. Handles the four shapes used here: a
 * bare column, `alias:column`, an embedded resource
 * `[alias:]other_table[!hint]( ... )`, and `*`.
 */
function checkSelect(select: string, table: string, file: string, problems: Problem[]): void {
  const columns = SCHEMA[table];
  if (!columns) {
    problems.push({ file, table, column: "(whole table)", select });
    return;
  }
  const parts = splitTopLevel(select);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // `[\s\S]` rather than the dotAll flag — see the note above.
    const embed = part.match(/^([A-Za-z0-9_]+:)?([A-Za-z0-9_]+)(![A-Za-z]+)?\s*\(([\s\S]*)\)$/);
    if (embed) {
      checkSelect(embed[4], embed[2], file, problems);
      continue;
    }
    if (part === "*") continue;
    // `alias:real_column` — only the right-hand side is a column.
    const name = (part.indexOf(":") >= 0 ? part.split(":").pop()! : part).trim();
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue; // ->> json paths, casts: not our business
    if (columns.indexOf(name) === -1) problems.push({ file, table, column: name, select });
  }
}

/** Every `.from("x")` in a file, in order, with whether it was a storage call. */
function fromsIn(text: string): { table: string; index: number; storage: boolean }[] {
  const found: { table: string; index: number; storage: boolean }[] = [];
  const re = /\.from\(\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    found.push({ table: m[1], index: m.index, storage: /storage\s*$/.test(before) });
  }
  return found;
}

function collectProblems(): Problem[] {
  const problems: Problem[] = [];
  const files = sourceFiles(SRC);
  for (let f = 0; f < files.length; f++) {
    const text = readFileSync(files[f], "utf8");
    const froms = fromsIn(text);
    // Each `.select("…")` belongs to the nearest `.from("…")` before it.
    const re = /\.select\(\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let owner: { table: string; index: number; storage: boolean } | null = null;
      for (let i = 0; i < froms.length; i++) {
        if (froms[i].index < m.index) owner = froms[i];
      }
      if (!owner || owner.storage || BUCKETS.has(owner.table)) continue;
      checkSelect(m[1], owner.table, rel(files[f]), problems);
    }
  }
  return problems;
}

describe("every .select() names columns that exist", () => {
  it("finds the queries at all", () => {
    // A test that scans source is worthless if the scan silently finds nothing.
    const files = sourceFiles(SRC);
    let selects = 0;
    for (let i = 0; i < files.length; i++) {
      const hits = readFileSync(files[i], "utf8").match(/\.select\(\s*"/g);
      selects += hits ? hits.length : 0;
    }
    expect(files.length).toBeGreaterThan(100);
    expect(selects).toBeGreaterThan(50);
  });

  it("names no column the database does not have", () => {
    const problems = collectProblems();
    const lines: string[] = [];
    for (let i = 0; i < problems.length; i++) {
      const p = problems[i];
      lines.push(`  ${p.file}\n    ${p.table}.${p.column}   in: .select("${p.select}")`);
    }
    expect(problems, problems.length ? `\n${lines.join("\n")}\n` : "").toEqual([]);
  });
});

describe("every .from() names something that exists", () => {
  it("names a real table or a real bucket", () => {
    // Catches both halves of the same mistake: a table typo, and a storage
    // bucket the code writes to that was never created. The second is not
    // hypothetical either — `trip-covers` reached production and made every
    // cover-photo upload fail with "Upload failed — please try again."
    const seen: { [name: string]: string } = {};
    const files = sourceFiles(SRC);
    for (let f = 0; f < files.length; f++) {
      const froms = fromsIn(readFileSync(files[f], "utf8"));
      for (let i = 0; i < froms.length; i++) {
        if (!seen[froms[i].table]) seen[froms[i].table] = rel(files[f]);
      }
    }
    const unknown: string[] = [];
    const lines: string[] = [];
    const names = Object.keys(seen);
    for (let i = 0; i < names.length; i++) {
      if (!SCHEMA[names[i]] && !BUCKETS.has(names[i])) {
        unknown.push(names[i]);
        lines.push(`  "${names[i]}" in ${seen[names[i]]}`);
      }
    }
    expect(unknown, unknown.length ? `\n${lines.join("\n")}\n` : "").toEqual([]);
  });
});
