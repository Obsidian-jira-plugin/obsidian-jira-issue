jest.mock('../src/settings', () => { return { SettingsData: { accounts: [] } } })

import LastGoodCache from '../src/lastGoodCache'
import { SettingsData } from '../src/settings'
import { TestAccountBasic, TestAccountOpen } from './testData'

const kFilePath = '.obsidian/plugins/obsidian-jira-issue/issues-cache.json'
const kFakeDateNow = new Date(Date.UTC(2000, 0, 1))

const kAccountBasic = { ...TestAccountBasic, id: 'id-basic' }

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

function buildIssue(account: any): any {
    return {
        id: '10001',
        key: 'AAA-123',
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

describe('LastGoodCache', () => {
    let adapter: ReturnType<typeof buildFakeAdapter>

    beforeEach(async () => {
        jest.useFakeTimers().setSystemTime(kFakeDateNow)
        SettingsData.accounts = [TestAccountOpen as any, kAccountBasic as any]
        adapter = buildFakeAdapter()
        await LastGoodCache.load(adapter as any, kFilePath)
    })

    afterEach(async () => {
        await LastGoodCache.flush()
        jest.useRealTimers()
    })

    test('Issue keeps only the chip fields and gets the live account back', () => {
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic))

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

    test('File is written after a delay and never contains the account credentials', async () => {
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic))
        expect(adapter.write).not.toHaveBeenCalled()

        jest.advanceTimersByTime(2000)
        await LastGoodCache.flush()

        expect(adapter.write).toHaveBeenCalledTimes(1)
        const written = adapter.files[kFilePath]
        expect(written).not.toContain(TestAccountBasic.password)
        expect(written).not.toContain(TestAccountBasic.username)
        expect(JSON.parse(written).entries['issue:AAA-123']).toEqual(expect.objectContaining({ accountId: 'id-basic', accountAlias: 'alias2', accountHost: 'host2' }))
    })

    test('File is replaced through a complete temporary copy', async () => {
        adapter.files[kFilePath] = 'previous content'
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic))

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
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic))

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
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic))
        await LastGoodCache.flush()

        await LastGoodCache.load(buildFakeAdapter({ [kFilePath]: adapter.files[kFilePath] }) as any, kFilePath)

        expect(LastGoodCache.getIssue('AAA-123').data.fields.summary).toEqual('Issue summary')
    })

    test('Load uses the temporary copy when the swap was interrupted', async () => {
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic))
        await LastGoodCache.flush()

        await LastGoodCache.load(buildFakeAdapter({ [`${kFilePath}.tmp`]: adapter.files[kFilePath] }) as any, kFilePath)

        expect(LastGoodCache.getIssue('AAA-123').data.fields.summary).toEqual('Issue summary')
    })

    test('Account is found by alias on the same host when its id changed', () => {
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic))

        SettingsData.accounts = [{ ...kAccountBasic, id: 'regenerated-id', alias: 'ALIAS2' } as any]
        expect(LastGoodCache.getIssue('AAA-123').data.account.id).toEqual('regenerated-id')

        SettingsData.accounts = [{ ...kAccountBasic, id: 'new-account', host: 'other-host' } as any]
        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()

        SettingsData.accounts = [TestAccountOpen as any]
        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
    })

    test('Issue without account is not stored', () => {
        LastGoodCache.rememberIssue('AAA-123', buildIssue(null))
        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
    })

    test('Search results keep every field and get the live account back on the results and each issue', () => {
        const searchResults = { total: 1, issues: [buildIssue(kAccountBasic)], account: kAccountBasic }
        LastGoodCache.rememberSearch('project = AAA', searchResults as any)

        const lastGood = LastGoodCache.getSearch('project = AAA')
        expect(lastGood.data.account).toBe(kAccountBasic)
        expect(lastGood.data.issues[0].account).toBe(kAccountBasic)
        expect(lastGood.data.issues[0].fields.description).toEqual('A long description that chips never render')
        expect(LastGoodCache.getCount('project = AAA')).toBeNull()
    })

    test('Count keeps only the total', () => {
        const searchResults = { total: 42, issues: [buildIssue(kAccountBasic)], account: kAccountBasic }
        LastGoodCache.rememberCount('project = AAA', searchResults as any)

        expect(LastGoodCache.getCount('project = AAA').data).toEqual({ total: 42, issues: [], account: kAccountBasic })
        expect(LastGoodCache.getSearch('project = AAA')).toBeNull()
    })

    test('Clear empties memory and file right away', async () => {
        LastGoodCache.rememberIssue('AAA-123', buildIssue(kAccountBasic))

        await LastGoodCache.clear()

        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
        expect(JSON.parse(adapter.files[kFilePath]).entries).toEqual({})
    })

    test('Unreadable file starts empty', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null)

        await LastGoodCache.load(buildFakeAdapter({ [kFilePath]: '{ not json' }) as any, kFilePath)

        expect(LastGoodCache.getIssue('AAA-123')).toBeNull()
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})

export { }
