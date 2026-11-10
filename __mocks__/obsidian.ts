export const addIcon = jest.fn()
export const setIcon = jest.fn()
export class PluginSettingTab {
    app: any
    plugin: any
    constructor(app?: any, plugin?: any) {
        this.app = app
        this.plugin = plugin
    }
}
export class EditorSuggest {}
export class Modal {}
export const Notice = jest.fn()
export class Plugin {}
export class Setting {}
export const requestUrl = jest.fn(() => {
    return { status: 200, json: {} }
})
export class TAbstractFile {
    path: string
}
export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}
export const Keymap = { isModEvent: jest.fn(() => false) }
export const normalizePath = (path: string) => {
    const normalized = path.replace(/[\\/]+/g, '/').replace(/^\/|\/$/g, '')
    return normalized === '' ? '/' : normalized
}
