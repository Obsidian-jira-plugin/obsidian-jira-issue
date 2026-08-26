import { App } from 'obsidian'
import { IJiraIssueAccountSettings } from './interfaces/settingsInterfaces'

interface ISecretStorage {
    setSecret(id: string, secret: string): void
    getSecret(id: string): string | null
}

function getSecretStorage(app: App): ISecretStorage | undefined {
    const secretStorage = app && (app as any).secretStorage
    if (
        !secretStorage ||
        typeof secretStorage.setSecret !== 'function' ||
        typeof secretStorage.getSecret !== 'function'
    ) {
        return undefined
    }
    return secretStorage
}

export function isSecretStorageAvailable(app: App): boolean {
    return !!getSecretStorage(app)
}

export function getAccountSecretKey(account: IJiraIssueAccountSettings, secretType: 'password' | 'bareToken'): string {
    const rawId = (account.id || account.alias).toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const type = secretType.toLowerCase()
    const prefix = 'jira-issue-'
    const maxRawIdLen = 64 - prefix.length - 1 - type.length
    const truncatedId = rawId.length > maxRawIdLen ? rawId.substring(0, maxRawIdLen) : rawId
    return `${prefix}${truncatedId}-${type}`
}

export async function saveAccountSecrets(app: App, account: IJiraIssueAccountSettings): Promise<void> {
    const secretStorage = getSecretStorage(app)
    if (!secretStorage) return

    setAndVerifySecret(secretStorage, getAccountSecretKey(account, 'password'), account.password || '')
    setAndVerifySecret(secretStorage, getAccountSecretKey(account, 'bareToken'), account.bareToken || '')
}

export async function loadAccountSecrets(app: App, account: IJiraIssueAccountSettings): Promise<{ password?: string; bareToken?: string }> {
    const secretStorage = getSecretStorage(app)
    if (!secretStorage) return {}

    const passwordKey = getAccountSecretKey(account, 'password')
    const password = secretStorage.getSecret(passwordKey) || undefined

    const tokenKey = getAccountSecretKey(account, 'bareToken')
    const bareToken = secretStorage.getSecret(tokenKey) || undefined

    return { password, bareToken }
}

export async function deleteAccountSecrets(app: App, account: IJiraIssueAccountSettings): Promise<void> {
    const secretStorage = getSecretStorage(app)
    if (!secretStorage) return

    setAndVerifySecret(secretStorage, getAccountSecretKey(account, 'password'), '')
    setAndVerifySecret(secretStorage, getAccountSecretKey(account, 'bareToken'), '')
}

function setAndVerifySecret(secretStorage: ISecretStorage, key: string, value: string): void {
    secretStorage.setSecret(key, value)
    if (secretStorage.getSecret(key) !== value) {
        throw new Error(`Failed to persist secret \"${key}\" in Obsidian SecretStorage`)
    }
}
