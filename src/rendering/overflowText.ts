const SCROLL_SPEED_PX_PER_SECOND = 30
const EDGE_PAUSE_MS = 1000
const OVERFLOW_TAG_SELECTOR = '.ji-overflow-tag'
const ISSUE_SUMMARY_SELECTOR = '.jira-issue-container .ji-overflow-tag.issue-summary'
const ISSUE_STATUS_SELECTOR = '.jira-issue-container .ji-overflow-tag.issue-status'

export interface OverflowAnimationMetrics {
    distancePx: number
    durationMs: number
    offsets: {
        startPauseEnd: number
        forwardEnd: number
        endPauseEnd: number
    }
}

const runningAnimations = new WeakMap<HTMLElement, Animation>()
const resizeObservers = new Map<HTMLElement, ResizeObserver>()
const scheduledElementRefreshes = new Map<HTMLElement, { ownerWindow: Window, frameId: number }>()
const scheduledRootRefreshes = new Map<Window, number>()

export function calculateOverflowAnimation(textWidth: number, viewportWidth: number): OverflowAnimationMetrics | null {
    const distancePx = Math.max(0, Math.ceil(textWidth - viewportWidth))
    if (distancePx === 0) {
        return null
    }

    const travelDurationMs = distancePx / SCROLL_SPEED_PX_PER_SECOND * 1000
    const durationMs = EDGE_PAUSE_MS * 2 + travelDurationMs * 2

    return {
        distancePx,
        durationMs,
        offsets: {
            startPauseEnd: EDGE_PAUSE_MS / durationMs,
            forwardEnd: (EDGE_PAUSE_MS + travelDurationMs) / durationMs,
            endPauseEnd: (EDGE_PAUSE_MS * 2 + travelDurationMs) / durationMs,
        },
    }
}

function stopOverflowAnimation(element: HTMLElement): void {
    const animation = runningAnimations.get(element)
    if (animation) {
        animation.cancel()
        runningAnimations.delete(element)
    }
    element.classList.remove('is-overflowing')
}

function prefersReducedMotion(element: HTMLElement): boolean {
    const ownerWindow = element.ownerDocument && element.ownerDocument.defaultView
    return !!ownerWindow && ownerWindow.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getOwnerWindow(root: ParentNode): Window | null {
    const rootDocument = (root as Document).defaultView !== undefined
        ? root as Document
        : (root as Node).ownerDocument
    return rootDocument && rootDocument.defaultView
}

function stopOverflowElementTracking(element: HTMLElement): void {
    const scheduledRefresh = scheduledElementRefreshes.get(element)
    if (scheduledRefresh) {
        scheduledRefresh.ownerWindow.cancelAnimationFrame(scheduledRefresh.frameId)
        scheduledElementRefreshes.delete(element)
    }

    const resizeObserver = resizeObservers.get(element)
    if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObservers.delete(element)
    }

    stopOverflowAnimation(element)
}

function scheduleElementRefresh(element: HTMLElement): void {
    const ownerWindow = element.ownerDocument && element.ownerDocument.defaultView
    if (!ownerWindow) {
        refreshOverflowElement(element)
        return
    }

    const scheduledRefresh = scheduledElementRefreshes.get(element)
    if (scheduledRefresh) {
        scheduledRefresh.ownerWindow.cancelAnimationFrame(scheduledRefresh.frameId)
    }

    const frameId = ownerWindow.requestAnimationFrame(() => {
        scheduledElementRefreshes.delete(element)
        refreshOverflowElement(element)
    })
    scheduledElementRefreshes.set(element, { ownerWindow, frameId })
}

function observeOverflowElement(element: HTMLElement): void {
    if (resizeObservers.has(element)) {
        return
    }

    const viewport = element.querySelector<HTMLElement>('.ji-overflow-viewport')
    const ownerWindow = element.ownerDocument && element.ownerDocument.defaultView
    if (!viewport || !ownerWindow || typeof ownerWindow.ResizeObserver !== 'function') {
        return
    }

    const resizeObserver = new ownerWindow.ResizeObserver(() => {
        if (element.isConnected === false) {
            stopOverflowElementTracking(element)
            return
        }
        scheduleElementRefresh(element)
    })
    resizeObservers.set(element, resizeObserver)
    resizeObserver.observe(viewport)
}

function stopTrackingDisconnectedElements(): void {
    Array.from(resizeObservers.keys()).forEach(element => {
        if (element.isConnected === false) {
            stopOverflowElementTracking(element)
        }
    })
}

export function refreshOverflowElement(element: HTMLElement): void {
    const viewport = element.querySelector<HTMLElement>('.ji-overflow-viewport')
    const text = element.querySelector<HTMLElement>('.ji-overflow-text')
    if (!viewport || !text) {
        return
    }

    stopOverflowAnimation(element)
    const metrics = calculateOverflowAnimation(text.scrollWidth, viewport.clientWidth)
    if (!metrics) {
        return
    }

    element.classList.add('is-overflowing')
    if (prefersReducedMotion(element) || typeof text.animate !== 'function') {
        return
    }

    const translatedPosition = `translateX(-${metrics.distancePx}px)`
    const animation = text.animate([
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: metrics.offsets.startPauseEnd },
        { transform: translatedPosition, offset: metrics.offsets.forwardEnd },
        { transform: translatedPosition, offset: metrics.offsets.endPauseEnd },
        { transform: 'translateX(0)', offset: 1 },
    ], {
        duration: metrics.durationMs,
        easing: 'linear',
        iterations: Infinity,
    })
    runningAnimations.set(element, animation)
}

export function scheduleOverflowElementRefresh(element: HTMLElement): void {
    const refresh = () => {
        observeOverflowElement(element)
        scheduleElementRefresh(element)
    }

    if (typeof element.onNodeInserted === 'function') {
        element.onNodeInserted(refresh, true)
    } else {
        refresh()
    }
}

export function refreshAllOverflowElements(root: ParentNode = document): void {
    stopTrackingDisconnectedElements()
    root.querySelectorAll<HTMLElement>(OVERFLOW_TAG_SELECTOR).forEach(element => {
        observeOverflowElement(element)
        refreshOverflowElement(element)
    })
}

export function scheduleAllOverflowElementsRefresh(root: ParentNode = document): void {
    const ownerWindow = getOwnerWindow(root)
    if (!ownerWindow) {
        refreshAllOverflowElements(root)
        return
    }

    const scheduledRefresh = scheduledRootRefreshes.get(ownerWindow)
    if (scheduledRefresh !== undefined) {
        ownerWindow.cancelAnimationFrame(scheduledRefresh)
    }
    const frameId = ownerWindow.requestAnimationFrame(() => {
        scheduledRootRefreshes.delete(ownerWindow)
        refreshAllOverflowElements(root)
    })
    scheduledRootRefreshes.set(ownerWindow, frameId)
}

export function applyOverflowWidths(root: ParentNode, summaryWidthRem: number, statusWidthRem: number): void {
    root.querySelectorAll<HTMLElement>(ISSUE_SUMMARY_SELECTOR).forEach(element => {
        element.style.maxWidth = `${summaryWidthRem}rem`
    })
    root.querySelectorAll<HTMLElement>(ISSUE_STATUS_SELECTOR).forEach(element => {
        element.style.maxWidth = `${statusWidthRem}rem`
    })
    scheduleAllOverflowElementsRefresh(root)
}

export function stopAllOverflowElements(root: ParentNode = document): void {
    scheduledRootRefreshes.forEach((frameId, ownerWindow) => ownerWindow.cancelAnimationFrame(frameId))
    scheduledRootRefreshes.clear()
    Array.from(scheduledElementRefreshes.keys()).forEach(stopOverflowElementTracking)
    Array.from(resizeObservers.keys()).forEach(stopOverflowElementTracking)
    root.querySelectorAll<HTMLElement>(OVERFLOW_TAG_SELECTOR).forEach(stopOverflowAnimation)
}
