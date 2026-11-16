#!/usr/bin/env bash
# Обновить из GitHub, закрыть старое окно и запустить заново.
cd "$(dirname "$0")" || exit 1
git pull --ff-only || exit 1
[ -d node_modules/electron ] || npm install
pkill -f 'node_modules/electron' 2>/dev/null
sleep 1
exec bash run.sh "$@"
