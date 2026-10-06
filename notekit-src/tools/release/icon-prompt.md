# Evergreen note 应用图标 · 生成提示词

给 GPT（ChatGPT 的图像生成 / GPT-4o 图像模式）用的提示词，产出 macOS 应用图标。
配色取自应用自己的主题 token（`src/assets/workspace-theme.css`），不是凭空定的：

| 角色 | 深色主题（应用日常观感） | 浅色主题 |
|---|---|---|
| 画布 / 侧栏底 | `#1C2529` / `#222D32` | `#FAFAFC` |
| 笔记表面 | `#29353A` | `#FFFFFF` |
| 正文墨色 | `#E3EBED` | `#333333` |
| 强调色 | `#9BC4CE`（浅青） | `#0A84FF` |

## 主提示词（英文，直接粘给 GPT）

```text
Design a macOS app icon for a local-first note-taking app called "Evergreen note".

WHAT THE APP IS: a quiet, long-form note app. Notes live in an infinite hierarchy
(an outline tree), any block can link to any other block (bidirectional links), and
all data stays on the user's own machine. It is a reading and thinking tool, not a
social or cloud product.

THE MARK (use this one direction): an evergreen leaf or conifer sprig whose veins
double as a small hierarchy of connected nodes — a 3-5 node tree-branch diagram that
overall reads as a leaf. Two of the nodes are joined by a link, echoing the app's
bidirectional links. Maximum 5 nodes, no more.

STYLE:
- flat vector, geometric, precise, one crisp silhouette
- 2-3 colours maximum, no gradient beyond a single subtle tonal step
- palette anchored on the app's own theme: deep slate-teal background #1C2529
  (or #222D32), pale teal mark #9BC4CE, optionally #E3EBED for the topmost node
- generous negative space; the mark occupies about 60-65% of the icon area, centred
- must still read at 16x16 px: strong silhouette, strokes thick enough to survive
  downscaling (no hairlines), no fine detail, no tiny elements

SHAPE: one rounded square ("squircle") filling the entire 1024x1024 frame, corner
radius about 22% of the side, corners as round as Apple's Big Sur app icons.
Nothing outside that rounded square: no backdrop, no outer shadow, no white margin.

HARD REQUIREMENTS:
- no text, no letters, no words, no numbers, no watermark, no signature
- no device mockup, no desk, no scene, no presentation frame, no caption, no UI chrome
- no 3D bevel, no glossy plastic, no glass reflection, no neon glow, no drop shadow
- no photorealism, no clip-art, no mascot, no robot / brain / cloud iconography
- no Apple logo and no trademarked shape

OUTPUT: one icon only, centred, 1:1 square, flat colours, as if exported from a
vector editor. Generate 4 variations of the same mark (differing in node layout and
light/dark balance) so I can pick one.
```

## 换方向用的备用提示词

不喜欢叶子方向时，把主提示词里 `THE MARK` 一段换掉：

```text
THE MARK (alternative A): three rounded note cards stacked with a slight offset,
the top card carries a leaf-shaped notch cut out of its corner; the stack reads as
"hierarchy" and the notch as "evergreen".
```

```text
THE MARK (alternative B): two filled circles joined by a thick arc, the arc plus the
circles forming the outline of a leaf; the two circles are the two ends of a
bidirectional link.
```

## 迭代提示词（第一版接近但不到位时用）

```text
Keep the same composition and colours. Change only this: <挑一条>
- make every stroke about 30% thicker and remove hairlines
- remove the gradient, use flat colour only
- increase contrast between the mark and the background
- make the mark larger (about 70% of the icon) and centre it perfectly
- simplify to 3 nodes and delete all fine detail so it survives at 16 px
- remove the device / desk / frame, show only the icon edge to edge
```

## 出图后交给 agent 做工程化

拿回来的东西：**一张 1024×1024 的 PNG**（原图，不要压缩、不要自己加白边或圆角）。

agent 侧要做的事（`tools/build-dmg.mjs --icon` 已预留）：

1. 用 macOS squircle 掩膜把「铺满画面」的圆角方形裁成标准图标体（824×824 居中于 1024 透明画布），
   四角外侧一律抠掉，避免留下生成图的白角。
2. 生成 iconset 十个尺寸（16/32/128/256/512 及各自 @2x），`iconutil -c icns` 打包。
3. **16px 目检**：`sips -Z 16` 缩放后与候选并排比对，认不出来的直接淘汰（图标真正的日常尺寸）。
4. 写入 `Contents/Resources/electron.icns` + `CFBundleIconFile`，重签、重打 dmg、重跑自测。
5. 更新 Release 资产（或发 v1.5.2）。

## 生成侧的两个坑

- ChatGPT 出图**没有透明通道**：让它把圆角方形铺满整张画布（提示词里已写），四角外侧的
  杂色由 agent 用掩膜抠掉，不要指望模型给你透明背景。
- 模型很容易画成「一台电脑屏幕上放着这个图标」的展示图。出现这种结果时，追加一句
  `Remove the device and the background scene. Show only the icon itself, edge to edge.`
