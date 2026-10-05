export type PressedKey = 'shift' | 'ctrl' | 'alt' | 'meta' | 'mod'

export const keyState = {
  pressed: {
    shift: false,
    ctrl: false,
    alt: false,
    meta: false,
  } as Record<PressedKey, boolean>,

  startListen() {
    const updateHandler = this.sync.bind(this)

    window.addEventListener('keydown', updateHandler)
    window.addEventListener('keyup', updateHandler)

    window.addEventListener('mousedown', updateHandler)

    window.addEventListener('blur', () => {
      setTimeout(() => {
        if (!(document.activeElement instanceof HTMLIFrameElement)) {
          this.resetAll()
        }
      }, 0)
    })

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.resetAll()
      }
    })
  },

  keyMap: {
    shift: 'Shift',
    ctrl: 'Control',
    alt: 'Alt',
    meta: 'Meta',
  },

  sync(event: KeyboardEvent | MouseEvent): void {
    const keys: Exclude<PressedKey, 'mod'>[] = ['shift', 'ctrl', 'alt', 'meta']

    keys.forEach((key) => {
      // 映射到浏览器原生的修饰键名称
      const modifierName = this.keyMap[key]
      const isDown = event.getModifierState(modifierName)

      this.pressed[key] = isDown
    })
  },

  handleKeyDown(event: KeyboardEvent): void {
    this.sync(event)
  },

  handleKeyUp(event: KeyboardEvent): void {
    this.sync(event)
  },

  isPressed(key: PressedKey): boolean {
    if (key === 'mod') {
      return this.pressed.ctrl || this.pressed.meta || false
    }
    return this.pressed[key] || false
  },

  hasPressed(): boolean {
    return Object.keys(this.pressed).some((key) =>
      this.isPressed(key as PressedKey)
    )
  },

  simulatePress(key: PressedKey, callback: () => void) {
    const k = key === 'mod' ? 'ctrl' : key
    const oldVal = this.pressed[k]
    this.pressed[k] = true
    try {
      return callback()
    } finally {
      this.pressed[k] = oldVal
    }
  },

  resetAll() {
    this.pressed.shift = false
    this.pressed.ctrl = false
    this.pressed.alt = false
    this.pressed.meta = false
  },
}
