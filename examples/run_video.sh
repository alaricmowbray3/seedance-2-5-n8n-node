#!/usr/bin/env bash
set -euo pipefail
: "${SEEDANCE_API_KEY:?Set SEEDANCE_API_KEY}"
base="${SEEDANCE_BASE_URL:-https://argolink.io/v1}"
out="${1:-video.mp4}"
job="${2:-}"
[[ ! -e "$out" ]] || { echo 'Output already exists' >&2; exit 1; }
auth=(-H "Authorization: Bearer $SEEDANCE_API_KEY" -A 'n8n-video-shell/1.0')
if [[ -z "$job" ]]; then
  result=$(curl --fail-with-body --max-time 90 -sS "${auth[@]}" \
    -H 'Content-Type: application/json' "${base%/}/videos/generations" \
    --data '{"model":"seedance-2.5","prompt":"A paper boat floats at dawn.","duration":5,"resolution":"720p","aspect_ratio":"16:9","generate_audio":true}')
  job=$(jq -er '.request_id | select(type == "string")' <<< "$result")
fi
[[ "$job" =~ ^[A-Za-z0-9_-]+$ ]] || { echo 'Invalid request ID' >&2; exit 1; }
echo "request_id=$job" >&2
deadline=$((SECONDS+3600))
for ((poll=0; poll<240 && SECONDS<deadline; poll++)); do
  result=$(curl --fail-with-body --max-time 90 -sS "${auth[@]}" "${base%/}/videos/$job")
  status=$(jq -er '.status' <<< "$result")
  case "$status" in
    done)
      tmp=$(mktemp "${out}.XXXXXX")
      trap 'rm -f "$tmp"' EXIT
      curl --fail-with-body --max-time 120 -sS "${auth[@]}" "${base%/}/videos/$job/content" -o "$tmp"
      ln "$tmp" "$out"
      exit 0 ;;
    pending) sleep 10 ;;
    *) echo "Job $job stopped: $result" >&2; exit 1 ;;
  esac
done
echo "Polling limit reached; resume $job" >&2
exit 1
