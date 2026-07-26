import { App } from 'obsidian'
import {
    deleteAccountSecrets,
    getAccountSecretKey,
    isSecretStorageAvailable,
    loadAccountSecrets,
    saveAccountSecrets,
} from '../src/secretStorage'
import { IJiraIssueAccountSettings, EAuthenticationTypes } from '../src/interfaces/settingsInterfaces'

describe('SecretStorage Helper', () => {
    let mockApp: App
    let secretMap: Map<string, string>

    const sampleAccount: IJiraIssueAccountSettings = {
        id: 'acc-123',
        alias: 'TestAccount',
        host: 'https://test.atlassian.net',
        authenticationType: EAuthenticationTypes.CLOUD,
        username: 'user@example.com',
        password: 'myApiToken123',
        bareToken: 'bearerTokenXYZ',
        priority: 1,
        color: '#ffffff',
        use2025Api: false,
        cache: {
            statusColor: {},
            customFieldsIdToName: {},
            customFieldsNameToId: {},
            customFieldsType: {},
            jqlAutocomplete: { fields: [], functions: {} },
        },
    }

    beforeEach(() => {
        secretMap = new Map<string, string>()
        mockApp = {
            secretStorage: {
                setSecret: jest.fn(async (key: string, val: string) => {
                    secretMap.set(key, val)
                }),
                getSecret: jest.fn(async (key: string) => {
                    return secretMap.get(key) || null
                }),
                deleteSecret: jest.fn(async (key: string) => {
                    secretMap.delete(key)
                }),
            },
        } as unknown as App
    })

    test('isSecretStorageAvailable check', () => {
        expect(isSecretStorageAvailable(mockApp)).toBe(true)
        expect(isSecretStorageAvailable({} as App)).toBe(false)
        expect(isSecretStorageAvailable(null)).toBe(false)
    })

    test('getAccountSecretKey generates key using account.id', () => {
        expect(getAccountSecretKey(sampleAccount, 'password')).toEqual(
            'jira-issue-acc-123-password'
        )
        expect(getAccountSecretKey(sampleAccount, 'bareToken')).toEqual(
            'jira-issue-acc-123-baretoken'
        )
    })

    test('saveAccountSecrets and loadAccountSecrets', async () => {
        await saveAccountSecrets(mockApp, sampleAccount)

        const passKey = getAccountSecretKey(sampleAccount, 'password')
        const tokenKey = getAccountSecretKey(sampleAccount, 'bareToken')

        expect(secretMap.get(passKey)).toEqual('myApiToken123')
        expect(secretMap.get(tokenKey)).toEqual('bearerTokenXYZ')

        const loaded = await loadAccountSecrets(mockApp, sampleAccount)
        expect(loaded.password).toEqual('myApiToken123')
        expect(loaded.bareToken).toEqual('bearerTokenXYZ')
    })

    test('deleteAccountSecrets removes keys from storage', async () => {
        await saveAccountSecrets(mockApp, sampleAccount)
        await deleteAccountSecrets(mockApp, sampleAccount)

        const loaded = await loadAccountSecrets(mockApp, sampleAccount)
        expect(loaded.password).toBeUndefined()
        expect(loaded.bareToken).toBeUndefined()
    })
})
