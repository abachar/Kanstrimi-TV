import type { Kind } from "@/db";
import type { CatalogView } from "./query";
import { QUERY_FIELDS } from "@/catalog";

/**
 * The filter language at a glance, under a search box: the syntax with examples of this kind, then
 * its fields with an example each. Folded: it is there for the day one forgets.
 */
const SYNTAX: Record<Kind, [string, string][]> = {
  vod: [
    ["matrix", "texte libre : le titre contient « matrix »"],
    ["genre:anim", "contient"],
    ['genre:"animation"', "égal"],
    ['genre:anim,"drame"', "l'un de (chacun contient, ou égal entre guillemets)"],
    ["langue-vo:japonais", "codes de langue et de pays : par code ou par nom, toujours égal"],
    ["année:<1980", "comparaison : < <= > >= ="],
    ["note:6..8", "intervalle"],
    ["nom:/\\|FR\\|/", "expression régulière"],
    ["-tmdb:oui", "le « - » nie un terme"],
    ["genre:anim langue-vo:ja", "l'espace veut dire « et »"],
  ],
  series: [
    ["friends", "texte libre : le titre contient « friends »"],
    ["genre:com", "contient"],
    ['genre:"comédie"', "égal"],
    ['genre:com,"drame"', "l'un de (chacun contient, ou égal entre guillemets)"],
    ["langue-vo:coréen", "codes de langue et de pays : par code ou par nom, toujours égal"],
    ["année:<1990", "comparaison : < <= > >= ="],
    ["note:7..9", "intervalle"],
    ["nom:/\\|FR\\|/", "expression régulière"],
    ["-tmdb:oui", "le « - » nie un terme"],
    ["genre:animation langue-vo:japonais", "l'espace veut dire « et »"],
  ],
  live: [
    ["tf1", "texte libre : le nom contient « tf1 »"],
    ["thème:spo", "contient"],
    ['thème:"sport"', "égal"],
    ['thème:spo,"infos"', "l'un de (chacun contient, ou égal entre guillemets)"],
    ["pays:maroc", "codes de pays : par code ou par nom, toujours égal"],
    ["qualité:>=fhd", "comparaison : < <= > >= ="],
    ["qualité:hd..fhd", "intervalle"],
    ["nom:/\\|FR\\|/", "expression régulière"],
    ["-adulte:oui", "le « - » nie un terme"],
    ["thème:sport pays:maroc", "l'espace veut dire « et »"],
  ],
};
const PLACEHOLDER: Record<Kind, string> = {
  vod: "Rechercher : matrix, genre:animation, qualité:>=fhd…",
  series: "Rechercher : friends, genre:comédie, langue-vo:japonais…",
  live: "Rechercher : tf1, thème:sport, pays:maroc…",
};

function QueryHelp({ kind }: { kind: Kind }) {
  const fields = QUERY_FIELDS.filter((f) => !f.kinds || f.kinds.includes(kind));
  return (
    <details class="group text-sm">
      <summary class="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
        <span class="group-open:hidden">Aide de la recherche</span>
        <span class="hidden group-open:inline">Masquer l'aide</span>
      </summary>
      <div class="mt-3 grid gap-6 rounded-xl border p-4 lg:grid-cols-2">
        <section class="flex flex-col gap-2">
          <h3 class="font-semibold">Syntaxe</h3>
          <p class="text-muted-foreground">La casse et les accents ne comptent jamais.</p>
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            {SYNTAX[kind].map(([ex, what]) => (
              <>
                <dt>
                  <code class="font-mono text-xs">{ex}</code>
                </dt>
                <dd class="text-muted-foreground">{what}</dd>
              </>
            ))}
          </dl>
        </section>
        <section class="flex flex-col gap-2">
          <h3 class="font-semibold">Champs</h3>
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            {fields.map((f) => (
              <>
                <dt>
                  <code class="font-mono text-xs">{f.names[0]}</code>
                </dt>
                <dd class="text-muted-foreground">
                  {f.doc}
                  {f.type === "number" || f.type === "quality" ? " · nombre" : ""} ·{" "}
                  <code class="font-mono text-xs">{typeof f.example === "string" ? f.example : f.example[kind]}</code>
                </dd>
              </>
            ))}
          </dl>
        </section>
      </div>
    </details>
  );
}

/** The sentence a wrong query gets, where the results would be. */
const QueryErrorLine = ({ error }: { error: string }) => (
  <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
    {error}
  </p>
);

/**
 * The search of the Live, Films and Séries screens, the same in both views: the filter language, its
 * help, and what is wrong with the query when it cannot run. `view` keeps the search in its view.
 */
export function SearchBar({ kind, view, q, error }: { kind: Kind; view: CatalogView; q: string; error?: string | null }) {
  return (
    <div class="flex flex-col gap-2">
      <form method="get" action="/admin/catalog" class="flex gap-2" role="search">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="view" value={view} />
        <input
          class="input"
          type="search"
          name="q"
          value={q}
          placeholder={PLACEHOLDER[kind]}
          aria-label="Rechercher"
          enterkeyhint="search"
        />
        <button class="btn" data-variant="secondary">
          Rechercher
        </button>
      </form>
      <QueryHelp kind={kind} />
      {error && <QueryErrorLine error={error} />}
    </div>
  );
}
