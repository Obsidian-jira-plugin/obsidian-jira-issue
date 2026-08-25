export const addIcon = jest.fn()
export const setIcon = jest.fn()
export class PluginSettingTab {}
export class EditorSuggest {}
export class Modal {}
export class Notice {}
export class Plugin {}
export class Setting {}
export const requestUrl = jest.fn(() => {
    return { status: 200, json: {} }
})