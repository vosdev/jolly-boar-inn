/**
 * For the component tests: jsdom has no Web Animations, and Svelte's transitions and
 * `animate:` need one that finishes. Call in a `beforeEach`; it returns the undo.
 */
export function stubAnimations(): () => void {
  const animate = Element.prototype.animate
  Element.prototype.animate = function (
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ): Animation {
    const duration = typeof options === 'number' ? options : Number(options?.duration ?? 0)
    const running = { onfinish: null as (() => void) | null, cancel() {}, currentTime: 0 }
    setTimeout(() => running.onfinish?.(), duration)
    return running as unknown as Animation
  }
  return () => {
    Element.prototype.animate = animate
  }
}
