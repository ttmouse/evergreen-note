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
          <InfoCalendar
            onPick={(fmtDate) => {
              $.dialog.remove(id);
              $.dateTool.route(fmtDate);
            }}
          />
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
