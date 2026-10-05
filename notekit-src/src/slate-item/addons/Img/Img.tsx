import { Element, Node, ReactEditor } from '../../slate.inc'
import { App, NewAddonParams } from '../../engine/App'
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap'
import { ImgComp, ImgElementComponent } from './ImgComp'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { InlineElement } from '../Inlines/Inlines'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { cover } from '../../engine/helper'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { isEmpty } from '../../utils/isEmpty'
import { pick } from '../../utils/object/pick'
import {
  InlinesBarInterface,
  InlinesFormParams,
} from '../Inlines/InlinesBar/InlinesBar'
import { setPubState } from '../../hooks/usePubState'
import { $t } from '../../../i18n'
import { GlobalModalProvider } from '../../../components/GlobalModal/GlobalModal'
import { reactRender } from '../../utils/common'
import React from 'react'
import { AttachmentInfo } from '../Attachment/Attachment'

export type ImgNeededProps = {
  src: string
  alt?: string
  href?: string
  height?: number
  width?: number
}
export type ImgElement = InlineElement & ImgNeededProps

export type ImgFormValues = Pick<
  ImgElement,
  'src' | 'alt' | 'height' | 'width' | 'href'
>

export type Base64ImageDbAdminnse = {
  node: UnitPersist & {
    fileInfo: AttachmentInfo
  }
  code: number
}

/**
 * Img Addon
 */
export function createImgAddon({ app, $ }: NewAddonParams) {
  class Img
    implements IAddonElement<ImgElement>, InlinesBarInterface<ImgElement>
  {
    app!: App
    config = {}

    /**
     * If img element is a void element ?
     */
    isVoid = () => false

    fromMarkdown(markdown: string) {
      return {} as any
    }

    /**
     * Check if a value matches the data structure of img element
     */
    verify(val: any): val is ImgElement {
      return Element.isElement(val) && (val as any).blockType === 'img'
    }

    exportString(el: ImgElement, options: { rich?: boolean } = {}) {
      if (options.rich) return `![${el.alt || ''}](${el.src})`;
      return el.alt || '[Image]';
      
    }

    /**
     * Create img element
     */
    createElement(props: {
      src: string
      title?: string
      alt?: string
      href?: string
      width?: number
      height?: number
    }): ImgElement {
      const { title } = props
      return this.app.addons.inlines.createElement('img', title, {
        inline: true,
        isVoid: true,
        ...props,
      }) as ImgElement
    }

    /**
     * Add a rule for string map
     */
    strmap(): StrmapRuleInfo {
      return {
        strmapRule: /!\[(.*?)\]\((.+?)\)$/,
        handle: ({ match }: StrmapParams) => {
          return this.createElement({ src: match[2], title: match[1] })
        },
      }
    }

    /**
     * Add an item to slash menu to create img element
     */
    slashMenu(): SlashMenuItems {
      return {
        slashImg: {
          icon: 'svg_img',
          title: $t`img.slash_menu_title`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'image' },
            en2: { v: 'img' },
            cn: { v: '图片' },
            pinyin: { v: 'tu pian' },
            py: { v: 'tp' },
          },
          handle({ editor }) {
            // slashMenu.insertText(editor, '![]()');
            $.img.showForm(editor)
            $.slashMenu.insertText(editor, '')
          },
        },
      }
    }

    /**
     * Add a React component to render img element
     */
    createComponent() {
      return ImgElementComponent
    }

    uploadDataURL(
      dataURL: string,
      filename = ''
    ): Promise<Base64ImageDbAdminnse> {
      return this.app.addons.http.progress({
        uri: '/api/saveB64Image',
        showProgress: true,
        payload: {
          uri: dataURL,
          filename,
        },
      }).then(async (e: Base64ImageDbAdminnse)=>{
        try {
          if (e.code) {
            const realPath = `/v2/${e.node.fileInfo.path}`
            const cache = await caches.open('EvergreenNote-v0-UserData');
            const resp = await fetch(dataURL);
            const blob = await resp.blob();
            const headers = new Headers();
            headers.append('Content-Type', resp.headers.get('Content-Type') || 'image/png');
            headers.append('Content-Length', blob.size.toString());
            await cache.put(realPath, new Response(blob, {headers}))
          }
        } catch(e) {}
        return e
      })
    }

    onPaste(editor: ItemEditor, nativeEvent: ClipboardEvent) {
      return new Promise((resolve, reject) => {
        if (nativeEvent.clipboardData?.items[0].type.includes('image')) {
          const { img } = this.app.addons
          const reader = new FileReader()
          const file = nativeEvent.clipboardData.items[0].getAsFile()
          reader.onload = async (e) => {
            if (e.target?.result) {
              const image = new Image()
              image.onload = async () => {
                // Clipboard screenshots from a Retina display contain device pixels.
                // Store their logical CSS size while keeping the original image intact.
                const scale = Math.max(1, window.devicePixelRatio || 1)
                const width = Math.round(image.naturalWidth / scale)
                const height = Math.round(image.naturalHeight / scale)
                const response = await img.uploadDataURL(
                  e.target.result as string
                )
                if (response.code == 0) {
                  editor.insertFragment([
                    img.createElement({
                      src: response.node.fileInfo.path,
                      width,
                      height,
                    }),
                    { text: '' },
                  ])
                }
                resolve(response)
              }
              image.onerror = async () => {
                const response = await img.uploadDataURL(
                  e.target!.result as string
                )
                if (response.code == 0) {
                  editor.insertFragment([
                    img.createElement({ src: response.node.fileInfo.path }),
                    { text: '' },
                  ])
                }
                resolve(response)
              }
              image.src = e.target.result as string
            }
          }
          file && reader.readAsDataURL(file)
        } else {
          reject(false)
        }
      })
    }

    showForm(editor: ItemEditor, vals: ImgFormValues = {} as any) {
      const formHanler = $.form.popup<
        ImgFormValues & { method?: string; upload?: any }
      >({
        initialValues: {
          method: 'Upload',
          ...vals,
        },
        subitems: {
          method: {
            type: 'btns',
            title: '',
            options: ['URL', 'Upload'],
          },
          src: {
            type: 'text',
            title: 'Image URL',
            autoFocus: true,
            focused: true,
            when: { method: 'URL' },
          },
          alt: {
            type: 'text',
            title: 'Alt Text',
            when: (values) => !isEmpty(values.src),
          },
          href: {
            type: 'text',
            title: $t`img.link_url`,
            when: (values) => !isEmpty(values.src),
          },
          width: {
            type: 'number',
            title: 'Width',
            when: (values) => !isEmpty(values.src),
          },
          upload: {
            type: 'file',
            title: 'Upload',
            when: { method: 'Upload' },
            accept: 'image/*',
            async onElChange(e, v: string) {
              const filename = e.target.files[0].name
              const response = await $.img.uploadDataURL(v, filename)
              editor.insertFragment([
                $.img.createElement({
                  src: response.node.fileInfo.path,
                  alt: filename,
                }),
                { text: '' },
              ])
              formHanler.close()
            },
          },
        },
        buttons: {
          [$t`common.done`]: (values) => {
            if (values.method === 'URL') {
              editor.insertFragment([
                $.img.createElement(pick(values, ['src', 'alt', 'width'])),
                { text: '' },
              ])
            }
          },
          [$t`common.cancel`]: null,
        },
      })
    }

    inlinesBarForm(params: InlinesFormParams<ImgElement>): void {
      const { editor, element } = params
      $.form.popup({
        // title: 'Image',
        initialValues: {
          src: element.src,
          alt: element.alt,
          width: element.width,
          href: element.href,
        },
        subitems: {
          src: {
            type: 'text',
            title: $t`img.image_url`,
          },
          alt: {
            type: 'text',
            title: $t`img.alt_text`,
          },
          href: {
            type: 'text',
            title: $t`img.link_url`,
          },
          width: {
            type: 'number',
            title: $t`img.width`,
          },
        },
        onChange(values) {
          const path = ReactEditor.findPath(editor as any, element)
          $.inlines.setProps<ImgElement>(editor, path, {
            ...values,
            iky: element.iky,
          })
          if (!isEmpty(values.width)) {
            setPubState(`imgsize-${element.iky}`, {
              width: Number(values.width),
            })
          }
        },
      })
    }

    inlinesBarAddItems(): void {
      const cond = () => $.inlinesBar.getContext<any>().is('img')
      $.inlinesBar.addItems({
        img: {
          cond,
          title: $t`img.form_title`,
          icon: 'svg_edit',
          onClick() {
            const ctx = $.inlinesBar.getContext<ImgElement>()
            $.img.inlinesBarForm({
              ...ctx,
              SnapProps: {
                targetBox: ctx.elementDom,
                place: ['center', 'bottom-out'],
              },
            })
          },
        },
      })
    }

    /**
     * Initialize Img addon
     */
    addonRun() {
      // Initialize global modal
      this.initializeGlobalModal()

      const { onPaste } = $?.paste ?? {}
      cover(onPaste, (event, editor) => {
        const { nativeEvent } = event
        if (nativeEvent.clipboardData?.items[0].type.includes('image')) {
          $.img.onPaste(editor, nativeEvent)
          return
        }
        return onPaste.call($.paste, event, editor)
      })

      $.img.inlinesBarAddItems()
    }

    /**
     * Initialize global modal provider
     */
    initializeGlobalModal() {
      // Check if global modal is already initialized
      if (document.getElementById(`${app.appName}-modal-root`)) {
        return
      }

      // Create a container for the global modal
      const modalContainer = document.createElement('div')
      modalContainer.id = `${app.appName}-modal-root`
      document.body.appendChild(modalContainer)

      // Render the GlobalModalProvider
      reactRender(modalContainer, React.createElement(GlobalModalProvider, {
        children: null
      }))
    }
  }

  return { img: new Img() }
}
