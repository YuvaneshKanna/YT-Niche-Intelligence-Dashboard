import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Turns vertical wheel input into horizontal scrolling on an element.
 *
 * Returns a **callback ref**, deliberately. The previous implementation used a
 * plain ref with `[ref.current]` as the effect dependency, which does not work:
 * deps are read during render, but refs are only assigned during commit, so on
 * the render that first creates the element the dep is still null and the
 * effect never re-runs to attach the listener. That happened to go unnoticed
 * while six sibling cards were each fetching and re-rendering the tree, and
 * broke the moment the section was replaced by one that renders once.
 *
 * A callback ref fires exactly when the node attaches or detaches, so the
 * listener is bound at the right moment regardless of render count.
 *
 * The listener must be non-passive: `preventDefault` is what stops the page
 * scrolling vertically at the same time, and React's own `onWheel` is
 * registered passively at the root, so it cannot do this.
 */
export function useHorizontalWheel<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  const nodeRef = useRef<T | null>(null)

  const ref = useCallback((el: T | null) => {
    nodeRef.current = el
    setNode(el)
  }, [])

  useEffect(() => {
    if (!node) return

    const onWheel = (e: WheelEvent) => {
      // A trackpad's horizontal gesture already scrolls this axis; only
      // translate the vertical component, and leave the event alone when there
      // is nothing to scroll so the page still moves.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (node.scrollWidth <= node.clientWidth) return
      e.preventDefault()
      node.scrollLeft += e.deltaY * 2
    }

    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [node])

  return { ref, node: nodeRef }
}
