jest.mock('escape-string-regexp', () => (s: string) => s)
jest.mock('../src/main', () => ({ ObsidianApp: { vault: { getConfig: jest.fn() } } }))
jest.mock('../src/settings', () => ({
    SettingsData: { cacheTime: '15m', colorSchema: null, showColorBand: false, showJiraLink: false, searchResultsLimit: 10, cache: { columns: [] } }
}))
jest.mock('../src/api/apiBase', () => ({ getIssue: jest.fn() }))
jest.mock('../src/client/jiraClient', () => ({
    __esModule: true,
    default: { getSearchResults: jest.fn(), customFieldsLoaded: jest.fn(() => Promise.resolve()) },
}))
jest.mock('../src/lastGoodCache', () => ({
    __esModule: true,
    trimIssueForChip: jest.fn(),
    default: {
        generation: jest.fn(() => 0),
        getCount: jest.fn(),
        rememberCount: jest.fn(),
        getSearch: jest.fn(),
        rememberSearch: jest.fn(),
        getIssue: jest.fn(),
    },
}))

import JiraClient from '../src/client/jiraClient'
import LastGoodCache from '../src/lastGoodCache'
import ObjectsCache from '../src/objectsCache'
import { CountFenceRenderer } from '../src/rendering/countFenceRenderer'
import RC from '../src/rendering/renderingCommon'
import { SearchFenceRenderer } from '../src/rendering/searchFenceRenderer'
import { TestAccountOpen } from './testData'

function createFakeElement(options: any = {}): any {
    if (typeof options === 'string') {
        options = { cls: options }
    }
    const element: any = {
        className: options.cls || '',
        textContent: options.text || '',
        children: [],
        appendChild(child: any) { this.children.push(child); return child },
        prepend(child: any) { this.children.unshift(child) },
        appendText: jest.fn(),
        onClickEvent: jest.fn(),
        onNodeInserted: jest.fn(),
    }
    if (options.parent) {
        options.parent.appendChild(element)
    }
    return element
}

function buildRootElement(): any {
    return { replaceChildren: jest.fn(), empty: jest.fn() }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const getSearchResultsMock = JiraClient.getSearchResults as jest.Mock

beforeAll(() => {
    (global as any).createDiv = (options: any) => createFakeElement(options)
    ;(global as any).createSpan = (options: any) => createFakeElement(options)
    ;(global as any).createEl = (_tag: string, options: any) => createFakeElement(options)
})

beforeEach(() => {
    ObjectsCache.clear()
    jest.spyOn(RC, 'renderSearchError')
    jest.spyOn(RC, 'renderStaleMarker')
})

afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
})

describe('CountFenceRenderer', () => {
    test('a count Jira returned that cannot be rendered shows the error, not the saved count', async () => {
        getSearchResultsMock.mockResolvedValueOnce({ total: undefined, issues: [], account: TestAccountOpen })

        await CountFenceRenderer('project = AAA', buildRootElement(), null)
        await settle()

        expect(RC.renderSearchError).toHaveBeenCalledTimes(1)
        expect(LastGoodCache.getCount).not.toHaveBeenCalled()
        expect(LastGoodCache.rememberCount).not.toHaveBeenCalled()
        expect(ObjectsCache.get('project = AAA').isError).toEqual(false)
    })

    test('a failed fetch shows the saved count', async () => {
        getSearchResultsMock.mockRejectedValueOnce(new Error('Timeout'))
        ;(LastGoodCache.getCount as jest.Mock).mockReturnValueOnce({ updateTime: 0, data: { total: 7, issues: [], account: TestAccountOpen } })

        await CountFenceRenderer('project = BBB', buildRootElement(), null)
        await settle()

        expect(RC.renderStaleMarker).toHaveBeenCalledTimes(1)
        expect(RC.renderSearchError).not.toHaveBeenCalled()
        expect(ObjectsCache.get('project = BBB').isError).toEqual(true)
    })
})

describe('SearchFenceRenderer', () => {
    test('results Jira returned that cannot be rendered show the error, not the saved results', async () => {
        getSearchResultsMock.mockResolvedValueOnce({ issues: [{ key: 'AAA-1', fields: {} }], account: TestAccountOpen })

        await SearchFenceRenderer('type: LIST\nquery: project = AAA', buildRootElement(), null)
        await settle()

        expect(RC.renderSearchError).toHaveBeenCalledTimes(1)
        expect(LastGoodCache.getSearch).not.toHaveBeenCalled()
        expect(LastGoodCache.rememberSearch).not.toHaveBeenCalled()
        expect(ObjectsCache.get('project = AAA').isError).toEqual(false)
    })

    test('rendered results are saved under the key of their view', async () => {
        const issue = { key: 'AAA-2', account: TestAccountOpen, fields: { summary: 'Summary', issuetype: { name: 'Task' }, status: { name: 'Done', statusCategory: { colorName: 'green' } } } }
        getSearchResultsMock.mockResolvedValueOnce({ issues: [issue], account: TestAccountOpen })

        await SearchFenceRenderer('type: LIST\nquery: project = CCC', buildRootElement(), null)
        await settle()

        expect(RC.renderSearchError).not.toHaveBeenCalled()
        expect(LastGoodCache.rememberSearch).toHaveBeenCalledWith('project = CCC|LIST', expect.anything(), expect.anything(), 0)
    })

    test('a failed fetch looks up the saved results of the same view', async () => {
        getSearchResultsMock.mockRejectedValueOnce(new Error('Timeout'))

        await SearchFenceRenderer('type: LIST\nquery: project = DDD', buildRootElement(), null)
        await settle()

        expect(LastGoodCache.getSearch).toHaveBeenCalledWith('project = DDD|LIST')
        expect(RC.renderSearchError).toHaveBeenCalledTimes(1)
    })
})

export { }
