import { afterAll } from 'vitest'

import { dropHandedOn } from './lib/keptMap'

/**
 * jsdom has `<dialog>` and its `open` attribute but not `showModal` or `close`, so the
 * in-page dialogs get the part of them a test can see: open while shown, gone after.
 */

if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement): void {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement): void {
    this.open = false
  }
}

/** jsdom lays nothing out, so there is never a size to observe; `bind:clientWidth` needs the class. */
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

/** jsdom has no `matchMedia`; a test is a mouse on a desktop unless it says otherwise. */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

/**
 * A map a test file's last unmount hands on is removed by a timer, which can fire after jsdom
 * has torn `window` down and make Leaflet throw; removing it while the file's window is up avoids that.
 */
afterAll(dropHandedOn)
