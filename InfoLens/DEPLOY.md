# InfoLens 腾讯云部署

## 架构

浏览器 → Caddy（HTTPS）→ Nginx → Gunicorn/Flask → CRM API

图片请求先由 Flask 校验登录。校验通过后 Flask 返回仅供 Nginx 使用的
`X-Accel-Redirect`，由 Nginx 从只读持久化卷直接发送图片，避免占用 Gunicorn
工作线程。`/_protected_media/` 是 Nginx `internal` 路径，不能被外部直接访问。

企业微信智能机器人 → WebSocket 长连接进程 → CRM API

应用和 Nginx 容器均不暴露公网端口；只有 Caddy 开放 80/443。提取结果保存在
Docker 持久化卷中，登录、图片和 API 均受鉴权保护。

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

## 4. 接入企业微信 API 模式智能机器人（无需域名）

1. 登录企业微信管理后台，进入“安全与管理 → 管理工具 → 智能机器人”。
2. 创建机器人并选择“API 模式”，连接方式选择“使用长连接”。
3. 获取 Bot ID 和 Secret。Secret 只显示一次，丢失后需要重新生成。
4. 在服务器 `.env` 中设置：

```dotenv
WECOM_BOT_ENABLED=true
WECOM_BOT_MODE=long_connection
WECOM_BOT_ID=机器人详情页中的Bot ID
WECOM_BOT_SECRET=长连接页面中的Secret
INFOLENS_CRM_SECRET_KEY=CRM接口密钥
```

5. 只启动机器人服务：

```shell
docker compose up -d --build wecom-bot
docker compose logs -f --tail=100 wecom-bot
```

日志出现“企业微信长连接认证成功”后，将机器人添加到内部群聊，在群内
`@机器人` 并发送 CRM 拜访链接；单聊机器人时可直接发送链接。

机器人只解析、去重并分发链接到 SQLite 队列，随后由后台消费者提取图片。
生成的文件按 `业务员/终端_拜访ID` 存放，提交人和企微消息 ID 记录在
`wecom_submission.json` 中。网页“分发处理”Tab 按业务员展示：

- 数量：已完成任务中 field 的唯一值数量；
- 分发数量：机器人分发的链接数量；
- 待下载数量：尚未下载任务中 field 的唯一值数量。

点击“下载全部”会把该业务员所有已完成图片按 `field_终端` 分组打包。

长连接不需要域名、公网 IP、HTTPS 或开放入站端口，但运行机器必须能够访问
`wss://openws.work.weixin.qq.com` 和 CRM API。若认证失败，检查 Bot ID、
Secret，并确认机器人后台选择的是长连接模式。

没有 Docker 时，可使用 Python 3.12 虚拟环境直接运行：

```shell
./start-wecom-bot.sh
```

如未来改用 URL 回调，可将 `WECOM_BOT_MODE` 设置为 `callback`，补充 Token
和 EncodingAESKey，并配置 `/api/wecom/bot/callback` 公网 HTTPS 地址。

## 5. 更新与备份

更新代码后：

```bash
docker compose up -d --build
```

提取文件存放在 `infolens_output` 命名卷中，备份存放在独立的
`infolens_backups` 命名卷中。

补全缺失或过期的缩略图：

```bash
docker compose run --rm maintenance thumbnails
```

一致性备份 SQLite 和全部图片文件，并保留最近 30 天：

```bash
docker compose run --rm maintenance backup --retention-days 30
```

仅备份 SQLite：

```bash
docker compose run --rm maintenance backup --database-only --retention-days 30
```

维护命令使用 SQLite Backup API 生成可恢复的数据库副本，不会直接复制正在使用的
WAL 文件。完整图片备份建议安排在业务低峰期，并额外配置腾讯云硬盘快照或将备份卷
同步至对象存储，避免服务器磁盘损坏时源数据和备份同时丢失。

可在服务器 `crontab -e` 中增加以下任务。请把 `/opt/infolens/InfoLens` 改为实际
部署目录：

```cron
15 2 * * * cd /opt/infolens/InfoLens && /usr/bin/docker compose run --rm maintenance thumbnails >> /var/log/infolens-maintenance.log 2>&1
45 2 * * * cd /opt/infolens/InfoLens && /usr/bin/docker compose run --rm maintenance backup --retention-days 30 >> /var/log/infolens-backup.log 2>&1
```

## 6. 安全检查

- CRM 密钥已更换，且只存在服务器 `.env` 中。
- 8000、8765 端口未对公网开放。
- 访问首页、API 和图片都需要登录。
- `.env` 权限建议设为 `chmod 600 .env`。
- 智能机器人 Secret 只保存在服务器 `.env` 中。
- 确认 `nginx` 服务健康，外部无法直接访问 `/_protected_media/`。
- 定期查看 `docker compose logs`，更新基础镜像与 Python 依赖。
