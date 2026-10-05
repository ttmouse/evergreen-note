/* eslint-disable @typescript-eslint/no-unused-vars */
import { after } from '@/slate-item/engine/helper'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { LoadedAddonName } from '@/main'
import { removeElement } from '@/slate-item/utils/dom/removeElement'

const nightModeStyles = `
:root {
  --bg-color: #202123;
  --body-bg-color: #342828;
  --dark-bg-primary: #202123;
  --dark-bg-secondary: #2a2d31;
  --dark-important: rgb(82 86 93);
  --dark-very-important: rgb(76 88 104);
  --dark-extremely-important: rgb(149 171 171);
  --dark-text: #ffffff;
  --dark-text-less-important: #94b8bc;
  --dark-text-no-important: #9e6a6a55;
  --dark-kanban-primary: #8ab588;
  --dark-kanban-secondary: #2a2d31;
}

body {
  background-color: var(--dark-bg-primary) !important;
  /* 深色背景 */
  color: var(--dark-text) !important;
  /* 浅色字体 */
}

.nui-dialog,
.MuiDialog-paper,
.MuiList-root {
  background-color: var(--dark-bg-secondary) !important;
  /* 深色背景 */
  color: var(--dark-text) !important;
  /* 浅色字体 */
}

body .svg-icon path {
  stroke: var(--dark-text) !important;
}

.node-text,
.node-head,
.node-body {
  color: var(--dark-text) !important;
  /* 浅色字体 */
}

/*.tool-item:not(.node-btn-menu) {
  background-color: var(--dark-very-important) !important;
}

.tool-item:not(.node-btn-menu):hover {
  background-color: var(--dark-extremely-important) !important;
}*/

.click-empty-add {
  background: transparent !important;
}

.node-icon:hover {
  fill: #fff !important;
  background-color: var(--dark-important) !important;
  color: #fff !important;
  border-color: var(--dark-important) !important;
}

.node-icon:hover svg {
  fill: #fff !important;
}

/* 滚动条滑块 默认情况下的样式 */
::-webkit-scrollbar {
  background: var(--dark-bg-primary) !important;
}

nav,
.nui-dialog,
.MuiDialog-paper ::-webkit-scrollbar {
  background: var(--dark-bg-secondary) !important;
}

::-webkit-scrollbar-thumb {
  background: var(--dark-important) !important;
}

:hover::-webkit-scrollbar-thumb {
  background: var(--dark-important) !important;
}

/* 滚动条滑块 鼠标悬停时的样式 */
::-webkit-scrollbar-thumb:hover {
  background-color: var(--dark-very-important) !important;
}

/* 滚动条滑块 鼠标按下时的样式 */
::-webkit-scrollbar-thumb:active {
  background-color: var(--dark-extremely-important) !important;
}

.crumbs-item {
  color: var(--dark-text-less-important) !important;
}

.crumbs-item:hover {
  color: white !important;
}

.mark-tag>[data-slate-string], .mark-tag>span[contenteditable="false"] {
  color: var(--cl-blue-100) !important;
  background: var(--cl-blue-700) !important;
}

.mark-tag:hover>[data-slate-string], .mark-tag:hover>span[contenteditable="false"] {
  color: #fff !important;
  background: var(--cl-blue-500) !important;
}

.node-icon {
  background: inherit !important;
}

nav.nav-area .node-icon {
  background: inherit !important;
}

.nui-dialog .node-icon {
  background: inherit !important;
}

.MuiDialog-paper .node-icon {
  background: inherit !important;
}

nav.nav-area {
  background: var(--dark-bg-secondary) !important
}

.extarea.node {
  background: var(--dark-bg-secondary) !important
} /* 右侧打开 */

.docver-list {
  background: var(--dark-bg-primary) !important
}

.MuiAlert-standardInfo {
  background: var(--cl-blue-500) !important;
}

nav.nav-area .node-head:hover {
  background: var(--dark-very-important) !important
}

#EvergreenNote-stars .node-head:hover {
  background: inherit !important
}

.MuiTableContainer-root tr,
th,
td {
  color: var(--dark-text) !important;
}

.MuiSvgIcon-root {
  color: var(--dark-text) !important;
}

.inline-element.element-bilink {
  color: var(--cl-blue-500) !important;
}

.node-layout-item-group-1 {
  outline: 1px solid var(--dark-text-less-important) !important;
}

.node.node-layout-result-container .node-layout-result>.node-body>.node-subitems>.node:not(.node-layout-item-group) {
  outline: 1px solid var(--dark-text-no-important) !important
}

.css-1hewi1m-menu-item {
  background: var(--dark-bg-primary) !important;
}

.css-1hewi1m-menu-item:hover {
  background-color: var(--dark-important) !important;
}

.css-1hewi1m-menu-item:hover:not([data-selected="true"]) .node-icon {
  background-color: var(--dark-important) !important;
}

.lib-title-wrap:hover .lib-title {
  background-color: var(--dark-very-important) !important;
}

.node-tools .node-btn:hover {
  background-color: var(--dark-extremely-important) !important;
}

.srs-deck-start-icon span {
  background: var(--dark-important) !important;
  color: var(--dark-text) !important;
}

.srs-deck-start-icon span:hover {
  background: var(--dark-very-important) !important;
}

.node-foldup>.node-tools .node-btn {
  background: var(--dark-important) !important;
}

.embed-container {
  outline: 1px solid var(--dark-text-less-important) !important;
  box-shadow: 4px 4px 0 0 var(--dark-important) !important
}

.embed-container:hover {
  box-shadow: 8px 8px 0 0 var(--dark-extremely-important) !important;
}

.MuiDialog-paper * {
  color: var(--dark-text) !important;
}

.conf-tabs .conf-tab-item:hover {
  background: var(--dark-very-important) !important;
}

.conf-tabs .conf-tab-item.active {
  background: var(--dark-extremely-important) !important;
}

.MuiInputLabel-root.MuiInputLabel-animated.MuiInputLabel-sizeSmall {
  background: var(--dark-bg-secondary) !important;
}

.MuiDialog-paper code {
  background: var(--cl-blue-700) !important;
}

.addon-list {
  background-color: unset !important;
}

.addon-list .MuiListItem-root:hover {
  background: var(--dark-very-important) !important;
}

.conf-tabs .conf-tab-item.active {
  background: var(--dark-extremely-important) !important;
}

.tab-item.tab {
  background: var(--dark-important) !important;
}

.nui-symbol:hover {
  background-color: var(--dark-important) !important;
}

.nui-symbol:hover .svg-icon {
  background-color: var(--dark-important) !important;
}

.editor-active .node-path-highlight>.node-tools .node-btn {
  background-color: var(--dark-important);
}

.node.node-layout-kanban .node-layout-kanban-1 {
  background: var(--dark-kanban-primary)
}

.node.node-layout-kanban .node-layout-kanban-2:not(.divider) {
  background: var(--dark-kanban-secondary)
}

.blockquote>.node-head {
  background-color: transparent;
  border-left: none;
  border-radius: 0;
}

.inline-element.refer-text .blockquote > .node-head {
  background-color: unset;
  border-left: unset;
}

.inline-element .MuiPaper-elevation {
  background: var(--dark-kanban-secondary) !important;
}

.inline-element .MuiPaper-elevation input {
  background: var(--dark-kanban-secondary) !important;
  color: var(--dark-text) !important;
}

.floatview-container[data-mode=andy] .floatview-container-subitems:not(:empty) {
  background: var(--dark-bg-primary) !important
}

.MuiDialog-paper .input-wrap input {
  background: var(--dark-bg-secondary) !important;
}

.search-result-item.active {
  background: var(--dark-very-important) !important;
}

.css-1hewi1m-menu-item[data-selected="true"] {
  background-color: var(--dark-kanban-secondary) !important;
}

.whiteboard-node {
  background: var(--dark-kanban-secondary) !important
}

.MuiPickersDay-root {
  background: inherit !important;
}

.MuiPickersDay-root:hover {
  background: var(--dark-important) !important;
}

.MuiChip-colorWarning {
  color: #e0c576 !important;
}

.MuiChip-colorError {
  color: #fe2089 !important;
}

.MuiChip-colorDefault {
  color: #33625a !important;
}

[data-route*="/AppTags"] #EvergreenNote-router .node[data-ky=AppTags] .node-body .node-subitems .node.note-block {
  border: 1px solid #bababa;
  background: var(--dark-kanban-secondary) !important;
}

.MuiPickersPopper-paper {
  background: var(--dark-bg-secondary) !important;
  color: var(--dark-text) !important;
}

.MuiPickersPopper-paper * {
  color: var(--dark-text) !important;
}

.MuiPickersDay-today:not(.Mui-selected) {
  border: 1px solid lightyellow !important;
}

.MuiPickersDay-root.Mui-selected {
  background: var(--cl-blue-600) !important;
  border: 1px solid white !important;
}

#input-with-icon-adornment {
  color: var(--dark-text) !important;
}

.MuiInput-underline::before {
  border-color: var(--dark-text) !important;
}

.element-datePicker .inline-rect > span {
  background: var(--dark-important);
}

.katex .mfrac .frac-line {
  border-color: var(--dark-text) !important;
}
.katex .mtable .vertical-separator {
  border-color: var(--dark-text) !important;
}

.mark-highlight {
  background-color: #a7428d !important;
}


.editor-view[editor-layout='whiteboard'] > .node-body > .item-editor > .node-top > .node-head > .node-text {
  background: inherit !important;
}

.MuiNativeSelect-select option {
  background: var(--dark-bg-secondary) !important;
}

.node-block-selected {
  background: var(--dark-very-important) !important;
}
`

export function createNightModeAddon(params: NewAddonParams) {
  const { app, $ } = params
  class NightMode implements IAddon {
    app!: App
    isNightMode = false

    addonInfo() {
      return {
        title: 'Night Mode',
        quote: 'Night Mode',
        type: 'fieldset',
        defaultValue: 'on',
        depend: ['style'] as LoadedAddonName[],
      }
    }

    takeEffect() {
      const theme = this.isNightMode ? 'dark' : 'light'
      // Browser-owned controls need the same appearance as the page and AppKit.
      document.documentElement.style.colorScheme = theme
      ;(window as any).notekitShell?.setTheme?.(theme)
      if (this.isNightMode) {
        $.style.exec(nightModeStyles, "night-mode-style")
        document.querySelectorAll("meta[name=theme-color]").forEach(e=>{(e as HTMLMetaElement).content="#202123"})
        document.body.classList.add('night-mode')
      } else {
        const ele = document.getElementById("night-mode-style")
        ele && removeElement(ele)
        document.querySelectorAll("meta[name=theme-color]").forEach(e=>{(e as HTMLMetaElement).content="#FFFFFF"})
        document.body.classList.remove('night-mode')
      }
    }

    addonBeforeRun() {
      const systemNightMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const storedVal = localStorage.getItem('nightMode');
      if (storedVal === 'on' || (storedVal === null && systemNightMode)) {
        this.isNightMode = true;
      } else {
        this.isNightMode = false;
      }
      const { invokeAll } = $.style;
      after(invokeAll, () => {
        this.takeEffect()
      })
      this.takeEffect()
    }

    toggleNightMode() {
      const nextNightMode = this.isNightMode ? 'off' : 'on';
      localStorage.setItem('nightMode', nextNightMode);
      this.isNightMode = !this.isNightMode;
      this.takeEffect();
    }

    addonRun() {
      $.main.addMoreExtraCommands({
        nightMode: {
          title: 'Toggle Night Mode',
          icon: 'svg_theme',
          onClick: () => {
            this.toggleNightMode()
          }
        }
      })
    }
  }

  return {
    nightMode: new NightMode(),
  }
}
