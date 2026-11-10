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
    SettingsData: { notesFolder: '', notesTemplate: '' }
}))

import { Notice, TFile, TFolder } from 'obsidian'
import { ObsidianApp } from '../src/main'
import { SettingsData } from '../src/settings'
import { isIssueNote, issueNoteFolder, issueNotePath, openOrCreateIssueNote } from '../src/rendering/issueNote'

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
        SettingsData.notesFolder = ''
        SettingsData.notesTemplate = ''
        files = {}
        vault.getAbstractFileByPath.mockImplementation((path: string) => files[path] ?? null)
        vault.getMarkdownFiles.mockImplementation(() => Object.values(files).filter(f => f instanceof TFile && f.path.endsWith('.md')))
        vault.create.mockImplementation(async (path: string) => file(path))
        getNewFileParent.mockReturnValue(folder('/'))
        ;(ObsidianApp.workspace.getLeaf as jest.Mock).mockReturnValue({ openFile })
    })

    describe('isIssueNote', () => {
        test.each([
            ['AAA-1.md', true],
            ['AAA-1 Some summary.md', true],
            ['AAA-12.md', false],
            ['AAA-10 Other issue.md', false],
            ['Notes about AAA-1.md', false],
        ])('%p is a note of AAA-1: %p', (name, expected) => {
            expect(isIssueNote(file(name), 'AAA-1')).toBe(expected)
        })
    })

    describe('issueNoteFolder', () => {
        test('uses the configured folder', () => {
            expect(issueNoteFolder(' Jira/Notes/ ')).toBe('Jira/Notes')
            expect(getNewFileParent).not.toHaveBeenCalled()
        })

        test('falls back to the default location for new notes', () => {
            getNewFileParent.mockReturnValue(folder('Inbox'))
            expect(issueNoteFolder('')).toBe('Inbox')
            expect(issueNoteFolder('  ')).toBe('Inbox')
        })
    })

    describe('issueNotePath', () => {
        test.each([
            ['', 'AAA-1.md'],
            ['/', 'AAA-1.md'],
            ['Jira', 'Jira/AAA-1.md'],
            ['Jira/Notes/', 'Jira/Notes/AAA-1.md'],
            ['/Jira//Notes', 'Jira/Notes/AAA-1.md'],
        ])('folder %p gives %p', (folderPath, expected) => {
            expect(issueNotePath('AAA-1', folderPath)).toBe(expected)
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

        test('creates a missing folder', async () => {
            SettingsData.notesFolder = 'Jira/Notes'
            await openOrCreateIssueNote('AAA-1')
            expect(vault.createFolder).toHaveBeenCalledWith('Jira/Notes')
            expect(vault.create).toHaveBeenCalledWith('Jira/Notes/AAA-1.md', '')
        })

        test('creates nothing when the folder path is a file', async () => {
            SettingsData.notesFolder = 'Jira'
            files['Jira'] = file('Jira')
            await openOrCreateIssueNote('AAA-1')
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('is not a folder'))
            expect(vault.create).not.toHaveBeenCalled()
        })

        test('copies the template content, with or without .md in the setting', async () => {
            const template = file('Templates/Issue.md')
            files['Templates/Issue.md'] = template
            vault.read.mockResolvedValue('# Template')
            vault.create.mockImplementation(async (path: string) => file(path))
            for (const setting of ['Templates/Issue', 'Templates/Issue.md']) {
                SettingsData.notesTemplate = setting
                await openOrCreateIssueNote('AAA-1')
                expect(vault.read).toHaveBeenLastCalledWith(template)
                expect(vault.create).toHaveBeenLastCalledWith('AAA-1.md', '# Template')
            }
        })

        test('opens a note of the issue that exists anywhere in the vault', async () => {
            SettingsData.notesFolder = 'Jira'
            SettingsData.notesTemplate = 'Templates/Issue'
            const existing = file('Projects/AAA-1 design.md')
            files[existing.path] = existing
            await openOrCreateIssueNote('AAA-1', 'tab')
            expect(vault.create).not.toHaveBeenCalled()
            expect(ObsidianApp.workspace.getLeaf).toHaveBeenCalledWith('tab')
            expect(openFile).toHaveBeenCalledWith(existing)
        })

        test('creates the note only once on a double click', async () => {
            SettingsData.notesFolder = 'Jira'
            await Promise.all([openOrCreateIssueNote('AAA-1'), openOrCreateIssueNote('AAA-1')])
            expect(vault.createFolder).toHaveBeenCalledTimes(1)
            expect(vault.create).toHaveBeenCalledTimes(1)
            expect(openFile).toHaveBeenCalledTimes(2)
        })

        test('creates nothing when the template does not exist', async () => {
            SettingsData.notesFolder = 'Jira'
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
