#!/usr/bin/env bash
###
# File: game-images.sh
# Project: deck-verified-site
# File Created: Monday, 20th October 2025 6:58:13 pm
# Author: Josh.5 (jsunnex@gmail.com)
# -----
# Last Modified: Monday, 20th October 2025 7:12:22 pm
# Modified By: Josh.5 (jsunnex@gmail.com)
###
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
    cat <<'EOF'
Usage: infra/game-images.sh [options]

Fetch poster, hero, background, and banner images for a Steam game and
write the resolved URLs to ./tmp/<identifier>.json.

Options:
  -a, --appid <id>   Steam app id to query
  -n, --name <name>  Human readable game name (used for lookups when id is missing)
  -o, --output <dir> Destination directory for the JSON artefact (default: ./tmp)
  -h, --help         Show this help
EOF
}

fatal() {
    echo "[!] $*" >&2
    exit 1
}

require_command() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1 || fatal "Missing required command: $cmd"
}

require_command curl
require_command jq

ENV_FILE="${PROJECT_ROOT}/.env"
if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${ENV_FILE}"
    set +a
else
    fatal "Missing .env file at project root (${ENV_FILE})"
fi

appid=""
game_name=""
output_dir="/tmp"

while [[ $# -gt 0 ]]; do
    case "$1" in
    -a | --appid)
        [[ $# -lt 2 ]] && fatal "Missing value for $1"
        appid="$2"
        shift 2
        ;;
    -n | --name)
        [[ $# -lt 2 ]] && fatal "Missing value for $1"
        game_name="$2"
        shift 2
        ;;
    -o | --output)
        [[ $# -lt 2 ]] && fatal "Missing value for $1"
        output_dir="$2"
        shift 2
        ;;
    -h | --help)
        usage
        exit 0
        ;;
    *)
        fatal "Unknown option: $1"
        ;;
    esac
done

[[ -z "${appid}" && -z "${game_name}" ]] && fatal "Provide either --appid or --name"

urlencode() {
    jq -rn --arg v "$1" '$v|@uri'
}

lookup_appid_from_name() {
    local name="$1"
    local encoded
    encoded="$(urlencode "$name")"
    local response
    response="$(curl -fsSL "https://store.steampowered.com/api/storesearch/?term=${encoded}&cc=US&l=en" 2>/dev/null || true)"
    [[ -z "${response}" ]] && return 1
    local id
    id="$(jq -r '.items[0].id // empty' <<<"${response}")"
    local resolved_name
    resolved_name="$(jq -r '.items[0].name // empty' <<<"${response}")"
    [[ -n "${id}" ]] && printf '%s|%s\n' "${id}" "${resolved_name}"
}

lookup_name_from_appid() {
    local id="$1"
    local response
    response="$(curl -fsSL "https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic" 2>/dev/null || true)"
    [[ -z "${response}" ]] && return 1
    jq -r --arg id "${id}" '.[$id].data.name // empty' <<<"${response}"
}

check_url_exists() {
    local url="$1"
    curl -fsIL --max-time 10 --connect-timeout 3 "$url" >/dev/null 2>&1
}

declare -A results=(
    ["poster"]=""
    ["hero"]=""
    ["background"]=""
    ["banner"]=""
)

append_result() {
    local kind="$1"
    local url="$2"
    local source="$3"
    [[ -z "${url}" ]] && return 0
    if [[ -n "${results[$kind]}" ]]; then
        results["$kind"]+=$'\n'
    fi
    if [[ -n "${source}" ]]; then
        results["$kind"]+="${url}"$'\t'"${source}"
    else
        results["$kind"]+="${url}"
    fi
}

array_to_json() {
    local kind="$1"
    local data="${results[$kind]}"
    if [[ -z "${data}" ]]; then
        echo "[]"
        return
    fi
    printf '%s\n' "${data}" | jq -s -R '
    split("\n")
    | map(select(length>0) | split("\t"))
    | map({
        url: .[0],
        source: (if (length > 1 and .[1] != "") then .[1] else null end)
      })
  '
}

resolved_name="${game_name}"

if [[ -z "${appid}" && -n "${game_name}" ]]; then
    if resolved="$(lookup_appid_from_name "${game_name}")"; then
        appid="${resolved%%|*}"
        [[ -z "${resolved_name}" ]] && resolved_name="${resolved#*|}"
        [[ -z "${resolved_name}" ]] && resolved_name="${game_name}"
    else
        fatal "Unable to resolve app id for \"${game_name}\""
    fi
fi

if [[ -z "${resolved_name}" && -n "${appid}" ]]; then
    resolved_name="$(lookup_name_from_appid "${appid}")"
fi
[[ -z "${resolved_name}" ]] && resolved_name="${appid}"

identifier="${appid:-${resolved_name}}"
identifier="${identifier// /_}"
identifier="${identifier//[^a-zA-Z0-9_.-]/_}"

if [[ "${output_dir}" == "/tmp" ]]; then
    output_dir="${PROJECT_ROOT}/tmp"
fi
mkdir -p "${output_dir}"
output_path="${output_dir%/}/game-images-${identifier}.json"

# Steam CDN checks - cheap HEAD requests on known asset types.
if [[ -n "${appid}" ]]; then
    while IFS='|' read -r kind source template; do
        [[ -z "${kind}" ]] && continue
        url="$(printf "${template}" "${appid}")"
        if check_url_exists "${url}"; then
            append_result "${kind}" "${url}" "${source}"
        fi
    done <<'EOF'
poster|steam|https://steamcdn-a.akamaihd.net/steam/apps/%s/library_600x900.jpg
poster|steam|https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/%s/library_600x900.jpg
hero|steam|https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/%s/library_hero.jpg
background|steam|https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/%s/page_bg_generated_v6b.jpg
background|steam|https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/%s/page_bg.jpg
banner|steam|https://cdn.cloudflare.steamstatic.com/steam/apps/%s/header.jpg
banner|steam|https://steamcdn-a.akamaihd.net/steam/apps/%s/capsule_616x353.jpg
banner|steam|https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/%s/library_capsule.jpg
EOF
fi

# IsThereAnyDeal API (poster-like assets).
if [[ -n "${ISTHEREANYDEAL_API_KEY:-}" && -n "${resolved_name}" ]]; then
    itad_lookup_params="key=${ISTHEREANYDEAL_API_KEY}"
    if [[ -n "${appid}" ]]; then
        itad_lookup_params+="&appid=$(urlencode "${appid}")"
    elif [[ -n "${resolved_name}" ]]; then
        itad_lookup_params+="&title=$(urlencode "${resolved_name}")"
    fi
    itad_lookup_json="$(curl -fsSL "https://api.isthereanydeal.com/games/lookup/v1?${itad_lookup_params}" 2>/dev/null || true)"
    if [[ -n "${itad_lookup_json}" ]]; then
        lookup_name="$(jq -r '.game.title // empty' <<<"${itad_lookup_json}")"
        [[ -n "${lookup_name}" && -z "${game_name}" ]] && resolved_name="${lookup_name}"
        itad_asset_lines="$(jq -r '
      def join_path($p):
        $p
        | map(if type=="number" then "[" + (tostring) + "]" else tostring end)
        | join(".");
      (.game.assets // empty)
      | paths(scalars) as $p
      | select(
          (getpath($p) | type) == "string"
          and (getpath($p) | test("^https?://"; "i"))
        )
      | (getpath($p) | tostring) + "\t" + join_path($p)
    ' <<<"${itad_lookup_json}")"
        if [[ -n "${itad_asset_lines}" ]]; then
            while IFS=$'\t' read -r asset_url asset_path; do
                [[ -z "${asset_url}" ]] && continue
                lowered="${asset_url,,} ${asset_path,,}"
                asset_kind=""
                if [[ "${lowered}" == *"background"* || "${lowered}" == *"wallpaper"* || "${lowered}" == *"backdrop"* ]]; then
                    asset_kind="background"
                elif [[ "${lowered}" == *"hero"* || "${lowered}" == *"landscape"* || "${lowered}" == *"wide"* ]]; then
                    asset_kind="hero"
                elif [[ "${lowered}" == *"banner"* || "${lowered}" == *"header"* || "${lowered}" == *"capsule"* ]]; then
                    asset_kind="banner"
                elif [[ "${lowered}" == *"poster"* || "${lowered}" == *"cover"* || "${lowered}" == *"box"* || "${lowered}" == *"portrait"* ]]; then
                    asset_kind="poster"
                fi
                [[ -z "${asset_kind}" ]] && continue
                append_result "${asset_kind}" "${asset_url}" "isthereanydeal"
            done <<<"${itad_asset_lines}"
        fi
    fi
    plain_resp="$(curl -fsSL "https://api.isthereanydeal.com/v02/game/plain/?key=${ISTHEREANYDEAL_API_KEY}&title=$(urlencode "${resolved_name}")" 2>/dev/null || true)"
    plain="$(jq -r '.data.plain // empty' <<<"${plain_resp}")"
    if [[ -z "${plain}" && -n "${appid}" ]]; then
        plain_resp="$(curl -fsSL "https://api.isthereanydeal.com/v02/game/plain/?key=${ISTHEREANYDEAL_API_KEY}&shop=steam&game_id=${appid}" 2>/dev/null || true)"
        plain="$(jq -r '.data.plain // empty' <<<"${plain_resp}")"
    fi
    if [[ -n "${plain}" ]]; then
        overview="$(curl -fsSL "https://api.isthereanydeal.com/v01/game/overview/?key=${ISTHEREANYDEAL_API_KEY}&plains=${plain}" 2>/dev/null || true)"
        itad_image="$(jq -r --arg plain "${plain}" '.data[$plain].image // empty' <<<"${overview}")"
        if [[ -n "${itad_image}" ]]; then
            append_result "poster" "${itad_image}" "isthereanydeal"
        fi
    fi
fi

# SteamGridDB - requires API key, provides richer assets.
sgdb_headers=()
if [[ -n "${STEAMGRIDDB_API_KEY:-}" ]]; then
    sgdb_headers=(-H "Authorization: Bearer ${STEAMGRIDDB_API_KEY}")
    sgdb_game_id=""
    if [[ -n "${appid}" ]]; then
        sgdb_game_resp="$(curl -fsSL "${sgdb_headers[@]}" "https://www.steamgriddb.com/api/v2/games/steam/${appid}" 2>/dev/null || true)"
        sgdb_game_id="$(jq -r '.data.id // empty' <<<"${sgdb_game_resp}")"
        if [[ -z "${resolved_name}" ]]; then
            name_candidate="$(jq -r '.data.name // empty' <<<"${sgdb_game_resp}")"
            [[ -n "${name_candidate}" ]] && resolved_name="${name_candidate}"
        fi
    fi
    if [[ -z "${sgdb_game_id}" && -n "${resolved_name}" ]]; then
        encoded="$(urlencode "${resolved_name}")"
        sgdb_search_resp="$(curl -fsSL "${sgdb_headers[@]}" "https://www.steamgriddb.com/api/v2/search/autocomplete/${encoded}" 2>/dev/null || true)"
        sgdb_game_id="$(jq -r '.data[0].id // empty' <<<"${sgdb_search_resp}")"
    fi
    if [[ -n "${sgdb_game_id}" ]]; then
        fetch_sgdb_urls() {
            local endpoint="$1"
            local kind="$2"
            local label="$3"
            local resp
            resp="$(curl -fsSL "${sgdb_headers[@]}" "${endpoint}" 2>/dev/null || true)"
            [[ -z "${resp}" ]] && return
            while IFS= read -r url; do
                [[ -z "${url}" ]] && continue
                append_result "${kind}" "${url}" "${label}"
            done < <(jq -r '.data // [] | map(.url) | .[:5][]?' <<<"${resp}")
        }
        fetch_sgdb_urls "https://www.steamgriddb.com/api/v2/grids/game/${sgdb_game_id}?dimensions=600x900" "poster" "steamgriddb"
        fetch_sgdb_urls "https://www.steamgriddb.com/api/v2/heroes/game/${sgdb_game_id}" "hero" "steamgriddb"
        fetch_sgdb_urls "https://www.steamgriddb.com/api/v2/grids/game/${sgdb_game_id}?dimensions=1920x1080" "background" "steamgriddb"
        fetch_sgdb_urls "https://www.steamgriddb.com/api/v2/grids/game/${sgdb_game_id}?dimensions=920x430" "banner" "steamgriddb"
    fi
fi

poster_json="$(array_to_json "poster")"
hero_json="$(array_to_json "hero")"
background_json="$(array_to_json "background")"
banner_json="$(array_to_json "banner")"

jq -n \
    --arg name "${resolved_name}" \
    --arg appid "${appid}" \
    --argjson poster "${poster_json}" \
    --argjson hero "${hero_json}" \
    --argjson background "${background_json}" \
    --argjson banner "${banner_json}" \
    '{
    name: ($name // null),
    appid: ($appid // null),
    images: {
      poster: $poster,
      hero: $hero,
      background: $background,
      banner: $banner
    }
  }' >"${output_path}"

echo "Image metadata written to ${output_path}"
