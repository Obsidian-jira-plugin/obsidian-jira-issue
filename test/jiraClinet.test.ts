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
