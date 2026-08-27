import { FrontMatterCache, TFile } from "obsidian"
import { IJiraIssue } from "../interfaces/issueInterfaces"
import { EColorSchema, ERenderStyle, IJiraIssueAccountSettings } from "../interfaces/settingsInterfaces"
import { ObsidianApp } from "../main"
import { SearchView } from "../searchView"
import { SettingsData } from "../settings"
import { scheduleOverflowElementRefresh } from "./overflowText"

export {
    JIRA_ISSUE_ICON_SVG_BASE_URL,
    JIRA_PRIORITY_ICON_SVG_BASE_URL,
    generateJiraIssueTypeSvgURL,
    generateJiraIssuePrioritySvgURL,
    JIRA_ISSUE_TYPE_ICON_MAP,
    JIRA_PRIORITY_ICON_MAP,
    JIRA_DEFAULT_ISSUE_ICON,
    JIRA_DEFAULT_PRIORITY_ICON
} from "./jiraIcons"

export const JIRA_STATUS_COLOR_MAP: Record<string, string> = {
    'blue-gray': 'is-info',
    'yellow': 'is-warning',
    'green': 'is-success',
    'red': 'is-danger',
    'medium-gray': 'is-dark',
}

export const JIRA_STATUS_COLOR_MAP_BY_NAME: Record<string, string> = {
    'New': 'is-dark',
    'Planning': 'is-dark',
    'To Do': 'is-dark',
    'In Progress': 'is-info',
    'Code Review': 'is-info',
    'Review': 'is-info',
    'Dev Complete': 'is-info',
    'Testing': 'is-info',
    'Release Pending': 'is-success',
    'Closed': 'is-success'
}

function resolveWebBaseUrl(account: IJiraIssueAccountSettings): string {
    return (account.webBaseUrl || account.host).trim().replace(/\/+$/, '')
}

export default {
    issueUrl(account: IJiraIssueAccountSettings, issueKey: string): string {
        try {
            return (new URL(`${resolveWebBaseUrl(account)}/browse/${issueKey}`)).toString()
        } catch (e) { return '' }
    },

    searchUrl(account: IJiraIssueAccountSettings, searchQuery: string): string {
        try {
            return (new URL(`${resolveWebBaseUrl(account)}/issues/?jql=${searchQuery}`)).toString()
        } catch (e) { return '' }
    },

    getTheme(): string {
        switch (SettingsData.colorSchema) {
            case EColorSchema.FOLLOW_OBSIDIAN:
                const obsidianTheme = (ObsidianApp.vault as any).getConfig("theme")
                if (obsidianTheme === 'obsidian') {
                    return 'is-dark'
                } else if (obsidianTheme === 'moonstone') {
                    return 'is-light'
                } else if (obsidianTheme === 'system') {
                    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
                        return 'is-dark'
                    } else {
                        return 'is-light'
                    }
                }
                break
            case EColorSchema.LIGHT:
                return 'is-light'
            case EColorSchema.DARK:
                return 'is-dark'
        }
        return 'is-light'
    },

    getNotes(): TFile[] {
        return ObsidianApp.vault.getMarkdownFiles()
    },

    getFrontMatter(file: TFile): FrontMatterCache {
        return ObsidianApp.metadataCache.getFileCache(file).frontmatter
    },

    renderContainer(children: HTMLElement[]): HTMLElement {
        const renderStyleClass = SettingsData.renderStyle === ERenderStyle.CLASSIC ? 'ji-style-classic' : 'ji-style-modern'
        const container = createDiv({ cls: `jira-issue-container ${renderStyleClass}` })
        for (const child of children) {
            container.appendChild(child)
        }
        return container
    },

    renderLoadingItem(item: string, inline = false): HTMLElement {
        let tagsRow
        if (inline) {
            tagsRow = createSpan({ cls: 'ji-tags has-addons' })
        } else {
            tagsRow = createDiv({ cls: 'ji-tags has-addons' })
        }
        createSpan({ cls: 'spinner', parent: createSpan({ cls: `ji-tag ${this.getTheme()}`, parent: tagsRow }) })
        createEl('a', { cls: `ji-tag is-link ${this.getTheme()}`, text: item, parent: tagsRow })
        createSpan({ cls: `ji-tag ${this.getTheme()}`, text: 'Loading ...', parent: tagsRow })
        return tagsRow
    },

    renderSearchError(el: HTMLElement, message: string, searchView: SearchView): void {
        const tagsRow = createDiv('ji-tags has-addons')
        createSpan({ cls: 'ji-tag is-delete is-danger', parent: tagsRow })
        if (searchView) {
            createSpan({ cls: `ji-tag is-danger ${this.getTheme()}`, text: "Search error", parent: tagsRow })
        } else {
            createSpan({ cls: `ji-tag is-danger ${this.getTheme()}`, text: "Search error", parent: tagsRow })
        }
        createSpan({ cls: 'ji-tag is-danger', text: message, parent: tagsRow })
        el.replaceChildren(this.renderContainer([tagsRow]))
    },

    renderIssue(issue: IJiraIssue, compact = false): HTMLElement {
        const tagsRow = createDiv('ji-tags has-addons')
        this.renderAccountColorBand(issue.account, tagsRow)
        if (issue.fields.issuetype.iconUrl) {
            createEl('img', {
                cls: 'fit-content',
                attr: { src: issue.fields.issuetype.iconUrl, alt: issue.fields.issuetype.name },
                title: issue.fields.issuetype.name,
                parent: createSpan({ cls: `ji-tag ${this.getTheme()} ji-sm-tag`, parent: tagsRow })
            })
        }
        createEl('a', { cls: `ji-tag is-link ${this.getTheme()} no-wrap`, href: this.issueUrl(issue.account, issue.key), title: this.issueUrl(issue.account, issue.key), text: issue.key, parent: tagsRow })
        if (!compact) {
            this.renderOverflowTag(tagsRow, `ji-tag ${this.getTheme()} issue-summary`, issue.fields.summary, issue.fields.summary, SettingsData.issueSummaryMaxWidthRem)
        }
        const statusColor = JIRA_STATUS_COLOR_MAP_BY_NAME[issue.fields.status.name] ||
            JIRA_STATUS_COLOR_MAP[issue.fields.status.statusCategory.colorName] ||
            'is-light'
        const statusTitle = issue.fields.status.description
            ? `${issue.fields.status.name}: ${issue.fields.status.description}`
            : issue.fields.status.name
        this.renderOverflowTag(tagsRow, `ji-tag no-wrap issue-status ${statusColor}`, issue.fields.status.name, statusTitle, SettingsData.issueStatusMaxWidthRem, {
            'data-status': issue.fields.status.name,
        })
        return tagsRow
    },

    renderOverflowTag(parent: HTMLElement, classes: string, text: string, title: string, maxWidthRem: number, attributes: Record<string, string> = {}): HTMLElement {
        const tag = createSpan({
            cls: `${classes} ji-overflow-tag`,
            title,
            attr: {
                ...attributes,
                'aria-label': text,
                style: `max-width: ${maxWidthRem}rem`,
            },
            parent,
        })
        const viewport = createSpan({ cls: 'ji-overflow-viewport', parent: tag })
        createSpan({ cls: 'ji-overflow-text', text, parent: viewport })
        scheduleOverflowElementRefresh(tag)
        return tag
    },

    renderIssueError(issueKey: string, message: string): HTMLElement {
        const tagsRow = createDiv('ji-tags has-addons')
        createSpan({ cls: 'ji-tag is-delete is-danger', parent: tagsRow })
        createSpan({ cls: 'ji-tag is-danger is-light', text: issueKey, parent: tagsRow })
        createSpan({ cls: 'ji-tag is-danger', text: message, parent: tagsRow })
        return tagsRow
    },

    renderAccountColorBand(account: IJiraIssueAccountSettings, parent: HTMLDivElement) {
        if (SettingsData.showColorBand) {
            createSpan({ cls: `ji-tag ${this.getTheme()} ji-band`, attr: { style: `background-color: ${account.color}` }, title: account.alias, parent: parent })
        }
    },
}
