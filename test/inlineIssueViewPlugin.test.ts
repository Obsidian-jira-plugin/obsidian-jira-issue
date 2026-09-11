import { RangeSet } from '@codemirror/state'
import { buildViewPluginClass, IMatchDecoratorRef } from '../src/rendering/inlineIssueViewPlugin'

// https://github.com/Obsidian-jira-plugin/obsidian-jira-issue/issues/19
// Inline issue tags that scroll into view stayed as unrendered plain text because the
// ViewPlugin's update() only recomputed decorations on doc/selection/mode changes, never on
// a viewport change (e.g. scrolling) - even though MatchDecorator.createDeco() only computes
// decorations for the current viewport in the first place.
describe('buildViewPluginClass', () => {
    function makeFakeState(fieldValue: boolean, selection: unknown) {
        return {
            field: jest.fn(() => fieldValue),
            selection,
        } as any
    }

    function makeUpdate(overrides: Partial<{ docChanged: boolean, viewportChanged: boolean }>, selectionUnchanged = true) {
        const sameSelection = { main: {} }
        return {
            docChanged: false,
            viewportChanged: false,
            ...overrides,
            startState: makeFakeState(false, selectionUnchanged ? sameSelection : { main: {} }),
            state: makeFakeState(false, sameSelection),
            transactions: [],
            view: {},
        } as any
    }

    test('recomputes decorations when the viewport changes even if nothing else did', () => {
        const createDeco = jest.fn(() => RangeSet.empty)
        const matchDecorator: IMatchDecoratorRef = { ref: { createDeco } as any }
        const { class: ViewPluginClass } = buildViewPluginClass(matchDecorator)
        const plugin = new ViewPluginClass({} as any)
        createDeco.mockClear()

        plugin.update(makeUpdate({ viewportChanged: true }))

        expect(createDeco).toHaveBeenCalledTimes(1)
    })

    test('does not recompute decorations when nothing relevant changed', () => {
        const createDeco = jest.fn(() => RangeSet.empty)
        const matchDecorator: IMatchDecoratorRef = { ref: { createDeco } as any }
        const { class: ViewPluginClass } = buildViewPluginClass(matchDecorator)
        const plugin = new ViewPluginClass({} as any)
        createDeco.mockClear()

        plugin.update(makeUpdate({}))

        expect(createDeco).not.toHaveBeenCalled()
    })

    test('recomputes decorations when the document changes', () => {
        const createDeco = jest.fn(() => RangeSet.empty)
        const matchDecorator: IMatchDecoratorRef = { ref: { createDeco } as any }
        const { class: ViewPluginClass } = buildViewPluginClass(matchDecorator)
        const plugin = new ViewPluginClass({} as any)
        createDeco.mockClear()

        plugin.update(makeUpdate({ docChanged: true }))

        expect(createDeco).toHaveBeenCalledTimes(1)
    })
})

export { }
