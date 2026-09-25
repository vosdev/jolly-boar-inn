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
