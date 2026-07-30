#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Alerta de frescura de la sincronización SAMIT → VPS
#
# POR QUÉ EXISTE. El 29/07/2026 las Edge Functions se cayeron y la
# sincronización estuvo 34 horas muerta sin que nadie lo notara: el dashboard
# sigue mostrando datos —viejos, pero plausibles—, así que la caída es
# invisible desde la aplicación. Gerencia pudo haber comprado con cifras de
# anteayer. Esto es la señal que faltaba.
#
# Vigila dos cosas distintas:
#   1. FRESCURA: cuántas horas hace que no entra una corrida.
#   2. INTEGRIDAD: datasets cuyo ÚLTIMO estado es 'sospechoso' (se escribió
#      pero no cuadró contra la cifra de control del ERP) o 'parcial'.
#      Se mira el último por dataset, no cualquiera de las últimas 24 h: un
#      fallo que la siguiente corrida ya arregló no debe despertar a nadie.
#
# Se instala en /opt/distrimm/bin/ y lo dispara el crontab de admin.
# Config en /etc/distrimm/alertas.env (chmod 600, NO va al repo):
#   TELEGRAM_BOT_TOKEN=...
#   TELEGRAM_CHAT_ID=...
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

CFG=/etc/distrimm/alertas.env
ESTADO="${HOME:-/home/admin}/.distrimm-alerta-sync.estado"

# Sin config no se hace nada, y en silencio: si no, cron manda correo cada vez.
[ -r "$CFG" ] || { echo "$(date -Is) sin $CFG, no se hace nada"; exit 0; }
set -a; . "$CFG"; set +a
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || {
  echo "$(date -Is) faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID"; exit 0; }

# La sincronización va cada 2 h: 4 permite perder un ciclo sin gritar.
HORAS_LIMITE="${SYNC_HORAS_LIMITE:-4}"
# Cada cuánto se repite el aviso mientras siga caída.
REPETIR_HORAS="${SYNC_REPETIR_HORAS:-6}"
# Ventana en hora de Bogotá. Empieza a las 10 y no a las 8 a propósito: el
# servidor de la oficina se enciende por la mañana y su primera corrida entra
# a los pocos minutos, pero si alguien llega tarde no queremos un falso
# positivo diario.
HORA_DESDE="${SYNC_HORA_DESDE:-10}"
HORA_HASTA="${SYNC_HORA_HASTA:-19}"

psql_() { sudo -u postgres psql -p 5433 -d distrimm -tAc "$1" 2>/dev/null | tr -d ' '; }

avisar() {
  curl -sS --max-time 20 -o /dev/null \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "text=$1"
}

# ── ¿Estamos en horario en que el ERP debería estar despachando? ─────────────
# El servidor de la oficina se apaga al cerrar (L-S), así que fuera de ese
# horario la falta de datos es NORMAL y avisar sería ruido todas las noches.
# Se evalúa en hora de Bogotá, no en la del VPS, que va en Europe/Berlin.
HORA_BOG=$(TZ=America/Bogota date +%-H)
DIA_BOG=$(TZ=America/Bogota date +%u)   # 1=lunes … 7=domingo
EN_HORARIO=0
if [ "$DIA_BOG" -le 6 ] && [ "$HORA_BOG" -ge "$HORA_DESDE" ] && [ "$HORA_BOG" -le "$HORA_HASTA" ]; then
  EN_HORARIO=1
fi

# Décimas de hora desde la última corrida. Se trae como ENTERO para comparar
# con aritmética de bash: comparar decimales obligaría a pasar por bc, y una
# dependencia menos es una cosa menos que se puede romper en un upgrade.
DECIMAS=$(psql_ "SELECT COALESCE(ROUND(EXTRACT(EPOCH FROM (now() - MAX(fin)))/360.0)::int, 9999) FROM distrimm_sync_estado;")
# Que la consulta falle ES una alerta: significa que Postgres no responde.
BASE_CAIDA=0
if ! [[ "$DECIMAS" =~ ^[0-9]+$ ]]; then DECIMAS=9999; BASE_CAIDA=1; fi
HORAS=$(( DECIMAS / 10 )).$(( DECIMAS % 10 ))

ULTIMA=$(psql_ "SELECT COALESCE(to_char(MAX(fin) AT TIME ZONE 'America/Bogota','DD/MM HH24:MI'),'nunca') FROM distrimm_sync_estado;")

# Último estado de cada dataset: solo alerta si el más reciente sigue mal.
MALOS=$(psql_ "
  WITH ultimo AS (
    SELECT DISTINCT ON (dataset) dataset, estado
    FROM distrimm_sync_estado
    WHERE fin > now() - interval '48 hours'
    ORDER BY dataset, fin DESC
  )
  SELECT COALESCE(string_agg(dataset || ' (' || estado || ')', ', ' ORDER BY dataset), '')
  FROM ultimo WHERE estado <> 'ok';")

PREVIO=$(cat "$ESTADO" 2>/dev/null || echo "ok 0")
EST_PREV=$(echo "$PREVIO" | awk '{print $1}')
TS_PREV=$(echo "$PREVIO" | awk '{print $2+0}')
AHORA=$(date +%s)

problema=0
mensaje=""

if [ "$DECIMAS" -ge $(( HORAS_LIMITE * 10 )) ] && [ "$EN_HORARIO" -eq 1 ]; then
  problema=1
  mensaje="🔴 <b>DistriMM — sincronización detenida</b>

Sin datos del ERP hace <b>${HORAS} h</b>.
Última corrida: ${ULTIMA} (Bogotá).

El dashboard sigue mostrando cifras viejas sin avisar.
Revisar que el servidor de la oficina esté encendido y que <code>/functions/v1</code> no responda 502."
  [ "$BASE_CAIDA" -eq 1 ] && mensaje="${mensaje}

⚠️ Además, no se pudo consultar la base de datos."
elif [ -n "$MALOS" ]; then
  problema=1
  mensaje="🟡 <b>DistriMM — datasets que no cuadran</b>

${MALOS}

<i>sospechoso</i> = se escribió pero no cuadró contra la cifra de control del ERP.
<i>parcial</i> = falló a medias."
fi

if [ "$problema" -eq 1 ]; then
  # Se avisa la primera vez, y luego cada REPETIR_HORAS mientras siga mal.
  if [ "$EST_PREV" = "ok" ] || [ $(( (AHORA - TS_PREV) / 3600 )) -ge "$REPETIR_HORAS" ]; then
    avisar "$mensaje" && echo "mal $AHORA" > "$ESTADO"
  fi
elif [ "$EST_PREV" != "ok" ]; then
  # Avisar también al recuperarse: si no, uno se queda sin saber si sigue caído.
  avisar "✅ <b>DistriMM — sincronización restablecida</b>

Última corrida: ${ULTIMA} (Bogotá)."
  echo "ok $AHORA" > "$ESTADO"
else
  echo "ok $AHORA" > "$ESTADO"
fi

echo "$(date -Is) horas=$HORAS horario=$EN_HORARIO problema=$problema malos='${MALOS}'"
