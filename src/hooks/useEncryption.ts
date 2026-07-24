import { useState, useCallback } from 'react';
import { CryptoService } from '../lib/crypto';
import { keyStore } from '../lib/keyStore';
import { useFirebase } from '../components/FirebaseProvider';
import { logger } from '../lib/logger';

export const useEncryption = () => {
  const { user } = useFirebase();

  /**
   * Encrypt a plaintext string for a specific recipient.
   * Generates a temporary symmetric key, encrypts the text, and then
   * wraps the symmetric key using the recipient's public key.
   */
  const encryptForRecipient = useCallback(async (
    plaintext: string, 
    recipientPublicKeyBase64: string
  ): Promise<{ ciphertext: string, iv: string, wrappedKey: string } | null> => {
    try {
      const recipientPublicKey = await CryptoService.importPublicKey(recipientPublicKeyBase64);
      const symmetricKey = await CryptoService.generateSymmetricKey();
      
      const { ciphertext, iv } = await CryptoService.encryptData(symmetricKey, plaintext);
      const wrappedKey = await CryptoService.wrapSymmetricKey(symmetricKey, recipientPublicKey);
      
      return { ciphertext, iv, wrappedKey };
    } catch (e) {
      logger.error('Failed to encrypt for recipient', e as Error);
      return null;
    }
  }, []);

  /**
   * Decrypt a ciphertext string using the current user's local private key.
   */
  const decryptWithPrivateKey = useCallback(async (
    ciphertext: string, 
    iv: string, 
    wrappedKeyBase64: string
  ): Promise<string | null> => {
    if (!user) return null;
    
    try {
      const privateKey = await keyStore.getPrivateKey(user.uid);
      if (!privateKey) throw new Error("Private key not found for current user. Cannot decrypt.");

      const symmetricKey = await CryptoService.unwrapSymmetricKey(wrappedKeyBase64, privateKey);
      const plaintext = await CryptoService.decryptData(symmetricKey, ciphertext, iv);
      
      return plaintext;
    } catch (e) {
      logger.error('Failed to decrypt with private key', e as Error);
      return null;
    }
  }, [user]);

  return { encryptForRecipient, decryptWithPrivateKey };
};
