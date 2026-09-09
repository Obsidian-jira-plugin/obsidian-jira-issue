import {
    applyOverflowWidths,
    calculateOverflowAnimation,
    scheduleOverflowElementRefresh,
    stopAllOverflowElements,
} from '../src/rendering/overflowText'

describe('OverflowText', () => {
    afterEach(() => {
        // The cleanup interval is module-level singleton state (one interval for the whole
        // plugin, not per window) - reset it between tests regardless of what each test did.
        stopAllOverflowElements({ querySelectorAll: (): HTMLElement[] => [] } as unknown as ParentNode)
        delete (global as any).window
    })

    test('does not animate text that fits in the viewport', () => {
        expect(calculateOverflowAnimation(200, 200)).toBeNull()
        expect(calculateOverflowAnimation(150, 200)).toBeNull()
    })

    test('calculates a 30 pixels per second round trip with one second pauses', () => {
        const metrics = calculateOverflowAnimation(260, 200)

        expect(metrics).not.toBeNull()
        expect(metrics.distancePx).toEqual(60)
        expect(metrics.durationMs).toEqual(6000)
        expect(metrics.offsets.startPauseEnd).toBeCloseTo(1 / 6)
        expect(metrics.offsets.forwardEnd).toBeCloseTo(1 / 2)
        expect(metrics.offsets.endPauseEnd).toBeCloseTo(2 / 3)
    })

    test('rounds fractional overflow up to avoid hiding the last pixel', () => {
        expect(calculateOverflowAnimation(200.1, 200).distancePx).toEqual(1)
    })

    test('only applies configured widths to Jira issue tags', () => {
        const summary = { style: {} } as HTMLElement
        const status = { style: {} } as HTMLElement
        const querySelectorAll = jest.fn((selector: string) => {
            if (selector === '.jira-issue-container .ji-overflow-tag.issue-summary') {
                return [summary]
            }
            if (selector === '.jira-issue-container .ji-overflow-tag.issue-status') {
                return [status]
            }
            return []
        })
        const root = { ownerDocument: null, querySelectorAll } as unknown as ParentNode

        applyOverflowWidths(root, 20, 4)

        expect(summary.style.maxWidth).toEqual('20rem')
        expect(status.style.maxWidth).toEqual('4rem')
        expect(querySelectorAll).not.toHaveBeenCalledWith('.issue-summary')
        expect(querySelectorAll).not.toHaveBeenCalledWith('.issue-status')
    })

    test('refreshes an overflow tag when its viewport is resized', () => {
        let resizeCallback: () => void
        const observe = jest.fn()
        const disconnect = jest.fn()
        const animationFrames: FrameRequestCallback[] = []
        const ownerWindow = {
            ResizeObserver: class {
                constructor(callback: () => void) {
                    resizeCallback = callback
                }

                observe = observe
                disconnect = disconnect
            },
            requestAnimationFrame: jest.fn((callback: FrameRequestCallback) => {
                animationFrames.push(callback)
                return animationFrames.length
            }),
            cancelAnimationFrame: jest.fn(),
            matchMedia: jest.fn(() => ({ matches: false })),
            setInterval: jest.fn(() => 1),
            clearInterval: jest.fn(),
        }
        ;(global as any).window = ownerWindow
        const viewport = { clientWidth: 150 }
        const text = { scrollWidth: 120 }
        const classList = { add: jest.fn(), remove: jest.fn() }
        const element = {
            classList,
            isConnected: true,
            ownerDocument: { defaultView: ownerWindow },
            querySelector: jest.fn((selector: string) => selector === '.ji-overflow-viewport' ? viewport : text),
        } as unknown as HTMLElement

        scheduleOverflowElementRefresh(element)
        expect(observe).toHaveBeenCalledWith(viewport)
        expect(ownerWindow.setInterval).toHaveBeenCalledTimes(1)
        animationFrames.shift()(0)
        expect(classList.add).not.toHaveBeenCalled()

        viewport.clientWidth = 100
        resizeCallback()
        animationFrames.shift()(0)
        expect(classList.add).toHaveBeenCalledWith('is-overflowing')

        const root = {
            defaultView: ownerWindow,
            querySelectorAll: jest.fn(() => [element]),
        } as unknown as ParentNode
        stopAllOverflowElements(root)
        expect(disconnect).toHaveBeenCalled()
        expect(ownerWindow.clearInterval).toHaveBeenCalledTimes(1)
    })

    test('periodically sweeps and stops tracking elements removed from the DOM', () => {
        let sweepCallback: () => void
        const observe = jest.fn()
        const disconnect = jest.fn()
        const ownerWindow = {
            ResizeObserver: class {
                constructor() { /* callback not exercised in this test */ }
                observe = observe
                disconnect = disconnect
            },
            requestAnimationFrame: jest.fn(() => 1),
            cancelAnimationFrame: jest.fn(),
            matchMedia: jest.fn(() => ({ matches: false })),
            setInterval: jest.fn((callback: () => void) => {
                sweepCallback = callback
                return 1
            }),
            clearInterval: jest.fn(),
        }
        ;(global as any).window = ownerWindow
        const viewport = { clientWidth: 150 }
        const text = { scrollWidth: 120 }
        const element = {
            classList: { add: jest.fn(), remove: jest.fn() },
            isConnected: true,
            ownerDocument: { defaultView: ownerWindow },
            querySelector: jest.fn((selector: string) => selector === '.ji-overflow-viewport' ? viewport : text),
        } as unknown as HTMLElement

        scheduleOverflowElementRefresh(element)
        expect(observe).toHaveBeenCalledTimes(1)

        // Note closed / navigated away from: the element is detached, but nothing
        // triggers a resize event on it anymore, so only the periodic sweep can catch it.
        ;(element as any).isConnected = false
        sweepCallback()

        expect(disconnect).toHaveBeenCalledTimes(1)
    })

    test('uses a single global sweep interval even for elements from a different (e.g. popout) window', () => {
        const mainWindow = {
            ResizeObserver: class {
                constructor() { /* not exercised */ }
                observe = jest.fn()
                disconnect = jest.fn()
            },
            requestAnimationFrame: jest.fn(() => 1),
            cancelAnimationFrame: jest.fn(),
            matchMedia: jest.fn(() => ({ matches: false })),
            setInterval: jest.fn(() => 1),
            clearInterval: jest.fn(),
        }
        ;(global as any).window = mainWindow

        // A popout window: its own distinct Window-like object, with no setInterval of its own
        // ever invoked - closing it later must not stop the sweep, because the sweep only ever
        // runs on the plugin's persistent main window, never on whichever window registered
        // an element first.
        const popoutWindow = {
            ResizeObserver: class {
                constructor() { /* not exercised */ }
                observe = jest.fn()
                disconnect = jest.fn()
            },
            requestAnimationFrame: jest.fn(() => 1),
            cancelAnimationFrame: jest.fn(),
        }

        const elementInMainWindow = {
            classList: { add: jest.fn(), remove: jest.fn() },
            isConnected: true,
            ownerDocument: { defaultView: mainWindow },
            querySelector: jest.fn(() => ({ clientWidth: 150 })),
        } as unknown as HTMLElement
        const elementInPopout = {
            classList: { add: jest.fn(), remove: jest.fn() },
            isConnected: true,
            ownerDocument: { defaultView: popoutWindow },
            querySelector: jest.fn(() => ({ clientWidth: 150 })),
        } as unknown as HTMLElement

        scheduleOverflowElementRefresh(elementInMainWindow)
        scheduleOverflowElementRefresh(elementInPopout)

        // Only the main window's setInterval was ever called, exactly once - not once per window.
        expect(mainWindow.setInterval).toHaveBeenCalledTimes(1)
    })
})

export { }
