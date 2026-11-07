# AGENTS.md — mini-arcade 协作注意事项

面向后续代理与协作者。仓库是五游戏合集 PWA，已部署：

https://liuzhuoling2011.github.io/mini-arcade/

远端 `main` 含显示优化提交 `89dac3d`（及之后文档提交）。**原来的五个独立游戏仓库与各自 Pages 必须保持不动**，不要合并或改写它们。

本地启动方式见 `README.md`（带 `/mini-arcade/` 前缀的静态服务，勿用 `file://`）。

---

## 1. 发布方式（本机 gh / git，不用 Cursor）

- 用本机已登录的 `gh` / `git`，账号 `liuzhuoling2011` 推送并配置 Pages。
- **不要**再用 Cursor CloudAgent / `cursor[bot]` 推送：该身份对 `liuzhuoling2011/mini-arcade` 曾反复 **HTTP 403**。
- 站点根目录需要 `.nojekyll`（已有则保留）。
- 开启 Pages（尚未配置时）：

```bash
gh api -X POST repos/liuzhuoling2011/mini-arcade/pages --input - <<'JSON'
{"build_type":"legacy","source":{"branch":"main","path":"/"}}
JSON
```

- 若 Pages 已存在，改为 PUT / 更新 `source` 为 `branch: main`、`path: /`。
- 推送：`git push origin HEAD:main`（**禁止 force push**）。
- **不要**把凭证、token 写进文档或命令输出。

---

## 2. 路径前缀与 PWA

- 线上所有资源在 **`/mini-arcade/`** 下。
- 本地预览必须用带此前缀的静态服务（见 README），不要用 `file://`。
- Service Worker **只接管** `/mini-arcade/` 前缀，勿扩大作用域以免影响同账号其他 Pages。

---

## 3. 显示目标（合集壳 + 触控）

- 游戏画面区域尽可能大；合集顶栏保持矮（约 **32–37px**），长说明可隐藏。
- 虚拟键盘：**半透明**、尽量不挡画面（可悬浮在边上）；`touch-action: none`。
- 桌面 **1920×1080**：不要出现虚拟方向键。

---

## 4. 分游戏布局约定

### 大鱼 / 矿工

- 固定宽高比（约 **640:480** / **550:400**）。
- 竖屏宽度已顶满时，不要再强行加高，以免变形或裁切。
- 摇杆 / 放钩 / 炸药留在画面外黑/蓝边上。

### 贪吃蛇 / 俄罗斯方块

- 方向键半透明（约 `rgba` alpha **0.34**）、悬浮，不另占一整栏。
- 横屏优先保棋盘/井，键缩小靠边。
- 桌面应尽量放大棋盘，勿锁死过小尺寸。

### 2048

- 无虚拟键。
- 横屏必须保持**正方形棋盘**并整块缩小；禁止只压高度导致数字被裁。

---

## 5. 验收截图

- Chrome 视口模拟（1920×1080、393×852、852×393）**不等于**真机 WebKit。
- `env(safe-area-inset-*)` 在模拟里常为 **0**；真机刘海需另测。
- 截图时尽量进入实局，避免暂停遮罩挡画面。

---

## 6. 明确不要做的事

- 不要合并 / 改写五个独立游戏仓库或其 Pages。
- 不要 force push。
- 不要依赖 Cursor CloudAgent 推送本仓库。
- 不要把密钥或登录态写进文档、提交或日志。
