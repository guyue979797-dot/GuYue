#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "缺少 .env，请先配置企业微信和 CRM 密钥。" >&2
    exit 1
fi
if [ ! -x .venv/bin/python ]; then
    echo "缺少 .venv，请先创建 Python 3.12 虚拟环境并安装 requirements.txt。" >&2
    exit 1
fi

set -a
. ./.env
set +a

exec .venv/bin/python -m infolens.wecom_ws
