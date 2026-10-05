import React from 'react';
import { useAddons } from '../../hooks/useAddons';
import { ContextEditorEmbed } from './EmbedContexts';
import { FeatureIcon } from '../../components/ItemView';
import { cls, preset } from '../../styles';
import { appendStyle } from '../../utils/dom/appendStyle';
import { useItem } from '../../hooks/useItem';
import { EleOuter, EleIcon } from '../../components/Ele';
import { Tip } from '../../components/Tip/Tip';
import { Icon } from '../../../components/MaterialIcon';
import { useEditor } from '@/slate-item/hooks/useEditor';

appendStyle(cls`
  .node.node-with-embed {
    .embed-zoomin-btn {
      opacity: 0;
      transition: 0.3s all;
      order: 1;
    }

    &:hover {
      .embed-zoomin-btn {
        opacity: 1;
      }
    }
  }
`);

export function EmbedZoominIcon() {
  const embedKy = React.useContext(ContextEditorEmbed);
  const cxtItem = useItem();
  const { router } = useAddons();
  return embedKy !== cxtItem.ky ? null : (
    <Tip title="Zoom in this item">
      <EleOuter
        onClick={(e: React.MouseEvent) => {
          router.to(`${embedKy}`, {}, e.target as HTMLElement);
        }}
        classOuter="embed-zoomin-btn"
      >
        <EleIcon classIcon={cls(preset.icon.basic)}>
          <Icon name="svg_zoomin" size={16} />
        </EleIcon>
      </EleOuter>
    </Tip>
  );
}
