# 第三方规则引擎致谢

本合集棋类规则参考并部分采用以下宽松许可证开源实现（未引入 GPL）：

## 中国象棋
- **lengyanyu258/xiangqi.js**（BSD-2-Clause）  
  https://github.com/lengyanyu258/xiangqi.js  
  文件：`games/xiangqi/xiangqi-engine.js`  
  用途：走法生成、合法性、将军/将死/困毙判定（马蹩腿、象眼、炮隔、将帅对面等）。

## 黑白棋 / 五子棋
- 规则算法按公开标准实现（八向翻转、末子四向五连），并对照 MIT 实现思路校验：  
  - geon/Othello-in-Typescript、sen-ltd/gomoku-ai、celaldrg/gomoku 等。  
  本仓库为自写逻辑层 + 自写 UI，不整仓拷贝。

## 飞行棋
- 规则说明对齐常见中国飞行棋 / Ludo：`6` 起飞、`6` 再掷、撞子回基地、安全格、精确入终点，以及**颜色飞跃**与**飞行通道**捷径。  
  捷径触发表与同色格索引对齐 MIT 项目 [netmanfisher/chinese-ludo](https://github.com/netmanfisher/chinese-ludo)（并参照 DynamsoftRD/Modern-Ludo 规则描述）后**重写**逻辑与绘制，未 vendoring 其 UI。

各许可证全文见上述项目仓库；分发本合集时请保留本说明与引擎文件头版权声明。

## 斗地主：flutter/games 架构与交互参考

`games/doudizhu/` 参考 [flutter/games](https://github.com/flutter/games) 的 `templates/card`、`templates/basic`，研究版本 `e3ba3c566e332c6f6c0dd54ce2a6306b7abf114b`。参考内容：规则模型/展示分离、响应式手牌组件、设置/进度持久化、音效/音乐 facade 与应用生命周期暂停。项目卡牌模板不是斗地主，不提供本作斗地主规则或 AI。

本作为原生 HTML/CSS/JavaScript 新实现，没有复制其 Dart 源码或素材；保留参考代码的 BSD 三条款通知于 [`games/doudizhu/REFERENCE-LICENSE.txt`](games/doudizhu/REFERENCE-LICENSE.txt)。Flutter 仓库根 LICENSE 还包含其他第三方条款，模板音乐为 CC-BY（Mr Smith）、音效 CC0、字体另有许可；本作均未采用。扑克牌用系统字符与 CSS，音效/轻背景旋律用 WebAudio 原创合成，无外部字体、音轨或运行时 CDN。具体研究文件与映射见 [`games/doudizhu/README.md`](games/doudizhu/README.md)。
