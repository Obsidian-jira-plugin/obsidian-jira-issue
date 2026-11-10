import { normalizePath, Notice, PaneType, TFile, TFolder } from "obsidian"
import { ObsidianApp } from "../main"
import { SettingsData } from "../settings"

// Same rule the NOTES column uses to connect notes to an issue: the name starts with the key
export function isIssueNote(note: TFile, issueKey: string): boolean {
    return note.name.startsWith(issueKey) && /^[^0-9]/.test(note.name.substring(issueKey.length))
}

// Without a configured folder, new notes go where Obsidian puts new notes ("Default location for new notes")
export function issueNoteFolder(folderSetting: string): string {
    if (folderSetting?.trim()) {
        return normalizePath(folderSetting.trim())
    }
    return ObsidianApp.fileManager.getNewFileParent('').path
}

export function issueNotePath(issueKey: string, folder: string): string {
    const cleanFolder = normalizePath(folder || '/')
    return cleanFolder === '/' ? `${issueKey}.md` : `${cleanFolder}/${issueKey}.md`
}

function findTemplateFile(templatePath: string): TFile | null {
    const path = normalizePath(templatePath.trim())
    for (const candidate of [path, `${path}.md`]) {
        const file = ObsidianApp.vault.getAbstractFileByPath(candidate)
        if (file instanceof TFile) {
            return file
        }
    }
    return null
}

async function findOrCreateIssueNote(issueKey: string): Promise<TFile | null> {
    // The table may be older than the note, so look again before creating a duplicate
    const existing = ObsidianApp.vault.getMarkdownFiles().find(note => isIssueNote(note, issueKey))
    if (existing) {
        return existing
    }

    let content = ''
    if (SettingsData.notesTemplate?.trim()) {
        const template = findTemplateFile(SettingsData.notesTemplate)
        if (!template) {
            new Notice(`Jira Issue: Note template "${SettingsData.notesTemplate}" not found`)
            return null
        }
        content = await ObsidianApp.vault.read(template)
    }

    const folder = issueNoteFolder(SettingsData.notesFolder)
    const path = issueNotePath(issueKey, folder)
    if (folder !== '/') {
        const folderFile = ObsidianApp.vault.getAbstractFileByPath(folder)
        if (!folderFile) {
            await ObsidianApp.vault.createFolder(folder)
        } else if (!(folderFile instanceof TFolder)) {
            new Notice(`Jira Issue: "${folder}" is not a folder`)
            return null
        }
    }
    return ObsidianApp.vault.create(path, content)
}

const pendingNotes = new Map<string, Promise<TFile | null>>()

// Opens the note of the issue, creating it first (in the configured folder, from the configured template)
export async function openOrCreateIssueNote(issueKey: string, newLeaf: PaneType | boolean = false): Promise<void> {
    try {
        // A double click must not try to create the same note twice
        let pending = pendingNotes.get(issueKey)
        if (!pending) {
            pending = findOrCreateIssueNote(issueKey).finally(() => pendingNotes.delete(issueKey))
            pendingNotes.set(issueKey, pending)
        }
        const note = await pending
        if (note) {
            await ObsidianApp.workspace.getLeaf(newLeaf).openFile(note)
        }
    } catch (e) {
        new Notice(`Jira Issue: Failed to create note for ${issueKey}: ${e instanceof Error ? e.message : String(e)}`)
    }
}
