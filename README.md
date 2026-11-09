# 贵州鑫向晨商贸工作台

贵州鑫向晨商贸工作台是一套面向本地商户酒饮供应链业务的 CRM 图片处理系统，用于集中处理拜访照片的提取、入库、查询、筛选、选择和导出，帮助业务团队把 CRM 拜访链接中的照片资料沉淀为可检索、可归档、可导出的图片资产库。

## 项目定位

系统服务于商贸公司日常业务管理场景，重点解决以下问题：

- 从 CRM 拜访详情链接中提取门店拜访照片。
- 按终端编码、客户名字、业务员、拜访月份归档照片。
- 支持单链接提取和 Excel 批量提取。
- 支持按月份、业务、终端编码、客户名字筛选图片。
- 支持图片预览、选择和批量导出。
- 支持账号密码登录、超级管理员和用户权限管理。
- 支持企业微信机器人接收链接并进入后台处理流程。

## 核心功能

### CRM 图片处理

- 单链接提取：输入 CRM 拜访详情链接后提取图片。
- 批量提取：上传 Excel 文件，批量解析链接并提取图片。
- 图片库管理：按终端编码、客户名字、业务和月份聚合展示。
- 月份归属：严格根据 `visit_in_time` 字段判断拜访月份，不按提取时间归类。
- 图片查看：单击图片可全屏预览。
- 图片选择：支持单张选择、当前结果全选和取消选择。
- 导出照片：将选中的照片按终端分组打包导出。

### 权限管理

- 超级管理员账号可持续访问系统。
- 管理员可新增、编辑、删除普通用户。
- 用户登录采用账号和密码校验。
- 支持用户启用、禁用和角色管理。

### 企业微信接入

- 支持企业微信 API 模式智能机器人。
- 支持长连接模式接收 CRM 拜访链接。
- 机器人提交的链接可进入后台队列处理。
- 分发记录可按业务员汇总、下载和清理。

## 技术架构

- 后端：Flask
- 前端：React + Arco Design
- 数据存储：SQLite，后续可迁移 MySQL/PostgreSQL
- 图片存储：本地文件目录
- 部署：Docker Compose + Caddy + Nginx + Gunicorn
- 企业微信：API 模式智能机器人长连接

## 目录结构

```text
GuYue/
├── InfoLens/
│   ├── frontend/              # React 前端源码
│   ├── infolens/              # 后端核心模块
│   │   ├── extractor.py       # CRM 链接解析与图片提取
│   │   ├── image_library.py   # 图片库入库、查询和导出
│   │   ├── users.py           # 用户与权限管理
│   │   ├── distribution.py    # 分发任务记录
│   │   └── wecom_ws.py        # 企业微信长连接处理
│   ├── tests/                 # 自动化测试
│   ├── web/                   # 构建后的前端静态资源
│   ├── web.py                 # Flask 应用入口
│   ├── start-local.sh         # 本地启动脚本
│   ├── compose.yaml           # Docker Compose 配置
│   └── DEPLOY.md              # 部署说明
└── README.md
```

## 本地运行

进入项目目录：

```bash
cd InfoLens
```

复制环境变量模板：

```bash
cp .env.example .env
```

配置必要环境变量：

```dotenv
INFOLENS_AUTH_MODE=password
INFOLENS_SESSION_SECRET=replace-with-random-secret
INFOLENS_SUPER_ADMIN_USERNAME=admin
INFOLENS_SUPER_ADMIN_PASSWORD_HASH=replace-with-password-hash
INFOLENS_CRM_SECRET_KEY=replace-with-crm-secret
```

启动本地服务：

```bash
PYTHON_BIN=python3 ./start-local.sh
```

访问：

```text
http://127.0.0.1:8765
```

## 前端构建

```bash
cd InfoLens/frontend
npm install
npm run build
```

构建产物会输出到 `InfoLens/web/assets`。

## 测试

```bash
cd InfoLens
python3 -m unittest tests/test_extractor.py tests/test_image_library.py tests/test_web.py
```

## 数据说明

当前系统默认使用 SQLite：

```text
InfoLens/output/_system/users.sqlite3
InfoLens/output/_system/image_library.sqlite3
InfoLens/output/_system/distributions.sqlite3
```

图片文件默认存储在：

```text
InfoLens/output/_image_library
```

SQLite 适合早期上线、小团队内部使用和单机部署。若后续用户数、批量提取任务和图片库规模持续增长，建议迁移到 MySQL 或 PostgreSQL，并将图片文件迁移到对象存储。

## 上线建议

- 生产环境必须开启登录鉴权。
- `.env` 不得提交到 Git。
- CRM 密钥、超级管理员密码哈希和企业微信 Secret 只保存在服务器环境变量中。
- 图片库和 SQLite 数据库需要定期备份。
- 外网只开放 80/443，不直接暴露 Flask 端口。
- 批量提取建议保持队列化处理，避免高并发写入数据库。
- 生产环境由 Nginx 使用 `X-Accel-Redirect` 直接发送鉴权后的图片文件。
- 使用 Compose 维护服务补全缩略图并生成 SQLite 与图片备份。

## 部署文档

腾讯云部署、Docker Compose、Caddy HTTPS 和企业微信机器人接入说明见：

```text
InfoLens/DEPLOY.md
```
