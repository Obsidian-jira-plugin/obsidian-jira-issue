import { RangeSet } from '@codemirror/state'
import { buildViewPluginClass, IMatchDecoratorRef, refreshInlineIssuesEffect } from '../src/rendering/inlineIssueViewPlugin'

// https://github.com/Obsidian-jira-plugin/obsidian-jira-issue/issues/19
// Inline issue tags that scroll into view stayed as unrendered plain text because the
// ViewPlugin's update() only recomputed decorations on doc/selection/mode changes, never on
// a viewport change (e.g. scrolling) - even though MatchDecorator.createDeco() only computes
// decorations for the current viewport in the first place.
describe('buildViewPluginClass', () => {
    function makeMatchDecorator() {
        return {
            createDeco: jest.fn(() => RangeSet.empty),
            updateDeco: jest.fn(() => RangeSet.empty),
        }
    }

    function makeUpdate(overrides: {
        docChanged?: boolean
        viewportChanged?: boolean
        selectionChanged?: boolean
        editorModeChanged?: boolean
        hasRefreshEffect?: boolean
    }) {
        const selectionA = { main: 'a' }
        const selectionB = { main: 'b' }
        const modeA = false
        const modeB = overrides.editorModeChanged ? true : false
        return {
            docChanged: overrides.docChanged ?? false,
            viewportChanged: overrides.viewportChanged ?? false,
            startState: { field: jest.fn(() => modeA), selection: selectionA },
            state: { field: jest.fn(() => modeB), selection: overrides.selectionChanged ? selectionB : selectionA },
            transactions: overrides.hasRefreshEffect ? [{ effects: [refreshInlineIssuesEffect.of()] }] : [],
            view: {},
        } as any
    }

    function setup() {
        const matchDecoratorImpl = makeMatchDecorator()
        const matchDecorator: IMatchDecoratorRef = { ref: matchDecoratorImpl as any }
        const { class: ViewPluginClass } = buildViewPluginClass(matchDecorator)
        const plugin = new ViewPluginClass({} as any)
        matchDecoratorImpl.createDeco.mockClear()
        matchDecoratorImpl.updateDeco.mockClear()
        return { plugin, matchDecoratorImpl }
    }

    test.each([
        ['viewport changed', { viewportChanged: true }],
        ['document changed', { docChanged: true }],
    ])('calls the cheap updateDeco(), not createDeco(), when only the %s', (_name, overrides) => {
        const { plugin, matchDecoratorImpl } = setup()

        plugin.update(makeUpdate(overrides))

        expect(matchDecoratorImpl.updateDeco).toHaveBeenCalledTimes(1)
        expect(matchDecoratorImpl.createDeco).not.toHaveBeenCalled()
    })

    test.each([
        ['the selection changed', { selectionChanged: true }],
        ['the editor mode changed', { editorModeChanged: true }],
        ['a refresh effect was dispatched', { hasRefreshEffect: true }],
    ])('falls back to a full createDeco() recompute when %s', (_name, overrides) => {
        const { plugin, matchDecoratorImpl } = setup()

        plugin.update(makeUpdate(overrides))

        expect(matchDecoratorImpl.createDeco).toHaveBeenCalledTimes(1)
        expect(matchDecoratorImpl.updateDeco).not.toHaveBeenCalled()
    })

    test('does not recompute decorations when nothing relevant changed', () => {
        const { plugin, matchDecoratorImpl } = setup()

        plugin.update(makeUpdate({}))

        expect(matchDecoratorImpl.createDeco).not.toHaveBeenCalled()
        expect(matchDecoratorImpl.updateDeco).not.toHaveBeenCalled()
    })

    test('a selection change takes priority over a simultaneous viewport change (still needs a full recompute)', () => {
        const { plugin, matchDecoratorImpl } = setup()

        plugin.update(makeUpdate({ selectionChanged: true, viewportChanged: true }))

        expect(matchDecoratorImpl.createDeco).toHaveBeenCalledTimes(1)
        expect(matchDecoratorImpl.updateDeco).not.toHaveBeenCalled()
    })
})

export { }
