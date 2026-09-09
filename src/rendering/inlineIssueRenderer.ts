import { MarkdownPostProcessorContext } from "obsidian"
import JiraClient from "../client/jiraClient"
import { IJiraIssue } from "../interfaces/issueInterfaces"
import { COMPACT_SYMBOL, ERenderStyle, JIRA_KEY_REGEX } from "../interfaces/settingsInterfaces"
import ObjectsCache from "../objectsCache"
import { SettingsData } from "../settings"
import RC from "./renderingCommon"

// TODO: support explicit account selection in inline issues

function getRenderStyleClass(): string {
    return SettingsData.renderStyle === ERenderStyle.CLASSIC ? 'ji-style-classic' : 'ji-style-modern'
}

function replaceInlineIssuesInTextNode(textNode: Text, pattern: RegExp): void {
    const text = textNode.textContent
    pattern.lastIndex = 0
    if (!pattern.test(text)) return

    const doc = textNode.ownerDocument
    const fragment = doc.createDocumentFragment()
    let lastIndex = 0
    let match: RegExpExecArray
    pattern.lastIndex = 0
    while ((match = pattern.exec(text))) {
        if (match.index > lastIndex) {
            fragment.appendChild(doc.createTextNode(text.substring(lastIndex, match.index)))
        }
        const compact = !!match[1]
        const issueKey = match[2]
        const container = createSpan({ cls: `ji-inline-issue jira-issue-container ${getRenderStyleClass()}`, attr: { 'data-issue-key': issueKey, 'data-compact': compact } })
        container.appendChild(RC.renderLoadingItem(issueKey, true))
        fragment.appendChild(container)
        lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
        fragment.appendChild(doc.createTextNode(text.substring(lastIndex)))
    }
    textNode.parentNode.replaceChild(fragment, textNode)
}

function convertInlineIssuesToTags(el: HTMLElement): void {
    if (SettingsData.inlineIssuePrefix) {
        const pattern = new RegExp(`${SettingsData.inlineIssuePrefix}(${COMPACT_SYMBOL}?)(${JIRA_KEY_REGEX})`, 'g')
        const doc = el.ownerDocument
        const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        const textNodes: Text[] = []
        let node: Node
        while ((node = walker.nextNode())) {
            textNodes.push(node as Text)
        }
        for (const textNode of textNodes) {
            replaceInlineIssuesInTextNode(textNode, pattern)
        }
    }
}

function convertInlineIssuesUrlToTags(el: HTMLElement): void {
    if (SettingsData.inlineIssueUrlToTag) {
        for (const account of SettingsData.accounts) {
            const issueUrlElements = el.querySelectorAll(`a.external-link[href^="${account.host}/browse/"]`)
            issueUrlElements.forEach((issueUrlElement: HTMLAnchorElement) => {
                const compact = issueUrlElement.previousSibling && issueUrlElement.previousSibling.textContent.endsWith('-')
                const issueKey = issueUrlElement.href.replace(`${account.host}/browse/`, '')
                const container = createSpan({ cls: `ji-inline-issue jira-issue-container ${getRenderStyleClass()}`, attr: { 'data-issue-key': issueKey, 'data-compact': compact } })
                container.appendChild(RC.renderLoadingItem(issueKey, true))
                issueUrlElement.replaceWith(container)
            })
        }
    }
}

export const InlineIssueRenderer = async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    // console.log({ el })
    convertInlineIssuesToTags(el)
    convertInlineIssuesUrlToTags(el)

    const inlineIssueTags: NodeListOf<HTMLSpanElement> = el.querySelectorAll(`span.ji-inline-issue`)
    inlineIssueTags.forEach((value: HTMLSpanElement) => {
        const issueKey = value.getAttribute('data-issue-key')
        const compact = value.getAttribute('data-compact') === 'true'
        const cachedIssue = ObjectsCache.get(issueKey)
        if (cachedIssue) {
            if (cachedIssue.isError) {
                value.replaceChildren(RC.renderIssueError(issueKey, cachedIssue.data as string))
            } else {
                value.replaceChildren(RC.renderIssue(cachedIssue.data as IJiraIssue, compact))
            }
        } else {
            value.replaceChildren(RC.renderLoadingItem(issueKey))
            JiraClient.getIssue(issueKey).then(newIssue => {
                const issue = ObjectsCache.add(issueKey, newIssue).data as IJiraIssue
                value.replaceChildren(RC.renderIssue(issue, compact))
            }).catch(err => {
                ObjectsCache.add(issueKey, err, true)
                value.replaceChildren(RC.renderIssueError(issueKey, err))
            })
        }
    })
}