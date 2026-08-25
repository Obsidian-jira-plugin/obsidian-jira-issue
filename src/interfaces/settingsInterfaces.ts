import { IJiraAutocompleteDataField, IJiraFieldSchema } from "./issueInterfaces"

export enum ECredentialStorageType {
    KEYCHAIN = 'KEYCHAIN',
    PASSPHRASE = 'PASSPHRASE',
    PLAINTEXT = 'PLAINTEXT',
}
export const CREDENTIAL_STORAGE_TYPE_DESCRIPTION = {
    [ECredentialStorageType.KEYCHAIN]: 'OS Keychain (SecretStorage)',
    [ECredentialStorageType.PASSPHRASE]: 'Master Passphrase (AES-256-GCM)',
    [ECredentialStorageType.PLAINTEXT]: 'Plaintext (data.json)',
}

export enum EAuthenticationTypes {
    OPEN = 'OPEN',
    BASIC = 'BASIC',
    CLOUD = 'CLOUD',
    BEARER_TOKEN = 'BEARER_TOKEN',
}
export enum ERenderStyle {
    MODERN = 'MODERN',
    CLASSIC = 'CLASSIC',
}
export const RENDER_STYLE_DESCRIPTION = {
    [ERenderStyle.MODERN]: 'Modern (Obsidian Native & Pastell Badges)',
    [ERenderStyle.CLASSIC]: 'Classic (Legacy Bulma Badges)',
}

export enum EColorSchema {
    FOLLOW_OBSIDIAN = 'FOLLOW_OBSIDIAN',
    LIGHT = 'LIGHT',
    DARK = 'DARK',
}
export const COLOR_SCHEMA_DESCRIPTION = {
    [EColorSchema.FOLLOW_OBSIDIAN]: 'Follow Obsidian',
    [EColorSchema.LIGHT]: 'Light',
    [EColorSchema.DARK]: 'Dark',
}

export const COMPACT_SYMBOL = '-'
export const AVATAR_RESOLUTION = '16x16'
export const COMMENT_REGEX = /^\s*#/
export const JIRA_KEY_REGEX = '[A-Z][A-Z0-9_]*-[0-9]+'

export interface IJiraIssueSettings {
    accounts: IJiraIssueAccountSettings[]
    apiBasePath: string
    cacheTime: string
    searchResultsLimit: number
    cache: {
        columns: string[]
    }
    colorSchema: EColorSchema
    inlineIssueUrlToTag: boolean
    inlineIssuePrefix: string
    issueSummaryMaxWidthRem: number
    issueStatusMaxWidthRem: number
    searchColumns: ISearchColumn[]
    logRequestsResponses: boolean
    logImagesFetch: boolean
    showColorBand: boolean
    showJiraLink: boolean
    credentialStorageType: ECredentialStorageType
    renderStyle: ERenderStyle

    // Legacy credentials
    host?: string
    authenticationType?: EAuthenticationTypes
    username?: string
    password?: string
    bareToken?: string
}

export interface IJiraIssueAccountSettings {
    id?: string
    alias: string
    host: string
    webBaseUrl?: string
    authenticationType: EAuthenticationTypes
    username?: string
    password?: string
    bareToken?: string
    encryptedPassword?: string
    encryptedBareToken?: string
    priority: number
    color: string
    use2025Api: boolean
    cache: {
        statusColor: Record<string, string>
        customFieldsIdToName: Record<string, string>
        customFieldsNameToId: Record<string, string>
        customFieldsType: Record<string, IJiraFieldSchema>
        jqlAutocomplete: {
            fields: IJiraAutocompleteDataField[]
            functions: {
                [key: string]: [string]
            }
        }
    }
}

export enum ESearchResultsRenderingTypes {
    TABLE = 'TABLE',
    LIST = 'LIST',
}
export const SEARCH_RESULTS_RENDERING_TYPE_DESCRIPTION = {
    [ESearchResultsRenderingTypes.TABLE]: 'Table',
    [ESearchResultsRenderingTypes.LIST]: 'List',
}

export enum ESearchColumnsTypes {
    KEY = 'KEY',
    SUMMARY = 'SUMMARY',
    DESCRIPTION = 'DESCRIPTION',
    TYPE = 'TYPE',
    CREATED = 'CREATED',
    UPDATED = 'UPDATED',
    REPORTER = 'REPORTER',
    ASSIGNEE = 'ASSIGNEE',
    PRIORITY = 'PRIORITY',
    STATUS = 'STATUS',
    DUE_DATE = 'DUE_DATE',
    RESOLUTION = 'RESOLUTION',
    RESOLUTION_DATE = 'RESOLUTION_DATE',
    PROJECT = 'PROJECT',
    ENVIRONMENT = 'ENVIRONMENT',
    AGGREGATE_PROGRESS = 'AGGREGATE_PROGRESS',
    AGGREGATE_TIME_ESTIMATED = 'AGGREGATE_TIME_ESTIMATED',
    AGGREGATE_TIME_ORIGINAL_ESTIMATE = 'AGGREGATE_TIME_ORIGINAL_ESTIMATE',
    AGGREGATE_TIME_SPENT = 'AGGREGATE_TIME_SPENT',
    FIX_VERSIONS = 'FIX_VERSIONS',
    // LINKS = 'LINKS',  // Example with: key=STORM-1612
    LABELS = 'LABELS',
    COMPONENTS = 'COMPONENTS',
    LAST_VIEWED = 'LAST_VIEWED',
    PROGRESS = 'PROGRESS',
    // SUBTASKS = 'SUBTASKS',
    TIME_ESTIMATE = 'TIME_ESTIMATE',
    TIME_ORIGINAL_ESTIMATE = 'TIME_ORIGINAL_ESTIMATE',
    TIME_SPENT = 'TIME_SPENT',
    DEV_STATUS = 'DEV_STATUS',

    CUSTOM_FIELD = 'CUSTOM_FIELD',
    NOTES = 'NOTES',
}
export const SEARCH_COLUMNS_DESCRIPTION = {
    [ESearchColumnsTypes.KEY]: 'Key',
    [ESearchColumnsTypes.SUMMARY]: 'Summary',
    [ESearchColumnsTypes.DESCRIPTION]: 'Description',
    [ESearchColumnsTypes.TYPE]: 'Type',
    [ESearchColumnsTypes.CREATED]: 'Created',
    [ESearchColumnsTypes.UPDATED]: 'Updated',
    [ESearchColumnsTypes.REPORTER]: 'Reporter',
    [ESearchColumnsTypes.ASSIGNEE]: 'Assignee',
    [ESearchColumnsTypes.PRIORITY]: 'Priority',
    [ESearchColumnsTypes.STATUS]: 'Status',
    [ESearchColumnsTypes.DUE_DATE]: 'Due Date',
    [ESearchColumnsTypes.RESOLUTION]: 'Resolution',
    [ESearchColumnsTypes.RESOLUTION_DATE]: 'Resolution Date',
    [ESearchColumnsTypes.PROJECT]: 'Project',
    [ESearchColumnsTypes.ENVIRONMENT]: 'Environment',
    [ESearchColumnsTypes.AGGREGATE_PROGRESS]: '#Progress',
    [ESearchColumnsTypes.AGGREGATE_TIME_ESTIMATED]: '#🕑Estimated',
    [ESearchColumnsTypes.AGGREGATE_TIME_ORIGINAL_ESTIMATE]: '#🕑Original Estimate',
    [ESearchColumnsTypes.AGGREGATE_TIME_SPENT]: '#🕑Spent',
    [ESearchColumnsTypes.FIX_VERSIONS]: 'Fix Versions',
    // [ESearchColumnsTypes.LINKS]: 'Links', // TODO
    [ESearchColumnsTypes.LABELS]: 'Labels',
    [ESearchColumnsTypes.COMPONENTS]: 'Components',
    [ESearchColumnsTypes.LAST_VIEWED]: 'Last Viewed',
    [ESearchColumnsTypes.PROGRESS]: 'Progress',
    // [ESearchColumnsTypes.SUBTASKS]: 'Subtasks', // TODO
    [ESearchColumnsTypes.TIME_ESTIMATE]: '🕑Estimate',
    [ESearchColumnsTypes.TIME_ORIGINAL_ESTIMATE]: '🕑Original Estimate',
    [ESearchColumnsTypes.TIME_SPENT]: '🕑Spent',
    [ESearchColumnsTypes.DEV_STATUS]: 'Dev Status',

    [ESearchColumnsTypes.CUSTOM_FIELD]: 'Custom field',
    [ESearchColumnsTypes.NOTES]: 'Notes',
}

export interface ISearchColumn {
    type: ESearchColumnsTypes
    compact: boolean
    extra?: string
}
