import { observer } from 'mobx-react'
import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { cls } from '../../styles'
import { editorHeadlessStyle } from '../ExtArea/ExtAreaComp'
import { APP_STAR_KY } from './Star'

const style = cls`
  .node-top[data-ky$='-stars'] {
    margin-top: -10px;
    opacity: 0.6;
    transition: 0.3s all;

    &:hover {
      opacity: 1;
    }

    > .node-body > .node-child > .node {
      > .node-btn {
        left: 0px;
      }
    }

    span[data-slate-string] {
      border-bottom: none !important;
      font-size: 14px !important;
    }

    .tool-item:not(.node-btn) {
      display: none;
    }
  }
`

export const StarEditorComp = observer(() => {
  const { editorView, star } = useAddons()
  const EditorComponent = editorView.createComponent()

  star.staredList // do nothing, just to trigger mobx

  // React.useLayoutEffect(() => {
  //   if (!isEmpty(star.staredList)) {
  //     appendStyle(
  //       `
  //         #EvergreenNote-stars {
  //           margin-top: 4px;
  //           border-top: 1px solid ${getColor(colorBase.slate, 300)};
  //         }
  //       `,
  //       'evergreen-stars-style'
  //     );
  //   }
  // }, [star.staredList]);

  return (
    <div className={[editorHeadlessStyle, style].join(' ')}>
      <EditorComponent
        ky={APP_STAR_KY}
        backlink={false}
        moreComponentVisible={false}
        readOnly
      />
    </div>
  )
})
