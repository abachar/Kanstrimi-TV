#!/usr/bin/env bash
# usage: tmdb-cache-clean.sh [--fix]
#
# Trouve les documents illisibles de tmdb_cache.data (jsonb abîmé : « unknown type of jsonb container »,
# ou Postgres qui tombe en segfault en le lisant) et, avec --fix, les vide pour qu'enrich les relise :
# data = '{}', fetched_at = 'epoch' (la ligne reste, le groupement garde sa fiche ; les plus anciennes
# sont relues en premier). Ensuite : Tâches → lancer à partir de « enrich ».
#
# Sans --fix, ne fait que lister. Lit par tranches de 1 000 ; une tranche qui fait tomber Postgres est
# relue id par id, en attendant son retour après chaque chute (quelques secondes, l'app coupée d'autant).
#
# Sur Harbor, en apps : ./tmdb-cache-clean.sh
# Ailleurs : PSQL="psql postgres://…/kanstrimi" ./tmdb-cache-clean.sh
set -uo pipefail

PSQL=${PSQL:-podman exec postgres psql -U postgres -d kanstrimi_db}
CHUNK=${CHUNK:-1000}
fix=false
[[ ${1:-} == --fix ]] && fix=true

q() { $PSQL -Atc "$1" 2>&1; }
up() { [[ $(q "select 1") == 1 ]]; }
wait_pg() { until up; do sleep 1; done; }
crashed() { grep -qiE "server closed|terminat|recovery mode|not yet accepting|connection.*lost|could not connect" <<<"$1"; }

wait_pg
max=$(q "select coalesce(max(id), 0) from tmdb_cache")
echo "tmdb_cache : ids 1 à $max, par tranches de $CHUNK" >&2
bad=()
for ((a = 1; a <= max; a += CHUNK)); do
  b=$((a + CHUNK - 1))
  out=$(q "do \$\$ declare r record; n int; begin
    for r in select id from tmdb_cache where id between $a and $b loop
      begin select length(data::text) into n from tmdb_cache where id = r.id;
      exception when others then raise notice 'BAD %', r.id; end;
    end loop; end \$\$")
  if crashed "$out"; then
    echo "  $a-$b : Postgres est tombé, relecture id par id" >&2
    wait_pg
    for id in $(q "select id from tmdb_cache where id between $a and $b order by id"); do
      o=$(q "select length(data::text) from tmdb_cache where id = $id")
      if ! [[ $o =~ ^[0-9]*$ ]]; then
        bad+=("$id")
        crashed "$o" && wait_pg
      fi
    done
  else
    bad+=($(grep -o 'BAD [0-9]*' <<<"$out" | cut -d' ' -f2))
  fi
done

if ((${#bad[@]} == 0)); then
  echo "Aucun document illisible."
  exit 0
fi
ids=$(IFS=,; echo "${bad[*]}")
echo "${#bad[@]} document(s) illisible(s) :"
# Columns around the broken one only: reading `data` would fail again.
$PSQL -c "select id, media_type, tmdb_id, lang, fetched_at from tmdb_cache where id in ($ids) order by id"
if $fix; then
  $PSQL -c "update tmdb_cache set data = '{}'::jsonb, fetched_at = 'epoch' where id in ($ids)"
  echo "Vidés. Reste à lancer le traitement à partir de « enrich »."
else
  echo "Rien n'est modifié : relancer avec --fix pour les vider."
fi
