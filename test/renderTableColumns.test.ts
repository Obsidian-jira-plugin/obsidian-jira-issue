jest.mock('escape-string-regexp', () => (s: string) => s)
jest.mock('../src/main', () => ({
    ObsidianApp: { vault: { getConfig: jest.fn() } }
}))
jest.mock('../src/api/apiBase', () => ({ getIssue: jest.fn() }))
jest.mock('../src/client/jiraClient', () => ({ __esModule: true, default: { getDevStatus: jest.fn() } }))
jest.mock('../src/rendering/issueNote', () => ({
    ...jest.requireActual('../src/rendering/issueNote'),
    openOrCreateIssueNote: jest.fn(),
}))

import { getIssue } from '../src/api/apiBase'
import JiraClient from '../src/client/jiraClient'
import { formatCopyTemplate, hasCustomFieldColumnsByName, renderTableColumn, trimIssueForColumns } from '../src/rendering/renderTableColumns'
import { SettingsData } from '../src/settings'
import { ESearchColumnsTypes, ISearchColumn } from '../src/interfaces/settingsInterfaces'
import { IJiraIssue, toDefaultedIssue } from '../src/interfaces/issueInterfaces'
import { TestAccountOpen } from './testData'
import RC from '../src/rendering/renderingCommon'
import { openOrCreateIssueNote } from '../src/rendering/issueNote'

describe('renderTableColumns', () => {
    beforeAll(() => {
        (global as any).createEl = (tag: string, options: any = {}) => {
            const el = {
                tagName: tag,
                text: options.text || '',
                textContent: options.text || '',
                href: options.href || '',
                title: options.title || '',
                cls: options.cls || '',
                listeners: {} as Record<string, (event: any) => void>,
                addEventListener: function(type: string, listener: (event: any) => void) { this.listeners[type] = listener },
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

    const originalPrefix = SettingsData.inlineIssuePrefix
    afterEach(() => {
        SettingsData.inlineIssuePrefix = originalPrefix
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

    test('formatCopyTemplate fills placeholders and keeps unknown ones', () => {
        SettingsData.inlineIssuePrefix = 'JIRA:'
        const issue = {
            key: 'TASK-1',
            fields: { summary: 'Fix login', status: { name: 'Done' }, assignee: null },
            account: TestAccountOpen,
        } as any

        expect(formatCopyTemplate('{prefix}{key}', issue)).toEqual('JIRA:TASK-1')
        expect(formatCopyTemplate('- {key} {summary} [{status}] {assignee}{nope}', issue)).toEqual('- TASK-1 Fix login [Done] {nope}')
        expect(formatCopyTemplate('{url}', issue)).toEqual('https://test-company.atlassian.net/browse/TASK-1')
    })

    test('formatCopyTemplate ignores Object.prototype member names', () => {
        const issue = { key: 'TASK-1', fields: {}, account: TestAccountOpen } as any

        expect(formatCopyTemplate('{constructor}{__proto__}{toString}', issue)).toEqual('{constructor}{__proto__}{toString}')
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
            (getIssue as jest.Mock).mockResolvedValueOnce({ fields: { summary: 'Epic summary' } })

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

        test('shows the assignee name from trimmed results in a compact column', async () => {
            const columns: ISearchColumn[] = [{ type: ESearchColumnsTypes.ASSIGNEE, compact: true, extra: '' }]
            const issue = trimIssueForColumns({
                ...epicLinkIssue(),
                fields: { assignee: { displayName: 'Jane Doe', emailAddress: 'jane@example.com', avatarUrls: { '16x16': 'data:image/png;base64,AAAA' } } } as any,
            }, columns)

            const row = { cells: [] } as any
            await renderTableColumn(columns, toDefaultedIssue({ ...issue, account: TestAccountOpen }), row, true)

            expect(row.cells[0].textContent).toEqual('Jane Doe')
        })

        test('shows the Epic key found in a custom field without an Epic Link mapping', async () => {
            const issue: IJiraIssue = {
                id: '10006',
                key: 'TASK-6',
                fields: {
                    summary: 'Task summary',
                    customfield_10100: 'Some text',
                    customfield_10200: 'EPIC-9',
                    customfield_10300: { key: 'EPIC-8', summary: 'Epic summary', self: 'https://host/rest/api/2/issue/10008', colorKey: 'blue' },
                } as any,
                account: TestAccountOpen,
            }
            const trimmed = trimIssueForColumns(issue, epicLinkColumns)

            expect(trimmed.fields).toEqual({
                customfield_10200: 'EPIC-9',
                customfield_10300: { key: 'EPIC-8', summary: 'Epic summary' },
            })

            const row = { cells: [] } as any
            await renderTableColumn(epicLinkColumns, { ...trimmed, account: TestAccountOpen }, row, true)

            expect(getIssue).not.toHaveBeenCalled()
            expect(row.cells[0].children[0].text).toEqual('EPIC-9')
        })

        test('shows no dev status instead of fetching it', async () => {
            const row = { cells: [] } as any
            await renderTableColumn([{ type: ESearchColumnsTypes.DEV_STATUS, compact: false, extra: '' }], epicLinkIssue(), row, true)

            expect(JiraClient.getDevStatus).not.toHaveBeenCalled()
            expect(row.cells[0].children[0].textContent).toEqual('-')
        })
    })

    describe('trimIssueForColumns', () => {
        test('keeps only the fields the columns render, and people by name only', () => {
            const parent = { key: 'EPIC-1', fields: { summary: 'Epic summary' } }
            const issue = {
                id: '10004',
                key: 'TASK-4',
                account: {
                    ...TestAccountOpen,
                    cache: { ...TestAccountOpen.cache, customFieldsNameToId: { 'EPIC LINK': '10014', 'Story Points': '10016' } },
                },
                fields: {
                    summary: 'Task summary',
                    description: 'Not shown by any column',
                    status: { name: 'Done', statusCategory: { colorName: 'green' } },
                    reporter: { displayName: 'Jane Doe', emailAddress: 'jane@example.com', accountId: '712020:abc', avatarUrls: { '16x16': 'data:image/png;base64,AAAA' } },
                    comment: { comments: [{ body: 'Not shown either' }] },
                    parent,
                    customfield_10014: 'EPIC-7',
                    customfield_10016: 5,
                    customfield_10099: 'Unused custom field',
                },
            } as any
            const columns: ISearchColumn[] = [
                { type: ESearchColumnsTypes.KEY, compact: false, extra: '' },
                { type: ESearchColumnsTypes.SUMMARY, compact: false, extra: '' },
                { type: ESearchColumnsTypes.STATUS, compact: false, extra: '' },
                { type: ESearchColumnsTypes.REPORTER, compact: true, extra: '' },
                { type: ESearchColumnsTypes.CUSTOM_FIELD, compact: false, extra: 'EPIC LINK' },
                { type: ESearchColumnsTypes.CUSTOM_FIELD, compact: false, extra: 'Story Points' },
            ]

            expect(trimIssueForColumns(issue, columns)).toEqual({
                id: '10004',
                key: 'TASK-4',
                account: null,
                fields: {
                    summary: 'Task summary',
                    status: { name: 'Done', statusCategory: { colorName: 'green' } },
                    reporter: { displayName: 'Jane Doe' },
                    parent,
                    customfield_10014: 'EPIC-7',
                    customfield_10016: 5,
                },
            })
        })

        test('keeps what the copy column template can use, people by name only', () => {
            const issue = {
                id: '10005',
                key: 'TASK-5',
                account: TestAccountOpen,
                fields: {
                    summary: 'Fix login',
                    description: 'Not used by the copy column',
                    status: { name: 'Done' },
                    labels: ['backend'],
                    assignee: { displayName: 'Jane Doe', emailAddress: 'jane@example.com' },
                },
            } as any

            const trimmed = trimIssueForColumns(issue, [{ type: ESearchColumnsTypes.COPY_TO_CLIPBOARD, compact: false, extra: '' }])

            expect(trimmed.fields).toEqual({
                summary: 'Fix login',
                status: { name: 'Done' },
                labels: ['backend'],
                assignee: { displayName: 'Jane Doe' },
            })
            expect(formatCopyTemplate('{key} {summary} [{status}] {assignee}', { ...trimmed, account: TestAccountOpen })).toEqual('TASK-5 Fix login [Done] Jane Doe')
        })
    })

    describe('hasCustomFieldColumnsByName', () => {
        const customField = (extra: string): ISearchColumn => ({ type: ESearchColumnsTypes.CUSTOM_FIELD, compact: false, extra })

        test('is true for a custom field column given by name', () => {
            expect(hasCustomFieldColumnsByName([{ type: ESearchColumnsTypes.KEY, compact: false, extra: '' }, customField('Team')])).toEqual(true)
        })

        test('is false for custom field columns given by id, Epic or Parent', () => {
            expect(hasCustomFieldColumnsByName([customField('10010'), customField('Epic Link'), customField('PARENT')])).toEqual(false)
        })

        test('is false without custom field columns', () => {
            expect(hasCustomFieldColumnsByName([{ type: ESearchColumnsTypes.KEY, compact: false, extra: '' }])).toEqual(false)
        })
    })
    describe('NOTES column create link', () => {
        const notesColumn: ISearchColumn[] = [{ type: ESearchColumnsTypes.NOTES, compact: false }]
        const issue = { id: '1', key: 'AAA-1', fields: {}, account: TestAccountOpen } as unknown as IJiraIssue

        beforeEach(() => {
            jest.spyOn(RC, 'getNotes').mockReturnValue([])
        })

        test('click creates or opens the note through the plugin', async () => {
            const row = { cells: [] } as any
            await renderTableColumn(notesColumn, issue, row)
            const link = row.cells[0].children[0]
            expect(link.text).toEqual('➕')
            const event = { preventDefault: jest.fn() }
            link.listeners.click(event)
            expect(event.preventDefault).toHaveBeenCalled()
            expect(openOrCreateIssueNote).toHaveBeenCalledWith('AAA-1', false)
        })

        test('middle click opens the note in a new tab', async () => {
            const row = { cells: [] } as any
            await renderTableColumn(notesColumn, issue, row)
            const link = row.cells[0].children[0]
            link.listeners.auxclick({ button: 2, preventDefault: jest.fn() })
            expect(openOrCreateIssueNote).not.toHaveBeenCalled()
            link.listeners.auxclick({ button: 1, preventDefault: jest.fn() })
            expect(openOrCreateIssueNote).toHaveBeenCalledWith('AAA-1', 'tab')
        })
    })
})
