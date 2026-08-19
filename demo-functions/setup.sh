#!/usr/bin/env bash
# Apply setup.sql to the project's database.
#
# After the server has answered once, not before: the auth schema is
# installed on the first connection zou takes out of its pool, and this
# file puts a trigger on auth.users, so applying it to a database
# nobody has asked anything of yet fails on a table that is not there
# yet.
#
# The port is the one the project's own config.toml names, which is
# upstream's file and says 54322.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
dsn=${1:-postgresql://postgres@127.0.0.1:54322/postgres}

psql "$dsn" -v ON_ERROR_STOP=1 -f "$here/setup.sql"
