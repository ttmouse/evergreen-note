import React from 'react';
import { ElementComponentProps } from '../EditorView/EditorView';
import { InlineOuterComp } from '../Inlines/InlineOuterComp';
import { appendStyle } from '../../utils/dom/appendStyle';
import { colorBase, getColor } from '../../styles/theme';
import { cls } from '../../styles';
import { byteAuto } from './helper';
import { AttachmentElement } from './Attachment';
import { useAddons } from '@/slate-item/hooks/useAddons';
import { useItem } from '@/slate-item/hooks/useItem';
import { DEBUG_MODE } from '@/main';

appendStyle(cls`
  .node.node-with-attachment {
    align-items: flex-start;
  }
  .element-attachment > [data-slate-node="text"] {
    display: none !important;
  }

  .attachment {
    display: flex;
    border: 1px solid ${getColor(colorBase.slate, 200)};
    border-radius: 4px;
    padding: 4px;
    cursor: pointer;
    transition: 0.3s all;

    > * {
      margin-right: 4px;
    }

    &:hover {
      border-color: ${getColor(colorBase.slate, 300)};

      .attachment-filename {
        color: ${getColor(colorBase.warning, 500)};
      }
    }
  }
  .attachment-type-icon {
    width: 20px;
  }
  .attachment-filename {
    color: ${getColor(colorBase.primary, 500)};
  }
  .attachment-filesize {
    font-size: 12px;
    color: ${getColor(colorBase.slate, 400)};
  }
`);

export function AttachmentComp(
  props: ElementComponentProps<AttachmentElement>
) {
  const { element: fileinfo } = props;
  const $ = useAddons();
  const item = useItem();
  const thePath = fileinfo.path.replace(/^https?:/i, '');

  const inner = (
    <div className="attachment" onClick={() => $.attachment.open(thePath, item)} onContextMenu={() => window.open(thePath, '_blank')}>
      <span>
        <img
          className="attachment-type-icon"
          alt={fileinfo.name}
          src={`/static/assets/images/filetype/${fileinfo.ext}.png`}
          onError={(e) => {
            if (DEBUG_MODE) return;
            e.currentTarget.src = '/static/assets/images/filetype/unknown.png';
          }}
        />
      </span>
      <span className="attachment-filename">{fileinfo.name}</span>
      <span className="attachment-filesize">{byteAuto(fileinfo.size)}</span>
    </div>
  );
  return <InlineOuterComp cssInlineBlock inner={inner} {...props} />;
}
