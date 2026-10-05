import React from 'react';
import { useItem } from '../../hooks/useItem';
import { ElementComponentProps } from '../EditorView/EditorView';
import { InlineOuterComp } from '../Inlines/InlineOuterComp';
import { PomoElement } from './Pomo';
import { useAddons } from '../../hooks/useAddons';
import { useEditor } from '../../hooks/useEditor';
import { PomoComp, POMO_DEFAULT_DURATION } from './PomoComp';
import { time } from '../../utils/date/time';
import { atLater } from '@/slate-item/utils/atLater';
import { until } from '@/slate-item/utils/until';
import { MEMBER_ID } from '@/slate-item/constants';

export function PomoElementComp(props: ElementComponentProps<PomoElement>) {
  const { element: pomoElement } = props;
  const { iky, startTime, log, duration }: PomoElement = pomoElement as any;
  const item = useItem();
  const editor = useEditor();
  const $ = useAddons();
  const handleStart = () => {
    const startTime = Date.now();
    $.inlines.setProps<PomoElement>(editor, item.GetSlPath(), {
      iky,
      startTime,
      log: 'no',
    });
    Notification.requestPermission();
    
    // request server to notify if we are in the background
    fetch(`/api/enablePomoNotification/${item.ky}?duration=${pomoElement.duration ?? POMO_DEFAULT_DURATION}&startTime=${startTime}`);
  };
  const handleStop = async (notify = true) => {
    const myprops = $.inlines.getProps<PomoElement>(
      editor,
      item.GetSlPath(),
      iky
    );

    if (myprops) {
      const count = myprops.count ?? 0;
      $.inlines.setProps<PomoElement>(editor, item.GetSlPath(), {
        ...myprops,
        count: count + 1,
        log: 'yes',
      });

      $.pomo.showCreateRecordForm({
        duration: myprops.duration!,
        item,
        time: time(),
      });
    }

    // prevent the server from sending the notification
    fetch(`/api/disablePomoNotification/${item.ky}`);

    if(notify) atLater(
      () => {
        if ($.sandbox.serviceWorkerRegistration) $.sandbox.serviceWorkerRegistration.showNotification("Time is over for your pomo!", {
          data: {taskID: `${MEMBER_ID}-${item.ky}`}
        });
      },
      `pomo-notification-${item.ky}`,
      100
    )
  };

  // if we forgot to log, log it now
  const logItNow = async () => {
    await until(()=>(!$.sync2.isSmallSyncing))
    const {startTime, log, duration} = $.inlines.getProps<PomoElement>(editor, item.GetSlPath(), iky)!;
    if (startTime && log === 'no') {
      if ((duration ?? POMO_DEFAULT_DURATION) * 60 * 1000 - (Date.now() - startTime!) < 0) {
        handleStop(false);
      }
    }
  }
  setTimeout(logItNow, 10);

  return (
    <InlineOuterComp
      inner={
        <PomoComp
          startTime={startTime}
          duration={pomoElement.duration ?? POMO_DEFAULT_DURATION}
          onStart={handleStart}
          onStop={handleStop}
        />
      }
      {...props}
    />
  );
}
