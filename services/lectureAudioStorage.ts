import type { LectureAudioRecording } from '@/types';

const DB_NAME = 'ClassSkipLectureAudioDB';
const DB_VERSION = 1;
const RECORDINGS_STORE = 'recordings';
const CHUNKS_STORE = 'chunks';
const CHUNK_RECORDING_INDEX = 'recordingId';
const IMPORT_CHUNK_BYTES = 8 * 1024 * 1024;

interface StoredAudioChunk {
  key: string;
  recordingId: string;
  sequence: number;
  blob: Blob;
  sizeBytes: number;
  createdAt: number;
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地录音数据库操作失败'));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('本地录音保存失败'));
    transaction.onabort = () => reject(transaction.error || new Error('本地录音保存被中断'));
  });

class LectureAudioStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
          db.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
          const chunks = db.createObjectStore(CHUNKS_STORE, { keyPath: 'key' });
          chunks.createIndex(CHUNK_RECORDING_INDEX, 'recordingId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error || new Error('无法打开本地录音数据库'));
      };
    });

    return this.dbPromise;
  }

  async createRecording(recording: LectureAudioRecording): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(RECORDINGS_STORE, 'readwrite');
    transaction.objectStore(RECORDINGS_STORE).put(recording);
    await transactionDone(transaction);
  }

  async getRecording(id: string): Promise<LectureAudioRecording | null> {
    const db = await this.open();
    const transaction = db.transaction(RECORDINGS_STORE, 'readonly');
    const result = await requestResult(
      transaction.objectStore(RECORDINGS_STORE).get(id) as IDBRequest<LectureAudioRecording | undefined>
    );
    return result || null;
  }

  async listRecordings(): Promise<LectureAudioRecording[]> {
    const db = await this.open();
    const transaction = db.transaction(RECORDINGS_STORE, 'readonly');
    const records = await requestResult(
      transaction.objectStore(RECORDINGS_STORE).getAll() as IDBRequest<LectureAudioRecording[]>
    );
    return records.sort((a, b) => b.createdAt - a.createdAt);
  }

  async appendChunk(recordingId: string, sequence: number, blob: Blob): Promise<LectureAudioRecording> {
    const db = await this.open();
    const transaction = db.transaction([RECORDINGS_STORE, CHUNKS_STORE], 'readwrite');
    const recordings = transaction.objectStore(RECORDINGS_STORE);
    const chunks = transaction.objectStore(CHUNKS_STORE);
    const recording = await requestResult(
      recordings.get(recordingId) as IDBRequest<LectureAudioRecording | undefined>
    );

    if (!recording) {
      transaction.abort();
      throw new Error('找不到正在保存的课堂录音');
    }

    const chunk: StoredAudioChunk = {
      key: `${recordingId}:${sequence.toString().padStart(8, '0')}`,
      recordingId,
      sequence,
      blob,
      sizeBytes: blob.size,
      createdAt: Date.now(),
    };
    chunks.put(chunk);

    const updated: LectureAudioRecording = {
      ...recording,
      chunkCount: Math.max(recording.chunkCount, sequence + 1),
      sizeBytes: recording.sizeBytes + blob.size,
    };
    recordings.put(updated);
    await transactionDone(transaction);
    return updated;
  }

  async updateRecording(
    id: string,
    updates: Partial<Omit<LectureAudioRecording, 'id'>>
  ): Promise<LectureAudioRecording> {
    const db = await this.open();
    const transaction = db.transaction(RECORDINGS_STORE, 'readwrite');
    const store = transaction.objectStore(RECORDINGS_STORE);
    const recording = await requestResult(
      store.get(id) as IDBRequest<LectureAudioRecording | undefined>
    );
    if (!recording) {
      transaction.abort();
      throw new Error('找不到课堂录音');
    }
    const updated = { ...recording, ...updates };
    store.put(updated);
    await transactionDone(transaction);
    return updated;
  }

  async getRecordingBlob(id: string): Promise<Blob> {
    const db = await this.open();
    const recording = await this.getRecording(id);
    if (!recording) throw new Error('找不到课堂录音');

    const transaction = db.transaction(CHUNKS_STORE, 'readonly');
    const index = transaction.objectStore(CHUNKS_STORE).index(CHUNK_RECORDING_INDEX);
    const chunks = await requestResult(
      index.getAll(IDBKeyRange.only(id)) as IDBRequest<StoredAudioChunk[]>
    );
    chunks.sort((a, b) => a.sequence - b.sequence);
    if (chunks.length === 0) throw new Error('这条课堂记录没有可播放的音频');
    return new Blob(chunks.map((chunk) => chunk.blob), { type: recording.mimeType || chunks[0].blob.type });
  }

  async deleteRecording(id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction([RECORDINGS_STORE, CHUNKS_STORE], 'readwrite');
    transaction.objectStore(RECORDINGS_STORE).delete(id);

    const index = transaction.objectStore(CHUNKS_STORE).index(CHUNK_RECORDING_INDEX);
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(id));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      transaction.objectStore(CHUNKS_STORE).delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionDone(transaction);
  }

  async recoverInterruptedRecordings(): Promise<LectureAudioRecording[]> {
    const recordings = await this.listRecordings();
    const recovered: LectureAudioRecording[] = [];
    for (const recording of recordings) {
      if (recording.status !== 'recording') {
        recovered.push(recording);
        continue;
      }
      recovered.push(
        await this.updateRecording(recording.id, {
          status: 'interrupted',
          endedAt: recording.endedAt || Date.now(),
          durationMs: recording.durationMs || Math.max(0, Date.now() - recording.createdAt),
        })
      );
    }
    return recovered;
  }

  async importAudioFile(
    file: File,
    recordingId: string,
    onProgress?: (recording: LectureAudioRecording) => void
  ): Promise<LectureAudioRecording> {
    const createdAt = Date.now();
    const mimeType = file.type || 'application/octet-stream';
    await this.createRecording({
      id: recordingId,
      source: 'upload',
      createdAt,
      mimeType,
      sizeBytes: 0,
      chunkCount: 0,
      status: 'recording',
      originalFileName: file.name,
    });

    try {
      let sequence = 0;
      for (let offset = 0; offset < file.size; offset += IMPORT_CHUNK_BYTES) {
        const chunk = file.slice(offset, Math.min(offset + IMPORT_CHUNK_BYTES, file.size), mimeType);
        const progress = await this.appendChunk(recordingId, sequence, chunk);
        onProgress?.(progress);
        sequence += 1;
      }
      return await this.updateRecording(recordingId, {
        status: 'ready',
        endedAt: Date.now(),
      });
    } catch (error) {
      await this.updateRecording(recordingId, {
        status: 'error',
        endedAt: Date.now(),
      }).catch(() => undefined);
      throw error;
    }
  }
}

export const lectureAudioStorage = new LectureAudioStorage();
