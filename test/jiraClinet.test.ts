import * as obsidian from 'obsidian'
import JiraClient from '../src/client/jiraClient'
import { TestAccountOpen } from './testData'
import { DEFAULT_SETTINGS, SettingsData } from '../src/settings'

const kIssueKey = 'AAA-123'
const requestUrlMock = jest.spyOn(obsidian, 'requestUrl')
const defaultHeaders = { 'content-type': 'application/json' }

describe('JiraClient', () => {
    describe('Positive tests', () => {
        // test('getIssue minimal', async () => {
        //     requestUrlMock.mockReturnValue({ status: 200, json: {} } as any)
        //     expect(await JiraClient.getIssue(kIssueKey)).toEqual(true)
        //     expect(requestUrlMock.mock.calls[0][0]).toEqual({
        //         contentType: 'application/json',
        //         headers: {},
        //         method: 'GET',
        //         url: 'https://test-company.atlassian.net/rest/api/latest/project',
        //     })
        // })

        test('testConnection', async () => {
            requestUrlMock.mockReturnValue({ status: 200, headers: defaultHeaders, json: { issues: [] } } as any)
            expect(await JiraClient.testConnection(TestAccountOpen)).toEqual(true)
            expect(requestUrlMock.mock.calls[0][0]).toEqual({
                contentType: 'application/json',
                headers: {
                    "Accept": "application/json",
                    "User-Agent": "obsidian-jira-issue-plugin",
                    "X-Atlassian-Token": "no-check",
                },
                method: 'GET',
                url: 'https://test-company.atlassian.net/rest/api/latest/project',
            })
        })

        test('testConnection accepts a JSON response without headers', async () => {
            requestUrlMock.mockReturnValue({ status: 200, json: { issues: [] } } as any)

            expect(await JiraClient.testConnection(TestAccountOpen)).toEqual(true)
        })

        test('testConnection accepts mixed-case content-type headers', async () => {
            requestUrlMock.mockReturnValue({ status: 200, headers: { 'Content-Type': 'application/json' }, json: { issues: [] } } as any)

            expect(await JiraClient.testConnection(TestAccountOpen)).toEqual(true)
        })

        test('testConnection falls back to parsing JSON text if response.json is undefined', async () => {
            requestUrlMock.mockReturnValue({ status: 200, headers: { 'Content-Type': 'application/json' }, text: JSON.stringify({ issues: [] }) } as any)

            expect(await JiraClient.testConnection(TestAccountOpen)).toEqual(true)
        })

        test('getIssue with disableImageFetch uses upstream Atlassian SVG icons without fetching images', async () => {
            const accountWithDisabledImages = {
                ...TestAccountOpen,
                disableImageFetch: true,
            }
            const rawIssueResponse = {
                key: 'TEST-100',
                fields: {
                    summary: 'Test summary',
                    issuetype: { name: 'Bug', iconUrl: 'https://jira.server.com/secure/viewavatar?size=xsmall&avatarId=10303' },
                    priority: { name: 'High', iconUrl: 'https://jira.server.com/images/icons/priorities/high.svg' },
                    reporter: {
                        displayName: 'Alice',
                        avatarUrls: { '16x16': 'https://jira.server.com/secure/useravatar?ownerId=alice' }
                    },
                    assignee: {
                        displayName: 'Bob',
                        avatarUrls: { '16x16': 'https://jira.server.com/secure/useravatar?ownerId=bob' }
                    },
                    status: { name: 'In Progress', statusCategory: { colorName: 'blue-gray' } },
                }
            }

            requestUrlMock.mockResolvedValueOnce({
                status: 200,
                headers: defaultHeaders,
                json: rawIssueResponse,
            } as any)

            const issue = await JiraClient.getIssue('TEST-100', { account: accountWithDisabledImages })

            expect(requestUrlMock).toBeCalledTimes(1)
            expect(issue.fields.issuetype.iconUrl).toContain('icon-object/svgs_raw/bug/16.svg')
            expect(issue.fields.priority.iconUrl).toContain('icon/icons_raw/core/priority-high.svg')
            expect(issue.fields.reporter.avatarUrls['16x16']).toEqual('')
            expect(issue.fields.assignee.avatarUrls['16x16']).toEqual('')
        })

        test('getIssue with disableImageFetch handles sub-tasks and unknown types/priorities', async () => {
            const accountWithDisabledImages = {
                ...TestAccountOpen,
                disableImageFetch: true,
            }
            const rawIssueResponse = {
                key: 'TEST-101',
                fields: {
                    summary: 'Sub-task summary',
                    issuetype: { name: 'Sub-task', iconUrl: 'https://jira.server.com/subtask.png' },
                    priority: { name: 'NonExistentPriority', iconUrl: 'https://jira.server.com/priority.png' },
                    status: { name: 'Open', statusCategory: { colorName: 'blue-gray' } },
                }
            }

            requestUrlMock.mockResolvedValueOnce({
                status: 200,
                headers: defaultHeaders,
                json: rawIssueResponse,
            } as any)

            const issue = await JiraClient.getIssue('TEST-101', { account: accountWithDisabledImages })

            expect(requestUrlMock).toBeCalledTimes(1)
            expect(issue.fields.issuetype.iconUrl).toContain('icon-object/svgs_raw/subtask/16.svg')
            expect(issue.fields.priority.iconUrl).toContain('icon/icons_raw/core/question-circle.svg')
        })

        test('getSearchResults with disableImageFetch maps icons without fetching images', async () => {
            const accountWithDisabledImages = {
                ...TestAccountOpen,
                disableImageFetch: true,
            }
            const rawSearchResponse = {
                issues: [
                    {
                        key: 'TEST-102',
                        fields: {
                            summary: 'Search issue summary',
                            issuetype: { name: 'Story', iconUrl: 'https://jira.server.com/story.png' },
                            priority: { name: 'Medium', iconUrl: 'https://jira.server.com/medium.png' },
                            status: { name: 'Done', statusCategory: { colorName: 'green' } },
                        }
                    }
                ]
            }

            requestUrlMock.mockResolvedValueOnce({
                status: 200,
                headers: defaultHeaders,
                json: rawSearchResponse,
            } as any)

            const results = await JiraClient.getSearchResults('project = TEST', { account: accountWithDisabledImages })

            expect(requestUrlMock).toBeCalledTimes(1)
            expect(results.issues[0].fields.issuetype.iconUrl).toContain('icon-object/svgs_raw/story/16.svg')
            expect(results.issues[0].fields.priority.iconUrl).toContain('icon/icons_raw/core/priority-medium.svg')
        })
        test('getIssue handles avatarUrls missing 16x16 resolution without crashing', async () => {
            const rawIssueResponse = {
                key: 'TEST-103',
                fields: {
                    summary: 'Test summary without 16x16 avatars',
                    issuetype: { name: 'Bug', iconUrl: 'https://test-company.atlassian.net/secure/viewavatar?size=xsmall&avatarId=10303' },
                    reporter: {
                        displayName: 'Alice',
                        avatarUrls: { '48x48': 'https://test-company.atlassian.net/secure/useravatar?size=large' }
                    },
                    assignee: {
                        displayName: 'Bob',
                        avatarUrls: { '48x48': 'https://test-company.atlassian.net/secure/useravatar?size=large' }
                    },
                    status: { name: 'In Progress', statusCategory: { colorName: 'blue-gray' } },
                }
            }

            requestUrlMock.mockResolvedValueOnce({
                status: 200,
                headers: defaultHeaders,
                json: rawIssueResponse,
            } as any)

            const issue = await JiraClient.getIssue('TEST-103', { account: TestAccountOpen })

            expect(issue.key).toEqual('TEST-103')
            expect(issue.fields.reporter.avatarUrls['16x16']).toBeUndefined()
            expect(issue.fields.assignee.avatarUrls['16x16']).toBeUndefined()
        })
        test('getBoards includes query parameters when use2025Api is enabled', async () => {
            requestUrlMock.mockReturnValue({ status: 200, headers: defaultHeaders, json: { values: [] } } as any)
            
            const projectKey = "PRO";
            const resultLimit = 10;
            const account2025 = { ...TestAccountOpen, use2025Api: true }

            await JiraClient.getBoards(projectKey, { limit: resultLimit, account: account2025 })

            const calledUrl = (requestUrlMock.mock.calls[0][0] as obsidian.RequestUrlParam).url
            expect(calledUrl).toContain(`projectKeyOrId=${projectKey}`)
            expect(calledUrl).toContain(`maxResults=${resultLimit}`)
        })
        test('getBoards includes query parameters when use2025Api is disabled', async () => {
            requestUrlMock.mockReturnValue({ status: 200, headers: defaultHeaders, json: { values: [] } } as any)

            const projectKey = "PRO";
            const resultLimit = 10;

            await JiraClient.getBoards(projectKey, { limit: resultLimit, account: TestAccountOpen })

            const calledUrl = (requestUrlMock.mock.calls[0][0] as obsidian.RequestUrlParam).url
            expect(calledUrl).toContain(`projectKeyOrId=${projectKey}`)
            expect(calledUrl).toContain(`maxResults=${resultLimit}`)
        })
    })

    describe('Negative tests', () => {
        test('testConnection', async () => {
            expect.assertions(2)
            requestUrlMock.mockReturnValue({ status: 401, headers: defaultHeaders } as any)
            try {
                await JiraClient.testConnection(TestAccountOpen)
            } catch (e) {
                expect(e).toEqual(new Error(`Unauthorized: Please check your authentication credentials`))
                expect(requestUrlMock.mock.calls[0][0]).toEqual({
                    contentType: 'application/json',
                    headers: {
                        "Accept": "application/json",
                        "User-Agent": "obsidian-jira-issue-plugin",
                        "X-Atlassian-Token": "no-check",
                    },
                    method: 'GET',
                    url: 'https://test-company.atlassian.net/rest/api/latest/project',
                })
            }
        })

        test('testConnection rejects a non-JSON HTTP 200 response', async () => {
            requestUrlMock.mockReturnValue({ status: 200, headers: { 'Content-Type': 'text/plain' }, text: 'OK' } as any)

            await expect(JiraClient.testConnection(TestAccountOpen))
                .rejects.toEqual(new Error('Jira API 200 Error: HTTP 200'))
        })

        test('testConnection uses a JSON error message without content-type headers', async () => {
            requestUrlMock.mockReturnValue({ status: 500, json: { message: 'Jira is unavailable' } } as any)

            await expect(JiraClient.testConnection(TestAccountOpen))
                .rejects.toEqual(new Error('Jira API 500 Error: Jira is unavailable'))
        })

        test('testConnection normalizes content-type headers when reading text errors', async () => {
            requestUrlMock.mockReturnValue({ status: 500, headers: { 'Content-Type': 'TEXT/HTML' }, text: '<title>Log in</title>' } as any)

            await expect(JiraClient.testConnection(TestAccountOpen))
                .rejects.toEqual(new Error('Jira API 500 Error: Login required'))
        })

        test('testConnection handles a response.json getter that throws on a non-JSON body', async () => {
            // Obsidian's real requestUrl().json is a lazy getter that parses the body on
            // first access and throws (e.g. SyntaxError) for a non-JSON response, regardless
            // of what content-type says. Reproduce that exact behavior instead of a plain property.
            const throwingResponse: any = { status: 200, headers: { 'Content-Type': 'TEXT/HTML' }, text: '<title>Log in</title>' }
            Object.defineProperty(throwingResponse, 'json', {
                get() { throw new SyntaxError('Unexpected token < in JSON') },
            })
            requestUrlMock.mockReturnValue(throwingResponse)

            await expect(JiraClient.testConnection(TestAccountOpen))
                .rejects.toEqual(new Error('Jira API 200 Error: Login required'))
        })

        describe('request timeout', () => {
            beforeEach(() => {
                jest.useFakeTimers()
                requestUrlMock.mockReturnValueOnce(new Promise(() => { }) as any)
            })

            afterEach(() => {
                SettingsData.requestTimeout = DEFAULT_SETTINGS.requestTimeout
                jest.useRealTimers()
            })

            test('getIssue fails when Jira does not answer in time', async () => {
                SettingsData.requestTimeout = '5s'
                const issue = JiraClient.getIssue(kIssueKey, { account: TestAccountOpen })
                const assertion = expect(issue).rejects.toThrow('Timeout: Jira did not answer within 5 seconds')

                await jest.advanceTimersByTimeAsync(5000)

                await assertion
            })

            test('a number without unit means seconds', async () => {
                SettingsData.requestTimeout = '30'
                const issue = JiraClient.getIssue(kIssueKey, { account: TestAccountOpen })
                const assertion = expect(issue).rejects.toThrow('Timeout: Jira did not answer within 30 seconds')

                await jest.advanceTimersByTimeAsync(30000)

                await assertion
            })

            test('a timeout under 1 second is raised to 1 second', async () => {
                SettingsData.requestTimeout = '10ms'
                const issue = JiraClient.getIssue(kIssueKey, { account: TestAccountOpen })
                const assertion = expect(issue).rejects.toThrow('Timeout: Jira did not answer within 1 second')

                await jest.advanceTimersByTimeAsync(1000)

                await assertion
            })

            test('a timeout over the longest timer delay is lowered to it', async () => {
                SettingsData.requestTimeout = '30d'
                const settled = jest.fn()
                const issue = JiraClient.getIssue(kIssueKey, { account: TestAccountOpen })
                issue.then(settled, settled)
                const assertion = expect(issue).rejects.toThrow('Timeout: Jira did not answer within 25 days')

                await jest.advanceTimersByTimeAsync(1000)
                expect(settled).not.toHaveBeenCalled()
                await jest.advanceTimersByTimeAsync(2 ** 31 - 1 - 1000)

                await assertion
            })

            test('an invalid timeout falls back to the default', async () => {
                SettingsData.requestTimeout = 'soon'
                const issue = JiraClient.getIssue(kIssueKey, { account: TestAccountOpen })
                const assertion = expect(issue).rejects.toThrow('Timeout: Jira did not answer within 20 seconds')

                await jest.advanceTimersByTimeAsync(20000)

                await assertion
            })
        })
    })

    test.todo('getIssue')
    test.todo('getSearchResults')
    test.todo('updateStatusColorCache')
        test('customFieldsLoaded waits for the custom fields being loaded', async () => {
            SettingsData.accounts = [TestAccountOpen]
            let answer: (response: unknown) => void
            requestUrlMock.mockReturnValueOnce(new Promise(resolve => { answer = resolve }) as any)
            const loaded = jest.fn()

            void JiraClient.updateCustomFieldsCache()
            void JiraClient.customFieldsLoaded(TestAccountOpen).then(loaded)
            await Promise.resolve()
            expect(loaded).not.toHaveBeenCalled()

            answer({ status: 200, headers: defaultHeaders, json: [] })
            expect(await JiraClient.customFieldsLoaded(TestAccountOpen)).toEqual(true)
            expect(loaded).toHaveBeenCalledWith(true)
        })

        describe('when the custom field names fail to load', () => {
            const accountWithoutNames = (id: string) => ({
                ...TestAccountOpen,
                id,
                cache: { ...TestAccountOpen.cache, customFieldsIdToName: {} as Record<string, string>, customFieldsNameToId: {} as Record<string, string>, customFieldsType: {} },
            })
            const forbidden = { status: 403, headers: defaultHeaders, json: {} } as any
            const fields = { status: 200, headers: defaultHeaders, json: [{ custom: true, name: 'Team', schema: { customId: 10010 } }] } as any
            const retryInterval = 60 * 1000
            const originalAccounts = SettingsData.accounts
            let consoleError: jest.SpyInstance
            let now: number

            beforeEach(() => {
                consoleError = jest.spyOn(console, 'error').mockImplementation(() => null)
                now = 1000000
                jest.spyOn(Date, 'now').mockImplementation(() => now)
            })

            afterEach(async () => {
                // Leave no accounts or load results behind for other tests
                SettingsData.accounts = []
                await JiraClient.updateCustomFieldsCache()
                SettingsData.accounts = originalAccounts
                jest.restoreAllMocks()
            })

            test('customFieldsLoaded tells which accounts have no names', async () => {
                const failingAccount = accountWithoutNames('failing')
                const workingAccount = accountWithoutNames('working')
                SettingsData.accounts = [failingAccount, workingAccount]
                requestUrlMock
                    .mockReturnValueOnce(forbidden)
                    .mockReturnValueOnce(fields)

                await JiraClient.updateCustomFieldsCache()

                expect(await JiraClient.customFieldsLoaded(failingAccount)).toEqual(false)
                expect(await JiraClient.customFieldsLoaded(workingAccount)).toEqual(true)
            })

            test('customFieldsLoaded waits before loading the names again', async () => {
                const account = accountWithoutNames('backoff')
                SettingsData.accounts = [account]
                requestUrlMock.mockReturnValueOnce(forbidden)
                await JiraClient.updateCustomFieldsCache()

                now += retryInterval - 1
                expect(await JiraClient.customFieldsLoaded(account)).toEqual(false)
                expect(requestUrlMock).toHaveBeenCalledTimes(1)

                requestUrlMock.mockReturnValueOnce(forbidden)
                now += 1
                expect(await JiraClient.customFieldsLoaded(account)).toEqual(false)
                expect(requestUrlMock).toHaveBeenCalledTimes(2)

                // The failed retry starts the waiting time again
                now += retryInterval - 1
                expect(await JiraClient.customFieldsLoaded(account)).toEqual(false)
                expect(requestUrlMock).toHaveBeenCalledTimes(2)
            })

            test('customFieldsLoaded loads the names again, once for parallel calls', async () => {
                const account = accountWithoutNames('retry')
                SettingsData.accounts = [account]
                requestUrlMock
                    .mockReturnValueOnce(forbidden)
                    .mockReturnValueOnce(fields)
                await JiraClient.updateCustomFieldsCache()
                now += retryInterval

                const loaded = await Promise.all([JiraClient.customFieldsLoaded(account), JiraClient.customFieldsLoaded(account)])

                expect(loaded).toEqual([true, true])
                expect(account.cache.customFieldsNameToId['Team']).toEqual('10010')
                expect(SettingsData.cache.columns).toContain('TEAM')
                expect(await JiraClient.customFieldsLoaded(account)).toEqual(true)
                expect(requestUrlMock).toHaveBeenCalledTimes(2)
            })

            test('names of an earlier load still count when loading them again fails', async () => {
                const account = accountWithoutNames('reload')
                SettingsData.accounts = [account]
                requestUrlMock
                    .mockReturnValueOnce(fields)
                    .mockReturnValueOnce(forbidden)
                await JiraClient.updateCustomFieldsCache()

                await JiraClient.updateCustomFieldsCache()

                expect(await JiraClient.customFieldsLoaded(account)).toEqual(true)
                expect(account.cache.customFieldsNameToId['Team']).toEqual('10010')
                // The suggestions are reset by every full update, the earlier names are added again
                expect(SettingsData.cache.columns.filter(c => c === 'TEAM')).toHaveLength(1)
            })

            test('a retry still running when a full update starts changes nothing', async () => {
                const account = accountWithoutNames('superseded')
                SettingsData.accounts = [account]
                requestUrlMock.mockReturnValueOnce(forbidden)
                await JiraClient.updateCustomFieldsCache()
                now += retryInterval

                let answerRetry: (response: unknown) => void
                requestUrlMock.mockReturnValueOnce(new Promise(resolve => { answerRetry = resolve }) as any)
                const retry = JiraClient.customFieldsLoaded(account)
                await new Promise(resolve => setImmediate(resolve))

                requestUrlMock.mockReturnValueOnce(fields)
                await JiraClient.updateCustomFieldsCache()
                answerRetry(fields)
                await retry

                expect(SettingsData.cache.columns.filter(c => c === 'TEAM')).toHaveLength(1)
                expect(requestUrlMock).toHaveBeenCalledTimes(3)
            })

            test('a caller waiting for an update gets the result of a newer one', async () => {
                const account = accountWithoutNames('newer')
                SettingsData.accounts = [account]
                let answerFirst: (response: unknown) => void
                requestUrlMock.mockReturnValueOnce(new Promise(resolve => { answerFirst = resolve }) as any)
                void JiraClient.updateCustomFieldsCache()
                await new Promise(resolve => setImmediate(resolve))
                const waiting = JiraClient.customFieldsLoaded(account)

                requestUrlMock.mockReturnValueOnce(fields)
                const second = JiraClient.updateCustomFieldsCache()
                answerFirst(forbidden)
                await second

                expect(await waiting).toEqual(true)
                // No extra load because of the outdated result of the first update
                expect(requestUrlMock).toHaveBeenCalledTimes(2)
            })

            test('a field without a name is skipped', async () => {
                const account = accountWithoutNames('noname')
                SettingsData.accounts = [account]
                requestUrlMock.mockReturnValueOnce({ ...fields, json: [{ custom: true, name: null, schema: { customId: 10011 } }, ...fields.json] })

                await expect(JiraClient.updateCustomFieldsCache()).resolves.toBeUndefined()
                expect(account.cache.customFieldsNameToId['Team']).toEqual('10010')
                expect(account.cache.customFieldsIdToName['10011']).toBeUndefined()
                expect(SettingsData.cache.columns).toContain('EPIC NAME')
            })

            test('the wait counts from the end of a slow request', async () => {
                const account = accountWithoutNames('slow')
                SettingsData.accounts = [account]
                requestUrlMock.mockImplementationOnce((async () => {
                    now += retryInterval
                    return forbidden
                }) as any)
                await JiraClient.updateCustomFieldsCache()

                now += retryInterval - 1
                expect(await JiraClient.customFieldsLoaded(account)).toEqual(false)
                expect(requestUrlMock).toHaveBeenCalledTimes(1)
            })

            test('a replaced full update stops loading the remaining accounts', async () => {
                const first = accountWithoutNames('first')
                const second = accountWithoutNames('second')
                SettingsData.accounts = [first, second]
                let answerFirst: (response: unknown) => void
                requestUrlMock.mockReturnValueOnce(new Promise(resolve => { answerFirst = resolve }) as any)
                void JiraClient.updateCustomFieldsCache()
                await new Promise(resolve => setImmediate(resolve))

                requestUrlMock.mockReturnValueOnce(fields).mockReturnValueOnce(fields)
                const newer = JiraClient.updateCustomFieldsCache()
                answerFirst(fields)
                await newer
                await new Promise(resolve => setImmediate(resolve))

                expect(requestUrlMock).toHaveBeenCalledTimes(3)
                expect(SettingsData.cache.columns.filter(c => c === 'TEAM')).toHaveLength(2)
            })

            test('a retry replaced by a successful full update counts its result', async () => {
                const account = accountWithoutNames('replacedRetry')
                SettingsData.accounts = [account]
                requestUrlMock.mockReturnValueOnce(forbidden)
                await JiraClient.updateCustomFieldsCache()
                now += retryInterval

                let answerRetry: (response: unknown) => void
                requestUrlMock.mockReturnValueOnce(new Promise(resolve => { answerRetry = resolve }) as any)
                const retry = JiraClient.customFieldsLoaded(account)
                await new Promise(resolve => setImmediate(resolve))
                requestUrlMock.mockReturnValueOnce(fields)
                const update = JiraClient.updateCustomFieldsCache()
                answerRetry(forbidden)
                await update

                expect(await retry).toEqual(true)
            })

            test('names loaded for another host do not count', async () => {
                const account = accountWithoutNames('hostChange')
                SettingsData.accounts = [account]
                requestUrlMock.mockReturnValueOnce(fields)
                await JiraClient.updateCustomFieldsCache()

                account.host = 'https://other.example.com'
                expect(await JiraClient.customFieldsLoaded(account)).toEqual(false)
            })

            test('a retry for the old host does not change the names after a host change', async () => {
                const account = accountWithoutNames('oldHostRetry')
                SettingsData.accounts = [account]
                requestUrlMock.mockReturnValueOnce(forbidden)
                await JiraClient.updateCustomFieldsCache()
                now += retryInterval

                let answerRetry: (response: unknown) => void
                requestUrlMock.mockReturnValueOnce(new Promise(resolve => { answerRetry = resolve }) as any)
                const retry = JiraClient.customFieldsLoaded(account)
                await new Promise(resolve => setImmediate(resolve))
                account.host = 'https://other.example.com'
                answerRetry(fields)

                expect(await retry).toEqual(false)
                expect(account.cache.customFieldsNameToId['Team']).toBeUndefined()
            })

            test('an account without cache gets one when the names load', async () => {
                const account = { ...TestAccountOpen, id: 'nocacheLoaded', cache: undefined as any }
                SettingsData.accounts = [account]
                requestUrlMock.mockReturnValueOnce(fields)

                await JiraClient.updateCustomFieldsCache()

                expect(account.cache.customFieldsNameToId['Team']).toEqual('10010')
                expect(await JiraClient.customFieldsLoaded(account)).toEqual(true)
            })

            test('an account without cache does not break the update', async () => {
                const account = { ...TestAccountOpen, id: 'nocache', cache: undefined as any }
                SettingsData.accounts = [account]
                requestUrlMock.mockReturnValueOnce(forbidden)

                await expect(JiraClient.updateCustomFieldsCache()).resolves.toBeUndefined()
                expect(await JiraClient.customFieldsLoaded(account)).toEqual(false)
            })
        })

        test('updateCustomFieldsCache populates virtual EPIC NAME mapping', async () => {
            SettingsData.accounts = [TestAccountOpen]
            requestUrlMock.mockReturnValue({ status: 200, headers: defaultHeaders, json: [] } as any)
            await JiraClient.updateCustomFieldsCache()
            expect((TestAccountOpen.cache.customFieldsNameToId as any)['EPIC NAME']).toEqual('VIRTUAL_EPIC_NAME')
            expect((TestAccountOpen.cache.customFieldsIdToName as any)['VIRTUAL_EPIC_NAME']).toEqual('EPIC NAME')
        })
    test.todo('getLoggedUser')
    test.todo('getDevStatus')

    afterEach(() => {
        jest.clearAllMocks()
    })
})

export { }
