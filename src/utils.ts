import colorsys from "colorsys"
import { IJiraIssueAccountSettings } from "./interfaces/settingsInterfaces"
import { SettingsData } from "./settings"

export function getAccountByAlias(alias: string): IJiraIssueAccountSettings {
    if (alias) {
        const account = SettingsData.accounts.find(account => account.alias.toUpperCase() === alias.toUpperCase())
        if (!account) {
            throw new Error(`No accounts found with alias: ${alias}`)
        }
        return account
    } else {
        return null
    }
}

export function getAccountByHost(host: string): IJiraIssueAccountSettings {
    if (host) {
        return SettingsData.accounts.find(account => account.host === host) || null
    } else {
        return null
    }
}

// Issues written as a Jira URL are tied to that host, the others can come from any account
export function getIssueCacheKey(issueKey: string, host: string = null): string {
    return host ? `${host}/browse/${issueKey}` : issueKey
}

function randomBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

export function getRandomHexColor(): string {
    return colorsys.hslToHex(randomBetween(0, 359), randomBetween(40, 100), randomBetween(45, 75))
}

export function getRandomRGBColor(): { r: number, g: number, b: number } {
    return colorsys.hslToRgb(randomBetween(0, 359), randomBetween(40, 100), randomBetween(45, 75))
}
