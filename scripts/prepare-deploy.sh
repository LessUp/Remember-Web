#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

copy_static() {
  local src="$1"
  local dest="$DIST_DIR/$(basename "$src")"
  if [[ -f "$ROOT_DIR/$src" ]]; then
    cp "$ROOT_DIR/$src" "$dest"
    echo "[prepare-deploy] copied $src"
  else
    echo "[prepare-deploy] warning: $src not found" >&2
  fi
}

copy_static "index.html"
copy_static "app.js"
copy_static "sw.js"
copy_static "manifest.webmanifest"

if [[ -d "$ROOT_DIR/assets" ]]; then
  cp -R "$ROOT_DIR/assets" "$DIST_DIR/"
  echo "[prepare-deploy] copied assets/ directory"
fi

echo "[prepare-deploy] bundle ready at $DIST_DIR"
