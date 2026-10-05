import React from 'react';
import Chip from '@mui/material/Chip';
import { useItem } from '../../hooks/useItem';
import { useAddons } from '../../hooks/useAddons';
import { showSnack } from '../../utils/msg/showSnack';
import { APP_SCRIPT_KY } from './Script';
import { $t } from '../../../i18n';

export function ScriptInstallIcon(props: any) {
  const item = useItem();
  const $ = useAddons();
  const [isInstalled, setIsInstalled] = React.useState(
    $.script.isInstalled(item.ky)
  );

  const label = isInstalled
    ? $t`script.installed_text`
    : $t`script.install_text`;
  const color = isInstalled ? 'success' : 'default';

  const onClick = (e: React.MouseEvent) => {
    showSnack($t`script.reload`);
    if (item.leaves?.some($.codeblock.verify)) {
      $.script.toggle(item.ky);
      setIsInstalled(!isInstalled);
    }
    e.stopPropagation();
  };

  return !item.leaves?.some((leaf: any) => leaf?.mode === 'javascript') ||
    !$.traits.match(`under(ky:${APP_SCRIPT_KY})`, item) ? null : (
    <Chip
      size="small"
      onClick={onClick}
      label={label}
      color={color}
      variant="outlined"
      sx={{ order: 10000 }}
    />
  );
}
