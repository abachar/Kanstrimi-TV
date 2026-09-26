/**
 * Prints the parse of every "kind|name" line of a file in the corpus format, to review and
 * freeze as `src/lib/grouping/__tests__/corpus.txt`:
 *   kind ⇒ name ⇒ title | year | market | language | quality | dynamic range | tags | season
 */
import fs from "node:fs";
import { parseName, type Kind } from "@/lib/grouping/tags";
for (const line of fs.readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean)) {
  const i = line.indexOf("|");
  const kind = line.slice(0, i) as Kind, name = line.slice(i + 1);
  const p = parseName(name, kind);
  console.log([kind, name, [p.title, p.year ?? "", p.market ?? "", p.language ?? "", p.quality ?? "", p.dynamicRange ?? "", p.tags.join(","), p.seasonHint ?? ""].join(" | ")].join(" ⇒ "));
}
