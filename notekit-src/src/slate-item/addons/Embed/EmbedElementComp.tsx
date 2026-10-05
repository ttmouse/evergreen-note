import React from 'react'
import { ErrorMsg } from '../../components/ErrorMsg/ErrorMsg'
import { ContextPkyList } from '../../components/ItemView/ItemViewContexts'
import { useAddons } from '../../hooks/useAddons'
import { KyString } from '../../interfaces/unit'
import { cls, colorBase } from '../../styles'
import { ElementComponentProps } from '../EditorView/EditorView'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { ContextEditorEmbed, ContextEditorReference } from './EmbedContexts'
import { appendStyle } from '../../utils/dom/appendStyle'
import { EmbedElement } from './Embed'
import { isEmpty } from '../../utils/isEmpty'

appendStyle(`
  .node.node-with-embed {
    align-items: flex-start;
  }

  .node-foldup .embed-container {
    box-shadow: none;
  }

  .embed-container {
    overflow-x: scroll;
  }

  .node-foldup .element-embed .node-top .node-body {
    display: none;
  }
`)

const editorClass = cls`
  border-radius: 4px;
  padding: 4px;
  outline: 1px solid var(--cl-slate-200);
  box-shadow: 4px 4px 0px 0px var(--cl-slate-100);
  margin-bottom: 8px;
  margin-right: 4px;
  margin-top: 4px;
  transition: 0.3s all;

  label: embed-container;

  &:hover {
    outline: 1px solid var(--cl-slate-300);
    box-shadow: 6px 6px 0px 0px var(--cl-slate-200);
  }

  .node-top {
    > .node-body {
      margin-top: 0;
    }

    > .node-head {
      > .node-extra {
        float: right;
      }
    }
  }
`

export function EmbedEditorComp(props: { ky: KyString }) {
  const $ = useAddons()
  const { ky } = props
  const EditorComponent = $.editorView.createComponent()
  const ref = React.useRef<HTMLDivElement>(null)
  const embededItem = $.dbMemory.getItem(ky)

  if (isEmpty(embededItem)) {
    return (
      <ErrorMsg>
        The embeded item doesn't exist: {`{{embed src="${ky}"}}`}
      </ErrorMsg>
    )
  }

  return (
    <div
      ref={ref}
      className={[editorClass, 'node-foldable', 'embed-container'].join(' ')}
    >
      <ContextEditorReference.Provider value>
        <ContextEditorEmbed.Provider value={ky}>
          <EditorComponent ky={ky} fromRouter={false} />
        </ContextEditorEmbed.Provider>
      </ContextEditorReference.Provider>
    </div>
  )
}

export function EmbedElementComp(props: ElementComponentProps<EmbedElement>) {
  const { element } = props
  const refky = element.refky ?? element.value
  let inner = React.useMemo(() => <EmbedEditorComp ky={refky} />, [refky])
  const ctxPkyList = React.useContext(ContextPkyList)
  if (ctxPkyList.includes(refky)) {
    inner = (
      <ErrorMsg>
        Can not recursively embed: {`{{embed src="${refky}"}}`}
      </ErrorMsg>
    )
  }
  return <InlineOuterComp cssInlineBlock inner={inner} {...props} />
}
