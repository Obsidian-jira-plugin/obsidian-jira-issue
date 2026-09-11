import { RangeSet, StateEffect } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView, MatchDecorator, PluginSpec, PluginValue, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view"
import { editorLivePreviewField } from "obsidian"
import JiraClient from "../client/jiraClient"
import { IJiraIssue } from "../interfaces/issueInterfaces"
import ObjectsCache from "../objectsCache"
import { SettingsData } from "../settings"
import RC from "./renderingCommon"
import { getAccountByHost } from "../utils"
import { COMPACT_SYMBOL, ERenderStyle, JIRA_KEY_REGEX } from "../interfaces/settingsInterfaces"

export const refreshInlineIssuesEffect = StateEffect.define<void>()

function getRenderStyleClass(): string {
    return SettingsData.renderStyle === ERenderStyle.CLASSIC ? 'ji-style-classic' : 'ji-style-modern'
}

export interface IMatchDecoratorRef {
    ref: MatchDecorator
}

function escapeRegexp(str: string): string {
    return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/\//g, '\\/')
}

const isEditorInLivePreviewMode = (view: EditorView) => view.state.field(editorLivePreviewField)
const isCursorInsideTag = (view: EditorView, start: number, length: number) => {
    const cursor = view.state.selection.main.head
    return (cursor > start - 1 && cursor < start + length + 1)
}
const isSelectionContainsTag = (view: EditorView, start: number, length: number) => {
    const selectionBegin = view.state.selection.main.from
    const selectionEnd = view.state.selection.main.to
    return (selectionEnd > start - 1 && selectionBegin < start + length + 1)
}

class InlineIssueWidget extends WidgetType {
    private _issueKey: string
    private _compact: boolean
    private _host: string
    private _htmlContainer: HTMLElement
    constructor(key: string, compact: boolean, host: string = null) {
        super()
        this._issueKey = key
        this._compact = compact
        this._host = host
        this._htmlContainer = createSpan({ cls: `ji-inline-issue jira-issue-container ${getRenderStyleClass()}` })
        this.buildTag()
    }

    buildTag() {
        const cachedIssue = ObjectsCache.get(this._issueKey)
        if (cachedIssue) {
            if (cachedIssue.isError) {
                this._htmlContainer.replaceChildren(RC.renderIssueError(this._issueKey, cachedIssue.data as string))
            } else {
                this._htmlContainer.replaceChildren(RC.renderIssue(cachedIssue.data as IJiraIssue, this._compact))
            }
        } else {
            this._htmlContainer.replaceChildren(RC.renderLoadingItem(this._issueKey))
            JiraClient.getIssue(this._issueKey, { account: getAccountByHost(this._host) }).then(newIssue => {
                const issue = ObjectsCache.add(this._issueKey, newIssue).data as IJiraIssue
                this._htmlContainer.replaceChildren(RC.renderIssue(issue, this._compact))
            }).catch(err => {
                ObjectsCache.add(this._issueKey, err, true)
                this._htmlContainer.replaceChildren(RC.renderIssueError(this._issueKey, err))
            })
        }
    }

    toDOM(view: EditorView): HTMLElement {
        return this._htmlContainer
    }

    eq(other: InlineIssueWidget): boolean {
        // WidgetType's default eq() always returns false, meaning every match is torn down and
        // redrawn on every decoration recompute. Since createDeco()/updateDeco() build a fresh
        // widget instance per match, without this override even an unchanged, already-rendered
        // tag would flicker and rebuild its DOM (and re-run the cache lookup in buildTag()) on
        // every recompute - which now also happens on scroll, not just doc/selection changes.
        return other._issueKey === this._issueKey && other._compact === this._compact && other._host === this._host
    }
}

// Global variable with the last instance of the MatchDecorator rebuilt every time the settings are changed
const jiraTagMatchDecorator: IMatchDecoratorRef = { ref: null }
const jiraUrlMatchDecorator: IMatchDecoratorRef = { ref: null }

function buildMatchDecorators() {
    if (SettingsData.inlineIssuePrefix !== '') {
        jiraTagMatchDecorator.ref = new MatchDecorator({
            regexp: new RegExp(`${SettingsData.inlineIssuePrefix}(${COMPACT_SYMBOL}?)(${JIRA_KEY_REGEX})`, 'g'),
            decoration: (match: RegExpExecArray, view: EditorView, pos: number) => {
                const compact = !!match[1]
                const key = match[2]
                const tagLength = match[0].length
                if (!isEditorInLivePreviewMode(view) || isCursorInsideTag(view, pos, tagLength) || isSelectionContainsTag(view, pos, tagLength)) {
                    return Decoration.mark({
                        tagName: 'div',
                        class: 'HyperMD-codeblock HyperMD-codeblock-bg jira-issue-inline-mark',
                    })
                } else {
                    return Decoration.replace({
                        widget: new InlineIssueWidget(key, compact),
                    })
                }
            }
        })
    } else {
        jiraTagMatchDecorator.ref = null
    }

    if (SettingsData.inlineIssueUrlToTag) {
        const urls: string[] = []
        SettingsData.accounts.forEach(account => urls.push(escapeRegexp(account.host)))
        jiraUrlMatchDecorator.ref = new MatchDecorator({
            regexp: new RegExp(`(${COMPACT_SYMBOL}?)(${urls.join('|')})/browse/(${JIRA_KEY_REGEX})`, 'g'),
            decoration: (match: RegExpExecArray, view: EditorView, pos: number) => {
                const compact = !!match[1]
                const host = match[2]
                const key = match[3]
                const tagLength = match[0].length
                if (!isEditorInLivePreviewMode(view) || isCursorInsideTag(view, pos, tagLength) || isSelectionContainsTag(view, pos, tagLength)) {
                    return Decoration.mark({
                        tagName: 'div',
                        class: 'HyperMD-codeblock HyperMD-codeblock-bg jira-issue-inline-mark',
                    })
                } else {
                    return Decoration.replace({
                        widget: new InlineIssueWidget(key, compact, host),
                    })
                }
            }
        })
    } else {
        jiraUrlMatchDecorator.ref = null
    }
}

export function buildViewPluginClass(matchDecorator: IMatchDecoratorRef) {
    class ViewPluginClass implements PluginValue {
        decorators: DecorationSet

        constructor(view: EditorView) {
            this.decorators = matchDecorator.ref ? matchDecorator.ref.createDeco(view) : RangeSet.empty
        }

        update(update: ViewUpdate): void {
            if (!matchDecorator.ref) {
                this.decorators = RangeSet.empty
                return
            }

            const editorModeChanged = update.startState.field(editorLivePreviewField) !== update.state.field(editorLivePreviewField)
            const hasRefreshEffect = update.transactions.some(tr => tr.effects.some(e => e.is(refreshInlineIssuesEffect)))
            const selectionChanged = update.startState.selection.main !== update.state.selection.main

            if (editorModeChanged || hasRefreshEffect || selectionChanged) {
                // A mode switch can change every match's decoration type (mark vs. widget); a
                // refresh effect (dispatched after a settings change) means matchDecorator.ref
                // may now be a brand new MatchDecorator instance - updateDeco() requires its
                // `deco` argument to have come from *this exact* MatchDecorator, so it's not safe
                // to hand off to it. A selection change can also flip a match's decoration type,
                // since isCursorInsideTag()/isSelectionContainsTag() key off the cursor position -
                // something updateDeco()'s own dirty-tracking (doc/viewport changes only) has no
                // way to know affects the output. All three need a full recompute.
                this.decorators = matchDecorator.ref.createDeco(update.view)
            } else if (update.docChanged || update.viewportChanged) {
                // updateDeco() only computes decorations for the current viewport too, so a
                // viewport change (e.g. scrolling to reveal previously off-screen lines) needs to
                // trigger a recompute - without it, tags that scroll into view stay as unrendered
                // plain text. Unlike createDeco(), updateDeco() does its own cheap bounded
                // re-matching (or no-ops entirely) instead of always rescanning the whole
                // viewport, so this is far cheaper to call on every scroll tick.
                this.decorators = matchDecorator.ref.updateDeco(update, this.decorators)
            }
        }

        destroy(): void {
            this.decorators = null
        }
    }

    const ViewPluginSpec: PluginSpec<ViewPluginClass> = {
        decorations: viewPlugin => viewPlugin.decorators,
    }

    return {
        class: ViewPluginClass,
        spec: ViewPluginSpec,
    }
}



export class ViewPluginManager {
    private _viewPlugins: ViewPlugin<PluginValue>[]

    constructor() {
        this.update()
        const jiraTagViewPlugin = buildViewPluginClass(jiraTagMatchDecorator)
        const jiraUrlViewPlugin = buildViewPluginClass(jiraUrlMatchDecorator)
        this._viewPlugins = [
            ViewPlugin.fromClass(jiraTagViewPlugin.class, jiraTagViewPlugin.spec),
            ViewPlugin.fromClass(jiraUrlViewPlugin.class, jiraUrlViewPlugin.spec),
        ]
    }

    update() {
        buildMatchDecorators()
    }

    getViewPlugins(): ViewPlugin<any>[] {
        return this._viewPlugins
    }
}