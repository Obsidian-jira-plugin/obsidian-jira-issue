jest.mock('../src/main', () => ({
    ObsidianApp: {
        vault: {
            getAbstractFileByPath: jest.fn(),
            getMarkdownFiles: jest.fn(),
            read: jest.fn(),
            create: jest.fn(),
            createFolder: jest.fn(),
        },
        fileManager: { getNewFileParent: jest.fn() },
        workspace: { getLeaf: jest.fn() },
    }
}))
jest.mock('../src/settings', () => ({
    SettingsData: { notesPath: '', notesTemplate: '' }
}))

import { Notice, TFile, TFolder } from 'obsidian'
import { ObsidianApp } from '../src/main'
import { SettingsData } from '../src/settings'
import { issueNoteMatcher, issueNotePath, openOrCreateIssueNote } from '../src/rendering/issueNote'

function file(path: string): TFile {
    const f = new TFile()
    f.path = path
    ;(f as any).name = path.split('/').pop()
    return f
}

function folder(path: string): TFolder {
    const f = new TFolder()
    f.path = path
    return f
}

describe('issueNote', () => {
    const vault = ObsidianApp.vault as unknown as Record<string, jest.Mock>
    const getNewFileParent = ObsidianApp.fileManager.getNewFileParent as jest.Mock
    const openFile = jest.fn()
    let files: Record<string, unknown>

    beforeEach(() => {
        jest.clearAllMocks()
        SettingsData.notesPath = ''
        SettingsData.notesTemplate = ''
        files = {}
        vault.getAbstractFileByPath.mockImplementation((path: string) => files[path] ?? null)
        vault.getMarkdownFiles.mockImplementation(() => Object.values(files).filter(f => f instanceof TFile && f.path.endsWith('.md')))
        vault.create.mockImplementation(async (path: string) => file(path))
        vault.createFolder.mockImplementation(async (path: string) => { files[path] = folder(path) })
        getNewFileParent.mockReturnValue(folder('/'))
        ;(ObsidianApp.workspace.getLeaf as jest.Mock).mockReturnValue({ openFile })
    })

    describe('issueNotePath', () => {
        test('without template: <key>.md in the default location for new notes', () => {
            expect(issueNotePath('AAA-1', '')).toBe('AAA-1.md')
            getNewFileParent.mockReturnValue(folder('Inbox'))
            expect(issueNotePath('AAA-1', '')).toBe('Inbox/AAA-1.md')
        })

        test('without template: next to the note containing the table, if Obsidian is set up that way', () => {
            getNewFileParent.mockImplementation((sourcePath: string) => folder(sourcePath ? 'Projects/Foo' : '/'))
            expect(issueNotePath('AAA-1', '', 'Projects/Foo/overview.md')).toBe('Projects/Foo/AAA-1.md')
            expect(getNewFileParent).toHaveBeenCalledWith('Projects/Foo/overview.md')
        })

        test.each([
            ['{key}', 'AAA-1.md'],
            ['Jira/{key}', 'Jira/AAA-1.md'],
            ['/Jira//{key}', 'Jira/AAA-1.md'],
            ['Tickets/{project}/TT- {key}', 'Tickets/AAA/TT- AAA-1.md'],
            ['Jira/{key}.md', 'Jira/AAA-1.md'],
            ['{key}/{key} main', 'AAA-1/AAA-1 main.md'],
        ])('template %p gives %p', (template, expected) => {
            expect(issueNotePath('AAA-1', template)).toBe(expected)
        })

        test('the project is everything before the last dash of the key', () => {
            expect(issueNotePath('MY-PROJ-12', '{project}/{key}')).toBe('MY-PROJ/MY-PROJ-12.md')
        })

        test('uses the setting, but not a template without {key}', () => {
            SettingsData.notesPath = 'Jira/{key}'
            expect(issueNotePath('AAA-1')).toBe('Jira/AAA-1.md')
            SettingsData.notesPath = 'Jira/notes'
            expect(issueNotePath('AAA-1')).toBe('AAA-1.md')
        })
    })

    describe('issueNoteMatcher', () => {
        test.each([
            ['AAA-1.md', true],
            ['AAA-1 Some summary.md', true],
            ['AAA-12.md', false],
            ['AAA-10 Other issue.md', false],
            ['Notes about AAA-1.md', false],
        ])('without template, %p is a note of AAA-1: %p', (name, expected) => {
            expect(issueNoteMatcher('AAA-1')(file(name))).toBe(expected)
        })

        test('with template, also the note at the template path', () => {
            SettingsData.notesPath = 'Tickets/{project}/TT- {key}'
            const matches = issueNoteMatcher('AAA-1')
            expect(matches(file('Tickets/AAA/TT- AAA-1.md'))).toBe(true)
            expect(matches(file('Other/TT- AAA-1.md'))).toBe(false)
            expect(matches(file('Tickets/AAA/TT- AAA-12.md'))).toBe(false)
            expect(matches(file('Somewhere/AAA-1 notes.md'))).toBe(true)
            expect(matches(file('tickets/aaa/tt- AAA-1.md'))).toBe(true)
        })
    })

    describe('openOrCreateIssueNote', () => {
        test('creates an empty note in the default location without settings', async () => {
            getNewFileParent.mockReturnValue(folder('Inbox'))
            files['Inbox'] = folder('Inbox')
            await openOrCreateIssueNote('AAA-1')
            expect(vault.createFolder).not.toHaveBeenCalled()
            expect(vault.create).toHaveBeenCalledWith('Inbox/AAA-1.md', '')
            expect(openFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'Inbox/AAA-1.md' }))
        })

        test('creates the note at the template path, with missing folders', async () => {
            SettingsData.notesPath = 'Tickets/{project}/TT- {key}'
            await openOrCreateIssueNote('AAA-1')
            expect(vault.createFolder).toHaveBeenCalledWith('Tickets/AAA')
            expect(vault.create).toHaveBeenCalledWith('Tickets/AAA/TT- AAA-1.md', '')
        })

        test('passes the note containing the table on for the default location', async () => {
            getNewFileParent.mockImplementation((sourcePath: string) => folder(sourcePath === 'Projects/Foo/overview.md' ? 'Projects/Foo' : '/'))
            files['Projects/Foo'] = folder('Projects/Foo')
            await openOrCreateIssueNote('AAA-1', false, 'Projects/Foo/overview.md')
            expect(vault.create).toHaveBeenCalledWith('Projects/Foo/AAA-1.md', '')
        })

        test('notes of two issues can create the same folder at the same time', async () => {
            SettingsData.notesPath = 'Jira/{project}/{key}'
            vault.createFolder.mockImplementation(async (path: string) => {
                await new Promise(resolve => setImmediate(resolve))
                if (files[path]) {
                    throw new Error('Folder already exists.')
                }
                files[path] = folder(path)
            })
            await Promise.all([openOrCreateIssueNote('AAA-1'), openOrCreateIssueNote('AAA-2')])
            expect(vault.create).toHaveBeenCalledWith('Jira/AAA/AAA-1.md', '')
            expect(vault.create).toHaveBeenCalledWith('Jira/AAA/AAA-2.md', '')
            expect(Notice).not.toHaveBeenCalled()
        })

        test('creates nothing when another file is at the path', async () => {
            SettingsData.notesPath = 'Jira/{key}'
            files['Jira'] = folder('Jira')
            files['Jira/AAA-1.md'] = folder('Jira/AAA-1.md')
            await openOrCreateIssueNote('AAA-1')
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('already exists'))
            expect(vault.create).not.toHaveBeenCalled()
        })

        test('creates nothing when the path has no {key}', async () => {
            SettingsData.notesPath = 'Jira/notes'
            await openOrCreateIssueNote('AAA-1')
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('{key}'))
            expect(vault.create).not.toHaveBeenCalled()
        })

        test('creates nothing when the folder path is a file', async () => {
            SettingsData.notesPath = 'Jira/{key}'
            files['Jira'] = file('Jira')
            await openOrCreateIssueNote('AAA-1')
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('is not a folder'))
            expect(vault.create).not.toHaveBeenCalled()
        })

        test('copies the template content, with or without .md in the setting', async () => {
            const template = file('Templates/Issue.md')
            files['Templates/Issue.md'] = template
            vault.read.mockResolvedValue('# Template')
            for (const setting of ['Templates/Issue', 'Templates/Issue.md']) {
                SettingsData.notesTemplate = setting
                await openOrCreateIssueNote('AAA-1')
                expect(vault.read).toHaveBeenLastCalledWith(template)
                expect(vault.create).toHaveBeenLastCalledWith('AAA-1.md', '# Template')
            }
        })

        test('opens a note of the issue that exists anywhere in the vault', async () => {
            SettingsData.notesPath = 'Jira/{key}'
            SettingsData.notesTemplate = 'Templates/Issue'
            const existing = file('Projects/AAA-1 design.md')
            files[existing.path] = existing
            await openOrCreateIssueNote('AAA-1', 'tab')
            expect(vault.create).not.toHaveBeenCalled()
            expect(ObsidianApp.workspace.getLeaf).toHaveBeenCalledWith('tab')
            expect(openFile).toHaveBeenCalledWith(existing)
        })

        test('creates the note only once on a double click', async () => {
            SettingsData.notesPath = 'Jira/{key}'
            await Promise.all([openOrCreateIssueNote('AAA-1'), openOrCreateIssueNote('AAA-1')])
            expect(vault.createFolder).toHaveBeenCalledTimes(1)
            expect(vault.create).toHaveBeenCalledTimes(1)
            expect(openFile).toHaveBeenCalledTimes(2)
        })

        test('creates nothing when the template does not exist', async () => {
            SettingsData.notesPath = 'Jira/{key}'
            SettingsData.notesTemplate = 'Templates/Missing'
            await openOrCreateIssueNote('AAA-1')
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Templates/Missing'))
            expect(vault.createFolder).not.toHaveBeenCalled()
            expect(vault.create).not.toHaveBeenCalled()
            expect(openFile).not.toHaveBeenCalled()
        })

        test('shows a notice instead of throwing when creating fails', async () => {
            vault.create.mockRejectedValue(new Error('disk full'))
            await expect(openOrCreateIssueNote('AAA-1')).resolves.toBeUndefined()
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('disk full'))
            expect(openFile).not.toHaveBeenCalled()
            // A failed attempt doesn't block the next one
            vault.create.mockImplementation(async (path: string) => file(path))
            await openOrCreateIssueNote('AAA-1')
            expect(openFile).toHaveBeenCalledTimes(1)
        })
    })
})
