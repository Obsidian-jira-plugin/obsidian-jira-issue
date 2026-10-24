jest.mock('escape-string-regexp', () => (s: string) => s)
jest.mock('../src/main', () => ({
    ObsidianApp: { vault: { getConfig: jest.fn() } }
}))

import { formatCopyTemplate, renderTableColumn } from '../src/rendering/renderTableColumns'
import { SettingsData } from '../src/settings'
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
})
