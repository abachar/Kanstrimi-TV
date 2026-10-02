import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { format } from "node:util";
import { env, redactText } from "@/shared";

/**
 * The detail of a run, in a text file of DATA_DIR/logs: everything the steps print on the
 * console while the run lasts, stamped and redacted, plus the pipeline's own notes. A file,
 * not a table: it is written even when the database is the thing that fails.
 */
export const logDir = () => path.join(env.dataDir, "logs");

type Sink = { stream: fs.WriteStream; step: string | null };
const current = new AsyncLocalStorage<Sink>();

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;

function write(sink: Sink, level: string, text: string) {
  // "[enrich] …" printed inside the enrich step: the tag is already there.
  if (sink.step && text.startsWith(`[${sink.step}] `)) text = text.slice(sink.step.length + 3);
  const prefix = `${stamp(new Date())} ${level.padEnd(5)} ${sink.step ? `[${sink.step}] ` : ""}`;
  sink.stream.write(
    `${redactText(text)
      .split("\n")
      .map((l) => prefix + l)
      .join("\n")}\n`,
  );
}

let teed = false;
/** Once per process: console.* keeps printing to journald and, inside a run, also to its file. */
function teeConsole() {
  if (teed) return;
  teed = true;
  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      const sink = current.getStore();
      if (sink) write(sink, level === "log" ? "info" : level, format(...args));
    };
  }
}

/** `2026-09-29T0600_pipeline_42.log`: sorted by date in a listing, unique by run id. */
export function logFileName(task: string, runId: number, at = new Date()) {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}${pad(at.getMinutes())}_${task}_${runId}.log`;
}

/** Runs `fn` with everything it prints copied into the file; the file is closed after. */
export async function withRunLog<T>(file: string, fn: () => Promise<T>): Promise<T> {
  teeConsole();
  fs.mkdirSync(logDir(), { recursive: true });
  const stream = fs.createWriteStream(path.join(logDir(), file), { flags: "a" });
  stream.on("error", (e) => console.error(`[journal] ${file} :`, e.message));
  try {
    return await current.run({ stream, step: null }, fn);
  } finally {
    await new Promise<void>((resolve) => stream.end(resolve));
  }
}

/** Tags the lines `fn` prints with the step's name. */
export function withStep<T>(step: string, fn: () => Promise<T>): Promise<T> {
  const sink = current.getStore();
  return sink ? current.run({ stream: sink.stream, step }, fn) : fn();
}

/** A line for the file only, not for journald: the pipeline's own account of the run. */
export function note(text: string) {
  const sink = current.getStore();
  if (sink) write(sink, "info", text);
}

const SAFE_NAME = /^[\w.-]+\.log$/;
/** Up to the last `maxBytes` of a run's file; null when it is gone (purged, another disk). */
export function readRunLog(file: string, maxBytes = 1_000_000): { text: string; truncated: boolean; size: number } | null {
  if (!SAFE_NAME.test(file)) return null;
  const full = path.join(logDir(), file);
  let fd: number;
  try {
    fd = fs.openSync(full, "r");
  } catch {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString("utf8");
    // A cut in the middle of a line: drop the partial first line.
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    return { text, truncated: start > 0, size };
  } finally {
    fs.closeSync(fd);
  }
}

export function runLogPath(file: string): string | null {
  return SAFE_NAME.test(file) ? path.join(logDir(), file) : null;
}

/** Deletes the files older than `days`; the database rows go with `purgeRuns`. */
export function purgeRunLogs(days: number): number {
  const limit = Date.now() - days * 86_400_000;
  let n = 0;
  let names: string[];
  try {
    names = fs.readdirSync(logDir());
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!SAFE_NAME.test(name)) continue;
    const full = path.join(logDir(), name);
    try {
      if (fs.statSync(full).mtimeMs < limit) {
        fs.unlinkSync(full);
        n++;
      }
    } catch {
      /* gone meanwhile */
    }
  }
  return n;
}
