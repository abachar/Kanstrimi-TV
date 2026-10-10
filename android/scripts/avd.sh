#!/bin/zsh
# usage: avd.sh
# Crée (ou recrée) l'émulateur « Tablet » : 2 560 × 1 600 à 280 dpi, paysage, l'image système Android 37 déjà installée,
# à l'échelle de la Galaxy Tab S9. Android Studio n'a pas de cmdline-tools ici : l'AVD est écrit à la main.
set -e
SDK=${ANDROID_HOME:-$HOME/Library/Android/sdk}
IMAGE=$(ls -d $SDK/system-images/android-*/google_apis*/arm64-v8a | tail -1)
IMAGE_REL=${IMAGE#$SDK/}/
TARGET=$(basename $(dirname $(dirname $IMAGE)))
AVD=$HOME/.android/avd
rm -rf $AVD/Tablet.avd $AVD/Tablet.ini
mkdir -p $AVD/Tablet.avd
cat > $AVD/Tablet.ini <<INI
avd.ini.encoding=UTF-8
path=$AVD/Tablet.avd
path.rel=avd/Tablet.avd
target=$TARGET
INI
cat > $AVD/Tablet.avd/config.ini <<INI
AvdId=Tablet
PlayStore.enabled=false
abi.type=arm64-v8a
avd.ini.displayname=Tablet
avd.ini.encoding=UTF-8
disk.dataPartition.size=6G
fastboot.forceFastBoot=yes
hw.accelerometer=yes
hw.audioInput=no
hw.battery=yes
hw.camera.back=none
hw.camera.front=none
hw.cpu.arch=arm64
hw.cpu.ncore=4
hw.dPad=no
hw.device.manufacturer=Generic
hw.device.name=Tablet
hw.gps=no
hw.gpu.enabled=yes
hw.gpu.mode=auto
hw.gyroscope=yes
hw.initialOrientation=landscape
hw.keyboard=yes
hw.lcd.density=280
hw.lcd.height=1600
hw.lcd.width=2560
hw.mainKeys=no
hw.ramSize=4096
hw.sdCard=no
hw.sensors.orientation=yes
hw.trackBall=no
image.sysdir.1=$IMAGE_REL
runtime.network.latency=none
runtime.network.speed=full
showDeviceFrame=no
skin.dynamic=yes
skin.name=2560x1600
skin.path=_no_skin
tag.display=$(basename $(dirname $IMAGE))
tag.id=$(basename $(dirname $IMAGE))
target=$TARGET
vm.heapSize=512
INI
echo "AVD Tablet créé ($TARGET, $IMAGE_REL)"
