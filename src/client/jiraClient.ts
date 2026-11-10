import ms from 'ms'
import { Platform, requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian'
import { AVATAR_RESOLUTION, EAuthenticationTypes, IJiraIssueAccountSettings } from '../interfaces/settingsInterfaces'
import { ESprintState, IJiraAutocompleteField, IJiraBoard, IJiraDevStatus, IJiraField, IJiraFieldSchema, IJiraIssue, IJiraSearchResults, IJiraSprint, IJiraStatus, IJiraUser } from '../interfaces/issueInterfaces'
import { DEFAULT_ACCOUNT, DEFAULT_SETTINGS, SettingsData } from "../settings"
import { getIssueTypeIconUrl, getPriorityIconUrl } from '../rendering/jiraIcons'

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
    if (!imageBuffer) return null
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
    if (!b) return ''
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
    const queryParameters = (use2025Api && requestOptions.queryParameters2025) ? requestOptions.queryParameters2025 : requestOptions.queryParameters
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
    try {
        // response.json is a lazy getter that parses the body on first access and throws
        // (e.g. SyntaxError) if it isn't valid JSON, regardless of what content-type says.
        if (response.json !== undefined && response.json !== null) {
            return true
        }
    } catch {
        // Fall through to parsing response.text instead.
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

class RequestTimeoutError extends Error { }

const MIN_REQUEST_TIMEOUT_MS = 1000
// setTimeout fires right away for longer delays (about 24.8 days)
const MAX_REQUEST_TIMEOUT_MS = 2 ** 31 - 1

function getRequestTimeoutMs(): number {
    const value = (SettingsData.requestTimeout || '').trim() || DEFAULT_SETTINGS.requestTimeout
    // ms() reads a plain number as milliseconds, but "30" here means 30 seconds
    const timeout = /^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : ms(value)
    if (!(timeout > 0)) {
        return ms(DEFAULT_SETTINGS.requestTimeout)
    }
    return Math.min(Math.max(timeout, MIN_REQUEST_TIMEOUT_MS), MAX_REQUEST_TIMEOUT_MS)
}

// requestUrl has no timeout: a request sent on a connection that stopped working (e.g. right
// after switching VPN) never settles, and the issue would stay on "Loading ..." forever
function requestUrlWithTimeout(requestUrlParam: RequestUrlParam): Promise<RequestUrlResponse> {
    const timeoutMs = getRequestTimeoutMs()
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new RequestTimeoutError(`Timeout: Jira did not answer within ${ms(timeoutMs, { long: true })}`))
        }, timeoutMs)
        Promise.resolve(requestUrl(requestUrlParam)).then(response => {
            clearTimeout(timer)
            resolve(response)
        }, error => {
            clearTimeout(timer)
            reject(error)
        })
    })
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
        response = await requestUrlWithTimeout(requestUrlParam)
        SettingsData.logRequestsResponses && console.info('JiraIssue:Fetch:', { request: requestUrlParam, response })
    } catch (errorResponse) {
        SettingsData.logRequestsResponses && console.warn('JiraIssue:Fetch:', { request: requestUrlParam, response: errorResponse })
        if (errorResponse instanceof RequestTimeoutError) {
            throw errorResponse
        }
        response = errorResponse
    }
    return response
}

async function preFetchImage(account: IJiraIssueAccountSettings, url: string): Promise<string> {
    if (!url || typeof url !== 'string') {
        return url || ''
    }
    // Pre fetch only images hosted on the Jira server
    if (!account || !account.host || !url.startsWith(account.host)) {
        return url
    }

    const options = {
        url: url,
        method: 'GET',
        headers: buildHeaders(account),
    }
    let response: RequestUrlResponse
    try {
        response = await requestUrlWithTimeout(options)
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
                issue.fields.issuetype.iconUrl = getIssueTypeIconUrl(issue.fields.issuetype.name)
            } else {
                issue.fields.issuetype.iconUrl = await preFetchImage(issue.account, issue.fields.issuetype.iconUrl)
            }
        }
        if (issue.fields.reporter) {
            if (disableImages) {
                if (issue.fields.reporter.avatarUrls) {
                    issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION] = ""
                }
            } else if (issue.fields.reporter.avatarUrls && issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION]) {
                issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION] = await preFetchImage(issue.account, issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION])
            }
        }
        if (issue.fields.assignee && issue.fields.assignee.avatarUrls) {
            if (disableImages) {
                issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION] = ""
            } else if (issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION]) {
                issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION] = await preFetchImage(issue.account, issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION])
            }
        }
        if (issue.fields.priority && issue.fields.priority.iconUrl) {
            if (disableImages) {
                issue.fields.priority.iconUrl = getPriorityIconUrl(issue.fields.priority.name)
            } else {
                issue.fields.priority.iconUrl = await preFetchImage(issue.account, issue.fields.priority.iconUrl)
            }
        }
    }
}

// A failed load of the custom field names is tried again at most this often per account,
// so an account whose /field keeps failing doesn't send a request on every render
const CUSTOM_FIELDS_RETRY_INTERVAL_MS = 60 * 1000

interface ICustomFieldsState {
    // The names of the account are known, from this load or an earlier one
    loaded: boolean
    loading: Promise<boolean> | null
    lastAttempt: number
    // Names loaded for another host don't count, e.g. after the host of the account was changed
    host: string
}

// One entry per account, replaced as a whole when a full update starts. Loads started for an
// older set don't change names or column suggestions anymore once they finish
let customFieldsStates = new Map<IJiraIssueAccountSettings, ICustomFieldsState>()
let customFieldsUpdate: Promise<void> = Promise.resolve()

function hasCustomFieldNames(account: IJiraIssueAccountSettings): boolean {
    return Object.keys(account.cache?.customFieldsNameToId || {}).length > 0
}

// Builds the new maps first, so a response that can't be read leaves the names of an earlier load untouched
function applyAccountCustomFields(account: IJiraIssueAccountSettings, response: IJiraField[]): void {
    const idToName: Record<string, string> = {}
    const nameToId: Record<string, string> = {}
    const types: Record<string, IJiraFieldSchema> = {}
    for (const i in response) {
        const field = response[i]
        if (field.custom && field.schema && field.schema.customId && typeof field.name === 'string') {
            idToName[field.schema.customId] = field.name
            nameToId[field.name] = field.schema.customId.toString()
            types[field.schema.customId] = field.schema
        }
    }
    // Virtual field mapping for deprecated Epic fields and Parent fields (only if not provided by Jira server)
    if (!nameToId['EPIC NAME']) nameToId['EPIC NAME'] = 'VIRTUAL_EPIC_NAME'
    if (!nameToId['Epic Name']) nameToId['Epic Name'] = 'VIRTUAL_EPIC_NAME'
    if (!nameToId['EPIC LINK']) nameToId['EPIC LINK'] = 'VIRTUAL_EPIC_NAME'
    if (!nameToId['Epic Link']) nameToId['Epic Link'] = 'VIRTUAL_EPIC_NAME'
    idToName['VIRTUAL_EPIC_NAME'] = 'EPIC NAME'

    if (!nameToId['PARENT']) nameToId['PARENT'] = 'VIRTUAL_PARENT'
    if (!nameToId['Parent']) nameToId['Parent'] = 'VIRTUAL_PARENT'
    if (!nameToId['PARENT LINK']) nameToId['PARENT LINK'] = 'VIRTUAL_PARENT'
    if (!nameToId['Parent Link']) nameToId['Parent Link'] = 'VIRTUAL_PARENT'
    idToName['VIRTUAL_PARENT'] = 'PARENT'

    if (!account.cache) {
        account.cache = JSON.parse(JSON.stringify(DEFAULT_ACCOUNT.cache))
    }
    account.cache.customFieldsIdToName = idToName
    account.cache.customFieldsNameToId = nameToId
    account.cache.customFieldsType = types
}

// Also used for names of an earlier load, as a full update starts with empty suggestions
function addColumnSuggestions(account: IJiraIssueAccountSettings): void {
    for (const [id, name] of Object.entries(account.cache?.customFieldsIdToName || {})) {
        if (!id.startsWith('VIRTUAL_')) {
            SettingsData.cache.columns.push(id, String(name).toUpperCase())
        }
    }
}

function isCurrent(states: Map<IJiraIssueAccountSettings, ICustomFieldsState>, account: IJiraIssueAccountSettings, state: ICustomFieldsState): boolean {
    return states === customFieldsStates && account.host === state.host
}

// true when the names of this account are known afterwards, from this load or an earlier one
function loadAccountCustomFields(account: IJiraIssueAccountSettings, states: Map<IJiraIssueAccountSettings, ICustomFieldsState>): Promise<boolean> {
    const state = states.get(account)
    if (state.loading) {
        return state.loading
    }
    state.loading = (async () => {
        let response: IJiraField[] = null
        try {
            response = await sendRequest(
                {
                    method: 'GET',
                    path: `/field`,
                    account: account,
                }
            ) as IJiraField[]
        } catch (e) {
            console.error('Error while retrieving custom fields list of account:', account.alias, e)
        }
        // Counted from the end, so a request that times out doesn't shorten the wait before the next one
        state.lastAttempt = Date.now()
        state.loading = null
        if (!isCurrent(states, account, state)) {
            // A newer full update or another host owns the names and suggestions now
            return false
        }
        try {
            if (response) {
                applyAccountCustomFields(account, response)
                state.loaded = true
            }
            // The name maps are only replaced after a successful load, so earlier names are still valid
            if (state.loaded) {
                addColumnSuggestions(account)
            }
        } catch (e) {
            console.error('Error while reading custom fields list of account:', account.alias, e)
        }
        return state.loaded
    })()
    return state.loading
}

async function updateAllCustomFields(states: Map<IJiraIssueAccountSettings, ICustomFieldsState>): Promise<void> {
    SettingsData.cache.columns = []
    for (const account of SettingsData.accounts) {
        if (states !== customFieldsStates) {
            // A newer full update loads all accounts again
            return
        }
        states.set(account, { loaded: hasCustomFieldNames(account), loading: null, lastAttempt: 0, host: account.host })
        await loadAccountCustomFields(account, states)
    }
    if (states !== customFieldsStates) {
        return
    }
    for (const column of ['EPIC NAME', 'EPIC LINK', 'PARENT', 'PARENT LINK']) {
        if (SettingsData.cache.columns.indexOf(column) === -1) {
            SettingsData.cache.columns.push(column)
        }
    }
}

// Resolves once the custom field names being loaded are known, right away when none are loading.
// false when the names of this account could not be loaded (e.g. timeout or 403 on /field).
// Callers have just had an answer from Jira, so names that failed before are loaded again,
// at most once per CUSTOM_FIELDS_RETRY_INTERVAL_MS
async function customFieldsLoaded(account: IJiraIssueAccountSettings): Promise<boolean> {
    // A full update started while waiting replaces the result of the one waited for
    let states: Map<IJiraIssueAccountSettings, ICustomFieldsState>
    do {
        states = customFieldsStates
        await customFieldsUpdate
    } while (states !== customFieldsStates)

    const state = account ? states.get(account) : null
    if (!state) {
        return true
    }
    if (account.host !== state.host) {
        // The host changed and the full update for the new one hasn't started yet
        return false
    }
    if (state.loaded) {
        return true
    }
    if (!state.loading && Date.now() - state.lastAttempt < CUSTOM_FIELDS_RETRY_INTERVAL_MS) {
        return false
    }
    const loaded = await loadAccountCustomFields(account, states)
    if (states !== customFieldsStates) {
        // A full update started during the retry, its result counts
        return customFieldsLoaded(account)
    }
    return loaded
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
        const states = new Map<IJiraIssueAccountSettings, ICustomFieldsState>()
        customFieldsStates = states
        customFieldsUpdate = updateAllCustomFields(states)
        await customFieldsUpdate
    },

    customFieldsLoaded,

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
