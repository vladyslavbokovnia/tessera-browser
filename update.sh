#!/usr/bin/env bash
# Обновить из GitHub, закрыть старое окно и запустить заново: bash update.sh
cd "$(dirname "$0")" || exit 1
git pull --ff-only || exit 1
pkill -x electron 2>/dev/null
pkill -x tessera-browser 2>/dev/null
sleep 1
exec bash run.sh "$@"
