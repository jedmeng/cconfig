#!/bin/sh
set -e

prepare_dir() {
  dir="$1"
  [ -n "$dir" ] || return 0
  mkdir -p "$dir"
  chown -R cconfig:cconfig "$dir"
}

DATA_DIR="${CCONFIG_DATA_DIR:-/config}"
CONFIG_DIR="${CCONFIG_CONFIG_DIR:-/config}"

mkdir -p "$DATA_DIR/sources"
prepare_dir "$DATA_DIR"
if [ "$CONFIG_DIR" != "$DATA_DIR" ]; then
  prepare_dir "$CONFIG_DIR"
fi

exec su-exec cconfig "$@"
