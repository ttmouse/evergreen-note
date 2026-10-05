import React from 'react';
import { useItem } from '../../../hooks/useItem';
import { useAddons } from '../../../hooks/useAddons';
import { FeatureIcon } from '../../../components/ItemView';

export type BlockStyleConfIconProps = {};

export function BlockStyleConfIcon(props: BlockStyleConfIconProps) {
  const item = useItem();
  const $ = useAddons();
  if (!$.style.isInstalled(item.ky)) {
    return null;
  }

  const onClick = (e: React.MouseEvent) => {
    $.blockStyleCondition.showForm({
      item,
      SnapProps: {
        targetBox: (e.target as HTMLElement).closest('.node-extra') as HTMLElement,
        place: ['right-in', 'bottom-out'],
      },
    });
  };

  return <FeatureIcon order={4000} icon="svg_settings" onClick={onClick} />;
}
