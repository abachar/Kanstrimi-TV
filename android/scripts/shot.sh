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
SCREENS=(Appairage Accueil Direct Films Series Recherche Recherche-resultats Fiche-film Fiche-serie Reglages)
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
  Accueil)   extras+=(--ez debug.autopair true --es debug.tab home) ;;
  Direct)    extras+=(--ez debug.autopair true --es debug.tab live) ;;
  Films)     extras+=(--ez debug.autopair true --es debug.tab movies) ;;
  Series)    extras+=(--ez debug.autopair true --es debug.tab series) ;;
  Recherche) extras+=(--ez debug.autopair true --es debug.tab search) ;;
  Recherche-resultats) extras+=(--ez debug.autopair true --es debug.tab search --es debug.search le) ;;
  Fiche-film)  extras+=(--ez debug.autopair true --es debug.tab movies --es debug.open tmdb:movie:535544) ;;
  Fiche-serie) extras+=(--ez debug.autopair true --es debug.tab series --es debug.open tmdb:tv:300388) ;;
  Reglages)  extras+=(--ez debug.autopair true --es debug.tab settings) ;;
esac
# A start right after an install sometimes reaches the instance being stopped: give the stop a moment.
$ADB shell am force-stop $APP; sleep 1
$ADB shell am start -n $APP/.app.MainActivity ${extras[@]} >/dev/null
sleep ${WAIT:-5}
mkdir -p ../ui-review/$screen
$ADB exec-out screencap -p > "../ui-review/$screen/$stamp.png"
echo "ok ui-review/$screen/$stamp.png"
