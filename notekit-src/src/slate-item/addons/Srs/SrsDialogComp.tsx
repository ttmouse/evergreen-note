import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import Button from '@mui/material/Button'
import { EDITOR_INVOKER } from '../EditorView/EditorView'

import './srs.less'
import {
  ItemWithSrsCard,
  ItemWithSrsDeck,
  QUALITY,
  SrsDeckInfo,
  FlashCard,
} from './types'
import { getPubState, usePubState } from '../../hooks/usePubState'
import { isEmpty } from '../../utils/isEmpty'
import { calcDue } from './helper'
import { PUB_KEY_SRS } from './Srs'
import { Tip } from '../../components/Tip/Tip'
import { $t } from '../../../i18n'
import { Item } from '../../interfaces/item'
import { datekit } from '../../utils/date/datekit'
import { time } from '../../utils/date/time'
import { sleep } from '../../utils/sleep'
import { mkid } from '../../utils/string/mkid'

export enum REVIEW_MODE {
  QUESTION,
  ANSWER,
  BROWSE,
}

export type SrsDialogProps = {
  queue: ItemWithSrsCard[]
  mode?: REVIEW_MODE
  deck: SrsDeckInfo
  deckItem: ItemWithSrsDeck
}

export type SrsPubState = {
  index: number
  queue: ItemWithSrsCard[]
  mode: REVIEW_MODE
  restItems: ItemWithSrsCard[]
  deckItem: ItemWithSrsDeck
  counts: { [q in QUALITY]: number }
  startTime: number
}

export function SrsDialogComp(props: SrsDialogProps) {
  const { queue, mode = REVIEW_MODE.QUESTION, deckItem } = props
  const [info, setInfo] = usePubState<SrsPubState>(PUB_KEY_SRS, {
    index: 0,
    queue,
    mode,
    restItems: queue,
    deckItem,
    counts: {
      [QUALITY.UNKNOWN]: 0,
      [QUALITY.ONE]: 0,
      [QUALITY.TWO]: 0,
      [QUALITY.THREE]: 0,
      [QUALITY.FIVE]: 0,
    },
    startTime: time(),
  })
  const $ = useAddons()
  const EditorComp = $.editorView.createComponent()
  const [cardSstartTime, setCardStartTime] = React.useState(time())

  const btnsRef = React.useRef<HTMLDivElement>(null)

  // 按快捷键的时候，高亮对应的按钮
  const activeBtn = async (op: string) => {
    if (btnsRef.current) {
      const el = btnsRef.current.querySelector(`[data-op="${op}"]`)
      el?.classList.add('active')
      await sleep(150)
      el?.classList.remove('active')
    }
  }

  const setQuality = async (q: QUALITY) => {
    $.srs.saveAnswer(info.restItems[info.index], {
      st: cardSstartTime,
      quality: q,
    })

    await activeBtn(q.toString())

    setCardStartTime(time())

    const newInfo = {
      ...info,
      index: info.index + 1, // next item
      mode: REVIEW_MODE.QUESTION,
      counts: {
        ...info.counts,
        [q]: info.counts[q] + 1,
      },
    }
    if (q === QUALITY.ONE) {
      newInfo.restItems.push(info.restItems[info.index])
    }

    setInfo(newInfo)
  }

  const showAnswer = async () => {
    await activeBtn('show-answer')
    setInfo({ ...info, mode: REVIEW_MODE.ANSWER })
  }

  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (getPubState(PUB_KEY_SRS).mode === REVIEW_MODE.QUESTION) {
        showAnswer()
        return
      }

      // 答案模式之下，用户可以编辑笔记
      // 当编辑器处于聚焦状态时，不响应快捷键
      if (info.mode === REVIEW_MODE.ANSWER && window.getSelection()) {
        return
      }

      const key = (...keys: string[]) => keys.includes(e.key)

      if (key('1', 'j')) {
        setQuality(QUALITY.ONE)
      } else if (key('2', 'k')) {
        setQuality(QUALITY.TWO)
      } else if (key('3', 'l')) {
        setQuality(QUALITY.THREE)
      } else if (key('4', ';')) {
        setQuality(QUALITY.FIVE)
      } else if (key('`', '·', 'h')) {
        setInfo({ ...info, mode: REVIEW_MODE.QUESTION, index: info.index + 1 })
      }
    }
    document.addEventListener('keydown', fn)
    return () => {
      document.removeEventListener('keydown', fn)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.index])

  if (isEmpty(info.queue)) {
    return (
      <div className="srs-wrap">
        <div className="srs-no-items">{$t`srs.no_flashcards`}</div>
      </div>
    )
  }

  if (info.index >= info.restItems.length) {
    const log = () => {
      const duration = Math.ceil(
        datekit().diff(datekit(info.startTime), 'minute', true)
      )
      const ky = mkid()
      $.dbMemory.saveItem(
        Item.newItem({
          pky: $.daily.getTodayDate(),
          weight: time(),
          ky,
          leaves: [
            {
              // eslint-disable-next-line prettier/prettier
              text: `${datekit().format('HH:mm')} ${$t`srs.finished`} `,
            },
            $.refer.createElement({ ky: deckItem.ky }),
            // eslint-disable-next-line prettier/prettier
            { text:
                ` ${$t(`srs.reviewed`, { count: queue.length })}, ` +
                `${$t`srs.quality1`} ${info.counts[QUALITY.ONE]}, ` +
                `${$t`srs.quality2`} ${info.counts[QUALITY.TWO]}, ` +
                `${$t`srs.quality3`} ${info.counts[QUALITY.THREE]}, ` +
                `${$t`srs.quality5`} ${info.counts[QUALITY.FIVE]}, ` +
                `${$t(`srs.duration`, { duration })}`,
            },
          ],
        })
      )
      $.srs.closeReviewDialog()
      $.daily.route(undefined, { highlightItems: ky })
    }

    return (
      <div className="srs-wrap">
        <div className="srs-no-items">{$t`srs.no_more_flashcards`}</div>
        <div className="srs-browse-items">
          <Button size="small" onClick={log}>
            {$t`srs.generate_log`}
          </Button>{' '}
          {$t`srs.generate_log_text`}
        </div>
      </div>
    )
  }

  const item = $.dbMemory.getItem(info.restItems[info.index].ky, {
    isRecur: true,
  }) as ItemWithSrsCard

  const realDeckItem =
    deckItem.ky === $.srs.SRS_KY ? $.srs.getRealDeckItem(item) : deckItem

  const classList = ['srs-wrap']
  const clozeRules = realDeckItem?.srs?.deck?.cloze ?? ['subitems']
  if (info.mode === REVIEW_MODE.QUESTION) {
    classList.push(...clozeRules.map((rule) => `cloze-${rule}`))
  } else if (info.mode === REVIEW_MODE.ANSWER) {
    classList.push(...clozeRules.map((rule) => `cloze-${rule}-show`))
  }

  const card = item.srs?.card ?? $.srs.initCard()
  const due = (flashcard: FlashCard, q: QUALITY) => {
    const interval = calcDue(flashcard, q)
    if (interval < 1) {
      return `${Math.round(24 * interval)}${$t`srs.hours`}`
    }
    return `${interval}${$t`srs.days`}`
  }

  let buttons = <></>
  switch (info.mode) {
    case REVIEW_MODE.ANSWER:
      buttons = (
        <>
          <Tip title="Press 1 or J">
            <Button
              data-op={QUALITY.ONE}
              onClick={() => setQuality(QUALITY.ONE)}
            >
              {$t`srs.quality1`}
              <span className="interval">{$t`srs.soon`}</span>
            </Button>
          </Tip>
          <Tip title="Press 2 or K">
            <Button
              data-op={QUALITY.TWO}
              onClick={() => setQuality(QUALITY.TWO)}
            >
              {$t`srs.quality2`}
              <span className="interval">{due(card, QUALITY.TWO)}</span>
            </Button>
          </Tip>
          <Tip title="Press 3 or L">
            <Button
              data-op={QUALITY.THREE}
              onClick={() => setQuality(QUALITY.THREE)}
            >
              {$t`srs.quality3`}
              <span className="interval">{due(card, QUALITY.THREE)}</span>
            </Button>
          </Tip>
          <Tip title="Press 4 or ;">
            <Button
              data-op={QUALITY.FIVE}
              onClick={() => setQuality(QUALITY.FIVE)}
            >
              {$t`srs.quality5`}
              <span className="interval">{due(card, QUALITY.FIVE)}</span>
            </Button>
          </Tip>
        </>
      )
      break

    case REVIEW_MODE.QUESTION:
      buttons = (
        <Tip title="Press any key">
          <Button
            data-op="show-answer"
            onClick={showAnswer}
          >{$t`srs.show_answer`}</Button>
        </Tip>
      )
      break
  }

  return (
    <div className={classList.join(' ')}>
      <EditorComp
        fromRouter={false}
        readOnly={info.mode === REVIEW_MODE.QUESTION}
        preventSaving
        item={item}
        crumbsVisible
        invoker={EDITOR_INVOKER.OTHER}
        moreComponentVisible={false}
        autoFocus={false}
      />
      <div ref={btnsRef} className="btn-group">
        {buttons}
      </div>
    </div>
  )
}
