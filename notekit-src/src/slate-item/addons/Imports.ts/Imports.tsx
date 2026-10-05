import React from 'react'
import { IAddon, App, NewAddonParams, CommandMaps } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { showSnack, SnackHanlder } from '../../utils/msg/showSnack'
import { InputFileComp } from './InputFileComp'
import throttle from 'lodash/fp/throttle'
import { sleep } from '../../utils/sleep'
import { multiHanlders } from './multiHanlders'
import { icons } from '../../../components/SvgIcon'
import { singleHandlers } from './singleHandlers'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { ItemTransforms } from '../../transforms/item'
import { Item } from '../../interfaces/item'
import { Options } from '../Form/Form'
import { $t } from '../../../i18n'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { recur } from '../../utils/recur'
import { time } from '@/slate-item/utils/date/time'

export type ImportFormat = keyof ReturnType<typeof singleHandlers>
export type ImportOpts = {
  format: ImportFormat
  keepID?: 'original' | 'new'
  time?: 'original' | 'new'
  ignoreEmptyLine?: boolean
}

export type ImportParams = {
  type: ImportFormat
  source: string
  app?: App
}

export type ImportHanlder = (params: ImportParams) => boolean | UnitPersist[]

export function createImportsAddon({ app, $ }: NewAddonParams) {
  class Imports implements IAddon {
    app!: App
    config = {}
    idMulti = 'idMulti-file-element'
    idSingle = 'idSingle-file-element'

    multiHanlders = multiHanlders
    singleHandlers = {} as ReturnType<typeof singleHandlers>

    showFilePicker() {
      document
        .getElementById(this.idMulti)!
        .dispatchEvent(new MouseEvent('click'))
    }

    showSingleFilePicker() {
      document
        .getElementById(this.idSingle)!
        .dispatchEvent(new MouseEvent('click'))
    }

    /**
     * Invoke handler to import multi items
     * @param params
     */
    async invokeMultiHandler(params: ImportParams) {
      const { router } = this.app.addons
      const { type } = params
      const items = await (this.multiHanlders[type] as any)({
        ...params,
        app: this.app,
      })
      if (!isEmpty(items)) {
        const dbid = $.libAdmin.current.ky
        const currentTime = time();
        for (const item of items) {
          item.updated = currentTime
          this.app?.addons.sync2?.addPending(dbid, 'node', item)
        }
        await this.app?.addons.imports.writeItems(items as any, undefined, {
          showProgress: true,
        })
        router.to('/diaries') // to change route
        router.to('/topics')
      }
    }

    async invokeSingleHandler(source: string) {
      const { editor, type, params } = this.singleOptions
      const result = await (this.singleHandlers as any)[type].handle(
        source,
        params
      )
      if (!isEmpty(result)) {
        recur(result as any, (item: UnitPersist) => {
          const v2item = $.compat.convertItem(item as any)
          Object.assign(item, v2item)
        })
        const items = result.subitems.map((sub: any) => {
          return Item.make(Item.resolvePkyAndWeight(sub as any), { editor })
        })
        ItemTransforms.insertLastItems(editor, {
          at: [0],
          items,
        })
      }
    }

    importItem(item: UnitPersist, dbid: KyString) {
      item.$dbid = dbid
      this.app.addons.dbMemory.addItem(item)
    }

    /**
     * Writing items into database
     * @param allItems
     */
    async writeItems(
      allItems: UnitPersist[],
      dbid?: KyString,
      options?: { showProgress: boolean; tbName?: string },
      from: 'sync' | 'import' = 'import'
    ) {
      // 检查导入的是 v1 还是 v2 的数据
      const isV2 = allItems.some((item) => Array.isArray(item?.leaves))
      // if (!isV2 && !window.location.href.includes('allow-v1=true')) {
      //   // showSnack({
      //   //   content:
      //   //     '由于数据兼容工作仍需进一步完善，暂时不能导入 V1 的数据，后期完善之后，将会支持导入 V1 的数据.',
      //   //   severity: 'warning',
      //   //   autoClose: 60000,
      //   // });
      //   return
      // }

      options = {
        showProgress: false,
        tbName: 'node',
        ...(options ?? {}),
      }

      dbid ??= $.libAdmin.current.ky

      let snack: SnackHanlder | null = null
      const showProgress = options?.showProgress && allItems.length > 200
      app.importStatus.importing++;
      if (showProgress) {
        snack = showSnack({
          content: 'Importing items, DO NOT close current page',
          horizontal: 'right',
          vertical: 'bottom',
          autoClose: 20 * 60 * 1000,
          clickAway: false,
        })

        // setTimeout(() => {
        //   appendStyle(`
        //     #${snack!.id}:not(:hover) {
        //       opacity: 0.1;
        //       transition: 0.3s all;
        //     }
        //   `);
        // }, 5000);
      }

      let isFinished = false
      /**
       * [还原修正] 原代码把 e.preventDefault() 放在判断之前，**无条件**调用，
       * 于是这个"导入未完成"守卫在导入结束后依然拦截关闭 ——
       * 浏览器里表现为每次关闭都弹确认框，Electron 里则是窗口/⌘Q 静默失效。
       * 原作者的外壳用 will-prevent-unload 忽略了它（见 desktop/main.cjs）。
       * 这里把 preventDefault 移进「确实未完成」分支，修掉根因。
       */
      window.addEventListener('beforeunload', (e) => {
        if (!isFinished) {
          e.preventDefault()
          e.returnValue = `The import task hasn't been completed, are you sure to abort it ?`
          return e.returnValue
        }
      })

      const wait = 200
      const setProgress = throttle(wait, (finished: number) => {
        if (showProgress) {
          snack?.update({
            content: `Writing items into database: (${finished}/${allItems.length}), DO NOT close current page`,
            progress: (finished / allItems.length) * 100,
          })
        }
      })

      for (const item of allItems) {
        if (from === 'import') {
          this.importItem(item, dbid)
        } else {
          $.dbMemory.syncAddItem(item)
        }
      }

      for (const [i, item] of allItems.entries()) {
        await $.dbDisk.save(item, dbid, options.tbName)
        setProgress(i + 1)
      }
      isFinished = true
      await sleep(wait)

      if (showProgress) {
        snack?.update({
          content: `Successfully imported all items. ${from === 'import' ? 'You can refresh the page after the SyncIcon on the top right corner indicates that all data is uploaded.' : '' }`,
          severity: 'success',
          autoClose: 3000,
        })
      }
      app.importStatus.importing--;
      if (app.importStatus.shouldRefresh) $.imports.reload();
    }

    singleOptions = {
      type: 'fulljson',
      item: {} as UnitPersist,
      editor: {} as ItemEditor,
      params: {} as ImportOpts,
    }

    showForm(editor: ItemEditor, item: UnitPersist) {
      const options: Options = {} as any
      for (const [k, info] of Object.entries(this.singleHandlers)) {
        ;(options as any)[k] = info.title
      }
      this.app.addons.form.popup<ImportOpts>({
        title: $t`imports.form_title`,
        width: 300,
        initialValues: {
          format: 'markdown',
          keepID: 'new',
          time: 'new',
        },
        subitems: {
          format: {
            title: $t`imports.source_format`,
            type: 'radio',
            required: true,
            options,
            onElChange(e, v) {
              let mime = 'text/*'
              if (v === 'fulljson') {
                mime = 'application/json'
              } else if (v === 'markdown') {
                mime = 'text/markdown,text/plain'
              }
              document
                .getElementById($.imports.idSingle)
                ?.setAttribute('accept', mime)
            },
          },
          keepID: {
            title: $t`imports.item_id`,
            type: 'select',
            options: {
              original: $t`imports.keep_id`,
              new: $t`imports.generate_id`,
            },
            when: (values) => ['fulljson', 'json'].includes(values.format),
          },
          time: {
            title: $t`imports.item_time`,
            type: 'select',
            options: {
              original: $t`imports.keep_time`,
              new: $t`imports.generate_time`,
            },
            when: (values) => ['fulljson', 'json'].includes(values.format),
          },
        },
        buttons: {
          [$t`imports.import_button`]: (values) => {
            this.singleOptions = {
              type: values.format,
              item,
              editor,
              params: values,
            }
            this.showSingleFilePicker()
          },
          [$t`common.cancel`]: null,
        },
      })
    }

    addonCommands(): HotkeyMaps {
      return {
        importsDatabase: {
          title: $t`imports.import_database`,
          hotkey: 'mod+shift+i',
          context: 'editor',
          handle() {
            $.imports.showFilePicker()
          },
        },
      }
    }

    addonInfo() {
      return {
        title: $t`imports.title`,
        quote: $t`imports.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    reload() {
      if (app.importStatus.importing > 0) {
        app.importStatus.shouldRefresh = true;
        return;
      } else {
        window.location.reload();
      }
    }

    addonRun() {
      const { ui, imports, editorView, main } = this.app.addons

      this.singleHandlers = singleHandlers()

      main.addMoreExtraCommands({
        imports: {
          title: $t`imports.import_database`,
          icon: icons.svg_import,
          order: 1000,
          hotkey: 'mod+shift+i',
          onClick: () => {
            document
              .getElementById($.imports.idMulti)
              ?.setAttribute('accept', 'application/json')
            imports.showFilePicker()
          },
        },
      })

      // Add <input type="file" /> to <body>
      ui.pushComponent(() => {
        return (
          <InputFileComp
            id={this.idMulti}
            onLoad={(ev, source) => {
              imports.invokeMultiHandler({
                type: 'fulljson',
                source,
              })
            }}
          />
        )
      })

      ui.pushComponent(() => {
        return (
          <InputFileComp
            id={this.idSingle}
            onLoad={(ev, source) => {
              imports.invokeSingleHandler(source)
            }}
          />
        )
      })

      editorView.addDropdown({
        imports: {
          title: $t`imports.editor_dropdown_title`,
          icon: icons.svg_import,
          onClick: (e, { editor, item }) => {
            imports.showForm(editor, item)
          },
        },
      })
    }
  }

  return { imports: new Imports() }
}
