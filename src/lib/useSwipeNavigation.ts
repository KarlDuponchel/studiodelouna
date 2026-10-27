import { useEffect, useRef, type RefObject } from 'react'

type Options = {
  onPrev: () => void
  onNext: () => void
  /** true pendant un déplacement de RDV : le swipe ne doit pas s'en mêler */
  isBlocked: () => boolean
  /** Élément à faire glisser sous le doigt (recherché dans le conteneur) */
  targetSelector: string
}

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Attend la fin d'une animation, avec un délai de secours si elle ne se termine pas (onglet en arrière-plan…) */
function settle(anim: Animation, ms: number) {
  return Promise.race([anim.finished.catch(() => undefined), new Promise((r) => setTimeout(r, ms + 80))])
}

/**
 * Swipe horizontal pour changer de période, avec la page qui suit le doigt.
 * Le défilement vertical reste natif : on ne prend la main que si le geste
 * est nettement horizontal.
 */
export function useSwipeNavigation(containerRef: RefObject<HTMLElement | null>, options: Options) {
  const opts = useRef(options)
  opts.current = options

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let startX = 0, startY = 0, startT = 0, dx = 0
    let axis: 'x' | 'y' | null = null
    let tracking = false
    let animating = false

    const target = () => el.querySelector<HTMLElement>(opts.current.targetSelector)
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || animating || opts.current.isBlocked()) return
      tracking = true
      axis = null
      dx = 0
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      startT = performance.now()
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      if (opts.current.isBlocked()) {
        tracking = false
        const t = target()
        if (t) t.style.transform = ''
        return
      }
      const x = e.touches[0].clientX - startX
      const y = e.touches[0].clientY - startY
      if (axis === null && (Math.abs(x) > 10 || Math.abs(y) > 10)) {
        axis = Math.abs(x) > Math.abs(y) * 1.2 ? 'x' : 'y'
      }
      if (axis !== 'x') return
      e.preventDefault()
      dx = x
      const t = target()
      if (t && !reduced()) {
        t.style.transition = 'none'
        t.style.transform = `translateX(${dx * 0.6}px)`
        t.style.opacity = String(1 - Math.min(Math.abs(dx) / 700, 0.4))
      }
    }

    const onEnd = async () => {
      if (!tracking) return
      tracking = false
      if (axis !== 'x') return

      const velocity = Math.abs(dx) / (performance.now() - startT)
      const go = Math.abs(dx) > 70 || (Math.abs(dx) > 25 && velocity > 0.45)
      const t = target()

      if (!go) {
        if (t) {
          t.style.transition = `transform 250ms ${EASE}, opacity 250ms ${EASE}`
          t.style.transform = ''
          t.style.opacity = ''
        }
        return
      }

      const dir = dx < 0 ? 1 : -1 // doigt vers la gauche = période suivante
      if (!t || reduced()) {
        if (t) Object.assign(t.style, { transform: '', opacity: '', transition: '' })
        if (dir > 0) opts.current.onNext()
        else opts.current.onPrev()
        return
      }

      animating = true
      try {
        // Sortie dans le sens du geste, puis entrée depuis le côté opposé
        await settle(t.animate(
          [{ transform: t.style.transform, opacity: t.style.opacity || '1' }, { transform: `translateX(${-dir * 35}%)`, opacity: 0 }],
          { duration: 140, easing: 'ease-in', fill: 'forwards' },
        ), 140)
        if (dir > 0) opts.current.onNext()
        else opts.current.onPrev()
        Object.assign(t.style, { transform: '', opacity: '', transition: '' })
        t.getAnimations().forEach((a) => a.cancel())
        const fresh = target() ?? t
        await settle(fresh.animate(
          [{ transform: `translateX(${dir * 35}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: 300, easing: EASE },
        ), 300)
      } finally {
        animating = false
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    // passive: false pour pouvoir bloquer le défilement pendant un swipe horizontal
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [containerRef])
}
