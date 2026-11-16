import { Editor } from "obsidian"

/**
 * Whether `line` sits inside a ```jira-search fence that is still open above it.
 *
 * Fences alternate, so counting the openings above the cursor is not enough: a closed
 * ```jira-search block stays closed until another one opens. Plain fences are tracked too,
 * so a ```jira-search line inside another code block does not count (issue #70).
 */
export function isInsideJiraSearchFence(editor: Editor, line: number): boolean {
    let state: 'none' | 'jira' | 'other' = 'none'
    for (let i = 0; i < line; i++) {
        const text = editor.getLine(i)
        if (state === 'none') {
            if (text.match(/^\s*```\s*jira-search/)) {
                state = 'jira'
            } else if (text.match(/^\s*```/)) {
                state = 'other'
            }
        } else if (text.match(/^\s*```\s*$/)) {
            // a closing fence: bare ``` and nothing else
            state = 'none'
        }
    }
    return state === 'jira'
}
