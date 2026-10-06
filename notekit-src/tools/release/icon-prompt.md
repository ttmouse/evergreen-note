# Evergreen note 应用图标 · 生成提示词

给 GPT（ChatGPT 图像生成）用的提示词，产出 macOS 应用图标。

**2026-10-06 重写**：第一版提示词把"叶脉 + 层级节点 + 双链箭头"当成卖点写进了提示词，
模型就把清单上每一样都画了上去——四张候选全是"叶子 + 五个节点 + 双箭头 + 叶脉"的堆叠。
图标不是插图：**极简只能靠元素预算约束，不能靠描述叠加**。本文件是约束优先版本。

配色取自应用自己的主题 token（`src/assets/workspace-theme.css`），不是凭空定的：

| 角色 | 深色主题（应用日常观感） | 浅色主题 |
|---|---|---|
| 画布 / 侧栏底 | `#1C2529` / `#222D32` | `#FAFAFC` |
| 笔记表面 | `#29353A` | `#FFFFFF` |
| 正文墨色 | `#E3EBED` | `#333333` |
| 强调色 | `#9BC4CE`（浅青） | `#0A84FF` |

## 铁律：一个图标 = 一个形状

| 允许 | 禁止 |
|---|---|
| 1 个主形（实心剪影） | 2 个以上并列的形状 |
| 最多 1 个色调细节（折角、叶柄、一道阴影） | 箭头、节点图、连线、圆点群、叶脉网、齿轮、大脑、机器人、云 |
| 负空间表达第二层含义 | 图标里再套图标 |

判断标准：**缩到 16px 还能一眼认出是什么**。认不出的元素，就是在占地方。

## 主提示词（英文，直接粘给 GPT）

```text
Design a macOS app icon for a note-taking app called "Evergreen note".

THE RULE THAT MATTERS MOST: the icon is ONE single shape and nothing else.
No symbols, no diagrams, no arrows, no small circles, no connecting lines, no leaf
veins, no icons inside icons. If you feel like adding a second element, do not —
use negative space or one tonal step instead. One silhouette. That is the whole icon.

SUBJECT (pick exactly one):
- a single leaf with a short stem, tilted about 30 degrees, as a solid silhouette, or
- a single note page with a folded corner, where the fold is the only detail

STYLE:
- flat vector, one crisp silhouette, perfectly centred
- two colours plus at most one darker tonal step: background #1C2529,
  shape #9BC4CE, optional detail one step darker
- the shape fills about 55-60% of the icon, with a generous even margin
- thick solid forms only: no hairlines, no thin strokes, no small parts
- must still be recognisable at 16x16 px

SHAPE: one rounded square ("squircle") filling the entire 1024x1024 frame, corner
radius about 22% of the side, like Apple's Big Sur app icons. Nothing outside it:
no backdrop, no outer shadow, no white margin.

NEVER INCLUDE:
- arrows, node diagrams, networks, graph edges, scattered dots, gears, brains,
  robots, clouds, magnifiers
- text, letters, numbers, watermarks, signatures
- device mockups, desks, scenes, frames, captions, UI chrome
- 3D bevel, gloss, glass, neon glow, drop shadow, gradients with more than one step
- photorealism, clip art, mascots, more than one leaf, more than one page

OUTPUT: one icon only, 1:1 square, flat colours, centred, edge to edge, as if
exported from a vector editor.
```

## 更稳的用法：把参考图一起传上去

文字约束再多，也不如给模型一张"就这么简单"的图。把下面任一张作为**附件**上传，
然后粘上面的提示词（开头加一句 `Match the attached reference image's level of simplicity.`）：

- `notekit-src/artifacts/release/icon-candidates/icon-a-page.png` —— 一页笔记 + 折角
- `notekit-src/artifacts/release/icon-candidates/icon-c-leaf-tilt.png` —— 一片斜叶 + 叶柄

这两张是用代码画的（`icon-candidates/icon-mock.py`、`icon-mock-leaf.py`），
配色与 macOS squircle 形状都按正本生成，本身就可以直接当成品用。

## 它还是画复杂了的时候（一句话修正）

```text
Too complex. Remove everything except the single main shape. The icon must have
exactly one silhouette and at most one tonal detail. Delete all other elements.
```

## 出图后交给 agent 做工程化

拿回来的东西：**一张 1024×1024 的 PNG**（原图，不要压缩、不要自己加白边或圆角）。

agent 侧要做的事（`tools/build-dmg.mjs --icon` 已预留）：

1. 用 macOS squircle 掩膜把"铺满画面"的圆角方形裁成标准图标体（824×824 居中于 1024 透明画布），
   四角外侧一律抠掉，避免留下生成图的白角。
2. 生成 iconset 十个尺寸（16/32/128/256/512 及各自 @2x），`iconutil -c icns` 打包。
3. **16px 目检**：`sips -Z 16` 缩放后并排比对，认不出来的直接淘汰（图标真正的日常尺寸）。
4. 写入 `Contents/Resources/electron.icns` + `CFBundleIconFile`，重签、重打 dmg、重跑自测。
5. 更新 Release 资产（或发 v1.5.2）。

## 生成侧的两个坑

- ChatGPT 出图**没有透明通道**：让它把圆角方形铺满整张画布（提示词里已写），四角外侧的
  杂色由 agent 用掩膜抠掉，不要指望模型给你透明背景。
- 模型很容易画成"一台电脑屏幕上放着这个图标"的展示图。出现这种结果时，追加一句
  `Remove the device and the background scene. Show only the icon itself, edge to edge.`
