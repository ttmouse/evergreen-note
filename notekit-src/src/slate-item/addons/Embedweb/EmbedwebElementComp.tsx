import React from 'react'
import { ElementComponentProps } from '../EditorView/EditorView'
import { SrcElement } from './Embedweb'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { IframeComp } from './IframeComp'
import { appendStyle } from '../../utils/dom/appendStyle'
import { cls, colorBase } from '../../styles'
import { AudioComp } from './AudioComp'
import { getUrlParams } from '../../utils/string/url'
import { isEmpty } from '../../utils/isEmpty'

appendStyle(`
  .node.node-with-embedweb {
    align-items: flex-start;
  }
`)

const iframeWrapperStyle = [cls``]

export function EmbedwebElementComp(props: ElementComponentProps<SrcElement>) {
  const { element } = props
  const { value, width = '100%', height } = element
  let url = value

  let h = height
  if (!height) {
    if (url?.includes('music.163.com')) {
      h = 120
    } else {
      h = 500
    }
  }

  if (/bilibili\.com\/video\/[a-z0-9-_=]+\/?/i.test(url)) {
    // 将B站的网址转换为视频嵌入网址

    const match = /\/video\/([a-z0-9-_=]+)/i.exec(url)!
    const info = getUrlParams(url)
    let page = 1
    if (!isEmpty(info) && !isEmpty(info.page)) {
      page = Number(info.page)
    }
    url = `//player.bilibili.com/player.html?bvid=${match[1]}&page=${page}&autoplay=false`
  } else if (/youku\.com\/v_show\/id_[a-z0-9-_=]+\.html/i.test(url)) {
    // 将优酷的网址转换为视频嵌入网址
    const match = /youku\.com\/v_show\/id_([a-z0-9-_=]+)\.html/i.exec(url)!
    url = `//player.youku.com/embed/${match[1]}`
  } else if (/youtube.com\/watch\?v=([a-z0-9-_=]+)/i.test(url)) {
    // 将YouTube的网址转换为视频嵌入网址
    const match = /youtube.com\/watch\?v=([a-z0-9-_=]+)/i.exec(url)!
    url = `//www.youtube.com/embed/${match[1]}`
  }

  const inner = React.useMemo(() => {
    if (isEmpty(value)) {
      return <></>
    }
    if (
      /mp3|wma|avi|rm|rmvb|flv|mpg|mov|mkv/.test(value.replace(/(\?|#).+/, ''))
    ) {
      return <AudioComp value={url} />
    }

    return (
      <div className={iframeWrapperStyle.join(' ')}>
        <IframeComp value={url} width={width} height={h} />
      </div>
    )
  }, [value, url, width, h])

  return <InlineOuterComp inner={inner} cssInlineBlock {...props} />
}
