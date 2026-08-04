let lockCount = 0
let previousOverflow = ''

export function lockBodyScroll() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
}

export function unlockBodyScroll() {
  if (lockCount <= 0) return
  lockCount -= 1
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow
  }
}

/** Garante que o scroll da página não fique preso após modais. */
export function resetBodyScroll() {
  lockCount = 0
  document.body.style.overflow = previousOverflow || ''
}
