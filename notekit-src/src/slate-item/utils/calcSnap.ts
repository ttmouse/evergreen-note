/* eslint-disable @typescript-eslint/no-use-before-define */

/*
The code below is used to calculate the position of the floating box when it needs to to snap to the target box.
According to target box, the floating box can be placed in 9 different positions, which are shown below:
- For the x axis: left-out, left-in, left-in-viewport, center, right-in-viewport, right-in, right-out
- For the y axis: top-out, top-in, top-in-viewport, middle, bottom-in-viewport, bottom-in, bottom-out
In the above keywords about the position,
the word "out" means that the floating box is placed outside the target box,
and the word "in" means that the floating box is placed inside the target box.
*/

export type BoxSize = {
  width: number
  height: number
  [k: string]: unknown
}

export type Coordinate = {
  left: number
  height: number
}

export type Placement = [XPlace, YPlace]

export type BoxInfo = {
  left: number
  top: number
  width: number
  height: number
}
export type XPlace =
  | 'center'
  | 'left-in'
  | 'left-in-viewport'
  | 'right-in'
  | 'right-in-viewport'
  | 'left-out'
  | 'right-out'
export type YPlace =
  | 'top-in'
  | 'bottom-in'
  | 'top-in-viewport'
  | 'bottom-in-viewport'
  | 'middle'
  | 'top-out'
  | 'bottom-out'

export type SnapCalcOptions = {
  /**
   * 备选方案
   * 假如首选方案不适合时，依次计算备选方案
   */
  alt?: Placement[]
  onComplete?: (box: BoxInfo) => void
}

export function getBoxInfo(rect: DOMRect | BoxInfo): BoxInfo {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

export function getRect(el: HTMLElement): BoxInfo {
  return getBoxInfo(el.getBoundingClientRect())
}

export function calcSnap(
  floatBox: BoxSize,
  targetBox: BoxInfo,
  at: Placement,
  opts: SnapCalcOptions = {} as any,
  reCalc = 0
): BoxInfo {
  const float = {
    left: 0,
    top: 0,
    ...floatBox,
  }

  targetBox = getBoxInfo(targetBox)

  const getAlt = (place: Placement) => {
    return opts.alt?.pop() ?? place
  }

  const h = float.height - window.innerHeight
  if (h > 0) {
    float.height -= h
  }
  const w = float.width - window.innerWidth
  if (w > 0) {
    float.width -= w
  }

  const [x, y] = at

  if (reCalc < 10) {
    if (x === 'right-out') {
      float.left = targetBox.left + targetBox.width
      if (float.left + float.width > window.innerWidth) {
        return calcSnap(
          float,
          targetBox,
          getAlt(['left-out', y]),
          opts,
          reCalc + 1
        )
      }
    } else if (x === 'right-in') {
      float.left = targetBox.left + targetBox.width - float.width

      const toNewLeft = targetBox.left + targetBox.width
      const ifRight = toNewLeft + float.width
      if (float.left < 0 && ifRight < window.innerWidth) {
        targetBox.left = toNewLeft
        return calcSnap(
          float,
          targetBox,
          getAlt(['left-in', y]),
          opts,
          reCalc + 1
        )
      }
    } else if (x === 'left-out') {
      float.left = targetBox.left - float.width
      if (float.left < 0) {
        return calcSnap(
          float,
          targetBox,
          getAlt(['right-out', y]),
          opts,
          reCalc + 1
        )
      }
    } else if (x === 'left-in') {
      float.left = targetBox.left

      const toNewLeft = targetBox.left + targetBox.width
      const ifRight = toNewLeft + float.width
      if (float.left < 0 && ifRight < window.innerWidth) {
        targetBox.left = toNewLeft
        return calcSnap(
          float,
          targetBox,
          getAlt(['right-in', y]),
          opts,
          reCalc + 1
        )
      }
    } else if (x === 'center') {
      float.left = targetBox.left + targetBox.width / 2 - float.width / 2
      const l = float.left + float.width - window.innerWidth
      if (l > 0) {
        float.left -= l
      } else if (float.left < 0) {
        float.left = 0
      }
    } else if (x === 'left-in-viewport') {
      if (float.left < 0) {
        float.left = 0
        if (float.left + float.width > window.innerWidth) {
          float.width = window.innerWidth - float.left
        }
      }
    } else if (x === 'right-in-viewport') {
      if (float.left + float.width > window.innerWidth) {
        float.left = window.innerWidth - float.width
        if (float.left < 0) {
          float.width = window.innerWidth
          float.left = 0
        }
      }
    }

    if (y === 'bottom-out') {
      float.top = targetBox.top + targetBox.height

      if (float.top + float.height > window.innerHeight) {
        return calcSnap(
          float,
          targetBox,
          getAlt([x, 'top-out']),
          opts,
          reCalc + 1
        )
      }
    } else if (y === 'bottom-in') {
      float.top = targetBox.top + targetBox.height - float.height

      if (float.top < 0) {
        return calcSnap(
          float,
          targetBox,
          getAlt([x, 'top-in']),
          opts,
          reCalc + 1
        )
      }
    } else if (y === 'top-out') {
      float.top = targetBox.top - float.height

      if (float.top < 0) {
        return calcSnap(
          float,
          targetBox,
          getAlt([x, 'bottom-in']),
          opts,
          reCalc + 1
        )
      }
    } else if (y === 'top-in') {
      float.top = targetBox.top

      if (float.top + float.height > window.innerHeight) {
        return calcSnap(
          float,
          targetBox,
          getAlt([x, 'bottom-in']),
          opts,
          reCalc + 1
        )
      }
    } else if (y === 'middle') {
      float.top = targetBox.top + targetBox.height / 2 - float.height / 2
      const t = float.top + float.height - window.innerHeight
      if (t > 0) {
        float.top -= t
      } else if (float.top < 0) {
        float.top = 0
      }
    } else if (y === 'bottom-in-viewport') {
      if (float.top + float.height > window.innerHeight) {
        float.top = window.innerHeight - float.height
      }
    }
  }

  return fixBox(float as BoxInfo)
}

export function fixBox(float: BoxInfo) {
  // 最后修正 X
  if (float.left < 0) {
    float.left = 0
  } else if (float.left + float.width > window.innerWidth) {
    float.left = window.innerWidth - float.width
  }
  // 最后修正 Y
  if (float.top < 0) {
    float.top = 0
  } else if (float.top + float.height > window.innerHeight) {
    float.top = window.innerHeight - float.height
  }
  // 最后修正 width
  if (float.left + float.width > window.innerWidth) {
    float.width = window.innerWidth - float.left
  }
  // 最后修正 height
  if (float.top + float.height > window.innerHeight) {
    float.height = window.innerHeight - float.top
  }
  return float
}

export function getPosition(element: HTMLElement | string): BoxInfo {
  if (typeof element === 'string') {
    element = document.querySelector(element) as HTMLElement
  }
  return element.getBoundingClientRect() as BoxInfo
}
