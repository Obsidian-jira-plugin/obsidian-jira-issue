function getCrypto(): Crypto {
    if (typeof globalThis !== 'undefined' && globalThis.crypto) {
        return globalThis.crypto
    }
    if (typeof window !== 'undefined' && window.crypto) {
        return window.crypto
    }
    throw new Error('Web Crypto API is not available')
}

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

function hexToBuffer(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const crypto = getCrypto()
    const encoder = new TextEncoder()
    const passphraseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    )
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        passphraseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    )
}

export async function encryptSecret(passphrase: string, plaintext: string): Promise<string> {
    if (!plaintext) return ''
    const crypto = getCrypto()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveKey(passphrase, salt)
    const encoder = new TextEncoder()
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encoder.encode(plaintext)
    )

    const payload = {
        salt: bufferToHex(salt.buffer),
        iv: bufferToHex(iv.buffer),
        data: bufferToHex(encrypted),
    }

    return JSON.stringify(payload)
}

export async function decryptSecret(passphrase: string, encryptedData: string): Promise<string> {
    if (!encryptedData) return ''
    try {
        const payload = JSON.parse(encryptedData)
        if (!payload.salt || !payload.iv || !payload.data) {
            throw new Error('Invalid encrypted payload structure')
        }
        const crypto = getCrypto()
        const salt = hexToBuffer(payload.salt)
        const iv = hexToBuffer(payload.iv)
        const ciphertext = hexToBuffer(payload.data)
        const key = await deriveKey(passphrase, salt)
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            ciphertext
        )
        const decoder = new TextDecoder()
        return decoder.decode(decrypted)
    } catch (e) {
        throw new Error('Decryption failed. Invalid passphrase or corrupted data.')
    }
}
