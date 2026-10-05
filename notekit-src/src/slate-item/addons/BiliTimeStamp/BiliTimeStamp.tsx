import { IAddon, App, NewAddonParams } from '../../engine/App'
import React from 'react'
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap'
import { InlineElement } from '../Inlines/Inlines'
import { ElementComponentProps } from '../EditorView/EditorView'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { InlinesFormParams } from '../Inlines/InlinesBar/InlinesBar'
import { ReactEditor } from '@/slate-item/slate.inc'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'

type BiliTimeStampProps = {
  time: number,
}
type BiliTimeStampElement = InlineElement & {
  blockType: 'biliTimeStamp',
} & BiliTimeStampProps;

export function createBiliTimeStampAddon({ app, $ }: NewAddonParams) {
  class BiliTimeStamp implements IAddon {
    app!: App
    config = {}

    addonBeforeRun() {
    }

    addonInfo() {
      return {
        title: "BiliTimeStamp",
        quote: "Link to a time in a Bilibili video",
        defaultValue: 'on',
        type: 'fieldset',
        updated: 2024_09_05,
      }
    }

    createElement(props: BiliTimeStampProps) {
      return $.inlines.createElement('biliTimeStamp', '', props);
    }

    verify(val: any): val is BiliTimeStampElement {
      return (val as BiliTimeStampElement).blockType === 'biliTimeStamp';
    }

    exportString(el: BiliTimeStampElement): string {
      return this.numberToTime(el.time);
    }

    isVoid(val: InlineElement) {
      return this.verify(val);
    }

    slashMenu(): SlashMenuItems {
      return {}
    }

    inlinesBarForm(params: InlinesFormParams<BiliTimeStampElement>): void {
      const { editor, element } = params
      $.form.popup({
        // title: 'Image',
        initialValues: {
          time: $.biliTimeStamp.numberToTime(element.time),
        },
        subitems: {
          time: {
            type: "text",
            title: "Time",
          }
        },
        onChange(values) {
          const path = ReactEditor.findPath(editor as any, element)
          const num = $.biliTimeStamp.timeToNumber(values.time)
          if (num && (!isNaN(num)))
            $.inlines.setProps<BiliTimeStampElement>(editor, path, {
              time: num,
              iky: element.iky,
            })
        },
      })
    }

    createComponent(props: BiliTimeStampProps) {
      return (props: ElementComponentProps<BiliTimeStampElement>) => {
        const { element } = props;
        const { time } = element as any;

        return (
          <InlineOuterComp
            inner={
              <a
                onClick={(e: React.MouseEvent) => {
                  const ele = e.target as HTMLDivElement;
                  const ifr = ele.closest(".node-with-embedweb")?.querySelector("iframe");
                  if (ifr) {
                    let src = ifr.src;
                    src = src.replace(/t=\d+(&|$)/, '');
                    src = src.replace(/autoplay=(false|true)(&|$)/, 'autoplay=true&')
                    src += `&t=${time}`;
                    ifr.src = src;
                  }
                }}
                href={"javascript:void(0)"}
                className={"biliTimeStampLink"}
              >{$.biliTimeStamp.numberToTime(time)}</a>
            }
            {...props}
          />
        );
      }
    }

    timeToNumber(time: string) {
      const splitted = time.split(":");
      if (splitted.length === 3) {
        const hours = parseInt(splitted[0]);
        const minutes = parseInt(splitted[1]);
        const seconds = parseInt(splitted[2]);
        return hours * 3600 + minutes * 60 + seconds;
      } else if (splitted.length === 2) {
        const minutes = parseInt(splitted[0]);
        const seconds = parseInt(splitted[1]);
        return minutes * 60 + seconds;
      }
      return 0;
    }

    numberToTime(time: number) {
      const hours = Math.floor(time / 3600);
      const minutes = Math.floor((time % 3600) / 60);
      const seconds = time % 60;
      return `${hours > 0 ? hours.toString().padStart(2, "0") + ":" : ""}${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    addonRun() {
      appendStyle(`
        .biliTimeStampLink {
          text-decoration:none;
          color:white;
          background: var(--cl-blue-500);
          padding: 0.3em 0.6em;
          border-radius: 1em;
          margin-right: 0.2em;
        }

        .node-with-refer .biliTimeStampLink {
          text-decoration: unset;
          color: unset;
          background: unset;
          padding: unset;
          border-radius: unset;
        }
        
      `)
      $.inlinesBar.addItems({
        biliTimeStamp: {
          cond: () => $.inlinesBar.getContext<any>().is('biliTimeStamp'),
          title: "Edit Time",
          icon: 'svg_edit',
          onClick() {
            const ctx = $.inlinesBar.getContext<BiliTimeStampElement>()
            $.biliTimeStamp.inlinesBarForm({
              ...ctx,
              SnapProps: {
                targetBox: ctx.elementDom,
                place: ['center', 'bottom-out'],
              },
            })
          },
        },
      })

      $.strmap && $.strmap.addRules({
        biliTimeStamp: {
          strmapRule: /^(\d{1,2}):(\d{1,2})(:\d{1,2})? /,
          handle: ({ item, match }: StrmapParams) => {
            if (item && item.pky && item.pky !== "-") {
              const pItem = $.dbMemory.getItem(item.pky);
              if (pItem.leaves.some(e => (e && (e as any).blockType == "embedweb" && (e as any).value.includes("bilibili.com")))) {
                return $.biliTimeStamp.createElement({ time: $.biliTimeStamp.timeToNumber(match[0]) })
              }
            }
          },
        },
      })
    }
  }

  return { biliTimeStamp: new BiliTimeStamp() }
}
