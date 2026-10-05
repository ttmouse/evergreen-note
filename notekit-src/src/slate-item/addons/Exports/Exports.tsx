import { IAddon, App, NewAddonParams } from '../../engine/App'
import { ExportHandlerParams, ExportTypeInfo, exportTypes } from './as'
import { download } from './helper'
import { isEmpty } from '../../utils/isEmpty'
import { createExportPdfAddon } from './ExportPdf/ExportPdf'
import { $t } from '../../../i18n'
import { icons } from '../../../components/SvgIcon'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { Item, ItemNode } from '../../interfaces/item'

export type ExportFormat = keyof typeof exportTypes
export type ExportFormValues = {
  format: ExportFormat
}

/**
 * The addon for exporting items to other formats.
 * @param addonParams
 * @returns The instance of the addon.
 */
export function createExportsAddon(addonParams: NewAddonParams) {
  const { app, $ } = addonParams

  class Exports implements IAddon {
    app!: App
    config = {}

    as = exportTypes

    /**
     * 将给定的文本内容下载到本地
     * @param content 给定的文本内容
     * @param filetype 保存的文件类型
     * @param filename 文件名称（不含后缀）
     * @returns 
     */
    async download(content: string, filetype: string, filename?: string) {
      return download(content, filetype, filename)
    }

    /**
     * 添加导出格式
     * @param types
     */
    addFormats(types: { [formatName: string]: ExportTypeInfo }) {
      Object.assign($.exports.as, types)
    }

    /**
     * Add a new export format.
     * @param type Type of the export format.
     * @param typeInfo Information of the export format.
     */
    addFormat(type: string, typeInfo: ExportTypeInfo) {
      $.exports.addFormats({ [type]: typeInfo })
    }

    /**
     * Export the given item to the given format.
     * @param type Type of the export format.
     * @param params Parameters for the export format.
     * @returns string
     */
    getString(
      type: ExportFormat,
      params: ExportHandlerParams
    ): string {
      if (type in $.exports.as === false) {
        throw new Error(`Unknown export type: ${type}`)
      }
      return $.exports.as[type].handle({
        ...params,
        app: $.exports.app,
      })
    }

    /**
     * Show the form for choosing the export format.
     * @param params Parameters for the export format.
     */
    showForm(params: Pick<ExportHandlerParams, 'data' | 'item'>) {
      const options: any = {}
      for (const [k, info] of Object.entries($.exports.as)) {
        options[k] = info.title
      }
      $.form.popup<ExportFormValues>({
        title: $t`exports.choose_target_title`,
        name: 'exports-form',
        initialValues: {
          format: 'markdown',
        },
        subitems: {
          format: {
            title: $t`exports.target_format`,
            type: 'select',
            required: true,
            options,
          },
        },
        buttons: {
          [$t`exports.export_button`]: (values) => {
            $.exports.handleForm(values, params)
          },
          [$t`common.cancel`]: null,
        },
      })
    }

    handleForm(
      values: ExportFormValues,
      params: { data: UnitPersist; item: ItemNode }
    ) {
      const { data, item } = params
      const itemPersist = $.dbMemory.getItem(data.ky, { isRecur: true })
      const content = $.exports.getString(values.format, {
        data: itemPersist,
        item,
      })

      // 有些格式，比如 pdf，它并不会返回一个文本内容
      if (!isEmpty(content)) {
        $.exports.download(
          content,
          ($.exports.as as any)[values.format].type ?? 'txt',
          Item.headString(data)
        )
      }
    }

    addonCommands(): HotkeyMaps {
      return {
        exportsCurrentDatabase: {
          title: $t`exports.export_database`,
          hotkey: 'mod+shift+s',
          context: 'everywhere',
          handle() {
            $.libAdmin.download()
          },
        },
      }
    }

    addonRun() {
      $.editorView.addDropdown({
        exports: {
          icon: 'svg_export',
          title: $t`exports.editor_dropdown_title`,
          onClick(e, { item }) {
            $.exports.showForm({
              data: item,
              item,
            })
          },
        },
      })

      $.main.addMoreExtraCommands({
        exports: {
          title: $t`exports.export_database`,
          icon: icons.svg_export,
          order: 2000,
          hotkey: 'mod+shift+s',
          onClick: async () => {
            $.libAdmin.download()
          },
        },
      })
    }
  }
  return {
    exports: new Exports(),
    ...createExportPdfAddon(addonParams),
  }
}
