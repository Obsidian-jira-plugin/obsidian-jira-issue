import { App, Modal, Setting } from 'obsidian'

export class UnlockModal extends Modal {
    private _onSubmit: (passphrase: string) => void
    private _passphrase = ''

    constructor(app: App, onSubmit: (passphrase: string) => void) {
        super(app)
        this._onSubmit = onSubmit
    }

    onOpen() {
        const { contentEl } = this
        contentEl.createEl('h2', { text: 'Jira Issue: Unlock Credentials' })
        contentEl.createEl('p', { text: 'Enter your Master Passphrase to decrypt your Jira passwords and tokens for this session.' })

        new Setting(contentEl).setName('Master Passphrase').addText(text => {
            text.setPlaceholder('Enter passphrase')
                .onChange(value => {
                    this._passphrase = value
                })
                .inputEl.setAttr('type', 'password')
            text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    this.close()
                    this._onSubmit(this._passphrase)
                }
            })
        })

        new Setting(contentEl).addButton(btn =>
            btn
                .setButtonText('Unlock')
                .setCta()
                .onClick(() => {
                    this.close()
                    this._onSubmit(this._passphrase)
                })
        )
    }

    onClose() {
        const { contentEl } = this
        contentEl.empty()
    }
}
