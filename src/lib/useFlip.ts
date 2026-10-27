import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Anime le déplacement des enfants [data-flip-id] d'un conteneur quand leur ordre change
 * (technique FLIP : on mesure avant/après et on anime l'écart).
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, orderKey: string) {
  const positions = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const next = new Map<string, number>()
    container.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      const id = el.dataset.flipId!
      const top = el.getBoundingClientRect().top
      next.set(id, top)
      const prev = positions.current.get(id)
      if (!reduced && prev !== undefined && prev !== top) {
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }], {
          duration: 280,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        })
      }
    })
    positions.current = next
  }, [containerRef, orderKey])
}
