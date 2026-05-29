# CCONFIG

面向 C程序 的 **YAML 配置加工平台**：把第三方订阅或本地配置，通过规则与代码修改器链式编排，输出可订阅的最终配置 URL。

## 功能

- **配置源**：从订阅 URL 拉取、本地上传或从模板创建；支持定时刷新与 Base64 自动解码
- **修改器**：用规则（替换、正则、列表头尾插入）或按路径编写 JS，对配置逐项加工
- **配置方案**：选定一个配置源，按顺序串联多个修改器，生成最终 YAML
- **预览调试**：查看每一步的中间结果、相邻步骤差异，以及指定配置项在各步骤中的变化
- **访问控制**：可选 OIDC 登录，仅白名单内的用户可进入管理端
- **配置编辑**：基于 Mihomo 配置项 Schema，在网页编辑器中获得路径与类型提示

## 使用方式

### 管理端（维护配置）

1. 若已启用 OIDC，先登录管理界面；未启用时可直接访问。
2. 在「配置源」中新建源：填写订阅链接、上传文件，或从模板开始编辑。
3. 在「修改器」中编写规则或代码，定义要如何改动配置。
4. 在「配置方案」中选择一个配置源，并依次添加要应用的修改器。
5. 在方案页面预览各步骤结果，确认无误后保存。

### 订阅端（拉取成品）

将配置方案对应的输出地址配置到客户端（路由器、手机、电脑等）：

```http
GET /api/output/:schemeId.yaml
```

其中 `:schemeId` 为方案 ID，可在配置方案页面查看。


## 环境变量

### 路径与运行

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CCONFIG_CONFIG_DIR` | 部署配置目录，读取 `$dir/config.yaml` | 项目根目录；Docker 为 `/config` |
| `CCONFIG_DATA_DIR` | 运行时数据目录 | 项目根目录；Docker 为 `/config` |
| `PORT` | HTTP 监听端口 | `8787` |
| `TRUST_PROXY` | 反向代理信任（`true` / `false` / 跳数） | 生产环境 `1` |
| `CCONFIG_BASE_PATH` | 子路径部署前缀（如 `/cconfig`） | 空（根路径） |
| `WEB_DIST` | 前端静态资源目录 | `../web/dist` |
| `CORS_ORIGIN` | 允许的跨域 Origin，逗号分隔 | 生产环境不启用；开发环境允许 localhost |
| `CCONFIG_LOG_DEBUG` | 调试日志（`true` / `1`） | 关闭 |

### OIDC

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CCONFIG_OIDC_ENABLED` | 是否启用 OIDC（`true` / `1` / `yes`） | **关闭** |

OIDC **默认关闭**。仅当 `CCONFIG_OIDC_ENABLED=true` 且 `config.yaml` 中存在完整 `oidc` 配置时才会启用；否则回退为关闭并打印警告日志，服务仍可正常启动。

启用 OIDC 后，具体参数（issuer、clientId 等）**全部写在 `config.yaml` 中**，不支持通过其他环境变量覆盖。

## OIDC 配置

复制示例并按需修改：

```bash
cp config/config.example.yaml config.yaml   # 本地
# Docker：复制到挂载目录，如 /config/config.yaml
```

`config.yaml` 示例：

```yaml
oidc:
  issuer: "https://your-idp.example.com"
  clientId: "your-client-id"
  clientSecret: "your-client-secret"
  # 留空则按当前访问地址自动推导
  redirectUri: ""
  scope: "openid profile email"
  preferredUsernameWhitelist:
    - "admin"
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `issuer` | 是 | IdP Issuer URL |
| `clientId` | 是 | OIDC 客户端 ID |
| `clientSecret` | 是 | OIDC 客户端密钥 |
| `preferredUsernameWhitelist` | 是 | 允许登录的用户名列表 |
| `redirectUri` | 否 | 回调地址，建议生产环境写死为 `https://你的域名/api/auth/oidc/callback` |
| `scope` | 否 | 授权范围，默认 `openid profile email` |

启用步骤：

```bash
export CCONFIG_OIDC_ENABLED=true
# 确保 config.yaml 位于 CCONFIG_CONFIG_DIR 所指目录
```

启动时会请求 `{issuer}/.well-known/openid-configuration` 拉取 IdP 元数据。

## Docker 运行

```bash
cp docker-compose.example.yml docker-compose.yml
cp config/config.example.yaml config.yaml   # 按需编辑 OIDC
# 启用 OIDC 时在 docker-compose.yml 中取消注释 CCONFIG_OIDC_ENABLED
docker compose up -d --build
```

`docker-compose.example.yml` 核心配置：

```yaml
environment:
  CCONFIG_DATA_DIR: /config
  CCONFIG_CONFIG_DIR: /config
  # CCONFIG_OIDC_ENABLED: "true"
volumes:
  - cconfig-data:/config
```

服务默认监听 `8787` 端口。

卷挂载路径须与 `CCONFIG_DATA_DIR`、`CCONFIG_CONFIG_DIR` 一致（示例中均为 `/config`）。若改为 `/data`，应同时修改环境变量与 `volumes` 映射，例如 `cconfig-data:/data`。镜像 entrypoint 会在启动时将挂载目录 `chown` 给容器内 `cconfig` 用户，避免权限错误。

## License

[ISC](LICENSE)
