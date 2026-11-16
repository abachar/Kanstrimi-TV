import type { Kind } from "@/db";
import { queryFieldsOf, queryNameIn, type QueryField, type QueryHome } from "@/catalog";
import { Icon } from "../icons";

/**
 * The filter language at a glance, under a search box or a filter's query: the syntax with examples of
 * this kind, then its words. Folded: it is there for the day one forgets. The words come from the
 * registry (`catalog/query/fields.ts`): a screen of the catalogue shows those of our entry alone, the
 * streams' screen theirs first, a filter both under their prefixes and without those only searches may
 * use.
 */
/** How a word is written here: `c` one of the catalogue's, `x` one of a stream's. */
type Names = { c: (name: string) => string; x: (name: string) => string };
const SYNTAX: Record<Kind, (n: Names) => [string, string][]> = {
  vod: ({ c, x }) => [
    ["seigneur des anneaux", "texte libre : le titre contient « seigneur des anneaux »"],
    [`${c("genre")}:anim`, "contient"],
    [`${c("genre")}:"animation"`, "égal"],
    [`${c("genre")}:anim,"drame"`, "l'un de (chacun contient, ou égal entre guillemets)"],
    [`${c("langue")}:japonais`, "codes de langue et de pays : par code ou par nom, toujours égal"],
    [`${c("saga")}:aucun`, "aucun : le champ n'a pas de valeur"],
    [`${c("année")}:<1980`, "comparaison : < <= > >= ="],
    [`${c("note")}:6..8`, "intervalle"],
    [`${c("titre")}:/^the /`, "expression régulière"],
    [`-${c("tmdb")}:oui`, "le « - » nie un terme"],
    [`${c("genre")}:anim && ${c("langue")}:ja`, "&& veut dire « et » ; un espace seul entre deux termes est une erreur"],
    [`${c("genre")}:horreur || ${c("genre")}:thriller`, "|| veut dire « ou », plus faible que « et »"],
    [`(${c("genre")}:anim || ${c("langue")}:ja) && ${c("note")}:>7`, "les parenthèses groupent ; -( … ) nie un groupe"],
    [`${x("langue")}:"vf"`, "mot d'un flux"],
  ],
  series: ({ c, x }) => [
    ["casa de papel", "texte libre : le titre contient « casa de papel »"],
    [`${c("genre")}:com`, "contient"],
    [`${c("genre")}:"comédie"`, "égal"],
    [`${c("genre")}:com,"drame"`, "l'un de (chacun contient, ou égal entre guillemets)"],
    [`${c("langue")}:coréen`, "codes de langue et de pays : par code ou par nom, toujours égal"],
    [`${c("note")}:aucun`, "aucun : le champ n'a pas de valeur"],
    [`${c("année")}:<1990`, "comparaison : < <= > >= ="],
    [`${c("note")}:7..9`, "intervalle"],
    [`${c("titre")}:/ \\d$/`, "expression régulière"],
    [`-${c("tmdb")}:oui`, "le « - » nie un terme"],
    [`${c("genre")}:animation && ${c("langue")}:japonais`, "&& veut dire « et » ; un espace seul entre deux termes est une erreur"],
    [`${c("genre")}:drame || ${c("genre")}:crime`, "|| veut dire « ou », plus faible que « et »"],
    [`(${c("langue")}:coréen || ${c("langue")}:ja) && ${c("note")}:>8`, "les parenthèses groupent ; -( … ) nie un groupe"],
    [`${x("langue")}:"vf"`, "mot d'un flux"],
  ],
  live: ({ c, x }) => [
    ["tf1", "texte libre : le nom contient « tf1 »"],
    [`${c("thème")}:spo`, "contient"],
    [`${c("thème")}:"sport"`, "égal"],
    [`${c("thème")}:spo,"infos"`, "l'un de (chacun contient, ou égal entre guillemets)"],
    [`${c("pays")}:maroc`, "codes de pays : par code ou par nom, toujours égal"],
    [`${c("pays")}:aucun`, "aucun : le champ n'a pas de valeur"],
    [`${x("qualité")}:>=fhd`, "comparaison : < <= > >= ="],
    [`${x("qualité")}:hd..fhd`, "intervalle"],
    [`${c("titre")}:/\\bsport \\d$/`, "expression régulière"],
    [`-${c("adulte")}:oui`, "le « - » nie un terme"],
    [`${c("thème")}:sport && ${c("pays")}:maroc`, "&& veut dire « et » ; un espace seul entre deux termes est une erreur"],
    [`${c("pays")}:france || ${c("pays")}:maroc`, "|| veut dire « ou », plus faible que « et »"],
    [`(${c("thème")}:sport || ${c("thème")}:infos) && ${c("pays")}:france`, "les parenthèses groupent ; -( … ) nie un groupe"],
    [`${x("catégorie")}:radios`, "mot d'un flux"],
  ],
};
const PLACEHOLDER: Record<Kind, string> = {
  vod: "Rechercher : matrix, genre:animation, année:>=2020…",
  series: "Rechercher : friends, genre:comédie, langue:japonais…",
  live: "Rechercher : tf1, thème:sport, pays:maroc…",
};

const STREAMS_PLACEHOLDER: Record<Kind, string> = {
  vod: 'Rechercher : matrix, langue:"vostfr", qualité:4k, catalogue.tmdb:non…',
  series: "Rechercher : friends, fournisseur:backup, catalogue.tmdb:non…",
  live: 'Rechercher : bein, catégorie:sport, catalogue.thème:"non reconnus"…',
};

const FieldList = ({ fields, home }: { fields: QueryField[]; home: QueryHome }) => (
  <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
    {fields.map((f) => (
      <>
        <dt>
          <code class="font-mono text-xs">{queryNameIn(f, home)}</code>
        </dt>
        <dd class="text-muted-foreground">
          {f.doc}
          {f.type === "number" || f.type === "quality" ? " · nombre" : ""} ·{" "}
          <code class="font-mono text-xs">
            {queryNameIn(f, home)}:{f.example}
          </code>
        </dd>
      </>
    ))}
  </dl>
);

/** Where a query is written: a screen of the catalogue, the streams' one, or a profile's filter. */
export type QueryPlace = "catalogue" | "streams" | "filter";
const HOMES: Record<QueryPlace, QueryHome> = { catalogue: "catalogue", streams: "xtream", filter: null };

/** A filter: every word under its prefix, and those only searches may use left out. The streams: their words without prefix. */
export function QueryHelp({ kind, place = "catalogue" }: { kind: Kind; place?: QueryPlace }) {
  const filter = place === "filter";
  const fields = queryFieldsOf(kind).filter((f) => !filter || !f.searchOnly);
  const home = HOMES[place];
  const names: Names = {
    c: (name) => (home === "catalogue" ? name : `catalogue.${name}`),
    x: (name) => (home === "xtream" ? name : `xtream.${name}`),
  };
  // The screens of the catalogue know no stream word: their examples go too.
  const syntax = SYNTAX[kind](names).filter(([ex]) => place !== "catalogue" || !ex.includes("xtream."));
  // Free text reads the provider's name there, not the entry's title.
  if (place === "streams") syntax[0] = ["canal+ sport", "texte libre : le nom chez le fournisseur contient « canal+ sport »"];
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
            {syntax.map(([ex, what]) => (
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
          {place === "catalogue" ? (
            <>
              <h3 class="font-semibold">Mots de la fiche</h3>
              <FieldList fields={fields.filter((f) => f.scope === "catalogue")} home={home} />
              <p class="text-muted-foreground">
                Ce que disent les fournisseurs (nom, catégorie, langue, qualité) se cherche dans l'écran{" "}
                <a class="underline underline-offset-4 hover:text-foreground" href="/admin/streams">
                  Flux
                </a>
                .
              </p>
            </>
          ) : place === "streams" ? (
            <>
              <h3 class="font-semibold">Mots du flux</h3>
              <FieldList fields={fields.filter((f) => f.scope === "xtream")} home={home} />
              <h3 class="mt-2 font-semibold">Mots de sa fiche : catalogue.</h3>
              <p class="text-muted-foreground">La fiche est le film, la série ou la chaîne où le flux est rangé.</p>
              <FieldList fields={fields.filter((f) => f.scope === "catalogue")} home={home} />
            </>
          ) : (
            <>
              <h3 class="font-semibold">Mots de la fiche : catalogue.</h3>
              <FieldList fields={fields.filter((f) => f.scope === "catalogue")} home={home} />
              <h3 class="mt-2 font-semibold">Mots d'un flux : xtream.</h3>
              <p class="text-muted-foreground">
                Un filtre se juge flux par flux, ses mots de fiche lus sur la fiche du flux : il garde les flux qui correspondent.
              </p>
              <FieldList fields={fields.filter((f) => f.scope === "xtream")} home={home} />
            </>
          )}
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
 * A search in the filter language, wherever it filters a list of a kind: the box, its help, and what
 * is wrong with the query when it cannot run. `hidden` keeps the page's other parameters.
 */
export function QuerySearchBar({
  kind,
  action,
  hidden = {},
  q,
  error,
  place = "catalogue",
}: {
  kind: Kind;
  action: string;
  hidden?: Record<string, string>;
  q: string;
  error?: string | null;
  place?: QueryPlace;
}) {
  return (
    <div class="flex flex-col gap-2">
      <form method="get" action={action} class="flex gap-2" role="search">
        {Object.entries(hidden).map(([name, value]) => (
          <input type="hidden" name={name} value={value} />
        ))}
        <input
          class="input"
          type="search"
          name="q"
          value={q}
          placeholder={place === "streams" ? STREAMS_PLACEHOLDER[kind] : PLACEHOLDER[kind]}
          aria-label="Rechercher"
          enterkeyhint="search"
        />
        <button class="btn" data-variant="secondary">
          <Icon name="search" />
          Rechercher
        </button>
      </form>
      <QueryHelp kind={kind} place={place} />
      {error && <QueryErrorLine error={error} />}
    </div>
  );
}

/** The search of the Live, Films and Séries screens: the contents of the kind. */
export const SearchBar = ({ kind, q, error }: { kind: Kind; q: string; error?: string | null }) => (
  <QuerySearchBar kind={kind} action="/admin/catalog" hidden={{ kind }} q={q} error={error} />
);
