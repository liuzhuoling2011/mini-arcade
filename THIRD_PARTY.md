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
