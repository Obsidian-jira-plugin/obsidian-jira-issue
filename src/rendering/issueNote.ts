import { normalizePath, Notice, PaneType, TFile, TFolder } from "obsidian"
import { ObsidianApp } from "../main"
import { SettingsData } from "../settings"

export const NOTE_PATH_KEY_PLACEHOLDER = '{key}'

// The configured path template, or '' when none is set. A template without {key} would give all
// issues the same note, so it doesn't count
function notePathTemplate(): string {
    const template = SettingsData.notesPath?.trim() || ''
    return template.includes(NOTE_PATH_KEY_PLACEHOLDER) ? template : ''
}

// Path of the note of an issue: from the path template ({key}, {project}) relative to the vault root,
// or <key>.md in Obsidian's "Default location for new notes" when no template is set.
// sourcePath is the note containing the table, for "Same folder as current file"
export function issueNotePath(issueKey: string, template: string = notePathTemplate(), sourcePath = ''): string {
    if (!template) {
        const folder = ObsidianApp.fileManager.getNewFileParent(sourcePath).path
        return normalizePath(folder === '/' ? `${issueKey}.md` : `${folder}/${issueKey}.md`)
    }
    const project = issueKey.substring(0, issueKey.lastIndexOf('-'))
    const path = normalizePath(template.split('{key}').join(issueKey).split('{project}').join(project))
    return path.toLowerCase().endsWith('.md') ? path : `${path}.md`
}

// The notes of an issue: names starting with the key (e.g. "AAA-1 Summary.md"), and the note at the
// path of the template. Built once per issue, as the NOTES column checks every note of the vault
export function issueNoteMatcher(issueKey: string): (note: TFile) => boolean {
    // Case-insensitive, as on macOS and Windows a note differing only in case blocks creating the note
    const templatePath = notePathTemplate() ? issueNotePath(issueKey).toLowerCase() : null
    return (note: TFile) => note.path.toLowerCase() === templatePath
        || (note.name.startsWith(issueKey) && /^[^0-9]/.test(note.name.substring(issueKey.length)))
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

async function findOrCreateIssueNote(issueKey: string, sourcePath: string): Promise<TFile | null> {
    // The table may be older than the note, so look again before creating a duplicate
    const existing = ObsidianApp.vault.getMarkdownFiles().find(issueNoteMatcher(issueKey))
    if (existing) {
        return existing
    }
    if (SettingsData.notesPath?.trim() && !notePathTemplate()) {
        new Notice(`Jira Issue: The path for new notes must contain ${NOTE_PATH_KEY_PLACEHOLDER}`)
        return null
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

    const path = issueNotePath(issueKey, notePathTemplate(), sourcePath)
    if (ObsidianApp.vault.getAbstractFileByPath(path)) {
        new Notice(`Jira Issue: "${path}" already exists and is not a note`)
        return null
    }
    const folder = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''
    if (folder && !await ensureFolder(folder)) {
        new Notice(`Jira Issue: "${folder}" is not a folder`)
        return null
    }
    return ObsidianApp.vault.create(path, content)
}

// false when something else than a folder is at the path
async function ensureFolder(folder: string): Promise<boolean> {
    if (!ObsidianApp.vault.getAbstractFileByPath(folder)) {
        try {
            await ObsidianApp.vault.createFolder(folder)
        } catch (e) {
            // Notes of other issues may create the same folder at the same time
            if (!(ObsidianApp.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
                throw e
            }
        }
    }
    return ObsidianApp.vault.getAbstractFileByPath(folder) instanceof TFolder
}

const pendingNotes = new Map<string, Promise<TFile | null>>()

// Opens the note of the issue, creating it first (at the configured path, from the configured template)
export async function openOrCreateIssueNote(issueKey: string, newLeaf: PaneType | boolean = false, sourcePath = ''): Promise<void> {
    try {
        // A double click must not try to create the same note twice
        let pending = pendingNotes.get(issueKey)
        if (!pending) {
            pending = findOrCreateIssueNote(issueKey, sourcePath).finally(() => pendingNotes.delete(issueKey))
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
