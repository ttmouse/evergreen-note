import React from 'react'
import { $t } from '../../../i18n'
import { App, NewAddonParams } from '../../engine/App'
import { Element, Location, ReactEditor, Transforms } from '../../slate.inc'
import { isEmpty } from '../../utils/isEmpty'
import { showSnack } from '../../utils/msg/showSnack'
import { mkid } from '../../utils/string/mkid'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { mimeAccept } from '../Imghost/helper'
import { InlineElement } from '../Inlines/Inlines'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { StrmapRuleInfo, StrmapParams } from '../Strmap/Strmap'
import { AttachmentComp } from './AttachmentComp'
import { AttachmentInputComp } from './AttachmentInputComp'
import { ItemNode } from '@/slate-item'
import { ImgElement } from '../Img/Img'

export type AttachmentInfo = {
  ext: string
  name: string
  path: string
  type: string
  extra?: any
  md5?: string
  width?: number
  height?: number
  size: number
}

/**
 * The data reponsed by the server while uploading a file
 */
export type AttachmentResponse = {
  code: number
  node: UnitPersist & { fileInfo: AttachmentInfo }
}

export type AttachmentElement = InlineElement & {
  inline: boolean
  blockType: 'attachment'
  children: Node[]
  size: number
} & AttachmentInfo

/**
 * Attachment Addon
 */
export function createAttachmentAddon({ app, $ }: NewAddonParams) {
  class Attachment implements IAddonElement<AttachmentElement> {
    app!: App
    config = {}
    id = `attachment-element-${mkid()}`
    at: Location | null = null
    editor: ItemEditor | null = null

    /**
     * If attachment element is a void element ?
     */
    isVoid(el: AttachmentElement) {
      return $.attachment.verify(el)
    }

    fromMarkdown(markdown: string) {
      return {} as any
    }

    /**
     * Check if a value matches the data structure of attachment element
     */
    verify(val: any): val is AttachmentElement {
      return Element.isElement(val) && (val as any).blockType === 'attachment'
    }

    /**
     * Create attachment element
     */
    createElement(props: AttachmentInfo): AttachmentElement {
      return this.app.addons.inlines.createElement('attachment', '', {
        ...props,
        isVoid: true,
      }) as AttachmentElement
    }

    exportString(el: AttachmentElement, options: { rich?: boolean }) {
      let trueUrl = el.path
      if (!trueUrl.startsWith('http')) {
        trueUrl = `${window.location.origin}/v2/${el.path}`
      }
      if (options.rich) return `[${el.name}](${trueUrl})`
      return `${el.name}`
    }

    /**
     * Add a rule for string map
     */
    strmap(): StrmapRuleInfo {
      return {
        strmapRule: /\{\{file\}\}/,
        handle: ({ match }: StrmapParams) => {
          return ''
        },
      }
    }

    /**
     * Add an item to slash menu to create attachment element
     */
    slashMenu(): SlashMenuItems {
      const { slashMenu, attachment } = this.app.addons
      return {
        slashAttachment: {
          icon: 'svg_attachment',
          title: $t`attachment.slash_menu_title`,
          order: slashMenu.order.inline,
          versions: {
            en: { v: 'upload an attachment' },
            zh: { v: '上传文件' },
            pinyin: { v: 'shang chuan wen jian' },
            py: { v: 'scwj' },
          },
          handle({ editor }) {
            attachment.at = editor.selection
            attachment.editor = editor
            attachment.showFilePicker()
            slashMenu.insertText(editor, '')
          },
        },
      }
    }

    /**
     * Add a React component to render attachment element
     */
    createComponent() {
      return AttachmentComp
    }

    showFilePicker() {
      document.getElementById(this.id)?.dispatchEvent(new MouseEvent('click'))
    }

    handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
      const { editor, at } = this
      const postData: { [k: string]: File } = {}
      const el = e.target
      if (el.files) {
        for (let i = 0; i < el.files.length; i++) {
          postData[`file${i}`] = el.files[i]
        }
        $.http.progress({
          uri: '/api/handle-upload',
          payload: postData,
          showProgress: true,
          async callback(response: AttachmentResponse) {
            if (response.code !== 0) {
              showSnack({
                content: 'Failed to upload file',
                severity: 'error',
              })
              return
            }
            ReactEditor.focus(editor as any)
            at && Transforms.select(editor as any, at)
            if (response.code === 0 && !isEmpty(response.node)) {
              try {
                if (response.node && response.node.fileInfo.path) {
                  const realPath = `/v2/${response.node.fileInfo.path}`
                  const cache = await caches.open('EvergreenNote-v0-UserData')
                  const file = postData['file0']
                  const headers = new Headers()
                  headers.append('Content-Type', file.type)
                  headers.append('Content-Length', file.size.toString())
                  await cache.put(
                    realPath,
                    new Response(file, {
                      headers: headers,
                    })
                  )
                }
              } catch (e) {}
              let element: InlineElement = $.attachment.createElement(
                response.node.fileInfo
              )
              if (response.node.fileInfo.type.startsWith('image')) {
                element = $.img.createElement({
                  src: response.node.fileInfo.path,
                  alt: response.node.fileInfo.name,
                })
              }

              editor?.insertFragment([element, { text: '' }])
            }
          },
        })
      }
    }

    open(path: string, item: ItemNode) {
      window.open(path, '_blank')
    }

    addonInfo() {
      return {
        title: $t`attachment.title`,
        quote: $t`attachment.quote`,
        defaultValue: 'on',
        type: 'fieldset',
      }
    }

    /**
     * Initialize Attachment addon
     */
    addonRun() {
      const { attachment, ui } = this.app.addons
      ui.pushComponent(() => (
        <AttachmentInputComp
          id={this.id}
          onChange={(e: any) => attachment.handleUpload(e)}
          // accept={mimeAccept(
          //   'jpg',
          //   'jpeg',
          //   'png',
          //   'gif',
          //   'pdf',
          //   'doc',
          //   'xls',
          //   'xlsx',
          //   'ppt',
          //   'txt',
          //   'zip',
          //   'mp3',
          // )}
          // accept="image/gif,
          //   image/jpeg,
          //   image/jpg,
          //   image/pjpeg,
          //   image/x-png,
          //   image/png,
          //   text/css,
          //   application/x-gzip,
          //   text/html,
          //   text/javascript,
          //   video/quicktime,
          //   audio/x-mpeg,
          //   video/x-sgi-movie,
          //   text/xml,
          //   text/plain,
          //   image/svg+xml,
          //   application/octet-stream,
          //   application/x-latex,
          //   application/x-shockwave-flash,
          //   application/pdf"
        />
      ))
    }
  }

  return { attachment: new Attachment() }
}
