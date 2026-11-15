#!/usr/bin/env bash
# Yerel Postgres'te şema + tüm migration'ları sıfırdan kurar ve SQL testlerini çalıştırır.
# Gerçek Supabase'e DOKUNMAZ. Kullanım: supabase/tests/run.sh [test-dosyası...]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
db="${CITA_TEST_DB:-cita_test}"

dropdb --if-exists "$db" >/dev/null
createdb "$db"
must() { PGOPTIONS="-c client_min_messages=warning" psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@" >/dev/null; }

must -f "$here/shim.sql" 2>/dev/null
must -f "$root/schema.sql"
for m in "$root"/migrations/*.sql; do
  must -f "$m"
done
# Migration'lar ikinci kez çalışınca da hata vermemeli (idempotency).
for m in "$root"/migrations/00[8-9]*.sql "$root"/migrations/01*.sql; do
  [ -f "$m" ] && must -f "$m"
done
echo "schema + migrations OK (idempotent re-run OK)"

files=("$@")
if [ ${#files[@]} -eq 0 ]; then files=("$here"/*.test.sql); fi
fail=0
for t in "${files[@]}"; do
  if out=$(psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$t" 2>&1); then
    echo "PASS $(basename "$t") ($(grep -c 'ok - ' <<<"$out") assertions)"
  else
    echo "FAIL $(basename "$t")"; echo "$out" | grep -E 'FAIL|ERROR|HATA' | head -5; fail=1
  fi
done
for t in "$here"/*.concurrency.sh; do
  [ -f "$t" ] || continue
  if CITA_TEST_DB="$db" bash "$t"; then echo "PASS $(basename "$t")"; else echo "FAIL $(basename "$t")"; fail=1; fi
done
exit $fail
