import { decryptSecret, encryptSecret } from '../src/crypto/encryption'

describe('Encryption (AES-256-GCM)', () => {
    const passphrase = 'MySuperSecretPassphrase123!'
    const secretText = 'ATATT3xFfGF0123456789SecretJiraToken'

    test('should encrypt and decrypt a secret string successfully', async () => {
        const encrypted = await encryptSecret(passphrase, secretText)
        expect(encrypted).not.toEqual(secretText)
        expect(typeof encrypted).toBe('string')

        const decrypted = await decryptSecret(passphrase, encrypted)
        expect(decrypted).toEqual(secretText)
    })

    test('should fail to decrypt with an incorrect passphrase', async () => {
        const encrypted = await encryptSecret(passphrase, secretText)
        await expect(decryptSecret('WrongPassphrase', encrypted)).rejects.toThrow(
            'Decryption failed'
        )
    })

    test('should handle empty strings', async () => {
        const encrypted = await encryptSecret(passphrase, '')
        expect(encrypted).toEqual('')
        const decrypted = await decryptSecret(passphrase, '')
        expect(decrypted).toEqual('')
    })
})
