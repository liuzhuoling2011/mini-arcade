# 翡翠牌社 · 斗地主

轻量静态 HTML/CSS/原生 ES Modules，**单人对两名 AI**，不含联网多人、账号、真钱或后端；不使用 Flutter 运行时、CDN、外部字体或下载音轨。合集入口 `/mini-arcade/games/doudizhu/`。

## 参考项目：真实发现与取舍

通过 GitHub `gh api` 远程阅读 [flutter/games](https://github.com/flutter/games)（研究时 main 为 `e3ba3c566e332c6f6c0dd54ce2a6306b7abf114b`）的根 README、目录树、LICENSE，以及：

- [`templates/card/README.md`](https://github.com/flutter/games/blob/e3ba3c566e332c6f6c0dd54ce2a6306b7abf114b/templates/card/README.md)：它是带菜单、设置、声音、拖放和最小状态管理的**卡牌/棋盘游戏壳**，不是斗地主实现。
- `templates/card/lib/game_internals/board_state.dart`：模型与展示分离、监听手牌变化、手牌为空触发胜利；本作将规则、动作生成、叫分和结算独立为纯规则模块 `engine.mjs`，UI 不另写一套判牌。
- `templates/card/lib/play_session/player_hand_widget.dart`：手牌按可用空间 Wrap、卡牌是独立交互组件。本作用独立牌组件和响应式手牌行，手机竖屏分两行，点选 / 横向拖扫，而不是搬用 Flutter 拖放 API。
- `templates/card/lib/audio/audio_controller.dart`：独立音频 facade、music / sfx 分轨设置、应用生命周期暂停恢复；本作用 `audio.mjs` 的 WebAudio facade，首次手势解锁、独立开关和总音量、后台/合集切换暂停。
- `templates/card/lib/style/responsive_screen.dart` 和 `templates/basic/README.md`：布局根据可用尺寸适配、按功能组织。本作分为引擎、音频、持久化、展示与测试，无构建依赖。

目录树与上述规则模型中**未发现斗地主实现**；所有斗地主规则、AI、计分、界面、合成音效与旋律均为此站新实现，不声称来自 Flutter 项目，也未复制其 Dart 源码/图片/字体/声音。参考项目代码使用 BSD 风格（三条款）许可，保留通知见 `REFERENCE-LICENSE.txt`。其根 LICENSE 还汇集部分第三方许可；卡牌模板 README 标明音乐为 Mr Smith 的 CC-BY、音效为 CC0，字体有自己的许可；本作没有使用这些素材。

## 功能与规则约定

- 完整 54 张；17×3 + 3 底牌；逐局轮换起叫；轮流叫更高的 1/2/3 分或不叫，3 分立即定地主，全不叫重发；地主 20 张先出。
- 单 / 对 / 三、三带一 / 二、顺子 ≥5、连对 ≥3 对、飞机无翅 / 单翅 / 对翅、四带二单 / 二对、炸弹、王炸。连续主体不含 2 / 王。
- 飞机翅膀不复用主体点数；单翅可重复为对子，每点最多 2 张；对翅须不同点数对子。主体可以从四张拆三张，但剩余同点牌不可作为自己的翅膀。
- 四带二单可带一对，也可带双王；四带二对须两种不同点数对子。四带二不算炸弹。非癞子玩法。规则弹窗与引擎、测试保持同一约定。
- 同牌型同长度比主体；炸弹压普通牌，王炸最大；两次不出清桌。先出完一方胜利。
- 叫分 × `2^(炸弹数+王炸数+春天数)` = 单位分；地主 ±2 单位，两农民各 ∓1 单位，严格零和；地主赢且两农民未出牌为春天，农民赢且地主只出一次为反春天。
- 结算显示胜方、叫分、炸弹/王炸次数、春天/反春天、最终倍数及三席明细。localStorage 保存累计虚拟分、胜局/总局、地主战绩、最佳局分和偏好；不可用时仍可玩。
- 三难度启发式 AI：休闲偏低牌与多张；标准农民避压队友并保留炸弹；挑战额外评估余手点数组合、避免拆炸、下家告急时拦截。AI **只读自己手牌、公开队伍/剩余张数**，不读取暗牌；同一动作生成器提供提示、托管、AI。
- 点选 / 拖扫可取消；提示轮换合法方案；合法才可出牌；领出不可不出；托管可收回。H 提示、P / 空格不出、Enter 出牌、Esc 重选、数字 0–3 叫分，卡牌也可 Tab / 空格选择。
- 发牌、底牌翻开、出牌飞入/清桌收拢、炸弹/王炸/春天庆祝；尊重 reduced-motion。独立音效、默认关闭轻 BGM、总音量；首次手势才解锁。
- visibility、pagehide/pageshow、同源父壳 suspend/resume 生命周期；暂停/新局清除 AI 定时器，以局号阻断旧回调。不默认暴露调试状态或对手牌。
- PWA v13，SW 仅 `/mini-arcade/`，大厅预缓存，游戏访问后才缓存。

## 可复现测试

仓库根目录：

```sh
node --test games/doudizhu/tests/engine.test.mjs
python3 games/doudizhu/tests/serve.py --port 8093
# 另一个终端（测试依赖不写入仓库）
npm install --prefix /workspace/doudizhu-artifacts playwright@1.58.2 --no-audit --no-fund
NODE_PATH=/workspace/doudizhu-artifacts/node_modules \
  node games/doudizhu/tests/browser.test.mjs
```

预览：`http://127.0.0.1:8093/mini-arcade/games/doudizhu/`。脚本默认使用 `/opt/google/chrome/chrome`，可设置 `CHROMIUM_PATH`；`TEST_URL` 可换服务地址，`ARTIFACT_DIR` 可换产物目录。`serve.py` 为测试用静态服务，不是生产服务器。

单元测试覆盖每类牌型、比较、非法/边界、全不叫/抢叫、清桌、牌权、春天/反春/炸弹、持久化损坏与新局隔离；40 组十张手牌枚举所有非空子集，验证合法行动生成完整；3000 局 seeded AI 全程检查动作合法、54 牌守恒、有限步终局与结算零和。

浏览器测试：1440×900、390×844、844×390、768×1024，实局 20 张手牌截图、触摸选择/取消、拖扫、提示、出牌、父壳暂停、新局清计时、托管至结算、偏好/战绩刷新保持；并测 SW 旧缓存清理、scope、按需缓存、已访游戏离线可玩、未访游戏离线提示和 JS pageerror；另外以 150ms 延迟、64KB/s 下载限速测试冷启与离线二开。截图与 JSON/日志放 `/workspace/doudizhu-artifacts/`（不提交二进制截图）。

## 已知边界

AI 是启发式而非搜索/机器学习最优策略；仅本机浏览器一人对电脑，无联网多人。刷新不恢复进行中的牌局，只保留已结算战绩和设置。Chromium 视口测试不是 iPhone 真机 WebKit 或刘海安全区验收。音乐为原创轻量合成循环，不含真人语音。游戏使用随机洗牌，无加密公平性承诺（纯本地娱乐）。

## 本次验收结果（2026-11-20，Asia/Shanghai）

- Node 测试 **27/27** 通过；**3000** 局完整 AI 对弈、**97,744** 次出牌/不出、**711** 次全不叫重发，单局最多 **71** 步（含叫分/重发）；无非法动作、丢牌/重复牌、无法终局或非零和结算。
- 四个指定视口全部通过布局/触摸/拖扫/键盘/托管结算/持久化/暂停测试，无水平或垂直溢出，JS pageerror **0**。叫分尚未结束时底牌不揭露。
- SW v13 作用域、v12 缓存清理、大厅不预拉游戏、已访问游戏离线可玩、未访问游戏离线提示均通过。150ms 延迟、64KB/s 下载限速冷启约 **0.79s**，离线二开约 **0.04s**（本机 Chromium 实测，非真实移动网络保证）。
