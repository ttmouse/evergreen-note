import React from 'react';
import { Icon, PrimitiveIcon } from '../../../components/MaterialIcon';
import { SvgIconName } from '../../../components/SvgIcon';
import { $t } from '../../../i18n';
import { IconItem } from '../../components';
import { usePubState } from '../../hooks/usePubState';
import { UnitProps } from '../../interfaces/unit';
import { observer } from 'mobx-react';
import { useAddons } from '../../hooks/useAddons';
import { showSnack } from '@/slate-item/utils/msg/showSnack';

const PUB_KEY_SYNC = 'sync-status';
export type SyncStatus =
  | 'up'
  | 'todo'
  | 'done'
  | 'success'
  | 'fail'
  | 'offline'
  | 'fetching'
  | 'fetched';

export const statusIcon: { [k in SyncStatus]?: SvgIconName } = {
  up: 'svg_cloud_upload',
  todo: 'svg_cloud_fill',
  done: 'svg_cloud',
  fetching: 'svg_cloud_download',
  offline: 'svg_cloud_offline',
  fail: 'svg_cloud_offline',
};

export const SyncIcon = observer((props: Partial<UnitProps>) => {
  const { icon } = props;
  const $ = useAddons();
  const [status] = usePubState<SyncStatus>(PUB_KEY_SYNC, 'done');
  // const theIcon = status in statusIcon ? statusIcon[status] : icon;

  let theIcon = icon;
  if (status in statusIcon) {
    // theKey = status;
    theIcon = statusIcon[status];
  }
  if ($.app.cfg.syncService === 'off') {
    theIcon = 'svg_cloud_offline';
  }

  const params = {
    // waitingCount: $.sync.waitingCount,
  };
  const theKey = 'title';

  return (
    <IconItem
      {...props}
      icon={theIcon as PrimitiveIcon}
      title={$t(`sync.${theKey}`, params)}
      onClick={async () => {
        $.sync2.smallSync();
      }}
    />
  );
  // return <Icon name={theIcon as any} size={16}  />
});
