import { DataAdapter } from "obsidian"
import { IJiraIssue, IJiraSearchResults } from "./interfaces/issueInterfaces"
import { IJiraIssueAccountSettings } from "./interfaces/settingsInterfaces"
import { SettingsData } from "./settings"

// Last successfully fetched issues, searches and counts, persisted to disk so a failed refresh
// (connection lost, VPN off, proxy returning 403...) can keep showing the previous content,
// even right after a restart. Unlike ObjectsCache, entries never expire and survive settings
// changes: only the "Clear cache" command empties the store.

const FILE_VERSION = 1
const SAVE_DELAY_MS = 2000

interface StoredEntry {
    updateTime: number
    // The account is stored by reference only: the settings object holds the credentials
    accountId: string
    accountAlias: string
    accountHost: string
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

// Account ids are not always persisted, so fall back to the alias, but only on the same host:
// a new account reusing an old alias must not inherit the old account's issues
function findAccount(entry: StoredEntry): IJiraIssueAccountSettings {
    const alias = (entry.accountAlias || '').toUpperCase()
    return SettingsData.accounts.find(account => entry.accountId && account.id === entry.accountId)
        || SettingsData.accounts.find(account => account.host === entry.accountHost && account.alias.toUpperCase() === alias)
        || null
}

// Chips only render these fields, the rest of an issue fetched with *all fields is not worth storing
function trimIssueForChip(issue: IJiraIssue): IJiraIssue {
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

function put(key: string, account: IJiraIssueAccountSettings, data: unknown): void {
    if (!account) {
        return
    }
    entries[key] = {
        updateTime: Date.now(),
        accountId: account.id || null,
        accountAlias: account.alias,
        accountHost: account.host,
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
        if (saveTimer) {
            clearTimeout(saveTimer)
            saveTimer = null
        }
        await save()
    },

    // Same key as ObjectsCache: the issue key, or the issue URL when the chip is tied to one Jira host
    rememberIssue(cacheKey: string, issue: IJiraIssue): void {
        put(`issue:${cacheKey}`, issue.account, trimIssueForChip(issue))
    },

    getIssue(cacheKey: string): LastGoodItem<IJiraIssue> {
        return take<IJiraIssue>(`issue:${cacheKey}`, (issue, account) => ({ ...issue, account }))
    },

    rememberSearch(cacheKey: string, searchResults: IJiraSearchResults): void {
        put(`search:${cacheKey}`, searchResults.account, {
            ...searchResults,
            account: null,
            issues: searchResults.issues.map(issue => ({ ...issue, account: null })),
        })
    },

    getSearch(cacheKey: string): LastGoodItem<IJiraSearchResults> {
        return take<IJiraSearchResults>(`search:${cacheKey}`, (searchResults, account) => ({
            ...searchResults,
            account,
            issues: searchResults.issues.map(issue => ({ ...issue, account })),
        }))
    },

    rememberCount(cacheKey: string, searchResults: IJiraSearchResults): void {
        put(`count:${cacheKey}`, searchResults.account, { issues: [], total: searchResults.total, account: null })
    },

    getCount(cacheKey: string): LastGoodItem<IJiraSearchResults> {
        return take<IJiraSearchResults>(`count:${cacheKey}`, (searchResults, account) => ({ ...searchResults, account }))
    },
}
