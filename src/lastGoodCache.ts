import { DataAdapter } from "obsidian"
import { IJiraIssue, IJiraSearchResults } from "./interfaces/issueInterfaces"
import { IJiraIssueAccountSettings } from "./interfaces/settingsInterfaces"
import { SettingsData } from "./settings"

// Last successfully fetched issues, searches and counts, persisted to disk so a failed refresh
// (connection lost, VPN off, proxy returning 403...) can keep showing the previous content,
// even right after a restart. The file lives in the vault, so it only keeps the fields that
// are rendered. Unlike ObjectsCache, entries survive settings changes; they are dropped after
// MAX_AGE_MS without a successful refresh, beyond MAX_ENTRIES, when their account is removed,
// or by the "Clear cache" command.

const FILE_VERSION = 2
const SAVE_DELAY_MS = 2000
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 500

interface StoredEntry {
    updateTime: number
    // The account is stored by reference only: the settings object holds the credentials
    accountId: string
    data: unknown
}

interface StoredFile {
    version: number
    entries: Record<string, StoredEntry>
}

export interface LastGoodItem<T> {
    updateTime: number
    data: T
}

let entries: Record<string, StoredEntry> = {}
let adapter: DataAdapter = null
let filePath: string = null
let saveTimer: ReturnType<typeof setTimeout> = null
let writeQueue: Promise<void> = Promise.resolve()
let generation = 0

function findAccount(entry: StoredEntry): IJiraIssueAccountSettings {
    return SettingsData.accounts.find(account => entry.accountId && account.id === entry.accountId) || null
}

// Chips only render these fields, the rest of an issue fetched with *all fields must not be stored
export function trimIssueForChip(issue: IJiraIssue): IJiraIssue {
    const { issuetype, status, summary } = issue.fields
    return {
        id: issue.id,
        key: issue.key,
        fields: {
            summary,
            issuetype: issuetype && { name: issuetype.name, iconUrl: issuetype.iconUrl },
            status: status && {
                name: status.name,
                description: status.description,
                statusCategory: status.statusCategory && { colorName: status.statusCategory.colorName },
            },
        },
        account: null,
    } as IJiraIssue
}

function prune(): void {
    const oldestKept = Date.now() - MAX_AGE_MS
    const kept = Object.keys(entries)
        .filter(key => entries[key].updateTime > oldestKept && findAccount(entries[key]))
        .sort((a, b) => entries[b].updateTime - entries[a].updateTime)
        .slice(0, MAX_ENTRIES)
    const prunedEntries: Record<string, StoredEntry> = {}
    for (const key of kept) {
        prunedEntries[key] = entries[key]
    }
    entries = prunedEntries
}

function put(key: string, account: IJiraIssueAccountSettings, data: unknown, fetchGeneration: number): void {
    // Fetched before the last "Clear cache": the user asked for this data to be gone
    if (fetchGeneration !== generation || !account || !account.id) {
        return
    }
    entries[key] = {
        updateTime: Date.now(),
        accountId: account.id,
        data: data,
    }
    scheduleSave()
}

function take<T>(key: string, attachAccount: (data: T, account: IJiraIssueAccountSettings) => T): LastGoodItem<T> {
    const entry = entries[key]
    if (!entry) {
        return null
    }
    const account = findAccount(entry)
    if (!account) {
        return null
    }
    return {
        updateTime: entry.updateTime,
        data: attachAccount(entry.data as T, account),
    }
}

function scheduleSave(): void {
    if (!adapter || saveTimer) {
        return
    }
    saveTimer = setTimeout(() => {
        saveTimer = null
        void save()
    }, SAVE_DELAY_MS)
}

// Writes run one at a time, each with the content as it was when the save was requested
function save(): Promise<void> {
    if (!adapter) {
        return writeQueue
    }
    prune()
    const file: StoredFile = { version: FILE_VERSION, entries: entries }
    const content = JSON.stringify(file)
    writeQueue = writeQueue.then(() => writeFile(content))
    return writeQueue
}

// The new content is fully written to a temporary file before it replaces the cache file, so a
// reader (e.g. the plugin reloaded mid-write) finds either the old file or the complete new one
async function writeFile(content: string): Promise<void> {
    const tmpPath = `${filePath}.tmp`
    try {
        await adapter.write(tmpPath, content)
        if (await adapter.exists(filePath)) {
            await adapter.remove(filePath)
        }
        await adapter.rename(tmpPath, filePath)
    } catch (e) {
        console.warn('JiraIssue: unable to write the issues cache', e)
    }
}

async function readEntries(path: string): Promise<Record<string, StoredEntry>> {
    try {
        if (await adapter.exists(path)) {
            const file = JSON.parse(await adapter.read(path)) as StoredFile
            if (file && file.version === FILE_VERSION && file.entries) {
                return file.entries
            }
        }
    } catch (e) {
        console.warn('JiraIssue: unable to read the issues cache', e)
    }
    return null
}

export default {

    async load(dataAdapter: DataAdapter, path: string): Promise<void> {
        adapter = dataAdapter
        filePath = path
        // Mid-swap the cache file can be missing while the temporary file is complete
        entries = (await readEntries(filePath)) || (await readEntries(`${filePath}.tmp`)) || {}
        prune()
    },

    async flush(): Promise<void> {
        if (saveTimer) {
            clearTimeout(saveTimer)
            saveTimer = null
            void save()
        }
        await writeQueue
    },

    async clear(): Promise<void> {
        entries = {}
        generation++
        if (saveTimer) {
            clearTimeout(saveTimer)
            saveTimer = null
        }
        await save()
    },

    // Taken before a fetch starts and given back to remember*(): results of fetches started
    // before a "Clear cache" are not stored
    generation(): number {
        return generation
    },

    // Same key as ObjectsCache: the issue key, or the issue URL when the chip is tied to one Jira host
    rememberIssue(cacheKey: string, issue: IJiraIssue, fetchGeneration: number): void {
        put(`issue:${cacheKey}`, issue.account, trimIssueForChip(issue), fetchGeneration)
    },

    getIssue(cacheKey: string): LastGoodItem<IJiraIssue> {
        return take<IJiraIssue>(`issue:${cacheKey}`, (issue, account) => ({ ...issue, account }))
    },

    // trimIssue keeps the fields the search view renders (chip fields for a list, column fields for a table)
    rememberSearch(cacheKey: string, searchResults: IJiraSearchResults, trimIssue: (issue: IJiraIssue) => IJiraIssue, fetchGeneration: number): void {
        put(`search:${cacheKey}`, searchResults.account, {
            issues: searchResults.issues.map(issue => ({ ...trimIssue(issue), account: null })),
            total: searchResults.total,
            isLast: searchResults.isLast,
            account: null,
        }, fetchGeneration)
    },

    getSearch(cacheKey: string): LastGoodItem<IJiraSearchResults> {
        return take<IJiraSearchResults>(`search:${cacheKey}`, (searchResults, account) => ({
            ...searchResults,
            account,
            issues: searchResults.issues.map(issue => ({ ...issue, account })),
        }))
    },

    rememberCount(cacheKey: string, searchResults: IJiraSearchResults, fetchGeneration: number): void {
        put(`count:${cacheKey}`, searchResults.account, { issues: [], total: searchResults.total, account: null }, fetchGeneration)
    },

    getCount(cacheKey: string): LastGoodItem<IJiraSearchResults> {
        return take<IJiraSearchResults>(`count:${cacheKey}`, (searchResults, account) => ({ ...searchResults, account }))
    },
}
