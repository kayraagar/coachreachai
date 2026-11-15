#!/usr/bin/env bash
# Eşzamanlı 12 foto isteği (farklı anahtarlar) + aynı anahtarla 6 eşzamanlı tekrar:
# ücretsiz öğrencide toplam düşen hak tam 3 olmalı, aynı anahtar tek istek üretmeli.
set -euo pipefail
db="${CITA_TEST_DB:-cita_test}"
q() { psql -X -q -At -d "$db" -c "$1"; }
uid=$(q "select tests.create_user('conc-$RANDOM-$$@test', '{\"role\":\"student\"}')")
claims="{\"sub\":\"$uid\",\"role\":\"authenticated\"}"
call() {
  psql -X -q -At -d "$db" -c "select set_config('request.jwt.claims', '$claims', false); set role authenticated; select public.cita_reserve_photo('$1')->>'outcome';" | tail -1
}
pids=()
for i in $(seq 1 12); do call "conc-key-$i" > "/tmp/cita_conc_$$_$i" & pids+=($!); done
for i in $(seq 1 6); do call "conc-same-key" > "/tmp/cita_conc_$$_s$i" & pids+=($!); done
wait "${pids[@]}"
reserved=$(cat /tmp/cita_conc_$$_* | grep -c reserved || true)
used=$(q "select used from public.photo_usage where student_id = '$uid'")
same=$(q "select count(*) from public.photo_requests where student_id = '$uid' and idempotency_key = 'conc-same-key'")
rm -f /tmp/cita_conc_$$_*
echo "reserved=$reserved used=$used same_key_rows=$same"
[ "$used" = "3" ] && [ "$reserved" = "3" ] && [ "$same" -le 1 ]

# Aynı Idempotency-Key ile 8 eşzamanlı istek (yeni öğrenci): tam 1 hak, tek satır.
uid=$(q "select tests.create_user('conc2-$RANDOM-$$@test', '{\"role\":\"student\"}')")
claims="{\"sub\":\"$uid\",\"role\":\"authenticated\"}"
pids=()
for i in $(seq 1 8); do call "same-key-xyz" > "/tmp/cita_conc2_$$_$i" & pids+=($!); done
wait "${pids[@]}"
outcomes=$(cat /tmp/cita_conc2_$$_* | sort | uniq -c | tr '\n' ' ')
rm -f /tmp/cita_conc2_$$_*
used=$(q "select used from public.photo_usage where student_id = '$uid'")
rows=$(q "select count(*) from public.photo_requests where student_id = '$uid'")
echo "same-key outcomes: $outcomes used=$used rows=$rows"
[ "$used" = "1" ] && [ "$rows" = "1" ]
