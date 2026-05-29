# config-schema.yaml

Mihomo/Clash 配置项的**显式 schema**（单一数据源），位于 `server/data/`，随服务镜像发布。

| 字段 | 说明 |
|------|------|
| `key` | YAML 键名（kebab-case，仅用于 YAML 编辑） |
| `type` | `string` / `number` / `boolean` / `array` / `object` / `null` |
| `description` | 中文说明（配置编辑器 tooltip） |
| `default` | 示例默认值 |
| `enum` | 可选枚举值（配置编辑器下拉） |
| `rules` | 校验规则（`range` / `regex` / `minLength` / `maxLength`） |
| `properties` | 子对象字段（递归） |
| `items` | 数组元素 schema |

**属性顺序**：文件中同级 `properties` 数组顺序即为 UI / 代码桩顺序。

**维护方式**：直接编辑 `config-schema.yaml`。若从旧版 YAML 注释目录重新生成：

```bash
cd server && npm run generate-schema
```

生成脚本会合并 `config-catalog-legacy` 推断结果，并补充 `proxies` / `proxy-groups` 等常用数组字段。
