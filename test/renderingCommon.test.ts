jest.mock('../src/main', () => {
    return { ObsidianApp: { vault: { getConfig: jest.fn() } } }
})
jest.mock('../src/settings', () => {
    return {
        SettingsData: {
            colorSchema: null,
            issueSummaryMaxWidthRem: 20,
            issueStatusMaxWidthRem: 2,
            showColorBand: false,
        }
    }
})

import { SettingsData } from '../src/settings'
import RC, { JIRA_DEFAULT_ISSUE_ICON, JIRA_DEFAULT_PRIORITY_ICON, JIRA_ISSUE_TYPE_ICON_MAP, JIRA_PRIORITY_ICON_MAP } from '../src/rendering/renderingCommon'
import { EColorSchema } from '../src/interfaces/settingsInterfaces'
import * as main from '../src/main'
import { TestAccountOpen } from './testData'

const kLightCSSClass = 'is-light'
const kDarkCSSClass = 'is-dark'

interface FakeElement {
    className: string
    textContent: string
    title: string
    attributes: Record<string, string>
    children: FakeElement[]
    appendChild: (child: FakeElement) => FakeElement
    onNodeInserted: jest.Mock
}

function createFakeElement(options: any = {}): FakeElement {
    if (typeof options === 'string') {
        options = { cls: options }
    }
    const element: FakeElement = {
        className: options.cls || '',
        textContent: options.text || '',
        title: options.title || '',
        attributes: options.attr || {},
        children: [],
        appendChild(child: FakeElement) {
            this.children.push(child)
            return child
        },
        onNodeInserted: jest.fn(),
    }
    if (options.parent) {
        options.parent.appendChild(element)
    }
    return element
}

const originalCreateDiv = (global as any).createDiv
const originalCreateSpan = (global as any).createSpan
const originalCreateEl = (global as any).createEl

beforeAll(() => {
    ;(global as any).createDiv = (options: any) => createFakeElement(options)
    ;(global as any).createSpan = (options: any) => createFakeElement(options)
    ;(global as any).createEl = (_tag: string, options: any) => createFakeElement(options)
})

afterAll(() => {
    ;(global as any).createDiv = originalCreateDiv
    ;(global as any).createSpan = originalCreateSpan
    ;(global as any).createEl = originalCreateEl
})

// @ts-ignore
const getConfigMock: jest.Mock = main.ObsidianApp.vault.getConfig

describe('RenderingCommon', () => {
    describe('getTheme', () => {
        test('Light', () => {
            SettingsData.colorSchema = EColorSchema.LIGHT
            expect(RC.getTheme()).toEqual(kLightCSSClass)
        })
        test('Dark', () => {
            SettingsData.colorSchema = EColorSchema.DARK
            expect(RC.getTheme()).toEqual(kDarkCSSClass)
        })
        test('Not Set', () => {
            SettingsData.colorSchema = null
            expect(RC.getTheme()).toEqual(kLightCSSClass)
        })
        test('Follow Obsidian - Light', () => {
            getConfigMock.mockReturnValueOnce('moonstone')
            SettingsData.colorSchema = EColorSchema.FOLLOW_OBSIDIAN
            expect(RC.getTheme()).toEqual(kLightCSSClass)
        })
        test('Follow Obsidian - Dark', () => {
            getConfigMock.mockReturnValueOnce('obsidian')
            SettingsData.colorSchema = EColorSchema.FOLLOW_OBSIDIAN
            expect(RC.getTheme()).toEqual(kDarkCSSClass)
        })
    })

    describe('renderIssue', () => {
        const issue = {
            key: 'AAA-123',
            account: TestAccountOpen,
            fields: {
                issuetype: { iconUrl: null, name: 'Task' },
                summary: 'A long issue summary',
                status: {
                    name: 'A very long status',
                    description: 'Status description',
                    statusCategory: { colorName: 'blue-gray' },
                },
            },
        } as any

        test('renders summary and status as single-line overflow tags', () => {
            const renderedIssue = RC.renderIssue(issue) as any as FakeElement
            const summary = renderedIssue.children.find(child => child.className.includes('issue-summary'))
            const status = renderedIssue.children.find(child => child.className.includes('issue-status'))

            expect(summary).toBeDefined()
            expect(summary.attributes.style).toEqual('max-width: 20rem')
            expect(summary.children[0].children[0].textContent).toEqual(issue.fields.summary)
            expect(status).toBeDefined()
            expect(status.attributes.style).toEqual('max-width: 2rem')
            expect(status.children[0].children[0].textContent).toEqual(issue.fields.status.name)
        })

        test('keeps the bounded status but omits the summary in compact mode', () => {
            const renderedIssue = RC.renderIssue(issue, true) as any as FakeElement

            expect(renderedIssue.children.some(child => child.className.includes('issue-summary'))).toEqual(false)
            expect(renderedIssue.children.some(child => child.className.includes('issue-status'))).toEqual(true)
        })
    })

    describe('web links', () => {
        test('uses webBaseUrl and strips trailing slashes', () => {
            const account = { ...TestAccountOpen, webBaseUrl: 'https://jira.mycompany.com///' }

            expect(RC.issueUrl(account, 'AAA-123')).toBe('https://jira.mycompany.com/browse/AAA-123')
            expect(RC.searchUrl(account, 'project = TEST')).toBe('https://jira.mycompany.com/issues/?jql=project%20=%20TEST')
        })

        test('falls back to host when webBaseUrl is empty', () => {
            const account = { ...TestAccountOpen, webBaseUrl: '', host: 'https://jira.mycompany.com///' }

            expect(RC.issueUrl(account, 'AAA-123')).toBe('https://jira.mycompany.com/browse/AAA-123')
            expect(RC.searchUrl(account, 'project = TEST')).toBe('https://jira.mycompany.com/issues/?jql=project%20=%20TEST')
        })
    })

    describe('icon mappings', () => {
        test('contains standard Jira issue type and priority SVG URLs', () => {
            expect(JIRA_ISSUE_TYPE_ICON_MAP['bug']).toContain('icon-object/svgs_raw/bug/16.svg')
            expect(JIRA_ISSUE_TYPE_ICON_MAP['task']).toContain('icon-object/svgs_raw/task/16.svg')
            expect(JIRA_ISSUE_TYPE_ICON_MAP['subtask']).toContain('icon-object/svgs_raw/subtask/16.svg')
            expect(JIRA_DEFAULT_ISSUE_ICON).toBe(JIRA_ISSUE_TYPE_ICON_MAP['issue'])

            expect(JIRA_PRIORITY_ICON_MAP['high']).toContain('icon/icons_raw/core/priority-high.svg')
            expect(JIRA_PRIORITY_ICON_MAP['critical']).toContain('icon/icons_raw/core/priority-critical.svg')
            expect(JIRA_DEFAULT_PRIORITY_ICON).toContain('icon/icons_raw/core/question-circle.svg')
        })
    })

    afterEach(() => {
        jest.clearAllMocks()
    })
})

export { }
