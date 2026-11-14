jest.mock('../src/settings', () => {
    return { SettingsData: { cache: { columns: [] } } }
})

import { Editor } from 'obsidian'
import { isInsideJiraSearchFence } from '../src/suggestions/jiraSearchFence'
import { ColumnsSuggest } from '../src/suggestions/columnsSuggest'
import { QuerySuggest } from '../src/suggestions/querySuggest'

// Only getLine is read by the fence check, so a line array is all the editor has to be.
function editorOf(lines: string[]): Editor {
    return { getLine: (i: number) => lines[i] } as unknown as Editor
}

// The index of the last line that starts with `text`, so the cases do not count lines by hand.
function lineWith(lines: string[], text: string): number {
    const i = lines.map((l, n) => (l.startsWith(text) ? n : -1)).filter((n) => n >= 0).pop()
    if (i === undefined) throw new Error(`no line starts with ${text}`)
    return i
}

describe('isInsideJiraSearchFence', () => {
    test('a cursor inside an open block', () => {
        const lines = ['```jira-search', 'query: assignee = currentUser()', 'columns: KEY']
        expect(isInsideJiraSearchFence(editorOf(lines), 2)).toBe(true)
    })

    test('the opening fence line itself is not inside the block', () => {
        const lines = ['```jira-search', 'query: assignee = currentUser()']
        expect(isInsideJiraSearchFence(editorOf(lines), 0)).toBe(false)
    })

    test('after the block is closed (issue #70: typing columns: below a closed block opened the menu)', () => {
        const lines = [
            '```jira-search',
            'query: assignee = currentUser()',
            'columns: KEY, SUMMARY',
            '```',
            '',
            'columns:',
        ]
        expect(isInsideJiraSearchFence(editorOf(lines), lineWith(lines, 'columns:'))).toBe(false)
    })

    test('nothing above the cursor: no block', () => {
        expect(isInsideJiraSearchFence(editorOf(['columns:']), 0)).toBe(false)
    })

    test('a later block after a closed one is inside again', () => {
        const lines = [
            '```jira-search',
            'query: assignee = currentUser()',
            '```',
            '',
            '```jira-search',
            'query: status = Done',
            'columns: KEY',
        ]
        expect(isInsideJiraSearchFence(editorOf(lines), 6)).toBe(true)
    })

    test('a jira-search line inside another code block does not count', () => {
        const lines = ['```markdown', '```jira-search', 'query: assignee = currentUser()', '```', '', 'columns:']
        expect(isInsideJiraSearchFence(editorOf(lines), lineWith(lines, 'columns:'))).toBe(false)
    })

    test('a closed plain code block above does not swallow the jira-search block below it', () => {
        const lines = ['```js', 'const a = 1', '```', '', '```jira-search', 'columns: KEY']
        expect(isInsideJiraSearchFence(editorOf(lines), 5)).toBe(true)
    })

    test('an unclosed plain code block above does not count as a jira-search one', () => {
        const lines = ['```js', 'const a = 1', '', 'columns: KEY']
        expect(isInsideJiraSearchFence(editorOf(lines), 3)).toBe(false)
    })

    test('no fence at all', () => {
        const lines = ['# Notes', '', 'columns: KEY']
        expect(isInsideJiraSearchFence(editorOf(lines), 2)).toBe(false)
    })
})

describe('suggestions only open inside an open jira-search block', () => {
    const app = {} as never

    function trigger(suggest: { onTrigger: (c: { line: number; ch: number }, e: Editor, f: never) => unknown }, lines: string[], line: number) {
        const editor = editorOf(lines)
        return suggest.onTrigger({ line, ch: lines[line].length }, editor, {} as never)
    }

    test('columns after a closed block: no menu (issue #70)', () => {
        const lines = [
            '```jira-search',
            'query: assignee = currentUser()',
            'columns: KEY, SUMMARY',
            '```',
            '',
            'columns:',
        ]
        const suggest = new ColumnsSuggest(app)
        expect(trigger(suggest, lines, lineWith(lines, 'columns:'))).toBeNull()
        lines.push('```jira-search', 'columns:')
        expect(trigger(suggest, lines, lines.length - 1)).not.toBeNull()
    })

    test('query after a closed block: no menu (the same check in querySuggest)', () => {
        const lines = ['```jira-search', 'query: status = Done', '```', '', 'query:']
        const suggest = new QuerySuggest(app)
        expect(trigger(suggest, lines, 4)).toBeNull()
        lines.push('```jira-search', 'query:')
        expect(trigger(suggest, lines, 6)).not.toBeNull()
    })
})
