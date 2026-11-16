import type { CatalogQuery } from "./query";
import { Title } from "../ui";
import { KIND_TITLES } from "../labels";

/** The title of a kind's screen, chosen in the side menu: what the app shows, organised by our rules. */
export function CatalogShell({ qy, children }: { qy: CatalogQuery; children?: unknown }) {
  return (
    <>
      <Title
        t={KIND_TITLES[qy.kind]}
        sub={
          qy.kind === "live"
            ? "Toutes les chaînes par marché et par thème ; la recherche et ses raccourcis choisissent ce que l'arbre montre"
            : "Ce que l'app affiche, organisé selon nos règles"
        }
      />
      {children}
    </>
  );
}
