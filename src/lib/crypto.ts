import { logger } from './logger';

export class CryptoService {
  private static readonly ALGO_ASYMMETRIC = {
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  };

  private static readonly ALGO_SYMMETRIC = {
    name: 'AES-GCM',
    length: 256,
  };

  /**
   * Generates a new RSA-OAEP key pair for a user
   */
  static async generateKeyPair(): Promise<CryptoKeyPair> {
    logger.debug('Generating new RSA keypair...');
    return window.crypto.subtle.generateKey(
      this.ALGO_ASYMMETRIC,
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Exports a public key to a base64 string for storing in Firestore
   */
  static async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('spki', publicKey);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  /**
   * Imports a public key from base64 string (from Firestore)
   */
  static async importPublicKey(base64Key: string): Promise<CryptoKey> {
    const binaryDerString = atob(base64Key);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }
    
    return window.crypto.subtle.importKey(
      'spki',
      binaryDer.buffer,
      this.ALGO_ASYMMETRIC,
      true,
      ['encrypt']
    );
  }

  /**
   * Generates a random symmetric key (AES-GCM) for encrypting a specific message or channel
   */
  static async generateSymmetricKey(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(
      this.ALGO_SYMMETRIC,
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts data with a symmetric key
   */
  static async encryptData(key: CryptoKey, data: string): Promise<{ ciphertext: string, iv: string }> {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: this.ALGO_SYMMETRIC.name, iv },
      key,
      encoder.encode(data)
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer))),
      iv: btoa(String.fromCharCode(...new Uint8Array(iv)))
    };
  }

  /**
   * Decrypts data with a symmetric key
   */
  static async decryptData(key: CryptoKey, ciphertextBase64: string, ivBase64: string): Promise<string> {
    try {
      const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
      const ciphertext = new Uint8Array(atob(ciphertextBase64).split('').map(c => c.charCodeAt(0)));

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: this.ALGO_SYMMETRIC.name, iv },
        key,
        ciphertext
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (e) {
      logger.error('Decryption failed', e as Error);
      throw e;
    }
  }

  /**
   * Encrypts a symmetric key using a recipient's public RSA key
   */
  static async wrapSymmetricKey(symmetricKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
    const rawKey = await window.crypto.subtle.exportKey('raw', symmetricKey);
    const encryptedKey = await window.crypto.subtle.encrypt(
      { name: this.ALGO_ASYMMETRIC.name },
      publicKey,
      rawKey
    );
    return btoa(String.fromCharCode(...new Uint8Array(encryptedKey)));
  }

  /**
   * Decrypts a symmetric key using the user's private RSA key
   */
  static async unwrapSymmetricKey(encryptedKeyBase64: string, privateKey: CryptoKey): Promise<CryptoKey> {
    const encryptedKey = new Uint8Array(atob(encryptedKeyBase64).split('').map(c => c.charCodeAt(0)));
    const rawKey = await window.crypto.subtle.decrypt(
      { name: this.ALGO_ASYMMETRIC.name },
      privateKey,
      encryptedKey
    );
    
    return window.crypto.subtle.importKey(
      'raw',
      rawKey,
      this.ALGO_SYMMETRIC,
      true,
      ['encrypt', 'decrypt']
    );
  }
}
