import { Platform, requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian'
import { AVATAR_RESOLUTION, EAuthenticationTypes, IJiraIssueAccountSettings } from '../interfaces/settingsInterfaces'
import { ESprintState, IJiraAutocompleteField, IJiraBoard, IJiraDevStatus, IJiraField, IJiraIssue, IJiraSearchResults, IJiraSprint, IJiraStatus, IJiraUser } from '../interfaces/issueInterfaces'
import { SettingsData } from "../settings"
import { JIRA_DEFAULT_ISSUE_ICON, JIRA_DEFAULT_PRIORITY_ICON, JIRA_ISSUE_TYPE_ICON_MAP, JIRA_PRIORITY_ICON_MAP } from '../rendering/jiraIcons'

interface RequestOptions {
    method: string
    path: string
    path2025?: string
    queryParameters?: URLSearchParams
    queryParameters2025?: URLSearchParams
    account?: IJiraIssueAccountSettings
    noBasePath?: boolean
}

function getMimeType(imageBuffer: ArrayBuffer): string {
    const imageBufferUint8 = new Uint8Array(imageBuffer.slice(0, 4))
    const bytes: string[] = []
    imageBufferUint8.forEach((byte) => {
        bytes.push(byte.toString(16))
    })
    const hex = bytes.join('').toUpperCase()
    switch (hex) {
        case '89504E47':
            return 'image/png'
        case '47494638':
            return 'image/gif'
        case 'FFD8FFDB':
        case 'FFD8FFE0':
        case 'FFD8FFE1':
            return 'image/jpeg'
        case '3C737667':
        case '3C3F786D':
            return 'image/svg+xml'
        default:
            SettingsData.logImagesFetch && console.error('Image mimeType not found:', hex)
            return null
    }
}

function bufferBase64Encode(b: ArrayBuffer) {
    const a = new Uint8Array(b)
    if (Platform.isMobileApp) {
        return btoa(String.fromCharCode(...a))
    } else {
        return Buffer.from(a).toString('base64')
    }
}

function base64Encode(s: string) {
    if (Platform.isMobileApp) {
        return btoa(s)
    } else {
        return Buffer.from(s).toString('base64')
    }
}

function buildUrl(host: string, requestOptions: RequestOptions, use2025Api: boolean): string {
    const basePath = requestOptions.noBasePath ? '' : SettingsData.apiBasePath
    // Normalize URL parts to prevent double slashes
    const normalizedHost = host.endsWith('/') ? host.slice(0, -1) : host
    const normalizedBasePath = basePath ? (basePath.startsWith('/') ? basePath : '/' + basePath) : ''
    const path = (use2025Api && requestOptions.path2025) ? requestOptions.path2025 : requestOptions.path
    const normalizedPath = path.startsWith('/') ? path : '/' + path

    const url = new URL(`${normalizedHost}${normalizedBasePath}${normalizedPath}`)
    const queryParameters = use2025Api ? requestOptions.queryParameters2025 : requestOptions.queryParameters
    if (queryParameters) {
        url.search = queryParameters.toString()
    }
    return url.toString()
}

function buildHeaders(account: IJiraIssueAccountSettings): Record<string, string> {
    const requestHeaders: Record<string, string> = {
        'User-Agent': 'obsidian-jira-issue-plugin',
        'X-Atlassian-Token': 'no-check',
        'Accept': 'application/json',
    }
    if (account.authenticationType === EAuthenticationTypes.BASIC || account.authenticationType === EAuthenticationTypes.CLOUD) {
        requestHeaders['Authorization'] = 'Basic ' + base64Encode(`${account.username}:${account.password}`)
    } else if (account.authenticationType === EAuthenticationTypes.BEARER_TOKEN) {
        requestHeaders['Authorization'] = `Bearer ${account.bareToken}`
    }
    return requestHeaders
}

function getResponseHeader(response: RequestUrlResponse, headerName: string): string | undefined {
    if (!response || !response.headers) {
        return undefined
    }
    const normalizedHeaderName = headerName.toLowerCase()
    const matchingHeader = Object.keys(response.headers).find(header => header.toLowerCase() === normalizedHeaderName)
    return matchingHeader ? response.headers[matchingHeader] : undefined
}

function hasJsonBody(response: RequestUrlResponse): boolean {
    if (!response) {
        return false
    }
    if (response.json !== undefined && response.json !== null) {
        return true
    }
    if (typeof response.text === 'string' && response.text.trim()) {
        try {
            response.json = JSON.parse(response.text)
            return true
        } catch {
            return false
        }
    }
    return false
}

function isTextResponse(response: RequestUrlResponse): boolean {
    if (!response || response.text === undefined) {
        return false
    }
    const contentType = getResponseHeader(response, 'content-type')
    const normalizedContentType = contentType && contentType.toLowerCase()
    return !normalizedContentType || normalizedContentType.includes('text') || normalizedContentType.includes('html')
}

async function sendRequest(requestOptions: RequestOptions): Promise<any> {
    let response: RequestUrlResponse
    if (requestOptions.account) {
        response = await sendRequestWithAccount(requestOptions.account, requestOptions)

        if (response.status === 200 && hasJsonBody(response)) {
            return { ...response.json, account: requestOptions.account }
        }
    } else {
        for (let i = 0; i < SettingsData.accounts.length; i++) {
            const account = SettingsData.accounts[i]
            response = await sendRequestWithAccount(account, requestOptions)

            if (response.status === 200 && hasJsonBody(response)) {
                return { ...response.json, account: account }
            } else if (Math.floor(response.status / 100) !== 4) {
                break
            }
        }
    }

    if (hasJsonBody(response) && response.json.errorMessages) {
        throw new Error(response.json.errorMessages.join('\n'))
    } else if (response && response.status) {
        let errorMsg
        switch (response.status) {
            case 400:
                throw new Error(`Bad Request: The query is not valid`)
            case 401:
                throw new Error(`Unauthorized: Please check your authentication credentials`)
            case 403:
                throw new Error(`Forbidden: You don't have permission to access this resource. Check your API token permissions and Jira project access.`)
            case 404:
                throw new Error(`Not Found: Issue does not exist`)
            case 410:
                throw new Error(`Missing API: Activate the 2025 search api in the Jira Issue account settings`)
            default:
                if (hasJsonBody(response) && response.json.message) {
                    errorMsg = response.json.message
                } else if (isTextResponse(response) && response.text.includes('<title>Log in')) {
                    errorMsg = 'Login required'
                } else {
                    errorMsg = `HTTP ${response.status}`
                }
                throw new Error(`Jira API ${response.status} Error: ${errorMsg}`)
        }
    } else {
        throw new Error(response as any)
    }
}

async function sendRequestWithAccount(account: IJiraIssueAccountSettings, requestOptions: RequestOptions): Promise<RequestUrlResponse> {
    let response
    const requestUrlParam: RequestUrlParam = {
        method: requestOptions.method,
        url: buildUrl(account.host, requestOptions, account.use2025Api),
        headers: buildHeaders(account),
        contentType: 'application/json',
    }
    try {
        response = await requestUrl(requestUrlParam)
        SettingsData.logRequestsResponses && console.info('JiraIssue:Fetch:', { request: requestUrlParam, response })
    } catch (errorResponse) {
        SettingsData.logRequestsResponses && console.warn('JiraIssue:Fetch:', { request: requestUrlParam, response: errorResponse })
        response = errorResponse
    }
    return response
}

async function preFetchImage(account: IJiraIssueAccountSettings, url: string): Promise<string> {
    // Pre fetch only images hosted on the Jira server
    if (!url.startsWith(account.host)) {
        return url
    }

    const options = {
        url: url,
        method: 'GET',
        headers: buildHeaders(account),
    }
    let response: RequestUrlResponse
    try {
        response = await requestUrl(options)
        SettingsData.logImagesFetch && console.info('JiraIssue:FetchImage:', { request: options, response })
    } catch (errorResponse) {
        SettingsData.logImagesFetch && console.warn('JiraIssue:FetchImage:', { request: options, response: errorResponse })
        response = errorResponse
    }

    if (response.status === 200) {
        const mimeType = getMimeType(response.arrayBuffer)
        if (mimeType) {
            return `data:${mimeType};base64,` + bufferBase64Encode(response.arrayBuffer)
        }
    }
    return null
}

async function fetchIssueImages(issue: IJiraIssue) {
    const disableImages = issue.account?.disableImageFetch
    if (issue.fields) {
        if (issue.fields.issuetype && issue.fields.issuetype.iconUrl) {
            if (disableImages) {
                const typeName = (issue.fields.issuetype.name || '').toLowerCase()
                issue.fields.issuetype.iconUrl = JIRA_ISSUE_TYPE_ICON_MAP[typeName] || (typeName.startsWith("sub-") && JIRA_ISSUE_TYPE_ICON_MAP["subtask"]) || JIRA_DEFAULT_ISSUE_ICON
            } else {
                issue.fields.issuetype.iconUrl = await preFetchImage(issue.account, issue.fields.issuetype.iconUrl)
            }
        }
        if (issue.fields.reporter) {
            if (disableImages) {
                if (issue.fields.reporter.avatarUrls) {
                    issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION] = ""
                }
            } else if (issue.fields.reporter.avatarUrls) {
                issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION] = await preFetchImage(issue.account, issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION])
            }
        }
        if (issue.fields.assignee && issue.fields.assignee.avatarUrls) {
            if (disableImages) {
                issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION] = ""
            } else {
                issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION] = await preFetchImage(issue.account, issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION])
            }
        }
        if (issue.fields.priority && issue.fields.priority.iconUrl) {
            if (disableImages) {
                const priorityName = (issue.fields.priority.name || '').toLowerCase()
                issue.fields.priority.iconUrl = JIRA_PRIORITY_ICON_MAP[priorityName] || JIRA_DEFAULT_PRIORITY_ICON
            } else {
                issue.fields.priority.iconUrl = await preFetchImage(issue.account, issue.fields.priority.iconUrl)
            }
        }
    }
}

export default {

    async getIssue(issueKey: string, options: { fields?: string[], account?: IJiraIssueAccountSettings } = {}): Promise<IJiraIssue> {
        const opt = {
            fields: (options.fields && options.fields.length > 0) ? options.fields : ['*all'],
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            fields: opt.fields.join(','),
        })
        const issue = await sendRequest(
            {
                method: 'GET',
                path: `/issue/${issueKey}`,
                account: opt.account,
                queryParameters: queryParameters,
            }
        ) as IJiraIssue
        await fetchIssueImages(issue)
        return issue
    },

    async getSearchResults(query: string, options: { limit?: number, offset?: number, fields?: string[], account?: IJiraIssueAccountSettings } = {}): Promise<IJiraSearchResults> {
        const opt = {
            fields: options.fields || ['*all'],
            offset: options.offset || 0,
            limit: options.limit || 50,
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            jql: query,
            fields: opt.fields.join(','),
            startAt: opt.offset > 0 ? opt.offset.toString() : '',
            maxResults: opt.limit > 0 ? opt.limit.toString() : '',
        })
        const queryParameters2025 = new URLSearchParams({
            jql: query,
            fields: opt.fields.join(','),
            nextPageToken: opt.offset > 0 ? opt.offset.toString() : '',
            maxResults: opt.limit > 0 ? opt.limit.toString() : '',
        })
        const searchResults = await sendRequest(
            {
                method: 'GET',
                path: '/search',
                path2025: '/search/jql',
                queryParameters: queryParameters,
                queryParameters2025: queryParameters2025,
                account: opt.account,
            }
        ) as IJiraSearchResults
        for (const issue of searchResults.issues) {
            issue.account = searchResults.account
            await fetchIssueImages(issue)
        }
        return searchResults
    },

    async updateStatusColorCache(status: string, account: IJiraIssueAccountSettings): Promise<void> {
        if (status in account.cache.statusColor) {
            return
        }
        const response = await sendRequest(
            {
                method: 'GET',
                path: `/status/${status}`,
            }
        ) as IJiraStatus
        account.cache.statusColor[status] = response.statusCategory.colorName
    },

    async updateCustomFieldsCache(): Promise<void> {
        SettingsData.cache.columns = []
        for (const account of SettingsData.accounts) {
            try {
                const response = await sendRequest(
                    {
                        method: 'GET',
                        path: `/field`,
                        account: account,
                    }
                ) as IJiraField[]
                account.cache.customFieldsIdToName = {}
                account.cache.customFieldsNameToId = {}
                account.cache.customFieldsType = {}
                for (const i in response) {
                    const field = response[i]
                    if (field.custom && field.schema && field.schema.customId) {
                        account.cache.customFieldsIdToName[field.schema.customId] = field.name
                        account.cache.customFieldsNameToId[field.name] = field.schema.customId.toString()
                        account.cache.customFieldsType[field.schema.customId] = field.schema
                        SettingsData.cache.columns.push(field.schema.customId.toString(), field.name.toUpperCase())
                    }
                }
                // Virtual field mapping for deprecated Epic fields and Parent fields (only if not provided by Jira server)
                if (!account.cache.customFieldsNameToId['EPIC NAME']) account.cache.customFieldsNameToId['EPIC NAME'] = 'VIRTUAL_EPIC_NAME'
                if (!account.cache.customFieldsNameToId['Epic Name']) account.cache.customFieldsNameToId['Epic Name'] = 'VIRTUAL_EPIC_NAME'
                if (!account.cache.customFieldsNameToId['EPIC LINK']) account.cache.customFieldsNameToId['EPIC LINK'] = 'VIRTUAL_EPIC_NAME'
                if (!account.cache.customFieldsNameToId['Epic Link']) account.cache.customFieldsNameToId['Epic Link'] = 'VIRTUAL_EPIC_NAME'
                account.cache.customFieldsIdToName['VIRTUAL_EPIC_NAME'] = 'EPIC NAME'

                if (!account.cache.customFieldsNameToId['PARENT']) account.cache.customFieldsNameToId['PARENT'] = 'VIRTUAL_PARENT'
                if (!account.cache.customFieldsNameToId['Parent']) account.cache.customFieldsNameToId['Parent'] = 'VIRTUAL_PARENT'
                if (!account.cache.customFieldsNameToId['PARENT LINK']) account.cache.customFieldsNameToId['PARENT LINK'] = 'VIRTUAL_PARENT'
                if (!account.cache.customFieldsNameToId['Parent Link']) account.cache.customFieldsNameToId['Parent Link'] = 'VIRTUAL_PARENT'
                account.cache.customFieldsIdToName['VIRTUAL_PARENT'] = 'PARENT'
            } catch (e) {
                console.error('Error while retrieving custom fields list of account:', account.alias, e)
            }
        }
        if (SettingsData.cache.columns.indexOf('EPIC NAME') === -1) {
            SettingsData.cache.columns.push('EPIC NAME')
        }
        if (SettingsData.cache.columns.indexOf('EPIC LINK') === -1) {
            SettingsData.cache.columns.push('EPIC LINK')
        }
        if (SettingsData.cache.columns.indexOf('PARENT') === -1) {
            SettingsData.cache.columns.push('PARENT')
        }
        if (SettingsData.cache.columns.indexOf('PARENT LINK') === -1) {
            SettingsData.cache.columns.push('PARENT LINK')
        }
    },

    // async updateJQLAutoCompleteCache(): Promise<void> {
    // const response = await sendRequest(
    //     {
    //         method: 'GET',
    //         path: `/jql/autocompletedata`,
    //     }
    // ) as IJiraAutocompleteData
    // settingData.cache.jqlAutocomplete = { fields: [], functions: {} }
    // for (const functionData of response.visibleFunctionNames) {
    //     for (const functionType of functionData.types) {
    //         if (functionType in settingData.cache.jqlAutocomplete.functions) {
    //             settingData.cache.jqlAutocomplete.functions[functionType].push(functionData.value)
    //         } else {
    //             settingData.cache.jqlAutocomplete.functions[functionType] = [functionData.value]
    //         }
    //     }
    // }
    // settingData.cache.jqlAutocomplete.fields = response.visibleFieldNames
    // },

    async getJQLAutoCompleteField(fieldName: string, fieldValue: string): Promise<IJiraAutocompleteField> {
        const queryParameters = new URLSearchParams({
            fieldName: fieldName,
            fieldValue: fieldValue,
        })
        return await sendRequest(
            {
                method: 'GET',
                path: `/jql/autocompletedata/suggestions`,
                queryParameters: queryParameters,
            }
        ) as IJiraAutocompleteField
    },

    async testConnection(account: IJiraIssueAccountSettings): Promise<boolean> {
        await sendRequest(
            {
                method: 'GET',
                path: `/project`,
                account: account,
            }
        )
        return true
    },

    async getLoggedUser(account: IJiraIssueAccountSettings = null): Promise<IJiraUser> {
        return await sendRequest(
            {
                method: 'GET',
                path: `/myself`,
                account: account,
            }
        ) as IJiraUser
    },

    async getDevStatus(issueId: string, options: { account?: IJiraIssueAccountSettings } = {}): Promise<IJiraDevStatus> {
        const opt = {
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            issueId: issueId,
        })
        return await sendRequest(
            {
                method: 'GET',
                path: `/rest/dev-status/latest/issue/summary`,
                queryParameters: queryParameters,
                noBasePath: true,
                account: opt.account,
            }
        ) as IJiraDevStatus
    },

    async getBoards(projectKeyOrId: string, options: { limit?: number, offset?: number, account?: IJiraIssueAccountSettings } = {}): Promise<IJiraBoard[]> {
        const opt = {
            offset: options.offset || 0,
            limit: options.limit || 50,
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            projectKeyOrId: projectKeyOrId,
            startAt: opt.offset > 0 ? opt.offset.toString() : '',
            maxResults: opt.limit > 0 ? opt.limit.toString() : '',
        })
        const boards = await sendRequest(
            {
                method: 'GET',
                path: `/rest/agile/1.0/board`,
                queryParameters: queryParameters,
                noBasePath: true,
                account: opt.account,
            }
        )
        if (boards.values && boards.values.length) {
            return boards.values
        }
        return []
    },

    async getSprints(boardId: number, options: { limit?: number, offset?: number, state?: ESprintState[], account?: IJiraIssueAccountSettings } = {}): Promise<IJiraSprint[]> {
        const opt = {
            state: options.state || [],
            offset: options.offset || 0,
            limit: options.limit || 50,
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            state: opt.state.join(','),
            startAt: opt.offset > 0 ? opt.offset.toString() : '',
            maxResults: opt.limit > 0 ? opt.limit.toString() : '',
        })
        const sprints = await sendRequest(
            {
                method: 'GET',
                path: `/rest/agile/1.0/board/${boardId}/sprint`,
                queryParameters: queryParameters,
                noBasePath: true,
                account: opt.account,
            }
        )
        if (sprints.values && sprints.values.length) {
            return sprints.values
        }
        return []
    },

    async getSprint(sprintId: number, options: { account?: IJiraIssueAccountSettings } = {}): Promise<IJiraSprint> {
        const opt = {
            account: options.account || null
        }
        return await sendRequest(
            {
                method: 'GET',
                path: `/rest/agile/1.0/sprint/${sprintId}`,
                noBasePath: true,
                account: opt.account,
            }
        )
    },
}
