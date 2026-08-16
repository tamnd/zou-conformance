#!/usr/bin/env bash
# Ask one server every function in the corpus the same question, once.
#
# A POST, an empty json body and the project's anon key, which is the
# smallest question that reaches a handler. Anything more than that is a
# secret nobody has here: a function that wants an OpenAI key and says
# so has still run, and saying so is the answer this is collecting.
#
# The names are the union of two lists, because that is what a server
# serves: every directory under functions/ that has an index.ts, and
# every [functions.<name>] block in config.toml, which can name a
# function that has no directory at all.
set -euo pipefail

url=${1:?usage: probe.sh <url> <anon key> [project] [out.tsv]}
key=${2:?usage: probe.sh <url> <anon key> [project] [out.tsv]}
project=${3:-/tmp/exproj/supabase}
out=${4:-/tmp/exproj/probe.tsv}

names=$(
  {
    for d in "$project"/functions/*/; do
      [ -f "$d/index.ts" ] || continue
      basename "$d"
    done
    sed -n 's/^\[functions\.\([^]]*\)\].*$/\1/p' "$project/config.toml"
  } | sort -u
)

body=$(mktemp)
trap 'rm -f "$body"' EXIT

: > "$out"
for n in $names; do
  read -r status seconds < <(curl -s --max-time 120 -o "$body" \
    -w '%{http_code} %{time_total}' \
    -X POST "$url/functions/v1/$n" \
    -H "Authorization: Bearer $key" \
    -H "apikey: $key" \
    -H 'content-type: application/json' \
    -d '{}') || true
  ms=$(awk -v s="$seconds" 'BEGIN { printf "%d", s * 1000 }')
  snippet=$(head -c 300 "$body" | tr '\n\t' '  ')
  printf '%s\t%s\t%s\t%s\n' "$n" "$status" "$ms" "$snippet" >> "$out"
  echo "$n [$status] ${ms}ms"
done

echo "$(wc -l < "$out" | tr -d ' ') functions asked, written to $out"
