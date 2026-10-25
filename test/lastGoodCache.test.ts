jest.mock('../src/settings', () => { return { SettingsData: { accounts: [] } } })

import LastGoodCache from '../src/lastGoodCache'
import { SettingsData } from '../src/settings'
import { TestAccountBasic, TestAccountOpen } from './testData'

const kFilePath = '.obsidian/plugins/obsidian-jira-issue/issues-cache.json'
const kFakeDateNow = new Date(Date.UTC(2000, 0, 1))
const kDayMs = 24 * 60 * 60 * 1000

const kAccountBasic = { ...TestAccountBasic, id: 'id-basic' }
const kAccountOpen = { ...TestAccountOpen, id: 'id-open' }

function buildFakeAdapter(initialFiles: Record<string, string> = {}) {
    const files: Record<string, string> = { ...initialFiles }
    return {
        files,
        exists: jest.fn(async (path: string) => path in files),
        read: jest.fn(async (path: string) => files[path]),
        write: jest.fn(async (path: string, data: string) => { files[path] = data }),
        remove: jest.fn(async (path: string) => { delete files[path] }),
        rename: jest.fn(async (path: string, newPath: string) => {
            if (newPath in files) {
                throw new Error('Destination file already exists!')
            }
            files[newPath] = files[path]
            delete files[path]
        }),
    }
}

async function settle() {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve()
    }
}

function buildIssue(account: any, key = 'AAA-123'): any {
    return {
        id: '10001',
        key,
        account,
        fields: {
            summary: 'Issue summary',
            description: 'A long description that chips never render',
            issuetype: { name: 'Task', iconUrl: 'data:image/svg+xml;base64,AAAA', subtask: false },
            status: { name: 'In Progress', description: 'Being worked on', statusCategory: { colorName: 'yellow', key: 'indeterminate' } },
            comment: { comments: [{ body: 'A comment' }] },
        },
    }
}

function rememberIssue(key: string, account: any) {
    LastGoodCache.rememberIssue(key, buildIssue(account, key), LastGoodCache.generation())
}

async function reload(files: Record<string, string>) {
    await LastGoodCache.load(buildFakeAdapter(files) as any, kFilePath)
}

describe('LastGoodCache', () => {
    let adapter: ReturnType<typeof buildFakeAdapter>

    beforeEach(async () => {
        jest.useFakeTimers().setSystemTime(kFakeDateNow)
        SettingsData.accounts = [kAccountOpen as any, kAccountBasic as any]
        adapter = buildFakeAdapter()
        await LastGoodCache.load(adapter as any, kFilePath)
    })

    afterEach(async () => {
        await LastGoodCache.flush()
        jest.useRealTimers()
    })

    test('Issue keeps only the chip fields and gets the live account back', () => {
        rememberIssue('AAA-123', kAccountBasic)

        const lastGood = LastGoodCache.getIssue('AAA-123')
        expect(lastGood.updateTime).toEqual(kFakeDateNow.getTime())
        expect(lastGood.data).toEqual({
            id: '10001',
            key: 'AAA-123',
            account: kAccountBasic,
            fields: {
                summary: 'Issue summary',
                issuetype: { name: 'Task', iconUrl: 'data:image/svg+xml;base64,AAAA' },
                status: { name: 'In Progress', description: 'Being worked on', statusCategory: { colorName: 'yellow' } },
            },
        })
        expect(LastGoodCache.getIssue('AAA-999')).toBeNull()
    })

    test('File is written after a delay and only refers to the account by id', async () => {
        rememberIssue('AAA-123', kAccountBasic)
        expect(adapter.write).not.toHaveBeenCalled()

        jest.advanceTimersByTime(2000)
        await LastGoodCache.flush()

        expect(adapter.write).toHaveBeenCalledTimes(1)
        const written = adapter.files[kFilePath]
        expect(written).not.toContain(TestAccountBasic.password)
        expect(written).not.toContain(TestAccountBasic.username)
        expect(JSON.parse(written).entries['issue:AAA-123']).toEqual({
            updateTime: kFakeDateNow.getTime(),
            accountId: 'id-basic',
            data: expect.any(Object),
        })
    })

    test('File is replaced through a complete temporary copy', async () => {
        adapter.files[kFilePath] = 'previous content'
        rememberIssue('AAA-123', kAccountBasic)

        await LastGoodCache.flush()

        expect(adapter.write).toHaveBeenCalledWith(`${kFilePath}.tmp`, expect.any(String))
        expect(adapter.rename).toHaveBeenCalledWith(`${kFilePath}.tmp`, kFilePath)
        expect(Object.keys(adapter.files)).toEqual([kFilePath])
        expect(JSON.parse(adapter.files[kFilePath]).entries['issue:AAA-123']).toBeDefined()
    })

    test('Writes run one at a time, in order', async () => {
        let releaseFirstWrite: () => void = null
        const firstWriteGate = new Promise<void>(resolve => { releaseFirstWrite = resolve })
        adapter.write.mockImplementationOnce(async (path: string, data: string) => {
            await firstWriteGate
            adapter.files[path] = data
        })
        rememberIssue('AAA-123', kAccountBasic)

        const flushed = LastGoodCache.flush()
        const cleared = LastGoodCache.clear()
        await settle()
        expect(adapter.write).toHaveBeenCalledTimes(1)

        releaseFirstWrite()
        await Promise.all([flushed, cleared])

        expect(adapter.write).toHaveBeenCalledTimes(2)
        expect(JSON.parse(adapter.files[kFilePath]).entries).toEqual({})
    })

    test('Entries survive a reload', async () => {
        rememberIssue('AAA-123', kAccountBasic)
        await LastGoodCache.flush()

        await reload({ [kFilePath]: adapter.files[kFilePath] })

        expect(LastGoodCache.getIssue('AAA-123').data.fields.summary).toEqual('Issue summary')
    })

    test('Load uses the temporary copy when the swap was interrupted', async () => {
        rememberIssue('AAA-123', kAccountBasic)
        await LastGoodCache.flush()

        await reload({ [`${kFilePath}.tmp`]: adapter.files[kFilePath] })

        expect(LastGoodCache.getIssue('AAA-123').data.fields.summary).toEqual('Issue summary')
    })

    test('Files written by an older version are ignored', async () => {
        await reload({ [kFilePath]: JSON.stringify({ version: 1, entries: { 'issue:AAA-123': { updateTime: kFakeDateNow.getTime(), accountId: 'id-basic', data: {} } } }) })

        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
    })

    test('Entries are matched by account id only', () => {
        rememberIssue('AAA-123', kAccountBasic)

        // A new account reusing the alias and host of a removed one must not inherit its issues
        SettingsData.accounts = [{ ...kAccountBasic, id: 'new-account' } as any]
        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()

        SettingsData.accounts = [{ ...kAccountBasic, alias: 'renamed', host: 'moved-host' } as any]
        expect(LastGoodCache.getIssue('AAA-123').data.account.alias).toEqual('renamed')
    })

    test('Issue without account or account id is not stored', () => {
        rememberIssue('AAA-123', null)
        rememberIssue('AAA-456', TestAccountOpen)

        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
        expect(LastGoodCache.getIssue('AAA-456')).toBeNull()
    })

    test('Search results keep only what the trimmer returns and get the live account back', () => {
        const searchResults = { total: 1, isLast: true, names: { summary: 'Summary' }, issues: [buildIssue(kAccountBasic)], account: kAccountBasic }
        const trimIssue = (issue: any) => ({ id: issue.id, key: issue.key, fields: { summary: issue.fields.summary } }) as any

        LastGoodCache.rememberSearch('project = AAA', searchResults as any, trimIssue, LastGoodCache.generation())

        const lastGood = LastGoodCache.getSearch('project = AAA')
        expect(lastGood.data).toEqual({
            total: 1,
            isLast: true,
            account: kAccountBasic,
            issues: [{ id: '10001', key: 'AAA-123', fields: { summary: 'Issue summary' }, account: kAccountBasic }],
        })
        expect(LastGoodCache.getCount('project = AAA')).toBeNull()
    })

    test('Count keeps only the total', () => {
        const searchResults = { total: 42, issues: [buildIssue(kAccountBasic)], account: kAccountBasic }
        LastGoodCache.rememberCount('project = AAA', searchResults as any, LastGoodCache.generation())

        expect(LastGoodCache.getCount('project = AAA').data).toEqual({ total: 42, issues: [], account: kAccountBasic })
        expect(LastGoodCache.getSearch('project = AAA')).toBeNull()
    })

    test('Clear empties memory and file right away', async () => {
        rememberIssue('AAA-123', kAccountBasic)

        await LastGoodCache.clear()

        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
        expect(JSON.parse(adapter.files[kFilePath]).entries).toEqual({})
    })

    test('Fetches started before Clear cache are not saved', async () => {
        const generationAtFetchStart = LastGoodCache.generation()

        await LastGoodCache.clear()
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic), generationAtFetchStart)

        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
    })

    test('Entries not refreshed for 30 days are dropped', async () => {
        rememberIssue('OLD-1', kAccountBasic)
        jest.setSystemTime(kFakeDateNow.getTime() + 2 * kDayMs)
        rememberIssue('RECENT-1', kAccountBasic)
        await LastGoodCache.flush()

        jest.setSystemTime(kFakeDateNow.getTime() + 31 * kDayMs)
        await reload({ [kFilePath]: adapter.files[kFilePath] })

        expect(LastGoodCache.getIssue('OLD-1')).toBeNull()
        expect(LastGoodCache.getIssue('RECENT-1')).not.toBeNull()
    })

    test('At most 500 entries are kept, the most recently refreshed ones', async () => {
        for (let i = 0; i < 501; i++) {
            jest.setSystemTime(kFakeDateNow.getTime() + i)
            rememberIssue(`AAA-${i}`, kAccountBasic)
        }
        await LastGoodCache.flush()

        expect(Object.keys(JSON.parse(adapter.files[kFilePath]).entries)).toHaveLength(500)
        expect(LastGoodCache.getIssue('AAA-0')).toBeNull()
        expect(LastGoodCache.getIssue('AAA-500')).not.toBeNull()
    })

    test('Entries of removed accounts are dropped from the file', async () => {
        rememberIssue('AAA-123', kAccountBasic)
        SettingsData.accounts = [kAccountOpen as any]
        rememberIssue('BBB-1', kAccountOpen)

        await LastGoodCache.flush()

        expect(Object.keys(JSON.parse(adapter.files[kFilePath]).entries)).toEqual(['issue:BBB-1'])
    })

    test('Unreadable file starts empty', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null)

        await reload({ [kFilePath]: '{ not json' })

        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})

export { }
