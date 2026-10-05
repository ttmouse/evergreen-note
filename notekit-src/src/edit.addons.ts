import { NewAddonParams } from './slate-item/engine/App'
import { createItemAddon, createItemTransformsAddon } from './slate-item'
import { createUIAddon } from './slate-item/addons/UI/UI'
import { createBacklinkAddon } from './slate-item/addons/Backlink/Backlink'
import { createBilinkAddon } from './slate-item/addons/Bilink/Bilink'
import { createBorderFoldupAddon } from './slate-item/addons/BorderFoldup/BorderFoldup'
import { createCodeblockAddon } from './slate-item/addons/Codeblock/Codeblock'
import { createCompatAddon } from './slate-item/addons/Compat/Compat'
import { createCounterAddon } from './slate-item/addons/Counter/Counter'
import { createDailyAddon } from './slate-item/addons/Daily/Daily'
import { createDbDiskAddon } from './slate-item/addons/DbDisk/DbDisk'
import { createDbMemoryAddon } from './slate-item/addons/DbMemory/DbMemory'
import { createEditorFactoryAddon } from './slate-item/addons/EditorFactory/EditorFactory'
import { createEditorViewAddon } from './slate-item/addons/EditorView/EditorView'
import { createElementRegistryAddon } from './slate-item/addons/ElementRegistry/ElementRegistry'
import { createEmbedAddon } from './slate-item/addons/Embed/Embed'
import { createEventHanlderAddon } from './slate-item/addons/EventHandler/EventHandler'
import { createExportsAddon } from './slate-item/addons/Exports/Exports'
import { createExtAreaAddon } from './slate-item/addons/ExtArea/ExtArea'
import { createCheckboxAddon } from './slate-item/addons/Form/Checkbox/Checkbox'
import { createRatingAddon } from './slate-item/addons/Form/Rating/Rating'
import { createSlidebarAddon } from './slate-item/addons/Form/Slidebar/Slidebar'
import { createSwitcherAddon } from './slate-item/addons/Form/Switcher/Switcher'
import { createHotkeyAddon } from './slate-item/addons/Hotkey/Hotkey'
import { createHttpAddon } from './slate-item/addons/Http/Http'
import { createHyperlinkAddon } from './slate-item/addons/Hyperlink/Hyperlink'
import { createImgAddon } from './slate-item/addons/Img/Img'
import { createImportsAddon } from './slate-item/addons/Imports.ts/Imports'
import { createIndexedCountAddon } from './slate-item/addons/IndexedCount/IndexedCount'
import { createInlinesAddon } from './slate-item/addons/Inlines/Inlines'
import { createIsAddon } from './slate-item/addons/Is/Is'
import { createFloatViewerAddon } from './slate-item/addons/FloatViewer/FloatViewer'
import { createKeywordsAddon } from './slate-item/addons/Keywords/Keywords'
import { createLatexAddon } from './slate-item/addons/Latex/Latex'
import { createLayoutFactoryAddon } from './slate-item/addons/LayoutFactory/LayoutFactory'
import { createMainAddon } from './slate-item/addons/Main/Main'
import { createMarkdownAddon } from './slate-item/addons/Markdown/Markdown'
import { createMarksAddon } from './slate-item/addons/Marks/Marks'
import { createMobileEditBarAddon } from './slate-item/addons/MobileEditBar/MobileEditBar'
import { createNavAddon } from './slate-item/addons/Nav/Nav'
import { createNetworkGraphAddon } from './slate-item/addons/NetworkGraph/NetworkGraph'
import { createOrderedListAddon } from './slate-item/addons/OrderedList/OrderedList'
import { createPasteAddon } from './slate-item/addons/Paste/Paste'
import { createPomoAddon } from './slate-item/addons/Pomo/Pomo'
import { createReactionAddon } from './slate-item/addons/Reaction/Reaction'
import { createRecentAddon } from './slate-item/addons/Recent/Recent'
import { createReferAddon } from './slate-item/addons/Refer/Refer'
import { createRouterAddon } from './slate-item/addons/Router/Router'
import { createSearchAddon } from './slate-item/addons/Search/Search'
import { createSlashMenuAddon } from './slate-item/addons/SlashMenu/SlashMenu'
import { createSlElementAddon } from './slate-item/addons/SlElement/SlElement'
import { createSlNodeAddon } from './slate-item/addons/SlNode/SlNode'
import { createSorterAddon } from './slate-item/addons/Sorter/Sorter'
import { createStarAddon } from './slate-item/addons/Star/Star'
import { createStrmapAddon } from './slate-item/addons/Strmap/Strmap'
import { createTopicAddon } from './slate-item/addons/Topic/Topic'
import { createTopicListAddon } from './slate-item/addons/TopicList/TopicList'
import { createTraitsAddon } from './slate-item/addons/Traits/Traits'
import { createAttachmentAddon } from './slate-item/addons/Attachment/Attachment'
import { createRandomAddon } from './slate-item/addons/Random/Random'
import { createSummaryAddon } from './slate-item/addons/Summary/Summary'
import { createSnippetAddon } from './slate-item/addons/Snippet/Snippet'
import { createFormAddon } from './slate-item/addons/Form/Form'
import { createFloatBarAddon } from './slate-item/addons/FloatBar/FloatBar'
import { createFloatMenuAddon } from './slate-item/addons/FloatMenu/FloatMenu'
import { createBackgroundAddon } from './slate-item/addons/Background/Background'
import { createRefreshAddon } from './slate-item/addons/Refresh/Refresh'
import { createHintAddon } from './slate-item/addons/Hint/Hint'
import { createHelpAddon } from './slate-item/addons/Help/Help'
import { createSandboxAddon } from './slate-item/addons/Sandbox/Sandbox'
import { createAliasAddon } from './slate-item/addons/Alias/Alias'
import { createCopyAddon } from './slate-item/addons/Copy/Copy'
import { createScriptAddon } from './slate-item/addons/Script/Script'
import { createConfAddon } from './slate-item/addons/Conf/Conf'
import { createDbCrossAddon } from './slate-item/addons/DbCross/DbCross'
import { createAddonCenterAddon } from './slate-item/addons/AddonCenter/AddonCenter'
import { createCacherAddon } from './slate-item/addons/Cacher/Cacher'
import { createTrashAddon } from './slate-item/addons/Trash/Trash'
import { createQuoteAddon } from './slate-item/addons/Quote/Quote'
import { createTagAddon } from './slate-item/addons/Tag/Tag'
import { createRefPlusAddon } from './slate-item/addons/ReferPlus/RefPlus'
import { createStyleAddon } from './slate-item/addons/Style/Style'
import { createMermaidGraphAddon } from './slate-item/addons/MermaidGraph/MermaidGraph'
import { createImghostAddon } from './slate-item/addons/Imghost/Imghost'
import { createTypingModeAddon } from './slate-item/addons/TypingMode/TypingMode'
import { createPrinterAddon } from './slate-item/addons/Printer/Printer'
import { createItemHeadlessAddon } from './slate-item/addons/ItemHeadless/ItemHeadless'
import { createClueAddon } from './slate-item/addons/Clue/Clue'
import { createStatusBarAddon } from './slate-item/addons/StatusBar/StatusBar'
import { createNameSpaceAddon } from './slate-item/addons/NameSpace/NameSpace'
import { createCrumbsAddon } from './slate-item/addons/Crumbs/Crumbs'
import { createScrollerAddon } from './slate-item/addons/Scroller/Scroller'
// import { createImgLocalizerAddon } from './slate-item/addons/ImgLocalizer/ImgLocalizer';
import { createHeatmapAddon } from './slate-item/addons/Heatmap/Heatmap'
import { createDateToolAddon } from './slate-item/addons/DateTool/DateTool'
// import { createGPT3Addon } from './slate-item/addons/GPT3/GPT3'
import { createSrcAddon } from './slate-item/addons/Embedweb/Embedweb'
// import { createBigDayAddon } from './slate-item/addons/BigDay/BigDay';
import { createMomentAddon } from './slate-item/addons/Moment/Moment'
import { createLibAdminAddon } from './slate-item/addons/LibAdmin/LibAdmin'
import { createPreferAddon } from './slate-item/addons/Prefer/Prefer'
import { createPlaceholderAddon } from './slate-item/addons/Placeholder/Placeholder'
import { createPathHighlightAddon } from './slate-item/addons/PathHighlight/PathHighlight'
import { createSync2Addon } from './slate-item/addons/Sync2/Sync2'
import { createAiAssistantAddon } from './slate-item/addons/AI/AiAssistant/AiAssistant'
import { createItemToolbarAddon } from './slate-item/addons/ItemToolbar/ItemToolbar'
import { createMirrorItemAddon } from './slate-item/addons/MirrorItem/MirrorItem'
import { createDocverAddon } from './slate-item/addons/Docver/Docver'
import { createSrsAddon } from './slate-item/addons/Srs/Srs'
import { createKeyClickAddon } from './slate-item/addons/KeyClick/KeyClick'
import { createConditionBuilderAddon } from './slate-item/addons/ConditionBuilder/ConditionBuilder'
import { createRevisionAddon } from './slate-item/addons/Revision/Revision'
import { createEditorViewerAddon } from './slate-item/addons/EditorViewer/EditorViewer'
import { createPanguSpaceAddon } from './slate-item/addons/PanguSpace/PanguSpace'
// import { createDiagramAddon } from './slate-item/addons/LayoutFactory/Diagram/Diagram';
import { createFileSystemAccessAddon } from './slate-item/addons/FileSystemAccess/FileSystemAccess'
import { createPresentationAddon } from './slate-item/addons/Presentation/Presentation'
import { createBiliTimeStampAddon } from './slate-item/addons/BiliTimeStamp/BiliTimeStamp'
import { createPdfReaderAddon } from './slate-item/addons/PDFReader/PDFReader'
import { createNightModeAddon } from './slate-item/addons/NightMode/NightMode'
import { createGroupHelperAddon } from './slate-item/addons/GroupHelper/GroupHelper'
import { createMDTableAddon } from './slate-item/addons/MDTable/MDTable'
import { createFileManagerAddon } from './slate-item/addons/FileManager/FileManager'
import { createLLMInterfaceAddon } from './slate-item/addons/LLMInterface/LLMInterface'

export function createAddons(params: NewAddonParams) {
  /**
   * 与 UI 无关的插件, 可以在任何环境使用, 例如 web worker
   */
  const uiLess = {
    dbDisk: createDbDiskAddon(params),
    dbMemory: createDbMemoryAddon(params),
    llmInterface: createLLMInterfaceAddon(params),
    keywords: createKeywordsAddon(params),
    slNode: createSlNodeAddon(params),
    slElement: createSlElementAddon(params),
    item: createItemAddon(params),
    itemTransforms: createItemTransformsAddon(params),
    traits: createTraitsAddon(params),
    is: createIsAddon(params),
    ...createCacherAddon(params),
  }

  const inlineElements = {
    ...createInlinesAddon(params),
    elementRegistry: createElementRegistryAddon(params),

    ...createAttachmentAddon(params),
    ...createImgAddon(params),
    hyperlink: createHyperlinkAddon(params),
    ...createMarksAddon(params),
    ...createTagAddon(params),
    ...createSearchAddon(params),
    // ...createQueryAddon(params),

    latex: createLatexAddon(params),
    pomo: createPomoAddon(params),
    codeblock: createCodeblockAddon(params),
    bilink: createBilinkAddon(params),
    refer: createReferAddon(params),
    ...createRefPlusAddon(params),
    embed: createEmbedAddon(params),
    checkbox: createCheckboxAddon(params),
    rating: createRatingAddon(params),
    switcher: createSwitcherAddon(params),
    slidebar: createSlidebarAddon(params),
    counter: createCounterAddon(params),
    ...createRandomAddon(params),
    ...createMermaidGraphAddon(params),
    ...createMDTableAddon(params),
    ...createSrcAddon(params),

    ...createFormAddon(params),
    ...createPlaceholderAddon(params),
  }

  const layouts = {
    ...createLayoutFactoryAddon(params),
    // ...createFlexmapAddon(params),
    // ...createTableSimpleAddon(params),
    // ...createKanbanAddon(params),
    // ...createLayoutMarkdownAddon(params),
  }

  const ai = {
    ...createAiAssistantAddon(params),
  }

  return {
    ...uiLess,
    ...ai,
    ...createConfAddon(params),
    ...createPreferAddon(params),
    indexedCount: createIndexedCountAddon(params),
    router: createRouterAddon(params),
    hotkey: createHotkeyAddon(params),
    eventHandler: createEventHanlderAddon(params),
    paste: createPasteAddon(params),
    ...createCopyAddon(params),
    ...createScriptAddon(params),
    ...createStyleAddon(params),
    ...createDbCrossAddon(params),
    // ...createTrackAddon(params),
    // ...createDocverAddon(params),
    ...createKeyClickAddon(params),
    ...createConditionBuilderAddon(params),
    // ...createOutlineExtractorAddon(params),

    // ...createDbAdminAddon(params),
    ...createLibAdminAddon(params),

    // 笔记增强功能
    // ...createMirrorItemAddon(params),
    strmap: createStrmapAddon(params),
    ...createPanguSpaceAddon(params),
    markdown: createMarkdownAddon(params),
    slashMenu: createSlashMenuAddon(params),
    // reaction: createReactionAddon(params),
    typingMode: createTypingModeAddon(params),
    ...createFloatViewerAddon(params),
    ...createSnippetAddon(params),
    ...createBackgroundAddon(params),
    ...createHintAddon(params),
    ...createFileManagerAddon(params),
    ...createSrsAddon(params),

    ...createSummaryAddon(params),
    ...createQuoteAddon(params),
    ...createSorterAddon(params),

    ...createPrinterAddon(params),
    ...createBorderFoldupAddon(params),
    ...createExportsAddon(params),
    ...createImportsAddon(params),
    ...createCompatAddon(params),
    ...createFloatBarAddon(params),
    ...createItemToolbarAddon(params),
    ...createFloatMenuAddon(params),
    ...createMobileEditBarAddon(params),

    ...inlineElements,

    ...createDailyAddon(params),
    ...createTopicAddon(params),
    ...createTopicListAddon(params),
    ...createNetworkGraphAddon(params),

    ...createNavAddon(params),
    ...createMainAddon(params),
    ...createExtAreaAddon(params),
    ...createGroupHelperAddon(params),
    ...createBacklinkAddon(params),
    ...createStarAddon(params),
    ...createRecentAddon(params),

    ...createHttpAddon(params),
    // ...createSyncAddon(params),
    ...createSync2Addon(params),
    ...createPresentationAddon(params),

    ...layouts,

    ...createOrderedListAddon(params),
    ...createAliasAddon(params),

    ...createHelpAddon(params),
    ...createSandboxAddon(params),
    ...createAddonCenterAddon(params),
    // ...createLibRemoteAddon(params),
    ...createRefreshAddon(params),
    ...createImghostAddon(params),
    // ...createImgLocalizerAddon(params),
    ...createClueAddon(params),
    ...createStatusBarAddon(params),
    ...createNameSpaceAddon(params),
    ...createRevisionAddon(params),

    ...createItemHeadlessAddon(params),
    ...createCrumbsAddon(params),
    ...createScrollerAddon(params),
    ...createHeatmapAddon(params),
    ...createDateToolAddon(params),
    ...createTrashAddon(params),
    ...createMomentAddon(params),
    ...createPdfReaderAddon(params),
    ...createBiliTimeStampAddon(params),
    // ...createGPT3Addon(params),
    // ...createCaiyunAddon(params),
    ...createPathHighlightAddon(params),
    ...createNightModeAddon(params),
    // ...createTranslateAddon(params),

    // ...createLearnSlateAddon(params),

    // 放在最后一行
    ...createEditorFactoryAddon(params),
    ...createEditorViewAddon(params),
    ...createEditorViewerAddon(params),

    ...createFileSystemAccessAddon(params),

    ...createUIAddon(params),
  }
}
