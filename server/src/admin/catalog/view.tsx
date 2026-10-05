import type { CatalogQuery } from "./query";
import { Title } from "../ui";
import { KIND_TITLES } from "../labels";

/** The title of a kind's screen, chosen in the side menu: what the app shows, organised by our rules. */
export function CatalogShell({ qy, children }: { qy: CatalogQuery; children?: unknown }) {
  return (
    <>
      <Title t={KIND_TITLES[qy.kind]} sub="Ce que l'app affiche, organisé selon nos règles" />
      {children}
    </>
  );
}
