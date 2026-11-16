#!/usr/bin/env bash
# Запуск Tessera Browser: bash run.sh
# Переменные окружения:
#   TB_ELECTRON=путь  свой файл electron
#   TB_SCALE=2.5     масштаб интерфейса (для экрана телефона)
#   TB_NO_GPU=1      выключить GPU-ускорение (если рисует с артефактами)
#   TB_MAXIMIZE=1    развернуть окно / TB_FULLSCREEN=1 — на весь экран
#   TB_FRAMELESS=1   окно без рамки
#   TB_DATA=путь     своя папка данных (по умолчанию ~/.config/tessera-browser)
cd "$(dirname "$0")" || exit 1
ELECTRON=""
for c in "$TB_ELECTRON" "$HOME/electron/electron" node_modules/.bin/electron /opt/tessera-browser/tessera-browser; do
  [ -n "$c" ] && [ -x "$c" ] && { ELECTRON="$c"; break; }
done
[ -n "$ELECTRON" ] || { echo "Electron не найден. См. README: установка без npm."; exit 1; }
FLAGS=(--no-sandbox --ozone-platform=x11 --disable-dev-shm-usage)
[ -n "$TB_NO_GPU" ] && FLAGS+=(--disable-gpu)
[ -n "$TB_SCALE" ] && FLAGS+=(--force-device-scale-factor="$TB_SCALE")
exec "$ELECTRON" "${FLAGS[@]}" . "$@"
