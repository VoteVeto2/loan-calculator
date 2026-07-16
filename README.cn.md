# 贷款计算器

[English](./README.md) | **简体中文**

单页贷款记账工具：录入一笔贷款，添加罚息利率区间和分期还款，查看每笔还款在利息与本金之间的分摊及实时余额。每次计算保存为一个命名会话。无需构建。

## 运行

**含 git 跟踪历史（推荐）。** 需要 [Bun](https://bun.sh)：

```bash
bun install
bun start       # http://localhost:5173
```

会话写入 `data/sessions/<id>.json` —— 提交这些文件，历史即可随仓库同步。

**独立运行。** 双击 `index.html`，直接以 `file://` 打开，数据保存在浏览器 `localStorage`（按浏览器、按设备隔离）。

## 使用

1. **贷款信息** —— 金额、年利率（按百分数填写）、起息日，以及计算截止日。高级选项：计息基数 `365`（民间借贷）或 `360`（人民银行口径）。
2. **还款**（可选）—— 每笔先冲利息、再冲本金，超出部分显示为多付（《民法典》第 561 条）。
3. **罚息区间**（可选）—— 左闭右开日期范围 `[起, 止)`，在区间内覆盖基础利率；重叠时以后添加的为准。

结果随输入实时重算：固定的**尚欠**面板加逐日台账。页首/页脚的快捷操作可加载示例贷款、运行内置校验。

## 利息如何计算

时间轴在每个事件处切分（起息日、罚息边界、还款日、截止日），每个区段按单利计提：

```
segmentInterest = principalAtSegmentStart * (annualRate / dayBasis) * segmentDays
```

天数左闭右开（计起始日，不计结束日）。未付利息结转但不计复利。仅在显示时四舍五入到两位小数。

## 测试

```bash
bun install
bun run test    # engine 5/5 · DOM 25/25 · server 18/18
```

（用 `bun run test`，不要用 `bun test`。）三层：`test:engine`（纯计算，无依赖）、`test:dom`（jsdom 中驱动真实界面）、`test:server`（启动 `server.mjs` 并驱动真实客户端）。

## 结构

```
index.html      页面结构 · styles.css  配色 + 布局
js/engine.js    纯贷款计算            js/store.js   持久化（服务器或 localStorage）
js/render.js    视图层                js/app.js     控制器
js/fixtures.js  验收场景
server.mjs      Bun 服务器 + data/sessions/ 的 REST API
test-*.mjs      三层测试 · onboard.md  贡献者指南
```

脚本以传统 `<script>` 标签加载（非 ES 模块），因此双击 `index.html` 也能从 `file://` 正常运行。

## 限制

仅支持单利 —— 不计复利，无等额本息/等额本金摊还计划。不强制法定上限（4 倍 LPR、24%/36%）。不构成法律或财务建议。
