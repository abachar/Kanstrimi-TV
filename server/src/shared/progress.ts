/**
 * A long loop's heartbeat: every `everyMs`, one console line saying how far it is, how fast it
 * goes and how long is left. Without it a step can stay silent for minutes in its run log.
 */
export function progress(label: string, total: number, detail: () => string, everyMs = 30_000) {
  const started = Date.now();
  let done = 0;
  const n = (x: number) => x.toLocaleString("fr-FR");
  const timer = setInterval(() => {
    const seconds = (Date.now() - started) / 1000;
    const rate = done / seconds;
    const left = rate > 0 ? Math.round((total - done) / rate) : null;
    const eta = left === null ? "" : left < 90 ? ` · reste ~${left} s` : ` · reste ~${Math.round(left / 60)} min`;
    console.log(`[${label}] ${n(done)} / ${n(total)} · ${detail()} · ${rate.toFixed(1)}/s${eta}`);
  }, everyMs);
  timer.unref();
  return {
    tick: (k = 1) => {
      done += k;
    },
    stop: () => clearInterval(timer),
  };
}
