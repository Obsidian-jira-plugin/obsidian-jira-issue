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

// Keep showing the last count fetched successfully, flagged as stale, instead of the error
function renderSearchCountFailure(el: HTMLElement, searchView: SearchView, error: unknown): void {
    const lastGood = LastGoodCache.getCount(searchView.getCacheKey())
    if (lastGood) {
        try {
            renderSearchCount(el, lastGood.data, searchView, { updateTime: lastGood.updateTime, error })
            return
        } catch {
            // A saved count that cannot be rendered falls back to the error
        }
    }
    RC.renderSearchError(el, error as string, searchView)
}

export const CountFenceRenderer = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> => {
    // console.log(`Search query: ${source}`)
    const searchView = SearchView.fromString(source)
    const cachedSearchResults = ObjectsCache.get(searchView.getCacheKey())
    if (cachedSearchResults) {
        if (cachedSearchResults.isError) {
            renderSearchCountFailure(el, searchView, cachedSearchResults.data)
        } else {
            renderSearchCount(el, (cachedSearchResults.data as IJiraSearchResults), searchView)
        }
    } else {
        RC.renderLoadingItem('Loading...')
        JiraClient.getSearchResults(searchView.query, { limit: 1 }).then(newSearchResults => {
            const searchResults = ObjectsCache.add(searchView.getCacheKey(), newSearchResults).data as IJiraSearchResults
            renderSearchCount(el, searchResults, searchView)
            LastGoodCache.rememberCount(searchView.getCacheKey(), searchResults)
        }).catch(err => {
            ObjectsCache.add(searchView.getCacheKey(), err, true)
            renderSearchCountFailure(el, searchView, err)
        })
    }
}
