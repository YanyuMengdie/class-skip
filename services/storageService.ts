
import { FileHistoryItem, TutorSession } from '@/types';

const DB_NAME = 'ReadingAssistantDB';
const DB_VERSION = 2;
const STORE_NAME = 'fileHistory';
/** 私教模式独立 store（keyPath 'id'），与 fileHistory 物理隔离 */
const TUTOR_STORE_NAME = 'tutorSessions';

class StorageService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // 现有：fileHistory（不动）
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        }
        // 新增：tutorSessions（独立、与略读隔离）
        if (!db.objectStoreNames.contains(TUTOR_STORE_NAME)) {
          db.createObjectStore(TUTOR_STORE_NAME, { keyPath: 'id' });
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

  // --- 私教模式独立存档（tutorSessions store，与 fileHistory 并列、互不干扰）---

  /** 单条 upsert（keyPath 'id'，put 即「存在则覆盖、不存在则插入」） */
  async saveTutorSession(session: TutorSession): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([TUTOR_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(TUTOR_STORE_NAME);
        const request = store.put(session);

        request.onsuccess = () => resolve();
        request.onerror = () => reject('Failed to save tutor session');
      } catch (e) {
        console.error('Save tutor session error:', e);
        reject(e);
      }
    });
  }

  /** 取全部私教会话（按 createdAt 降序，新建在前） */
  async getAllTutorSessions(): Promise<TutorSession[]> {
    await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([TUTOR_STORE_NAME], 'readonly');
      const store = transaction.objectStore(TUTOR_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as TutorSession[];
        resolve(results.sort((a, b) => b.createdAt - a.createdAt));
      };
      request.onerror = () => reject('Failed to fetch tutor sessions');
    });
  }

  /** 按 id 删单条 */
  async deleteTutorSession(id: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([TUTOR_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(TUTOR_STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject('Failed to delete tutor session');
    });
  }
}

export const storageService = new StorageService();
