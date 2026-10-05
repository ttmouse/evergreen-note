import React from 'react';
import { Icon } from '../../../components/MaterialIcon';
import { icons } from '../../../components/SvgIcon';
import { ElementComponentProps } from '../EditorView/EditorView';
import { useAddons } from '../../hooks/useAddons';
import { colorCollection } from '../../styles';
import { useEditor } from '../../hooks/useEditor';
import { useItem } from '../../hooks/useItem';
import { ItemTransforms } from '../../transforms/item';
import { ItemWithWhiteboardNode } from '../LayoutFactory/Whiteboard/Whiteboard';

function ColorLabel(props: { color: string; depth: number }) {
  const { color, depth } = props;
  return (
    <span
      style={{
        backgroundColor: `var(--cl-${color}-${depth})`,
        minWidth: 24,
        minHeight: 24,
        display: 'inline-block',
        borderRadius: '100%'
      }}
    />
  )
}

function isWhiteboardItem(item: UnitPersist) {
  return !!(item as any).whiteboard?.node;
}

export function ColorBtn(props: ElementComponentProps<any>) {
  const $ = useAddons();
  const editor = useEditor();
  const item = useItem();

  if (!isWhiteboardItem(item)) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    const options = {} as any;
    for (const c of $.background.colors) {
      options[c] = <ColorLabel color={c} depth={$.background.colorDepth} />
    }

    const handler = $.form.popup({
      width: 230,
      SnapProps: {
        place: ['center', 'bottom-out'],
        targetBox: e.currentTarget as any,
      },
      initialValues: {
        color: item.background?.color,
      },
      subitems: {
        color: {
          type: 'toggleButton',
          shape: 'round',
          border: false,
          size: 'small',
          options,
        },
      },
      onChange(values) {
        ItemTransforms.setItems(editor, {
          at: item.GetSlPath(),
          props: {
            background: {
              color: values.color
            },
          },
        });
        handler.close();
      }
    });
  }

  return (
    <div onClick={handleClick} className="tool-item color-btn">
      <Icon name={icons.svg_theme} size={12} />
    </div>
  )
}