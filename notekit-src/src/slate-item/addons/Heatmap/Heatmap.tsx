import { App, NewAddonParams } from '../../engine/App';
import { HeatmapProps } from './HeatmapComp';
import { calcColor, RGBColor } from './helper';
import {
  HeatMapStrategyCreatedNodes,
  HeatMapStrategyUpdatedNodes,
} from './strategy';
import { after } from '../../engine/helper';
import { $t } from '../../../i18n';
import { InlineElement } from '../Inlines/Inlines';
import { HeatmapElementComp } from './HeatmapElementComp';
import { HeatmapPageComp } from './HeatmapPageComp';
import { SlashMenuItems } from '../SlashMenu/SlashMenu';
import { IAddonElement } from '../ElementRegistry/ElementRegistry';
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap';
import {
  datekit,
  h24,
  isDateFmt,
  isFuture,
  YYYY_MM_DD,
} from '../../utils/date/datekit';
import { FORM_EL } from '../Form/Form';
import { isEmpty } from '../../utils/isEmpty';
import { ItemTransforms } from '../../transforms/item';

export type HeatmapElement = InlineElement & HeatmapProps;

export enum STRATEGIES {
  createdNodes = 'createdNodes',
  updatedNodes = 'updatedNodes',
}

export function createHeatmapAddon({ app, $ }: NewAddonParams) {
  class Heatmap implements IAddonElement<HeatmapElement> {
    app!: App;
    config = {};

    blockType = 'heatmap';

    strategies = {
      [STRATEGIES.createdNodes]: new HeatMapStrategyCreatedNodes(),
      [STRATEGIES.updatedNodes]: new HeatMapStrategyUpdatedNodes(),
    };

    // 黑白灰配色：浅灰 → 近黑（与主界面黑白灰一致，2026-10-09 用户反馈）
    colorRange: [RGBColor, RGBColor] = [
      [224, 224, 224],
      [24, 24, 24],
    ];

    fieldset() {
      return {
        start: {
          type: FORM_EL.text,
          title: $t`heatmap.start_month`,
        },
        end: {
          type: FORM_EL.text,
          title: $t`heatmap.end_month`,
        },
      };
    }

    isVoid(val: InlineElement) {
      return this.verify(val);
    }

    verify(val: any): val is HeatmapElement {
      return (val as HeatmapElement).blockType === $.heatmap.blockType;
    }

    exportString(el: HeatmapElement) {
      return `{{heatmap}}`;
    }

    fromMarkdown(md: string) {
      return undefined;
    }

    strmap(): StrmapRuleInfo {
      return {
        title: $t`heatmap.title`,
        // 支持 {{heatmap}} 与 {{heatmap 2021-11,2022-1}}（自定义起止月份）
        strmapRule: /\{\{heatmap(?:\s*(\d{4}-\d{1,2})\s*,\s*(\d{4}-\d{1,2}))?\}\}$/,
        handle({ match }: StrmapParams) {
          const [, start, end] = match;
          return $.heatmap.createElement(
            start && end ? ({ start, end } as HeatmapProps) : undefined
          );
        },
      };
    }

    slashMenu(): SlashMenuItems {
      return {
        heatmapSlash: {
          icon: 'svg_heatmap',
          title: $t`heatmap.slash_menu_title`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'heatmap' },
            cn: { v: '热力图' },
            pinyin: { v: 're li tu' },
            py: { v: 'rlt' },
          },
          handle({ editor }) {
            $.slashMenu.insertText(editor, [$.heatmap.createElement()]);
          },
        },
      };
    }

    createElement(props: HeatmapProps = {} as any) {
      const {
        start = datekit().add(-2, 'month').format('YYYY-MM'),
        end = datekit().format('YYYY-MM'),
      } = props;

      return $.inlines.createElement($.heatmap.blockType, '{{heatmap}}', {
        start,
        end,
      });
    }

    createComponent() {
      return HeatmapElementComp;
    }

    calcPercent(
      fmtDate: YYYY_MM_DD,
      strategyName: STRATEGIES = STRATEGIES.createdNodes
    ) {
      return $.heatmap.strategies[strategyName].getPercent(fmtDate);
    }

    calcColor = calcColor;

    calcBgColor(fmtDate: YYYY_MM_DD): string {
      const n = $.heatmap.calcPercent(fmtDate, STRATEGIES.createdNodes);
      const percent = Math.round(n * 100) / 100;
      const bg =
        percent === 0
          ? '' // 空格不写内联背景，交给 CSS 给极浅灰底（浅/夜各一档，2026-10-09）
          : $.heatmap.calcColor(
              $.heatmap.colorRange[0],
              $.heatmap.colorRange[1],
              percent
            );
      return bg;
    }

    // calcCssBgColor(fmtDate: YYYY_MM_DD) {
    //   const percent = $.heatmap.calcPercent(fmtDate);
    //   return $.heatmap.cssBgColor(percent);
    // }

    // cssBgColor(percent: number) {
    //   const pc = Math.round(percent * 100 * 100) / 100;
    //   return `hsl(147, ${pc}%, ${pc}%)`;
    // }

    route(date: YYYY_MM_DD) {
      $.daily.route(date);
    }

    addonInfo() {
      return {
        title: $t`heatmap.title`,
        quote: $t`heatmap.quote`,
        defaultValue: 'on',
        updated: 20221108,
      };
    }

    collectItem(item: UnitPersist) {
      for (const stg of Object.values(this.strategies)) {
        if (stg.check(item)) {
          stg.addItem(item);

          // 处理未来的日期主题
          if (item.topic && isDateFmt(item.topic) && isFuture(item.topic)) {
            setTimeout(() => {
              const count = $.counter.countDescendants(item);
              stg.add(item.topic!, count);
            }, 100);
          }
        }
      }
    }

    addonBeforeRun() {
      after($.dbMemory.addItem, (_, item) => {
        $.heatmap.collectItem(item);
      });

      $.heatmap.slashMenu();
    }

    addonRun() {
      // const [[r1, g1, b1], [r2, g2, b2]] = $.heatmap.colorRange;
      // appendStyle(`
      //   :root {
      //     --r1: ${r1};
      //     --g1: ${g1};
      //     --b1: ${b1};
      //     --r2: ${r2};
      //     --g2: ${g2};
      //     --b2: ${b2};
      //   }`);

      // 侧边栏入口：注册 /heatmap 路由页面并加导航项
      $.router?.register({
        heatmap: {
          title: $t`heatmap.title`,
          comp: HeatmapPageComp,
        },
      });

      // 2026-10-10 用户反馈：左侧边栏单独的热力图入口奇怪，已移除；
      // 热力图仍可通过笔记内嵌 {{heatmap}} 查看，/heatmap 路由保留但无入口。
    }
  }

  return { heatmap: new Heatmap() };
}
