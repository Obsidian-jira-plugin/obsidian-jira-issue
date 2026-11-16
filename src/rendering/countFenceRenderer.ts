import { MarkdownPostProcessorContext } from "obsidian"
import { IJiraSearchResults } from "../interfaces/issueInterfaces"
import JiraClient from "../client/jiraClient"
import LastGoodCache from "../lastGoodCache"
import ObjectsCache from "../objectsCache"
import RC, { IStaleInfo } from "./renderingCommon"
import { SearchView } from "../searchView"

function renderSearchCount(el: HTMLElement, searchResults: IJiraSearchResults, searchView: SearchView, stale: IStaleInfo = null): void {
    const tagsRow = createDiv('ji-tags has-addons')
    RC.renderAccountColorBand(searchResults.account, tagsRow)
    if (searchView.label !== '') {
        createSpan({ cls: `ji-tag is-link ${RC.getTheme()}`, text: searchView.label || `Count`, title: searchView.query, parent: tagsRow })
    }
    createSpan({ cls: `ji-tag ${RC.getTheme()}`, text: searchResults.total.toString(), title: searchView.query, parent: tagsRow })
    if (stale) {
        RC.renderStaleMarker(tagsRow, 'this count', stale)
    }
    el.replaceChildren(RC.renderContainer([tagsRow]))
}

// For a count Jira returned: if it cannot be rendered, the error is shown, not the saved count,
// since Jira did answer. onRendered (saving the count) only runs after a render
function renderSearchCountOrError(el: HTMLElement, searchResults: IJiraSearchResults, searchView: SearchView, onRendered: () => void = null): void {
    try {
        renderSearchCount(el, searchResults, searchView)
    } catch (err) {
        RC.renderSearchError(el, String(err), searchView)
        return
    }
    RC.saveRendered(onRendered)
}

function renderSearchCountFailure(el: HTMLElement, searchView: SearchView, error: unknown): void {
    RC.renderSavedOrError(LastGoodCache.getCount(searchView.getCacheKey()), error,
        (searchResults: IJiraSearchResults, stale: IStaleInfo) => renderSearchCount(el, searchResults, searchView, stale),
        () => RC.renderSearchError(el, error as string, searchView))
}

// jira-search caches its results under the same key, and a count has neither its issues nor
// (with the 2025 API) does a search have the count
function countCacheKey(searchView: SearchView): string {
    return `count:${searchView.getCacheKey()}`
}

export const CountFenceRenderer = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> => {
    // console.log(`Search query: ${source}`)
    const searchView = SearchView.fromString(source)
    const cachedSearchResults = ObjectsCache.get(countCacheKey(searchView))
    if (cachedSearchResults) {
        if (cachedSearchResults.isError) {
            renderSearchCountFailure(el, searchView, cachedSearchResults.data)
        } else {
            renderSearchCountOrError(el, (cachedSearchResults.data as IJiraSearchResults), searchView)
        }
    } else {
        RC.renderLoadingItem('Loading...')
        const generation = LastGoodCache.generation()
        JiraClient.getSearchCount(searchView.query, { account: searchView.account })
            .then(newSearchResults => {
                const searchResults = ObjectsCache.add(countCacheKey(searchView), newSearchResults).data as IJiraSearchResults
                renderSearchCountOrError(el, searchResults, searchView, () => LastGoodCache.rememberCount(searchView.getCacheKey(), searchResults, generation))
            }, err => {
                ObjectsCache.add(countCacheKey(searchView), err, true)
                renderSearchCountFailure(el, searchView, err)
            })
    }
}
