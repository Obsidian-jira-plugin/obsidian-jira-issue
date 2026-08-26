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
                setSecret: jest.fn((key: string, val: string) => {
                    secretMap.set(key, val)
                }),
                getSecret: jest.fn((key: string) => {
                    return secretMap.get(key) ?? null
                }),
            },
        } as unknown as App
    })

    test('isSecretStorageAvailable check', () => {
        expect(isSecretStorageAvailable(mockApp)).toBe(true)
        expect(isSecretStorageAvailable({} as App)).toBe(false)
        expect(isSecretStorageAvailable({ secretStorage: {} } as unknown as App)).toBe(false)
        expect(isSecretStorageAvailable(null)).toBe(false)
    })

    test('getAccountSecretKey generates key using account.id', () => {
        expect(getAccountSecretKey(sampleAccount, 'password')).toEqual(
            'jira-issue-acc-123-password'
        )
        expect(getAccountSecretKey(sampleAccount, 'bareToken')).toEqual(
            'jira-issue-acc-123-baretoken'
        )

        const hostileAccount = {
            ...sampleAccount,
            id: 'Very long account ID with spaces, unicode é, and symbols !!!'.repeat(3),
        }
        const key = getAccountSecretKey(hostileAccount, 'bareToken')
        expect(key.length).toBeLessThanOrEqual(64)
        expect(key).toMatch(/^[a-z0-9-]+$/)
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

    test('saveAccountSecrets clears missing credentials with empty values', async () => {
        await saveAccountSecrets(mockApp, sampleAccount)
        await saveAccountSecrets(mockApp, {
            ...sampleAccount,
            password: '',
            bareToken: '',
        })

        const passKey = getAccountSecretKey(sampleAccount, 'password')
        const tokenKey = getAccountSecretKey(sampleAccount, 'bareToken')
        expect(secretMap.get(passKey)).toEqual('')
        expect(secretMap.get(tokenKey)).toEqual('')

        const loaded = await loadAccountSecrets(mockApp, sampleAccount)
        expect(loaded.password).toBeUndefined()
        expect(loaded.bareToken).toBeUndefined()
    })

    test('deleteAccountSecrets clears keys by overwriting them with empty values', async () => {
        await saveAccountSecrets(mockApp, sampleAccount)
        await deleteAccountSecrets(mockApp, sampleAccount)

        const passKey = getAccountSecretKey(sampleAccount, 'password')
        const tokenKey = getAccountSecretKey(sampleAccount, 'bareToken')
        expect(secretMap.get(passKey)).toEqual('')
        expect(secretMap.get(tokenKey)).toEqual('')

        const loaded = await loadAccountSecrets(mockApp, sampleAccount)
        expect(loaded.password).toBeUndefined()
        expect(loaded.bareToken).toBeUndefined()
    })

    test('saveAccountSecrets fails when SecretStorage does not persist the value', async () => {
        mockApp = {
            secretStorage: {
                setSecret: jest.fn(),
                getSecret: jest.fn(() => null),
            },
        } as unknown as App

        await expect(saveAccountSecrets(mockApp, sampleAccount)).rejects.toThrow(
            'Failed to persist secret'
        )
    })
})
