#!/bin/zsh
# usage: shot.sh <écran> <tvos|iphone> [horodatage]
# Capture un écran de l'app (client de démo) dans apple/ui-review/<écran>/<horodatage>-<cible>.png (hors git).
# L'app Debug doit être installée sur le simulateur (shot-all.sh la compile et l'installe).
# Simulateurs : TVOS_UDID / IPHONE_UDID pour changer ; WAIT=<s> pour attendre plus longtemps.
set -e
cd "${0:A:h}"
B=dev.crafters.kanstrimi
SCREENS=(Appairage Accueil Direct Films Series Recherche Reglages Fiche-film Fiche-serie Fiche-sans-TMDB
         Lecteur-pause Lecteur-chargement Lecteur-echec Lecteur-episode-suivant Lecteur-direct)

screen=$1; target=$2; stamp=${3:-$(date +%Y-%m-%d_%H-%M-%S)}
if [[ -z $screen || -z $target ]] || (( ! ${SCREENS[(Ie)$screen]} )); then
  echo "usage: shot.sh <écran> <tvos|iphone>"; echo "écrans : ${SCREENS[*]}"; exit 1
fi
case $target in
  tvos)   UDID=${TVOS_UDID:-6F40AAF4-FF49-4B23-BB36-642EF4FB6AB6} ;;
  iphone) UDID=${IPHONE_UDID:-9E91C633-731D-4100-AFCA-268F5C1C47B0} ;;
  *) echo "cible inconnue : $target (tvos|iphone)"; exit 1 ;;
esac

# Réglages de lancement (clés debug.* lues par RootView.debugHooks, Debug seulement)
typeset -A kv
case $screen in
  Appairage)               kv=(debug.unpair YES) ;;
  Accueil)                 kv=(debug.tab home) ;;
  Direct)                  kv=(debug.tab live) ;;
  Films)                   kv=(debug.tab movies) ;;
  Series)                  kv=(debug.tab series) ;;
  Recherche)               kv=(debug.tab search) ;;
  Reglages)                kv=(debug.tab settings) ;;
  Fiche-film)              kv=(debug.open tmdb:movie:535544) ;;
  Fiche-serie)             kv=(debug.open tmdb:tv:300388) ;;
  Fiche-sans-TMDB)         kv=(debug.open fallback:movie:avant-charlie-brown-il-y-avait-schulz:-) ;;
  Lecteur-pause)           kv=(debug.autoplay tmdb:movie:535544 debug.playerState vodPaused) ;;
  Lecteur-chargement)      kv=(debug.autoplay tmdb:movie:535544 debug.playerState opening) ;;
  Lecteur-echec)           kv=(debug.autoplay tmdb:movie:535544 debug.playerState failure) ;;
  Lecteur-episode-suivant) kv=(debug.autoplay tmdb:tv:300388:s01e01 debug.playerState nextEpisode) ;;
  Lecteur-direct)          kv=(debug.autoplay live debug.playerState livePlaying) ;;
esac
[[ $screen == Appairage ]] || kv[debug.autopair]=YES

xcrun simctl boot $UDID 2>/dev/null || true
xcrun simctl bootstatus $UDID >/dev/null
xcrun simctl get_app_container $UDID $B >/dev/null 2>&1 || { echo "app absente sur $target : lancer shot-all.sh $target"; exit 1; }
[[ $target == iphone ]] && xcrun simctl status_bar $UDID override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3

xcrun simctl terminate $UDID $B >/dev/null 2>&1 || true
for k in debug.tab debug.open debug.autoplay debug.playerState debug.resumeAt debug.unpair debug.autopair; do
  xcrun simctl spawn $UDID defaults delete $B $k >/dev/null 2>&1 || true
done
xcrun simctl spawn $UDID defaults write $B pref.useMock -bool YES
for k v in ${(kv)kv}; do
  if [[ $v == YES ]]; then xcrun simctl spawn $UDID defaults write $B $k -bool YES
  else xcrun simctl spawn $UDID defaults write $B $k "$v"; fi
done
xcrun simctl launch $UDID $B >/dev/null
sleep ${WAIT:-5}
mkdir -p ../ui-review/$screen
xcrun simctl io $UDID screenshot --type=png "../ui-review/$screen/$stamp-$target.png" >/dev/null 2>&1
echo "ok ui-review/$screen/$stamp-$target.png"
