import React from 'react';
import { IAddon, App, NewAddonParams } from '../../engine/App';
import { ItemNode } from '../../interfaces/item';
import { cover } from '../../engine/helper';
import { ElementComponentProps } from '../EditorView/EditorView';
import { isEmpty } from '../../utils/isEmpty';
import { ColorBtn } from './ColorBtn';

export type ItemWithBackground = ItemNode & {
  background: {
    color?: string;
  };
};

export function createBackgroundAddon({ app, $ }: NewAddonParams) {
  class Background implements IAddon {
    app!: App;
    config = {};

    colors = [
      'red',
      'gold',
      'green',
      'cyan',
      'blue',
      'purple',
      'magenta',
      'slate',
    ];

    colorDepth = 200;

    addonRun() {
      const WithBackground = (props: ElementComponentProps<any>) => {
        const { element, children } = props
        const { background } = element as ItemWithBackground
        const { color } = background || {}
        const previousColor = React.useRef<string | undefined>()

        React.useEffect(() => {
          // Most Slate elements have no background. Only colored items (or
          // items whose previous color must be removed) need a DOM lookup.
          const hadColor = typeof previousColor.current === 'string'
          previousColor.current = color
          if (typeof color !== 'string' && !hadColor) return
          // ItemOuter renders each editor instance with element.$id as its DOM
          // id. The persistent ky can be shared by several open views.
          const el = element.$id ? document.getElementById(element.$id) : null
          if (typeof color === 'string' && el) {
            Object.assign((el as HTMLElement).style, {
              backgroundColor: `var(--cl-${color}-${$.background.colorDepth})`,
              outlineColor: 'transparent',
            })
          } else if (el) {
            ;((el as HTMLElement).style as any).backgroundColor = ''
          }
        }, [color, element.$id])

        return <>{children}</>
      }

      const { renderElement } = $.editorView
      cover(renderElement, (props) => {
        return (
          <WithBackground {...props}>
            {renderElement.call($.editorView, props)}
          </WithBackground>
        )
      })

      $.itemToolbar.addItems({ ColorBtn });
    }
  }

  return { background: new Background() };
}
