import * as obsidian from 'obsidian'
import JiraClient from '../src/client/jiraClient'
import { TestAccountOpen } from './testData'
import { SettingsData } from '../src/settings'

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
    })

    test.todo('getIssue')
    test.todo('getSearchResults')
    test.todo('updateStatusColorCache')
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
