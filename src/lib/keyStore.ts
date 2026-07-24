import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface CryptoDB extends DBSchema {
  keys: {
    key: string;
    value: CryptoKey;
  };
}

class KeyStore {
  private dbPromise: Promise<IDBPDatabase<CryptoDB>>;

  constructor() {
    try {
      this.dbPromise = openDB<CryptoDB>('swift-drop-crypto', 1, {
        upgrade(db) {
          db.createObjectStore('keys');
        },
      });
      // Handle rejection to avoid unhandled promise rejection error
      this.dbPromise.catch(e => {
        console.warn("IndexedDB rejected:", e);
      });
    } catch (e) {
      console.warn("IndexedDB not accessible, falling back to rejected promise", e);
      this.dbPromise = Promise.reject(e);
      this.dbPromise.catch(() => {});
    }
  }

  async savePrivateKey(uid: string, key: CryptoKey): Promise<void> {
    const db = await this.dbPromise;
    await db.put('keys', key, `privateKey_${uid}`);
  }

  async getPrivateKey(uid: string): Promise<CryptoKey | undefined> {
    const db = await this.dbPromise;
    return db.get('keys', `privateKey_${uid}`);
  }

  async deletePrivateKey(uid: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('keys', `privateKey_${uid}`);
  }
}

export const keyStore = new KeyStore();
