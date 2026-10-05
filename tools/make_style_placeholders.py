#!/usr/bin/env python3
"""为 source map 中缺失的样式/语言包创建占位，并把编译好的 index.css 作为样式真源。

背景：原 .less/.css 文件编译后并入 index.css，自身不产生独立模块，
所以不进 source map。逐个反编译没必要——构建产物 index.css 就是全部样式的合并结果，
直接整体引用即可，各缺失文件留空占位以让 import 解析通过。
"""
import os
import shutil

ROOT = os.environ.get(
    "NOTEKIT_SRC",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "notekit-src"),
)
SRC = os.path.join(ROOT, "src")

# (import 写法, 引用它的文件)
STYLES = [
    ("../../../assets/index.css", "src/slate-item/addons/UI/AppComp.tsx"),
    ("../../../assets/normalize.css", "src/slate-item/addons/UI/AppComp.tsx"),
    ("../../../assets/variable.css", "src/slate-item/addons/UI/AppComp.tsx"),
    ("../../styles/variables.less", "src/slate-item/notekit-ui/components/Brick/Brick.tsx"),
    ("../Symbol/Symbol.less", "src/slate-item/notekit-ui/components/Dialog/Dialog.tsx"),
    ("./Bilink.less", "src/slate-item/addons/Bilink/Bilink.tsx"),
    ("./Button.less", "src/slate-item/notekit-ui/components/Button/Button.tsx"),
    ("./Dialog.less", "src/slate-item/notekit-ui/components/Dialog/Dialog.tsx"),
    ("./MDTable.css", "src/slate-item/addons/MDTable/MDTable.tsx"),
    ("./Mask.less", "src/slate-item/notekit-ui/components/Mask/Mask.tsx"),
    ("./OrderedList.less", "src/slate-item/addons/OrderedList/OrderedList.ts"),
    ("./Panel.less", "src/slate-item/notekit-ui/components/Panel/Panel.tsx"),
    ("./Symbol.less", "src/slate-item/notekit-ui/components/Symbol/Symbol.tsx"),
    ("./Tab.less", "src/slate-item/notekit-ui/components/Tab/Tab.tsx"),
    ("./Tip.less", "src/slate-item/components/Tip/Tip.tsx"),
    ("./addonCenter.less", "src/slate-item/addons/AddonCenter/AddonCenterComp.tsx"),
    ("./andy.less", "src/slate-item/addons/Andy/Andy.tsx"),
    ("./backlink.less", "src/slate-item/addons/Backlink/Backlink.tsx"),
    ("./block-selection.less", "src/slate-item/addons/BlockSelection/BlockSelection.ts"),
    ("./codeblock.less", "src/slate-item/addons/Codeblock/CodeblockElementComp.tsx"),
    ("./conf.less", "src/slate-item/addons/Conf/ConfFormWrapComp.tsx"),
    ("./editor-view.less", "src/slate-item/addons/EditorView/EditorView.tsx"),
    ("./flexmap.layout.less", "src/slate-item/addons/LayoutFactory/Flexmap/Flexmap.tsx"),
    ("./float-viewer.less", "src/slate-item/addons/FloatViewer/FloatViewerListComp.tsx"),
    ("./floatViewer.less", "src/slate-item/addons/FloatViewer/FloatEditorComp.tsx"),
    ("./heatmap.less", "src/slate-item/addons/Heatmap/HeatmapElementComp.tsx"),
    ("./hint.less", "src/slate-item/addons/Hint/Hint.tsx"),
    ("./item-headless.less", "src/slate-item/addons/ItemHeadless/ItemHeadless.tsx"),
    ("./kanban.layout.less", "src/slate-item/addons/LayoutFactory/Kanban/Kanban.tsx"),
    ("./layouts.less", "src/slate-item/addons/LayoutFactory/LayoutFactory.tsx"),
    ("./markdown.less", "src/slate-item/addons/Markdown/Markdown.tsx"),
    ("./marks.less", "src/slate-item/addons/Marks/Marks.tsx"),
    ("./moment.less", "src/slate-item/addons/Moment/MomentComp.tsx"),
    ("./month-calendar.less", "src/slate-item/components/MonthCalendar/MonthCalendar.tsx"),
    ("./path-highlight.less", "src/slate-item/addons/PathHighlight/PathHighlight.ts"),
    ("./pdfReader.less", "src/slate-item/addons/PDFReader/PDFReaderComp.tsx"),
    ("./pomo.less", "src/slate-item/addons/Pomo/PomoComp.tsx"),
    ("./search.less", "src/slate-item/addons/Search/SearchComp.tsx"),
    ("./sorter.less", "src/slate-item/addons/Sorter/Sorter.tsx"),
    ("./srs.less", "src/slate-item/addons/Srs/SrsDialogComp.tsx"),
    ("./summary.less", "src/slate-item/addons/Summary/Summary.tsx"),
    ("./tablesimple.layout.less", "src/slate-item/addons/LayoutFactory/TableSimple/TableSimple.tsx"),
    ("./tag.less", "src/slate-item/addons/Tag/TagsComp.tsx"),
    ("./white-board.less", "src/slate-item/addons/LayoutFactory/Whiteboard/WhiteboardComp.tsx"),
]

PLACEHOLDER = (
    "/* 占位：原文件不在 source map 中（编译后并入 index.css）。\n"
    "   样式真源见 src/assets/all-styles.css。 */\n"
)

made = 0
for spec, user in STYLES:
    target = os.path.normpath(os.path.join(ROOT, os.path.dirname(user), spec))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    if not os.path.exists(target):
        with open(target, "w", encoding="utf-8") as f:
            f.write(PLACEHOLDER)
        made += 1
print(f"样式占位: {made} 个")

for lang in ("en", "zh"):
    p = os.path.join(SRC, "locales", f"{lang}.json")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if not os.path.exists(p):
        open(p, "w", encoding="utf-8").write("{}\n")
        print(f"语言包占位: {p}")

SRC_CSS = ("/private/var/folders/_n/5cp090hd5dxc29l16pfvlh280000gn/T/_MEIwfIGH4"
           "/static/index.css")
DST_CSS = os.path.join(SRC, "assets", "all-styles.css")
if os.path.isfile(SRC_CSS):
    os.makedirs(os.path.dirname(DST_CSS), exist_ok=True)
    shutil.copyfile(SRC_CSS, DST_CSS)
    print(f"样式真源: {DST_CSS} ({os.path.getsize(DST_CSS)} 字节)")
else:
    print("样式真源缺失：原 Notekit 运行目录已清理，需要重新从 .app 取")