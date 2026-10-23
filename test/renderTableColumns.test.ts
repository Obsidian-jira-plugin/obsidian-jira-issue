jest.mock('escape-string-regexp', () => (s: string) => s)
jest.mock('../src/main', () => ({
    ObsidianApp: { vault: { getConfig: jest.fn() } }
}))
jest.mock('../src/api/apiBase', () => ({ getIssue: jest.fn() }))
jest.mock('../src/client/jiraClient', () => ({ __esModule: true, default: { getDevStatus: jest.fn() } }))

import { getIssue } from '../src/api/apiBase'
import JiraClient from '../src/client/jiraClient'
import { renderTableColumn } from '../src/rendering/renderTableColumns'
import { ESearchColumnsTypes, ISearchColumn } from '../src/interfaces/settingsInterfaces'
import { IJiraIssue } from '../src/interfaces/issueInterfaces'
import { TestAccountOpen } from './testData'

describe('renderTableColumns', () => {
    beforeAll(() => {
        (global as any).createEl = (tag: string, options: any = {}) => {
            const el = {
                tagName: tag,
                text: options.text || '',
                textContent: options.text || '',
                href: options.href || '',
                title: options.title || '',
                children: [] as any[],
                parent: options.parent,
                setText: function(t: string) { this.textContent = t }
            }
            if (options.parent) {
                if (options.parent.cells) {
                    options.parent.cells.push(el)
                }
                if (options.parent.children) {
                    options.parent.children.push(el)
                }
            }
            return el
        }
        ;(global as any).createSpan = (options: any = {}) => (global as any).createEl('span', options)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    test('renders EPIC NAME custom field column as a link from issue.fields.parent', async () => {
        const columns: ISearchColumn[] = [
            { type: ESearchColumnsTypes.CUSTOM_FIELD, compact: false, extra: 'EPIC NAME' }
        ]
        const mockIssue: IJiraIssue = {
            id: '10001',
            key: 'TASK-1',
            fields: {
                summary: 'Task summary',
                parent: {
                    id: '10000',
                    key: 'EPIC-1',
                    fields: {
                        summary: 'Project Overhaul Epic',
                        issuetype: { name: 'Epic' }
                    }
                }
            } as any,
            account: {
                ...TestAccountOpen,
                cache: {
                    ...TestAccountOpen.cache,
                    customFieldsNameToId: {
                        'EPIC NAME': 'VIRTUAL_EPIC_NAME'
                    }
                }
            }
        }

        const row = { cells: [] } as any
        await renderTableColumn(columns, mockIssue, row)

        expect(row.cells.length).toEqual(1)
        const cell = row.cells[0]
        expect(cell.children.length).toEqual(1)
        expect(cell.children[0].tagName).toEqual('a')
        expect(cell.children[0].text).toEqual('EPIC-1: Project Overhaul Epic')
        expect(cell.children[0].href).toEqual('https://test-company.atlassian.net/browse/EPIC-1')
    })

    test('renders EPIC NAME for subtask with nested grandparent epic', async () => {
        const columns: ISearchColumn[] = [
            { type: ESearchColumnsTypes.CUSTOM_FIELD, compact: false, extra: 'EPIC NAME' }
        ]
        const mockIssue: IJiraIssue = {
            id: '10002',
            key: 'SUB-1',
            fields: {
                summary: 'Subtask summary',
                issuetype: { name: 'Sub-task', subtask: true },
                parent: {
                    id: '10001',
                    key: 'STORY-10',
                    fields: {
                        summary: 'Parent Story Summary',
                        issuetype: { name: 'Story' },
                        parent: {
                            id: '10000',
                            key: 'EPIC-99',
                            fields: { summary: 'Grandparent Epic' }
                        }
                    }
                }
            } as any,
            account: {
                ...TestAccountOpen,
                cache: {
                    ...TestAccountOpen.cache,
                    customFieldsNameToId: {
                        'EPIC NAME': 'VIRTUAL_EPIC_NAME'
                    }
                }
            }
        }

        const row = { cells: [] } as any
        await renderTableColumn(columns, mockIssue, row)

        expect(row.cells.length).toEqual(1)
        const cell = row.cells[0]
        expect(cell.children.length).toEqual(1)
        expect(cell.children[0].tagName).toEqual('a')
        expect(cell.children[0].text).toEqual('EPIC-99: Grandparent Epic')
        expect(cell.children[0].href).toEqual('https://test-company.atlassian.net/browse/EPIC-99')
    })

    describe('offline (saved results shown while Jira is unreachable)', () => {
        const epicLinkIssue = (): IJiraIssue => ({
            id: '10003',
            key: 'TASK-3',
            fields: {
                summary: 'Task summary',
                customfield_10014: 'EPIC-7',
            } as any,
            account: {
                ...TestAccountOpen,
                cache: {
                    ...TestAccountOpen.cache,
                    customFieldsNameToId: { 'EPIC LINK': '10014' }
                }
            }
        })
        const epicLinkColumns: ISearchColumn[] = [
            { type: ESearchColumnsTypes.CUSTOM_FIELD, compact: false, extra: 'EPIC LINK' }
        ]

        test('looks up the Epic summary when online', async () => {
            ;(getIssue as jest.Mock).mockResolvedValueOnce({ fields: { summary: 'Epic summary' } })

            const row = { cells: [] } as any
            await renderTableColumn(epicLinkColumns, epicLinkIssue(), row)

            expect(getIssue).toHaveBeenCalledTimes(1)
            expect(row.cells[0].children[0].text).toEqual('EPIC-7: Epic summary')
        })

        test('shows the Epic key without looking it up', async () => {
            const row = { cells: [] } as any
            await renderTableColumn(epicLinkColumns, epicLinkIssue(), row, true)

            expect(getIssue).not.toHaveBeenCalled()
            expect(row.cells[0].children[0].text).toEqual('EPIC-7')
        })

        test('shows no dev status instead of fetching it', async () => {
            const row = { cells: [] } as any
            await renderTableColumn([{ type: ESearchColumnsTypes.DEV_STATUS, compact: false, extra: '' }], epicLinkIssue(), row, true)

            expect(JiraClient.getDevStatus).not.toHaveBeenCalled()
            expect(row.cells[0].children[0].textContent).toEqual('-')
        })
    })
})
