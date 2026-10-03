/** `src-i…` = an item (movie or channel), `src-e…` = an episode source; base36 of our own ids. */
export const sourceId = (kind: "item" | "episode", id: number) => `src-${kind === "item" ? "i" : "e"}${id.toString(36)}`;
