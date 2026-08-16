#!/usr/bin/env bash
# Lay the Supabase examples project out where a server can serve it.
#
# The project is not copied into this repository. It is somebody else's
# forty two functions, it moves, and half of what it imports is fetched
# over the network at boot anyway. So what is written down here is the
# commit it was read at and the way to get that commit back.
#
# It is copied out of the checkout rather than served in place, because
# a run leaves things behind in the project directory and a checkout
# that a run has written into is no longer the thing that was pinned.
set -euo pipefail

ref=${CORPUS_REF:-9be60cab63161100500bdae6dfd45501c5fd8b07}
dest=${1:-/tmp/exproj}

mkdir -p "$dest"
if [ ! -d "$dest/checkout/.git" ]; then
  git clone -q --filter=blob:none --no-checkout \
    https://github.com/supabase/supabase "$dest/checkout"
fi
git -C "$dest/checkout" sparse-checkout set --no-cone examples/edge-functions
git -C "$dest/checkout" fetch -q origin "$ref" 2>/dev/null || true
git -C "$dest/checkout" checkout -q "$ref"

rm -rf "$dest/supabase"
cp -R "$dest/checkout/examples/edge-functions/supabase" "$dest/supabase"

echo "corpus $ref at $dest/supabase"
echo "$(find "$dest/supabase/functions" -maxdepth 2 -name index.ts | wc -l | tr -d ' ') entrypoints under functions/"
