import React from 'react';
import { IAddon, App, NewAddonParams } from '../../engine/App';
import { InfoCalendar } from './MyCalendar';
import { createDatePickerAddon } from './DatePicker/DatePicker';
import { YYYY_MM_DD } from '../../utils/date/datekit';
import { $t } from '../../../i18n';
import { createReminderAddon } from './Reminder/Reminder';

export function createDateToolAddon(params: NewAddonParams) {
  const { app, $ } = params;
  class DateTool implements IAddon {
    app!: App;
    config = {};

    route(date: YYYY_MM_DD) {
      $.daily.route(date);
    }

    popup() {
      const id = $.dialog.show({
        classList: ['dialog-datetool'],
        body: (
          <div>
            <InfoCalendar
              onPick={(fmtDate) => {
                $.dialog.remove(id);
                $.dateTool.route(fmtDate);
              }}
            />
            {/* D125F26FCF5E-18：状态图例（记录密度/引用/提醒），替代无解释的底色 */}
            <div className="datetool-legend">
              <span>
                <i
                  className="dt-dot"
                  style={{ background: 'var(--nk-muted)' }}
                />
                记录密度
              </span>
              <span>
                <i
                  className="dt-dot"
                  style={{
                    background: 'var(--cl-orange-500, #ec8b33)',
                  }}
                />
                引用
              </span>
              <span>
                <i className="dt-badge">2</i>
                提醒
              </span>
            </div>
          </div>
        ),
        SnapProps: {
          targetBox: document.getElementById($.main.ids.extra) as HTMLElement,
          place: ['right-in', 'bottom-out'],
        },
      });
    }

    addonInfo() {
      return {
        title: $t`dateTool.title`,
        quote: $t`dateTool.quote`,
        defaultValue: 'on',
        updated: 20221109,
      };
    }

    addonRun() {
      $.main.addExtraCommands({
        calendar: {
          title: $t`dateTool.calendar`,
          icon: 'svg_calendar',
          onClick() {
            $.dateTool.popup();
          },
        },
      });
    }
  }

  return {
    dateTool: new DateTool(),
    ...createDatePickerAddon(params),
    ...createReminderAddon(params),
  };
}
