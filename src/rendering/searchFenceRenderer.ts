import { MarkdownPostProcessorContext, setIcon } from "obsidian"
import { toDefaultedIssue, IJiraIssue, IJiraSearchResults } from "../interfaces/issueInterfaces"
import JiraClient from "../client/jiraClient"
import LastGoodCache, { trimIssueForChip } from "../lastGoodCache"
import ObjectsCache from "../objectsCache"
import { hasCustomFieldColumnsByName, renderTableColumn, trimIssueForColumns } from "./renderTableColumns"
import { SearchView } from "../searchView"
import { SettingsData } from "../settings"
import RC, { IStaleInfo } from "./renderingCommon"
import { ESearchColumnsTypes, ESearchResultsRenderingTypes, IJiraIssueAccountSettings, SEARCH_COLUMNS_DESCRIPTION } from "../interfaces/settingsInterfaces"

// Only what this view renders is saved: a list shows chips, a table shows its columns
function getIssueTrimmer(searchView: SearchView): (issue: IJiraIssue) => IJiraIssue {
    if (searchView.type === ESearchResultsRenderingTypes.LIST) {
        return trimIssueForChip
    }
    const columns = searchView.getColumns()
    return issue => trimIssueForColumns(issue, columns)
}

// Columns of custom fields given by name need the names loaded from Jira to find their field.
// If the names could not be loaded, saving would drop those columns from the last good results
function rememberSearch(searchView: SearchView, searchResults: IJiraSearchResults, generation: number): void {
    const save = () => LastGoodCache.rememberSearch(searchView.getSavedResultsKey(), searchResults, getIssueTrimmer(searchView), generation)
    const needsNames = searchView.type !== ESearchResultsRenderingTypes.LIST && hasCustomFieldColumnsByName(searchView.getColumns())
    if (!needsNames) {
        save()
        return
    }
    JiraClient.customFieldsLoaded(searchResults.account)
        .then(namesLoaded => {
            if (namesLoaded) {
                save()
            }
        })
        .catch(err => RC.logSaveError(err))
}

async function renderSearchResults(rootEl: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults, stale: IStaleInfo = null): Promise<void> {
    searchView.account = searchResults.account
    if (searchView.type === ESearchResultsRenderingTypes.LIST) {
        renderSearchResultsList(rootEl, searchView, searchResults, stale)
    } else {
        await renderSearchResultsTable(rootEl, searchView, searchResults, stale)
    }
}

// For results Jira returned: if they cannot be rendered, the error is shown, not the saved
// results, since Jira did answer. onRendered (saving the results) only runs after a render
async function renderSearchResultsOrError(rootEl: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults, onRendered: () => void = null): Promise<void> {
    try {
        await renderSearchResults(rootEl, searchView, searchResults)
    } catch (err) {
        RC.renderSearchError(rootEl, String(err), searchView)
        return
    }
    RC.saveRendered(onRendered)
}

function renderSearchFailure(rootEl: HTMLElement, searchView: SearchView, error: unknown): Promise<void> {
    return RC.renderSavedOrError(LastGoodCache.getSearch(searchView.getSavedResultsKey()), error,
        (searchResults: IJiraSearchResults, stale: IStaleInfo) => renderSearchResults(rootEl, searchView, searchResults, stale),
        async () => RC.renderSearchError(rootEl, error as string, searchView))
}

async function renderSearchResultsTable(rootEl: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults, stale: IStaleInfo): Promise<void> {
    const table = createEl('table', { cls: `table is-bordered is-striped is-narrow is-hoverable is-fullwidth ${RC.getTheme()}` })
    renderSearchResultsTableHeader(table, searchView, searchResults.account)
    // Stale results are shown because Jira could not be reached: don't fetch more data per row
    await renderSearchResultsTableBody(table, searchView, searchResults, !!stale)

    const footer = renderSearchFooter(rootEl, searchView, searchResults, stale)
    rootEl.replaceChildren(RC.renderContainer([table, footer]))
}

function renderSearchResultsTableHeader(table: HTMLElement, searchView: SearchView, account: IJiraIssueAccountSettings): void {
    const header = createEl('tr', {
        parent:
            createEl('thead', { attr: { style: getAccountBandStyle(searchView.account) }, parent: table })
    })
    const columns = searchView.getColumns()
    for (const column of columns) {
        let name = SEARCH_COLUMNS_DESCRIPTION[column.type]
        // Frontmatter
        if (column.type === ESearchColumnsTypes.NOTES && column.extra) {
            name = column.extra
        }
        // Custom field
        if (column.type === ESearchColumnsTypes.CUSTOM_FIELD) {
            if (Number(column.extra)) {
                name = account.cache.customFieldsIdToName[column.extra]
            } else {
                name = column.extra
            }
        }
        if (column.compact) {
            createEl('th', { text: name[0].toUpperCase(), attr: { 'aria-label-position': 'top', 'aria-label': column.type }, parent: header })
        } else {
            createEl('th', { text: name, title: column.type, parent: header })
        }
    }
}

async function renderSearchResultsTableBody(table: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults, offline: boolean): Promise<void> {
    const tbody = createEl('tbody', { parent: table })
    for (let issue of searchResults.issues) {
        issue = toDefaultedIssue(issue)
        const row = createEl('tr', { parent: tbody })
        const columns = searchView.getColumns()
        await renderTableColumn(columns, issue, row, offline)
    }
}

function renderSearchResultsList(rootEl: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults, stale: IStaleInfo): void {
    const list: HTMLElement[] = []
    for (const issue of searchResults.issues) {
        list.push(RC.renderIssue(issue))
    }
    const footer = renderSearchFooter(rootEl, searchView, searchResults, stale)
    rootEl.replaceChildren(RC.renderContainer([...list, footer]))
}

function getAccountBandStyle(account: IJiraIssueAccountSettings): string {
    if (SettingsData.showColorBand) {
        return 'border-left: 3px solid ' + account.color
    }
    return ''
}

function renderSearchFooter(rootEl: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults, stale: IStaleInfo): HTMLElement {
    const searchFooter = createDiv({ cls: 'search-footer' })
    const searchCount = `Total results: ${searchResults.total?.toString() || searchResults.issues.length.toString()}${searchResults.isLast === false ? "+" : ""} | ${searchResults.account.alias}`

    if (SettingsData.showJiraLink) {
        createEl('a', {
            text: searchCount,
            href: RC.searchUrl(searchView.account, searchView.query),
            parent: searchFooter,
        })
    } else {
        createDiv({
            text: searchCount,
            parent: searchFooter,
        })
    }

    const lastUpdateContainer = createDiv({ parent: searchFooter })
    createSpan({
        text: `Last update: ${stale ? RC.formatUpdateTime(stale.updateTime) : ObjectsCache.getTime(searchView.getCacheKey())}`,
        parent: lastUpdateContainer,
    })
    if (stale) {
        RC.renderStaleMarker(lastUpdateContainer, 'these results', stale)
    }
    const refreshButton = createEl('button', { parent: lastUpdateContainer, title: 'Refresh', cls: 'rotate-animation' })
    setIcon(refreshButton, 'sync-small')
    refreshButton.onClickEvent(() => {
        rootEl.empty()
        ObjectsCache.delete(searchView.getCacheKey())
        // Same SearchView, so the refresh keeps the cache key of the fence it belongs to
        void renderSearchView(rootEl, searchView)
    })
    return searchFooter
}

async function renderSearchView(rootEl: HTMLElement, searchView: SearchView): Promise<void> {
    const cachedSearchResults = ObjectsCache.get(searchView.getCacheKey())
    if (cachedSearchResults) {
        if (cachedSearchResults.isError) {
            await renderSearchFailure(rootEl, searchView, cachedSearchResults.data)
        } else {
            await renderSearchResultsOrError(rootEl, searchView, cachedSearchResults.data as IJiraSearchResults)
        }
    } else {
        // console.log(`Search results not available in the cache`)
        RC.renderLoadingItem('Loading...')
        const generation = LastGoodCache.generation()
        JiraClient.getSearchResults(searchView.query, { limit: searchView.limit || SettingsData.searchResultsLimit, account: searchView.account })
            .then(newSearchResults => {
                searchView.account = newSearchResults.account
                const searchResults = ObjectsCache.add(searchView.getCacheKey(), newSearchResults).data as IJiraSearchResults
                return renderSearchResultsOrError(rootEl, searchView, searchResults, () => rememberSearch(searchView, searchResults, generation))
            }, err => {
                ObjectsCache.add(searchView.getCacheKey(), err, true)
                return renderSearchFailure(rootEl, searchView, err)
            })
    }
}

export const SearchFenceRenderer = async (source: string, rootEl: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> => {
    // console.log(`Search query: ${source}`)
    try {
        await renderSearchView(rootEl, SearchView.fromString(source))
    } catch (err) {
        RC.renderSearchError(rootEl, err, null)
    }
}
