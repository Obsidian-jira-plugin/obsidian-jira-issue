import {
    applyOverflowWidths,
    calculateOverflowAnimation,
    scheduleOverflowElementRefresh,
    stopAllOverflowElements,
} from '../src/rendering/overflowText'

describe('OverflowText', () => {
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
        }
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
    })
})

export { }
