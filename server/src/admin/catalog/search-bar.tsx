import type { Kind } from "@/db";
import { queryFieldsOf, type QueryField } from "@/catalog";

/**
 * The filter language at a glance, under a search box or a rule's query: the syntax with examples of
 * this kind, then its fields, those of the content then those of a version. Folded: it is there for the
 * day one forgets. The fields come from the registry (`catalog/query/fields.ts`): the searches and the
 * rules show the same ones, a rule without those only searches may use.
 */
const SYNTAX: Record<Kind, [string, string][]> = {
  vod: [
    ["matrix", "texte libre : le titre contient « matrix »"],
    ["genre:anim", "contient"],
    ['genre:"animation"', "égal"],
    ['genre:anim,"drame"', "l'un de (chacun contient, ou égal entre guillemets)"],
    ["langue:japonais", "codes de langue et de pays : par code ou par nom, toujours égal"],
    ["année:<1980", "comparaison : < <= > >= ="],
    ["note:6..8", "intervalle"],
    ["xtream.nom:/\\(4K\\)$/", "expression régulière"],
    ["-tmdb:oui", "le « - » nie un terme"],
    ["genre:anim langue:ja", "l'espace veut dire « et »"],
    ['variant.langue:"vf"', "champ de version : recherche, une de ses versions ; règle, juge les versions"],
  ],
  series: [
    ["friends", "texte libre : le titre contient « friends »"],
    ["genre:com", "contient"],
    ['genre:"comédie"', "égal"],
    ['genre:com,"drame"', "l'un de (chacun contient, ou égal entre guillemets)"],
    ["langue:coréen", "codes de langue et de pays : par code ou par nom, toujours égal"],
    ["année:<1990", "comparaison : < <= > >= ="],
    ["note:7..9", "intervalle"],
    ["xtream.nom:/\\(VOST\\)/", "expression régulière"],
    ["-tmdb:oui", "le « - » nie un terme"],
    ["genre:animation langue:japonais", "l'espace veut dire « et »"],
    ['variant.langue:"vf"', "champ de version : recherche, une de ses versions ; règle, juge les versions"],
  ],
  live: [
    ["tf1", "texte libre : le titre contient « tf1 »"],
    ["thème:spo", "contient"],
    ['thème:"sport"', "égal"],
    ['thème:spo,"infos"', "l'un de (chacun contient, ou égal entre guillemets)"],
    ["pays:maroc", "codes de pays : par code ou par nom, toujours égal"],
    ["qualité:>=fhd", "comparaison : < <= > >= ="],
    ["qualité:hd..fhd", "intervalle"],
    ["xtream.nom:/\\bHD$/", "expression régulière"],
    ["-adulte:oui", "le « - » nie un terme"],
    ["thème:sport pays:maroc", "l'espace veut dire « et »"],
    ["xtream.catégorie:radios", "champ de version : recherche, une de ses versions ; règle, juge les versions"],
  ],
};
const PLACEHOLDER: Record<Kind, string> = {
  vod: "Rechercher : matrix, genre:animation, qualité:>=fhd…",
  series: "Rechercher : friends, genre:comédie, langue:japonais…",
  live: "Rechercher : tf1, thème:sport, pays:maroc…",
};

const FieldList = ({ fields }: { fields: QueryField[] }) => (
  <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
    {fields.map((f) => (
      <>
        <dt>
          <code class="font-mono text-xs">{f.names[0]}</code>
        </dt>
        <dd class="text-muted-foreground">
          {f.doc}
          {f.type === "number" || f.type === "quality" ? " · nombre" : ""} · <code class="font-mono text-xs">{f.example}</code>
        </dd>
      </>
    ))}
  </dl>
);

/** `rule`: the fields only searches may use are left out. */
export function QueryHelp({ kind, rule = false }: { kind: Kind; rule?: boolean }) {
  const fields = queryFieldsOf(kind).filter((f) => !rule || !f.searchOnly);
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
          <h3 class="font-semibold">Champs de la fiche</h3>
          <FieldList fields={fields.filter((f) => f.level === "content")} />
          <h3 class="mt-2 font-semibold">Champs d'une version</h3>
          <p class="text-muted-foreground">
            {rule
              ? "Une règle qui en cite un masque les versions qui correspondent, dans les fiches que ses autres termes désignent."
              : "Dans une recherche : une de ses versions, les termes de version ensemble décrivant la même."}
          </p>
          <FieldList fields={fields.filter((f) => f.level === "variant")} />
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
}: {
  kind: Kind;
  action: string;
  hidden?: Record<string, string>;
  q: string;
  error?: string | null;
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

/** The search of the Live, Films and Séries screens: the contents of the kind. */
export const SearchBar = ({ kind, q, error }: { kind: Kind; q: string; error?: string | null }) => (
  <QuerySearchBar kind={kind} action="/admin/catalog" hidden={{ kind }} q={q} error={error} />
);
