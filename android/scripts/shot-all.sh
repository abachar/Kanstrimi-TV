#!/bin/zsh
# usage: shot-all.sh
# Compile l'app en Debug, l'installe sur l'émulateur « Tablet » puis capture tous les écrans de shot.sh avec le même
# horodatage. NOBUILD=1 pour réutiliser l'app déjà installée.
set -e
cd "${0:A:h}"
SDK=${ANDROID_HOME:-$HOME/Library/Android/sdk}
ADB=$SDK/platform-tools/adb
if [[ -z $NOBUILD ]]; then
  echo "compilation…"
  (cd .. && ./gradlew assembleDebug -q)
fi
# shot.sh démarre l'émulateur ; l'installation attend qu'il réponde.
if ! $ADB get-state >/dev/null 2>&1; then
  nohup $SDK/emulator/emulator -avd Tablet -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect >/tmp/kanstrimi-emulator.log 2>&1 &
  $ADB wait-for-device
  until [[ $($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r') == 1 ]]; do sleep 2; done
fi
$ADB install -r ../app/build/outputs/apk/debug/app-debug.apk >/dev/null
stamp=$(date +%Y-%m-%d_%H-%M-%S)
for s in Appairage Qui-regarde Profil Accueil Direct Films Series Recherche Recherche-resultats Fiche-film Fiche-serie Reglages Lecteur-pause Lecteur-chargement Lecteur-echec Lecteur-episode-suivant Lecteur-passer-intro Lecteur-direct; do ./shot.sh $s $stamp; done
