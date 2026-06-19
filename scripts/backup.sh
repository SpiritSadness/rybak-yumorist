#!/usr/bin/env bash
set -euo pipefail

BOT_DIR="/home/andreyzabrodin/PC/4/fishing-bot-new"
BACKUP_ROOT="/home/andreyzabrodin/PC/4/backups"
BACKUP_DIR="${BACKUP_ROOT}/daily"
WEEKLY_DIR="${BACKUP_ROOT}/weekly"
MONTHLY_DIR="${BACKUP_ROOT}/monthly"
DATA_DIR="${BACKUP_ROOT}/data"
LOG_DIR="${BACKUP_ROOT}/logs"
LOCK_FILE="${BACKUP_ROOT}/.backup.lock"
STATUS_FILE="${BACKUP_ROOT}/status.json"
ENV_FILE="${BOT_DIR}/.env"

RETAIN_DAILY=14
RETAIN_WEEKLY=8
RETAIN_MONTHLY=6
RETAIN_DATA=30
MIN_FREE_MB=1024
MAX_LOG_KB=512
RETRIES=3
RETRY_DELAY_SEC=30

MODE="${1:-daily}"
START_TS=$(date +%s)
LAST_DATA_ARCHIVE=""
LAST_DATA_SIZE=""
MONTHLY_CREATED=0
MONTHLY_NAME=""
LAST_ARCHIVE_NAME=""
LAST_ARCHIVE_SIZE=""
LAST_ARCHIVE_FILES=""

mkdir -p "$BACKUP_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR" "$DATA_DIR" "$LOG_DIR"

rotate_log() {
  local log_file="$LOG_DIR/backup.log"
  [[ -f "$log_file" ]] || return 0
  local size_kb
  size_kb=$(du -k "$log_file" | awk '{print $1}')
  if (( size_kb > MAX_LOG_KB )); then
    mv "$log_file" "$LOG_DIR/backup.log.$(date '+%Y%m%d-%H%M%S')"
    find "$LOG_DIR" -maxdepth 1 -type f -name 'backup.log.*' -mtime +30 -delete
  fi
}

log() {
  rotate_log
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*" | tee -a "$LOG_DIR/backup.log"
}

write_status() {
  local state="$1"
  local message="$2"
  local archive="${3:-}"
  local size="${4:-}"
  python3 - "$STATUS_FILE" "$state" "$message" "$MODE" "$archive" "$size" <<'PY'
import json, sys, datetime
path, state, message, mode, archive, size = sys.argv[1:7]
payload = {
    "state": state,
    "message": message,
    "mode": mode,
    "archive": archive or None,
    "size": size or None,
    "updatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds")
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY
}

load_env_value() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r"'"'" || true
}

resolve_notify_chat_id() {
  local configured
  configured="$(load_env_value BACKUP_NOTIFY_CHAT_ID)"
  if [[ -n "$configured" ]]; then
    echo "$configured"
    return
  fi

  local cache_file="${BOT_DIR}/data/backup-notify.json"
  if [[ -f "$cache_file" ]]; then
    python3 - "$cache_file" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    if data.get("chatId"):
        print(data["chatId"])
except Exception:
    pass
PY
    return
  fi

  local groups_file="${BOT_DIR}/data/groups.json"
  if [[ -f "$groups_file" ]]; then
    python3 - "$groups_file" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    groups = data.get("groups") or {}
    for item in groups.values():
        if item.get("active") and item.get("addedBy"):
            print(item["addedBy"])
            break
except Exception:
    pass
PY
  fi
}

count_archives() {
  local dir="$1"
  local pattern="$2"
  find "$dir" -maxdepth 1 -type f -name "$pattern" 2>/dev/null | wc -l | tr -d ' '
}

disk_free_gb() {
  df -BG "$BACKUP_ROOT" | awk 'NR==2 {gsub(/G/,"",$4); print $4}'
}

send_telegram_report() {
  local payload="$1"
  if ! command -v node >/dev/null 2>&1; then
    log "WARN: node not found, telegram report skipped"
    return 0
  fi

  if node "${BOT_DIR}/scripts/backup-notify.js" "$payload" >>"$LOG_DIR/backup.log" 2>&1; then
    log "Telegram report sent"
  else
    log "WARN: telegram report failed"
  fi
}

build_report_json() {
  local status="$1"
  local message="${2:-}"
  local error="${3:-}"
  local attempt="${4:-1}"
  python3 - "$status" "$message" "$error" "$attempt" "$MODE" "$START_TS" \
    "$LAST_ARCHIVE_NAME" "$LAST_ARCHIVE_SIZE" "$LAST_ARCHIVE_FILES" \
    "$LAST_DATA_ARCHIVE" "$LAST_DATA_SIZE" "$MONTHLY_CREATED" "$MONTHLY_NAME" \
    "$BACKUP_DIR" "$WEEKLY_DIR" "$DATA_DIR" "$MONTHLY_DIR" "$BACKUP_ROOT" <<'PY'
import json, sys, datetime, glob, os

(
    status, message, error, attempt, mode, start_ts,
    archive_name, archive_size, archive_files,
    data_name, data_size, monthly_created, monthly_name,
    daily_dir, weekly_dir, data_dir, monthly_dir, backup_root
) = sys.argv[1:19]

finished = datetime.datetime.now().astimezone()
duration = max(0, int(finished.timestamp()) - int(start_ts or 0))

def count_files(path, pattern):
    return len(glob.glob(os.path.join(path, pattern)))

payload = {
    "status": status,
    "mode": mode,
    "message": message or None,
    "error": error or None,
    "attempt": int(attempt or 1),
    "maxAttempts": 3,
    "finishedAt": finished.strftime("%d.%m.%Y %H:%M:%S %Z"),
    "durationSec": duration,
    "archiveName": archive_name or None,
    "size": archive_size or None,
    "files": int(archive_files) if str(archive_files).isdigit() else None,
    "checksumOk": bool(archive_name),
    "dataArchiveName": data_name or None,
    "dataSize": data_size or None,
    "monthlyCreated": str(monthly_created) == "1",
    "monthlyName": monthly_name or None,
    "dailyCount": count_files(daily_dir, "fishing-bot-new_*.tar.gz"),
    "weeklyCount": count_files(weekly_dir, "fishing-bot-new_*.tar.gz"),
    "dataCount": count_files(data_dir, "data_*.tar.gz"),
    "monthlyCount": count_files(monthly_dir, "fishing-bot-new_*.tar.gz"),
    "diskFreeGb": None,
}

try:
    import subprocess
    out = subprocess.check_output(["df", "-BG", backup_root], text=True)
    parts = out.strip().splitlines()[-1].split()
    payload["diskTotalGb"] = parts[1].replace("G", "")
    payload["diskUsedGb"] = parts[2].replace("G", "")
    payload["diskFreeGb"] = parts[3].replace("G", "")
    used_pct = parts[4].replace("%", "")
    if used_pct.isdigit():
        payload["diskUsedPct"] = int(used_pct)
except Exception:
    pass

print(json.dumps(payload, ensure_ascii=False))
PY
}

notify_backup() {
  local status="$1"
  local message="${2:-}"
  local error="${3:-}"
  local attempt="${4:-1}"
  local payload

  if [[ -n "${DISPLAY:-}" ]] && command -v notify-send >/dev/null 2>&1; then
    if [[ "$status" == "ok" ]]; then
      notify-send "Бэкап бота" "Успешно (${MODE})" || true
    else
      notify-send "Бэкап бота: ошибка" "${error:-$message}" || true
    fi
  fi

  payload="$(build_report_json "$status" "$message" "$error" "$attempt")"
  send_telegram_report "$payload"
}

notify_failure() {
  notify_backup "failed" "" "$1" "${ATTEMPT:-1}"
}

cleanup_staging() {
  if [[ -n "${STAGING_DIR:-}" && -d "$STAGING_DIR" ]]; then
    rm -rf "$STAGING_DIR"
  fi
}

trap cleanup_staging EXIT

fail() {
  log "ERROR: $*"
  write_status "failed" "$*" "" ""
  notify_failure "❌ Бэкап бота не удался (${MODE}): $*"
  exit 1
}

check_disk_space() {
  local avail_mb
  avail_mb=$(df -Pm "$BACKUP_ROOT" | awk 'NR==2 {print $4}')
  if (( avail_mb < MIN_FREE_MB )); then
    fail "мало места на диске: ${avail_mb} MB (нужно >= ${MIN_FREE_MB} MB)"
  fi
}

write_checksum() {
  local archive="$1"
  sha256sum "$archive" > "${archive}.sha256"
}

verify_archive() {
  local archive="$1"
  tar -tzf "$archive" >/dev/null 2>&1 || return 1
  [[ -f "${archive}.sha256" ]] || return 1
  (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256" >/dev/null 2>&1)
}

rsync_bot_snapshot() {
  local dest="$1"
  local full="$2"

  local -a excludes=(
    --exclude='.git/'
    --exclude='.staging.*'
  )

  if [[ "$full" != "1" ]]; then
    excludes+=(
      --exclude='node_modules/'
      --exclude='logs/*.log'
      --exclude='logs/*.log.*'
    )
  fi

  rsync -a "${excludes[@]}" "$BOT_DIR/" "$dest/"
}

create_archive() {
  local archive="$1"
  local staging_bot="$2"
  tar -czf "$archive" -C "$(dirname "$staging_bot")" "$(basename "$staging_bot")" || return 1
  write_checksum "$archive"
  verify_archive "$archive" || {
    rm -f "$archive" "${archive}.sha256"
    return 1
  }
}

create_data_snapshot() {
  local stamp="$1"
  local archive="${DATA_DIR}/data_${stamp}.tar.gz"
  tar -czf "$archive" -C "$BOT_DIR" data || return 1
  write_checksum "$archive"
  verify_archive "$archive" || {
    rm -f "$archive" "${archive}.sha256"
    return 1
  }
  ln -sfn "$(basename "$archive")" "${DATA_DIR}/latest.tar.gz"
  LAST_DATA_ARCHIVE="$(basename "$archive")"
  LAST_DATA_SIZE="$(du -h "$archive" | awk '{print $1}')"
  log "DATA snapshot -> ${LAST_DATA_ARCHIVE} (${LAST_DATA_SIZE})"
}

ensure_monthly_copy() {
  local source_archive="$1"
  local month_key
  month_key="$(date '+%Y-%m')"
  local monthly_archive="${MONTHLY_DIR}/fishing-bot-new_${month_key}.tar.gz"

  if [[ -f "$monthly_archive" ]]; then
    MONTHLY_NAME="$(basename "$monthly_archive")"
    return 0
  fi

  cp -f "$source_archive" "$monthly_archive"
  cp -f "${source_archive}.sha256" "${monthly_archive}.sha256"
  ln -sfn "$(basename "$monthly_archive")" "${MONTHLY_DIR}/latest.tar.gz"
  MONTHLY_CREATED=1
  MONTHLY_NAME="$(basename "$monthly_archive")"
  log "MONTHLY copy -> ${MONTHLY_NAME}"
}

rotate_files() {
  local dir="$1"
  local pattern="$2"
  local days="$3"
  local deleted=0
  local old

  while IFS= read -r old; do
    rm -f "$old" "${old}.sha256"
    deleted=$((deleted + 1))
  done < <(find "$dir" -maxdepth 1 -type f -name "$pattern" -mtime +"$days" | sort)

  if (( deleted > 0 )); then
    log "ROTATE ${dir##*/}: removed ${deleted} file(s) older than ${days} days"
  fi
}

rotate_monthly() {
  local deleted=0
  local cutoff_month
  cutoff_month="$(date -d "-${RETAIN_MONTHLY} months" '+%Y-%m')"
  local old month_key

  while IFS= read -r old; do
    month_key="$(basename "$old" | sed -n 's/^fishing-bot-new_\([0-9]\{4\}-[0-9]\{2\}\)\.tar\.gz$/\1/p')"
    if [[ -n "$month_key" && "$month_key" < "$cutoff_month" ]]; then
      rm -f "$old" "${old}.sha256"
      deleted=$((deleted + 1))
    fi
  done < <(find "$MONTHLY_DIR" -maxdepth 1 -type f -name 'fishing-bot-new_*.tar.gz' | sort)

  if (( deleted > 0 )); then
    log "ROTATE monthly: removed ${deleted} archive(s)"
  fi
}

mirror_backup() {
  local mirror_path
  mirror_path="$(load_env_value BACKUP_MIRROR_PATH)"
  if [[ -z "$mirror_path" ]]; then
    mirror_path="${HOME}/Backups/rybak-yumorist"
  fi

  [[ -n "$LAST_ARCHIVE" && -f "$LAST_ARCHIVE" ]] || return 0

  mkdir -p "$mirror_path/daily" "$mirror_path/weekly" "$mirror_path/data" "$mirror_path/monthly"

  local mirror_target="${mirror_path}/daily"
  if [[ "$MODE" == "weekly" || "$MODE" == "full" ]]; then
    mirror_target="${mirror_path}/weekly"
  fi

  if cp -f "$LAST_ARCHIVE" "${mirror_target}/$(basename "$LAST_ARCHIVE")" \
    && cp -f "${LAST_ARCHIVE}.sha256" "${mirror_target}/$(basename "$LAST_ARCHIVE").sha256"; then
    ln -sfn "$(basename "$LAST_ARCHIVE")" "${mirror_target}/latest.tar.gz"
    log "MIRROR -> ${mirror_target}/$(basename "$LAST_ARCHIVE")"
  else
    log "WARN: mirror copy failed for ${mirror_path}"
    return 0
  fi

  if [[ -n "$LAST_DATA_ARCHIVE" ]]; then
    local data_src="${DATA_DIR}/${LAST_DATA_ARCHIVE}"
    if [[ -f "$data_src" ]]; then
      cp -f "$data_src" "${mirror_path}/data/${LAST_DATA_ARCHIVE}" || true
      cp -f "${data_src}.sha256" "${mirror_path}/data/${LAST_DATA_ARCHIVE}.sha256" 2>/dev/null || true
      ln -sfn "$LAST_DATA_ARCHIVE" "${mirror_path}/data/latest.tar.gz"
    fi
  fi

  if [[ -n "$MONTHLY_NAME" && -f "${MONTHLY_DIR}/${MONTHLY_NAME}" ]]; then
    cp -f "${MONTHLY_DIR}/${MONTHLY_NAME}" "${mirror_path}/monthly/${MONTHLY_NAME}" 2>/dev/null || true
    cp -f "${MONTHLY_DIR}/${MONTHLY_NAME}.sha256" "${mirror_path}/monthly/${MONTHLY_NAME}.sha256" 2>/dev/null || true
  fi
}

LAST_ARCHIVE=""

run_backup_once() {
  local target_dir="$1"
  local prefix="$2"
  local full="$3"
  local stamp archive staging_bot size files

  stamp="$(date '+%Y-%m-%d_%H-%M-%S')"
  archive="${target_dir}/${prefix}_${stamp}.tar.gz"
  STAGING_DIR="$(mktemp -d "${BACKUP_ROOT}/.staging.XXXXXX")"
  staging_bot="${STAGING_DIR}/fishing-bot-new"

  if ! rsync_bot_snapshot "$staging_bot" "$full"; then
    cleanup_staging
    return 1
  fi

  if ! create_archive "$archive" "$staging_bot"; then
    cleanup_staging
    return 1
  fi

  cleanup_staging

  ln -sfn "$(basename "$archive")" "${target_dir}/latest.tar.gz"
  size="$(du -h "$archive" | awk '{print $1}')"
  files="$(tar -tzf "$archive" | wc -l | tr -d ' ')"
  LAST_ARCHIVE_NAME="$(basename "$archive")"
  LAST_ARCHIVE_SIZE="$size"
  LAST_ARCHIVE_FILES="$files"
  log "OK mode=${MODE} size=${size} files=${files} path=${archive}"

  create_data_snapshot "$stamp"
  ensure_monthly_copy "$archive"
  write_status "ok" "backup completed" "$archive" "$size"
  LAST_ARCHIVE="$archive"
  return 0
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "SKIP: backup already running"
  exit 0
fi

if [[ ! -d "$BOT_DIR" ]]; then
  fail "bot directory not found: $BOT_DIR"
fi

case "$MODE" in
  daily|weekly|full)
    ;;
  *)
    fail "unknown mode: $MODE (use daily|weekly|full)"
    ;;
esac

if [[ "$MODE" == "weekly" || "$MODE" == "full" ]]; then
  TARGET_DIR="$WEEKLY_DIR"
  FULL=1
  log "START weekly/full backup"
else
  TARGET_DIR="$BACKUP_DIR"
  FULL=0
  log "START daily backup"
fi

check_disk_space

attempt=1
success=0

while (( attempt <= RETRIES )); do
  ATTEMPT="$attempt"
  if [[ "$attempt" -gt 1 ]]; then
    log "RETRY ${attempt}/${RETRIES} in ${RETRY_DELAY_SEC}s"
    sleep "$RETRY_DELAY_SEC"
  fi

  if run_backup_once "$TARGET_DIR" "fishing-bot-new" "$FULL"; then
    success=1
    break
  fi

  attempt=$((attempt + 1))
done

if (( success == 0 )); then
  fail "backup failed after ${RETRIES} attempts"
fi

mirror_backup

rotate_files "$BACKUP_DIR" 'fishing-bot-new_*.tar.gz' "$RETAIN_DAILY"
rotate_files "$WEEKLY_DIR" 'fishing-bot-new_*.tar.gz' "$((RETAIN_WEEKLY * 7))"
rotate_files "$DATA_DIR" 'data_*.tar.gz' "$RETAIN_DATA"
rotate_monthly
log "DONE mode=${MODE}"
notify_backup "ok" "backup completed" "" "$ATTEMPT"
exit 0
