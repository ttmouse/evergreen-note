import React from 'react';
import { useAddons } from '../../hooks/useAddons';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { GearIcon as SettingsIcon } from '@phosphor-icons/react';
import { $t } from '../../../i18n';
import { AddonInfo } from './AddonCenterComp';
import { cls, colorBase } from '../../styles';
import { isEmpty } from '../../utils/isEmpty';
import { until } from '../../utils/until';
import { atLater } from '../../utils/atLater';

const reloadStyle = cls`
  color:${[colorBase.warning, 500]};
  cursor: pointer;
  border-bottom: 1px solid ${[colorBase.warning, 500]};
  display: inline-block;

  &:hover {
    color:${[colorBase.warning, 600]};
    border-bottom: 1px solid ${[colorBase.warning, 600]};
  }
;`;

export function AddonDetailComp(props: { addonInfo: AddonInfo; onStatusChange?: () => void }) {
  const { addonInfo: info } = props;
  const $ = useAddons();

  const [enabled, setEnabled] = React.useState(false);
  const [changed, setChanged] = React.useState(false);

  const setStatus = (status: boolean) => {
    setEnabled(status);
    setChanged(true);
    info && $.addonCenter.enableAddon(info.addonName, status);
    props.onStatusChange?.();

    until(() => !$.addonCenter.isDialogOpen).then(() => {
      atLater($.ui.refresh, 'restart-app', 300);
    });
  };

  React.useEffect(() => {
    setChanged(false);
    info && setEnabled($.addonCenter.isAddonEnabled(info.addonName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.addonName]);

  return (
    <div className="addon-detail">
      <h1>{info.title}</h1>

      <Typography variant="body1" gutterBottom>
        {!info.updated ? '' : $t(`addonCenter.updated`, info)}
      </Typography>

      <Typography variant="body2" gutterBottom>
        {info.quote ?? ''}
      </Typography>

      <Typography variant="subtitle1" gutterBottom>
        {enabled ? (
          <Button
            onClick={() => setStatus(false)}
            variant="contained"
            color="success"
            size="small"
          >
            {$t`common.enabled`}
          </Button>
        ) : (
          <Button
            onClick={() => setStatus(true)}
            variant="outlined"
            size="small"
          >
            {$t`common.enable`}
          </Button>
        )}
        {isEmpty($.addonCenter.getAddonInfo(info.addonName)?.subitems) ||
        !enabled ? null : (
          <IconButton
            color="primary"
            aria-label={$t`addonCenter.settings`}
            title={$t`addonCenter.settings`}
            sx={{ ml: 1 }}
            onClick={(e) =>
              $.prefer.showCfgForm({
                // activeKey: info.addonName,
                hideDialogTitle: true,
                hideTabs: true,
                picks: [info.addonName],
                DialogProps: {
                  SnapProps: {
                    targetBox: e.currentTarget,
                    place: ['center', 'bottom-out'],
                  },
                },
              })
            }
          >
            <SettingsIcon />
          </IconButton>
        )}
      </Typography>

      {!changed ? null : (
        <Typography
          variant="body2"
          gutterBottom
          className={reloadStyle}
          onClick={() => $.imports.reload()}
        >
          {$t('addonCenter.reload')}
        </Typography>
      )}
    </div>
  );
}
