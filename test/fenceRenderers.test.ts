jest.mock('escape-string-regexp', () => (s: string) => s)
jest.mock('../src/main', () => ({ ObsidianApp: { vault: { getConfig: jest.fn() } } }))
jest.mock('../src/settings', () => ({
    SettingsData: { cacheTime: '15m', colorSchema: null, showColorBand: false, showJiraLink: false, searchResultsLimit: 10, cache: { columns: [] } }
}))
jest.mock('../src/api/apiBase', () => ({ getIssue: jest.fn() }))
jest.mock('../src/client/jiraClient', () => ({
    __esModule: true,
    default: { getSearchResults: jest.fn(), getApproximateCount: jest.fn(), customFieldsLoaded: jest.fn(() => Promise.resolve(true)) },
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
        setText(text: string) { this.textContent = text },
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
const chipIssue = (key: string) => ({ key, account: TestAccountOpen, fields: { summary: 'Summary', issuetype: { name: 'Task' }, status: { name: 'Done', statusCategory: { colorName: 'green' } } } })
const getSearchResultsMock = JiraClient.getSearchResults as jest.Mock
const getApproximateCountMock = JiraClient.getApproximateCount as jest.Mock

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

    test('a count that rendered stays shown when saving it fails', async () => {
        getSearchResultsMock.mockResolvedValueOnce({ total: 3, issues: [], account: TestAccountOpen })
        ;(LastGoodCache.rememberCount as jest.Mock).mockImplementationOnce(() => { throw new Error('Cannot save') })
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null)

        await CountFenceRenderer('project = EEE', buildRootElement(), null)
        await settle()

        expect(RC.renderSearchError).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalledTimes(1)
    })

    test('renders the count from the 2025 API, which has no total', async () => {
        const account2025 = { ...TestAccountOpen, use2025Api: true }
        getSearchResultsMock.mockResolvedValueOnce({ issues: [chipIssue('AAA-7')], isLast: true, account: account2025 })
        getApproximateCountMock.mockResolvedValueOnce(42)

        await CountFenceRenderer('project = ZZZ', buildRootElement(), null)
        await settle()

        const errorMessage = (RC.renderSearchError as jest.Mock).mock.calls[0]?.[1] ?? ''
        expect(errorMessage).toEqual('')
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

    test('results that rendered stay shown when saving them fails', async () => {
        getSearchResultsMock.mockResolvedValueOnce({ issues: [chipIssue('AAA-3')], account: TestAccountOpen })
        ;(LastGoodCache.rememberSearch as jest.Mock).mockImplementationOnce(() => { throw new Error('Cannot save') })
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null)

        await SearchFenceRenderer('type: LIST\nquery: project = EEE', buildRootElement(), null)
        await settle()

        expect(RC.renderSearchError).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalledWith('JiraIssue: unable to save the data for offline use', expect.any(Error))
    })

    test('a table with a custom field column given by name is not saved when the field names could not be loaded', async () => {
        getSearchResultsMock.mockResolvedValueOnce({ issues: [chipIssue('AAA-4')], account: TestAccountOpen })
        ;(JiraClient.customFieldsLoaded as jest.Mock).mockResolvedValueOnce(false)

        await SearchFenceRenderer('type: TABLE\nquery: project = FFF\ncolumns: KEY, $Team', buildRootElement(), null)
        await settle()

        expect(RC.renderSearchError).not.toHaveBeenCalled()
        expect(LastGoodCache.rememberSearch).not.toHaveBeenCalled()
    })

    test('a table with a custom field column given by name is saved once the field names are loaded', async () => {
        getSearchResultsMock.mockResolvedValueOnce({ issues: [chipIssue('AAA-5')], account: TestAccountOpen })

        await SearchFenceRenderer('type: TABLE\nquery: project = GGG\ncolumns: KEY, $Team', buildRootElement(), null)
        await settle()

        expect(JiraClient.customFieldsLoaded).toHaveBeenCalledWith(TestAccountOpen)
        expect(LastGoodCache.rememberSearch).toHaveBeenCalledWith('project = GGG|TABLE:KEY,CUSTOM_FIELD.Team', expect.anything(), expect.anything(), 0)
    })

    test.each([
        ['a list', 'type: LIST\nquery: project = HHH', 'project = HHH|LIST'],
        ['a table without custom field columns given by name', 'type: TABLE\nquery: project = HHH\ncolumns: KEY, $10010, $Epic Link', 'project = HHH|TABLE:KEY,CUSTOM_FIELD.10010,CUSTOM_FIELD.Epic Link'],
    ])('%s is saved without waiting for the field names', async (_view, source, savedKey) => {
        getSearchResultsMock.mockResolvedValueOnce({ issues: [chipIssue('AAA-6')], account: TestAccountOpen })

        await SearchFenceRenderer(source, buildRootElement(), null)
        await settle()

        expect(RC.renderSearchError).not.toHaveBeenCalled()
        expect(JiraClient.customFieldsLoaded).not.toHaveBeenCalled()
        expect(LastGoodCache.rememberSearch).toHaveBeenCalledWith(savedKey, expect.anything(), expect.anything(), 0)
    })
})

export { }
