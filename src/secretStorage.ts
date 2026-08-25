import { App } from 'obsidian'
import { IJiraIssueAccountSettings } from './interfaces/settingsInterfaces'

export function isSecretStorageAvailable(app: App): boolean {
    return !!(app && (app as any).secretStorage)
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
    if (!isSecretStorageAvailable(app)) return
    const secretStorage = (app as any).secretStorage

    const passwordKey = getAccountSecretKey(account, 'password')
    if (account.password) {
        await secretStorage.setSecret(passwordKey, account.password)
    } else {
        await secretStorage.deleteSecret(passwordKey)
    }

    const tokenKey = getAccountSecretKey(account, 'bareToken')
    if (account.bareToken) {
        await secretStorage.setSecret(tokenKey, account.bareToken)
    } else {
        await secretStorage.deleteSecret(tokenKey)
    }
}

export async function loadAccountSecrets(app: App, account: IJiraIssueAccountSettings): Promise<{ password?: string; bareToken?: string }> {
    if (!isSecretStorageAvailable(app)) return {}
    const secretStorage = (app as any).secretStorage

    const passwordKey = getAccountSecretKey(account, 'password')
    const password = (await secretStorage.getSecret(passwordKey)) || undefined

    const tokenKey = getAccountSecretKey(account, 'bareToken')
    const bareToken = (await secretStorage.getSecret(tokenKey)) || undefined

    return { password, bareToken }
}

export async function deleteAccountSecrets(app: App, account: IJiraIssueAccountSettings): Promise<void> {
    if (!isSecretStorageAvailable(app)) return
    const secretStorage = (app as any).secretStorage
    await secretStorage.deleteSecret(getAccountSecretKey(account, 'password'))
    await secretStorage.deleteSecret(getAccountSecretKey(account, 'bareToken'))
}
