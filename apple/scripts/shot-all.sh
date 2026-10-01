#!/bin/zsh
# usage: shot-all.sh <tvos|iphone>
# Compile l'app en Debug, l'installe sur le simulateur puis capture tous les écrans de shot.sh
# avec le même horodatage. NOBUILD=1 pour réutiliser l'app déjà installée.
set -e
cd "${0:A:h}"
target=$1
case $target in
  tvos)   UDID=${TVOS_UDID:-6F40AAF4-FF49-4B23-BB36-642EF4FB6AB6}; SDK=appletvsimulator ;;
  iphone) UDID=${IPHONE_UDID:-9E91C633-731D-4100-AFCA-268F5C1C47B0}; SDK=iphonesimulator ;;
  *) echo "usage: shot-all.sh <tvos|iphone>"; exit 1 ;;
esac

if [[ -z $NOBUILD ]]; then
  DD=${TMPDIR:-/tmp}/kanstrimi-ui-review-dd
  xcrun simctl boot $UDID 2>/dev/null || true
  echo "compilation $target…"
  xcodebuild -project ../kanstrimi.xcodeproj -scheme kanstrimi -configuration Debug \
    -destination "platform=${${SDK/appletvsimulator/tvOS}/iphonesimulator/iOS} Simulator,id=$UDID" \
    -derivedDataPath $DD build -quiet
  xcrun simctl install $UDID $DD/Build/Products/Debug-$SDK/kanstrimi.app
fi

stamp=$(date +%Y-%m-%d_%H-%M-%S)
for s in Appairage Accueil Direct Films Series Recherche Recherche-resultats Reglages Fiche-film Fiche-serie Fiche-sans-TMDB \
         Lecteur-pause Lecteur-chargement Lecteur-echec Lecteur-episode-suivant Lecteur-direct; do
  ./shot.sh $s $target $stamp
done
