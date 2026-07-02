# InfoLens 腾讯云部署

## 架构

浏览器 → Caddy（HTTPS）→ Gunicorn/Flask → CRM API

应用容器不暴露公网端口；只有 Caddy 开放 80/443。提取结果保存在 Docker
持久化卷中，登录、图片和 API 均受鉴权保护。

## 1. 准备资源

1. 购买腾讯云轻量应用服务器，建议 Ubuntu 24.04、至少 2 核 2 GB。
2. 准备域名，将 A 记录指向服务器公网 IP。
3. 如果服务器位于中国大陆，先完成 ICP 备案。
4. 防火墙仅开放 TCP 22、80、443 和 UDP 443；不要开放 8000、8765。
5. 安装 Docker Engine 与 Docker Compose 插件。

## 2. 配置

```bash
cp .env.example .env
```

生成会话密钥：

```bash
openssl rand -hex 32
```

生成登录密码哈希：

```bash
docker run --rm python:3.12-slim sh -c \
  "pip install 'Werkzeug==3.1.8' >/dev/null && python -c \"from getpass import getpass; from werkzeug.security import generate_password_hash; print(generate_password_hash(getpass('Password: '), method='pbkdf2:sha256'))\""
```

将生成结果和 CRM 新密钥写入 `.env`。密码哈希包含 `$`，请用单引号包住整段值，
例如 `INFOLENS_PASSWORD_HASH='pbkdf2:...'`。`.env` 不得提交到 Git 或发送到群聊。

### 公司账号登录

如公司的身份系统支持 OIDC，将 `INFOLENS_AUTH_MODE` 改为 `oidc`，并填写：

- `INFOLENS_OIDC_METADATA_URL`
- `INFOLENS_OIDC_CLIENT_ID`
- `INFOLENS_OIDC_CLIENT_SECRET`
- `INFOLENS_ALLOWED_EMAIL_DOMAIN` 或 `INFOLENS_ALLOWED_EMAILS`

在身份系统中登记回调地址：

```text
https://你的域名/auth/callback
```

## 3. 启动

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
```

Caddy 会为配置的域名自动申请和续期 HTTPS 证书。

## 4. 更新与备份

更新代码后：

```bash
docker compose up -d --build
```

提取文件存放在 `infolens_output` 命名卷中。上线前应配置云硬盘快照或定期备份，
并制定图片保留期限。

## 5. 安全检查

- CRM 密钥已更换，且只存在服务器 `.env` 中。
- 8000、8765 端口未对公网开放。
- 访问首页、API 和图片都需要登录。
- `.env` 权限建议设为 `chmod 600 .env`。
- 定期查看 `docker compose logs`，更新基础镜像与 Python 依赖。
