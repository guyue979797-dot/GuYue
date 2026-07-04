#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

if [[ -z "${INFOLENS_CRM_SECRET_KEY:-}" ]]; then
  LEGACY_ZIP="${INFOLENS_LEGACY_ZIP:-/Users/guyue/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_zi8nj6cmkn9x12_b5cf/temp/drag/InfoLens(1).zip}"
  if [[ -f "$LEGACY_ZIP" ]]; then
    INFOLENS_CRM_SECRET_KEY="$(
      unzip -p "$LEGACY_ZIP" "InfoLens/infolens/crm_client.py" |
        sed -n 's/^SECRET_KEY = "\(.*\)"$/\1/p'
    )"
    export INFOLENS_CRM_SECRET_KEY
  fi
fi

if [[ -z "${INFOLENS_CRM_SECRET_KEY:-}" ]]; then
  print -u2 "未找到 CRM 密钥。请在 InfoLens/.env 中配置 INFOLENS_CRM_SECRET_KEY。"
  exit 1
fi

export INFOLENS_AUTH_MODE="${INFOLENS_AUTH_MODE:-off}"
exec "${PYTHON_BIN:-python3}" web.py
