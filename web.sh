#!/usr/bin/env bash
# Превью интерфейса в обычном браузере (нужен только node): bash web.sh
cd "$(dirname "$0")" || exit 1
exec node preview/server.js "$@"
