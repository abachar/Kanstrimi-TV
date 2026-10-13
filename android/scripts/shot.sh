#!/bin/zsh
# usage: shot.sh <écran> [horodatage]
# Capture un écran de l'app (client de démonstration) sur l'émulateur « Tablet » dans android/ui-review/<écran>/<horodatage>.png
# (hors git). L'app Debug doit être installée (shot-all.sh la compile et l'installe). L'émulateur démarre s'il ne tourne pas.
# WAIT=<s> pour attendre plus longtemps avant la capture.
set -e
cd "${0:A:h}"
SDK=${ANDROID_HOME:-$HOME/Library/Android/sdk}
ADB=$SDK/platform-tools/adb
APP=dev.crafters.kanstrimi
SCREENS=(Appairage Qui-regarde Profil Accueil Direct Films Series Recherche Recherche-resultats Fiche-film Fiche-serie Reglages Lecteur-pause Lecteur-chargement Lecteur-echec Lecteur-episode-suivant Lecteur-passer-intro Lecteur-direct)
screen=$1; stamp=${2:-$(date +%Y-%m-%d_%H-%M-%S)}
if [[ -z $screen ]] || (( ! ${SCREENS[(Ie)$screen]} )); then echo "usage: shot.sh <écran>"; echo "écrans : ${SCREENS[*]}"; exit 1; fi

if ! $ADB get-state >/dev/null 2>&1; then
  echo "démarrage de l'émulateur Tablet…"
  nohup $SDK/emulator/emulator -avd Tablet -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect >/tmp/kanstrimi-emulator.log 2>&1 &
  $ADB wait-for-device
  until [[ $($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r') == 1 ]]; do sleep 2; done
fi

# Extras read by MainActivity.debugHooks (Debug seulement) : le client de démo, appairé d'office, l'onglet demandé,
# une fiche poussée (debug.open), la requête de la recherche (debug.search).
typeset -a extras
extras=(--ez debug.mock true)
case $screen in
  Appairage) extras+=(--ez debug.unpair true) ;;
  Qui-regarde) extras+=(--ez debug.autopair true --ez debug.chooseProfile true) ;;
  Profil)    extras+=(--ez debug.autopair true --es debug.tab profile) ;;
  Accueil)   extras+=(--ez debug.autopair true --es debug.tab home) ;;
  Direct)    extras+=(--ez debug.autopair true --es debug.tab live) ;;
  Films)     extras+=(--ez debug.autopair true --es debug.tab movies) ;;
  Series)    extras+=(--ez debug.autopair true --es debug.tab series) ;;
  Recherche) extras+=(--ez debug.autopair true --es debug.tab search) ;;
  Recherche-resultats) extras+=(--ez debug.autopair true --es debug.tab search --es debug.search le) ;;
  Fiche-film)  extras+=(--ez debug.autopair true --es debug.tab movies --es debug.open tmdb:movie:535544) ;;
  Fiche-serie) extras+=(--ez debug.autopair true --es debug.tab series --es debug.open tmdb:tv:300388) ;;
  Reglages)  extras+=(--ez debug.autopair true --es debug.tab settings) ;;
  # Le lecteur mis en scène sans flux (debug.play + debug.playerState) : un film de la démo, ou un épisode pour la suite.
  Lecteur-pause)            extras+=(--ez debug.autopair true --es debug.play tmdb:movie:603 --es debug.playerState vodPaused) ;;
  Lecteur-chargement)       extras+=(--ez debug.autopair true --es debug.play tmdb:movie:603 --es debug.playerState opening) ;;
  Lecteur-echec)            extras+=(--ez debug.autopair true --es debug.play tmdb:movie:603 --es debug.playerState failure) ;;
  Lecteur-episode-suivant)  extras+=(--ez debug.autopair true --es debug.play tmdb:tv:1396:s01e01 --es debug.playerState nextEpisode) ;;
  Lecteur-passer-intro)     extras+=(--ez debug.autopair true --es debug.play tmdb:tv:1396:s01e01 --es debug.playerState skipIntro) ;;
  Lecteur-direct)           extras+=(--ez debug.autopair true --es debug.play live --es debug.playerState livePlaying) ;;
esac
# A start right after an install sometimes reaches the instance being stopped: give the stop a moment.
$ADB shell am force-stop $APP; sleep 1
$ADB shell am start -n $APP/.app.MainActivity ${extras[@]} >/dev/null
# The live player hides its controls after 4 s of playback: captured before, like a finger just lifted.
[[ $screen == Lecteur-direct ]] && : ${WAIT:=3}
sleep ${WAIT:-5}
mkdir -p ../ui-review/$screen
$ADB exec-out screencap -p > "../ui-review/$screen/$stamp.png"
echo "ok ui-review/$screen/$stamp.png"
