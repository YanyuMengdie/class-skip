
import { FileHistoryItem } from '../types';

const DB_NAME = 'ReadingAssistantDB';
const DB_VERSION = 1;
const STORE_NAME = 'fileHistory';

class StorageService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        console.error('IndexedDB init error:', event);
        reject('Failed to initialize IndexedDB');
      };
    });
  }

  async saveFileState(item: FileHistoryItem): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = () => reject('Failed to save file state');
      } catch (e) {
        console.error('Save error:', e);
        reject(e);
      }
    });
  }

  async getFileState(hash: string): Promise<FileHistoryItem | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject('Failed to get file state');
    });
  }

  async getAllHistory(): Promise<FileHistoryItem[]> {
    await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as FileHistoryItem[];
        // Sort by last opened descending
        resolve(results.sort((a, b) => b.lastOpened - a.lastOpened));
      };
      request.onerror = () => reject('Failed to fetch history');
    });
  }

  async deleteFileState(hash: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(hash);

      request.onsuccess = () => resolve();
      request.onerror = () => reject('Failed to delete history item');
    });
  }
}

export const storageService = new StorageService();
