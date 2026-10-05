import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { atom, cls, colorBase, getColor, preset } from '../../../styles'
import svg_h1 from '../../../svgs/h1.svg?raw'
import svg_h2 from '../../../svgs/h2.svg?raw'
import svg_h3 from '../../../svgs/h3.svg?raw'
import svg_h4 from '../../../svgs/h4.svg?raw'
import svg_h5 from '../../../svgs/h5.svg?raw'
import svg_h6 from '../../../svgs/h6.svg?raw'

const mdStyle = cls`
  /* 如果 Markdown 视图是位于其他视图中，则应给它应一个最大宽度限制 */
  .node[layout] .node-layout-markdown {
    max-width: 700px;
  }

  .node-layout-markdown {

    &.node-top .node-layout-markdown-1 {
      margin-left: -24px;
    }

    .h1, .h2, .h3, .h4, .h5, .h6 {
      &:not(:first-child) {
        margin-top: 16px;
      }

      > .node-tools .node-btn {
        border-radius: 4px;
        opacity: 1;

        svg {
          display: none;
        }
      }
    }

    .h1 {
      > .node-tools .node-btn {
        ${atom.bgsvg({
          svg: svg_h1,
          color: getColor(colorBase.grey, 300),
        })};
      }
    }

    .h2 {
      > .node-tools .node-btn {
        ${atom.bgsvg({
          svg: svg_h2,
          color: getColor(colorBase.grey, 300),
        })};
      }
    }

    .h3 {
      > .node-tools .node-btn {
        ${atom.bgsvg({
          svg: svg_h3,
          color: getColor(colorBase.grey, 300),
        })};
      }
    }

    .h4 {
      > .node-tools .node-btn {
        ${atom.bgsvg({
          svg: svg_h4,
          color: getColor(colorBase.grey, 300),
        })};
      }
    }

    .h5 {
      > .node-tools .node-btn {
        ${atom.bgsvg({
          svg: svg_h5,
          color: getColor(colorBase.grey, 300),
        })};
      }
    }

    .h6 {
      > .node-tools .node-btn {
        ${atom.bgsvg({
          svg: svg_h6,
          color: getColor(colorBase.grey, 300),
        })};
      }
    }
  }

  .node-layout-markdown-1 {
    > .node-tools .node-btn {
      opacity: 0;
      transform: scale(0.8);

      &:hover {
        opacity: 1;
        transition: 0.3s all;
        transform: scale(1);
      }
    }

    > .node-body {
      border-left: none;
    }
  }
`

export function createLayoutMarkdownAddon({ app, $ }: NewAddonParams) {
  class LayoutMarkdown implements IAddon {
    app!: App
    config = {}

    addSlashItems() {
      const { slashMenu } = this.app.addons
      slashMenu?.addItems({
        slashMarkdown: {
          icon: 'svg_markdown',
          title: 'Markdown',
          order: slashMenu.order.layout,
          versions: {
            en: { v: 'as markdown' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, '')
            $.layoutFactory.applies('markdown', editor)
          },
        },
      })
    }

    addonRun() {
      // Initialization for this LayoutMarkdown
      this.addSlashItems()
      document.body.classList.add(mdStyle)

      $.layoutFactory?.registerLayouts({
        markdown: {
          icon: 'svg_markdown',
          title: 'Markdown',
          order: 400,
        },
      })
    }
  }

  return { layoutMarkdown: new LayoutMarkdown() }
}
