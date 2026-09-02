
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  deleteField,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  query,
  orderBy, 
  limit as firestoreLimit,
  where,
  Timestamp, 
  initializeFirestore, 
  enableIndexedDbPersistence 
} from 'firebase/firestore';

import { ChatCache, ExplanationCache, AnnotationCache, ChatMessage, StudyMap, ViewMode, SkimStage, QuizData, DocType, NotebookData, CloudSession, CalendarEvent, Memo, Exam, ExamMaterialLink, DailyPlanCacheDoc, DailySegment, TutorSession, PersistedSkimSession, JointReviewPack, JointReviewMaterial, TinyStudyEntrySession, type DisciplineBand } from '@/types';

const firebaseConfig = {
  apiKey: "AIzaSyC0_saRd3L2zIxOfG1FQinjYpyCGs_B9ls",
  authDomain: "ai-tutor-647fd.firebaseapp.com",
  projectId: "ai-tutor-647fd",
  storageBucket: "ai-tutor-647fd.firebasestorage.app",
  messagingSenderId: "663486346896",
  appId: "1:663486346896:web:dcc51ef505326644eb0a15"
};

// 1. Initialize App & Stable Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- FIRESTORE OPTIMIZATION: STABILITY & PERSISTENCE ---
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
      console.warn('Persistence failed: Multiple tabs open');
  } else if (err.code == 'unimplemented') {
      console.warn('Persistence failed: Browser not supported');
  }
});

// --- Auth Functions ---
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("[Auth] Login Success:", result.user.uid);
    return result.user;
  } catch (error) {
    console.error("[Auth] Login Failed:", error);
    return null;
  }
};

export const logoutUser = async () => {
  await signOut(auth);
  console.log("[Auth] User Signed Out");
};

/** 用于邮件链接登录：发送登录链接到邮箱（无密码，点链接即登录） */
export const sendEmailLoginLink = async (email: string): Promise<void> => {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + (window.location.pathname || '/') : '';
  const actionCodeSettings = {
    url: baseUrl,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('emailForSignIn', email);
  }
};

/** 判断当前 URL 是否为邮件登录链接回调 */
export const isEmailLinkSignIn = (url: string): boolean => {
  return isSignInWithEmailLink(auth, url);
};

/** 在用户点击邮件中的链接后，用该函数完成登录（需传入当时填写的 email 与当前完整 URL） */
export const completeEmailLinkSignIn = async (email: string, url: string): Promise<User> => {
  const result = await signInWithEmailLink(auth, email, url);
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('emailForSignIn');
  }
  return result.user;
};

// --- Storage Functions (REST API) ---
export const uploadPDF = async (user: User, file: File): Promise<string> => {
  return uploadToFirebaseREST(user, file, file.name, file.type || 'application/pdf');
};

export const uploadImageBlob = async (user: User, blob: Blob): Promise<string> => {
  const filename = `ai_asset_${Date.now()}.png`;
  return uploadToFirebaseREST(user, blob, filename, 'image/png');
};

const uploadToFirebaseREST = async (user: User, data: Blob | File, filename: string, contentType: string): Promise<string> => {
  console.group("🚀 [REST API] Upload Pipeline");
  try {
    if (!user || !user.uid) throw new Error("User object is missing or invalid.");
    
    console.log("1. User Verified. Fetching ID Token...");
    const authToken = await user.getIdToken(); 
    
    const bucketName = firebaseConfig.storageBucket;
    const safeFileName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniquePrefix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const objectPath = `users/${user.uid}/uploads/${uniquePrefix}_${safeFileName}`;
    const encodedPath = encodeURIComponent(objectPath);
    
    const uploadEndpoint = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o?name=${encodedPath}`;
    
    console.log("2. Uploading to REST Endpoint:", uploadEndpoint);

    const response = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': contentType
      },
      body: data
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`REST Upload Failed [${response.status}]: ${errorText}`);
    }

    const resData = await response.json();
    console.log("✅ 3. Upload Success. Metadata:", resData);

    const downloadToken = resData.downloadTokens;
    if (!downloadToken) {
        throw new Error("No download token returned from Storage API");
    }

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    
    console.log("✅ 4. Download URL Generated:", downloadUrl);
    
    console.groupEnd();
    return downloadUrl;

  } catch (error: any) {
    console.error("❌ [REST API] Upload Failed:", error);
    console.groupEnd();
    throw error;
  }
};

// --- FIRESTORE SUBCOLLECTION HELPERS ---

/**
 * Returns keys that belong to the ROOT Metadata document.
 */
const META_KEYS = new Set([
    'id', 'userId', 'fileName', 'customTitle', 'fileUrl', 'downloadUrl', 
    'createdAt', 'updatedAt', 'sortIndex', 'type', 'parentId'
]);

/**
 * Helper to split a full update object into Meta (Root) and Heavy (Subcollection) parts.
 */
const splitUpdateData = (data: Partial<CloudSession>) => {
    const metaUpdates: any = {};
    const heavyUpdates: any = {};
    
    Object.entries(data).forEach(([key, value]) => {
        if (value === undefined) return; // Skip undefined
        
        if (META_KEYS.has(key)) {
            metaUpdates[key] = value;
        } else {
            // Everything else goes to heavy data subcollection
            heavyUpdates[key] = value;
        }
    });

    return { metaUpdates, heavyUpdates };
};

// --- Firestore Session Functions ---

export const createCloudSession = async (
  user: User,
  fileName: string,
  fileUrl: string,
  parentId: string | null = null
): Promise<string> => {
  console.group("📝 [Firestore] Session Creation");
  try {
    const sessionsRef = collection(db, "sessions");
    const docRef = doc(sessionsRef); 
    const sessionId = docRef.id;
    const now = Timestamp.now();

    const metaData = {
      userId: user.uid,
      fileName,
      fileUrl,
      createdAt: now,
      sortIndex: Date.now(),
      updatedAt: now,
      type: 'file', // Default
      parentId
    };

    const heavyData = {
      chatCache: {},
      explanations: {},
      annotations: {},
      notebookData: {},
      pageComments: {},
      skimMessages: [],
      // 阶段乙：略读 session 已搬到子集合 sessions/{id}/skims/{skimId}，data/main 不再存 skimSessions。
      viewMode: 'deep',
      docType: 'STEM',
      currentIndex: 0,
      skimTopHeight: 60,
      skimFocusMode: false,
      personaSettings: null
    };

    const heavyRef = doc(db, "sessions", sessionId, "data", "main");
    await Promise.all([
        setDoc(docRef, metaData),
        setDoc(heavyRef, heavyData)
    ]);

    console.log("✅ Created Session:", sessionId);
    console.groupEnd();
    return sessionId;
  } catch (error: any) {
    console.error("❌ [Firestore] Write Failed:", error);
    console.groupEnd();
    throw error;
  }
};

export const createCloudFolder = async (user: User, folderName: string, parentId: string | null = null): Promise<string> => {
    try {
        const sessionsRef = collection(db, "sessions");
        const docRef = doc(sessionsRef);
        const now = Timestamp.now();

        const folderData = {
            userId: user.uid,
            fileName: folderName,
            fileUrl: '', // No file for folders
            createdAt: now,
            sortIndex: Date.now(),
            updatedAt: now,
            type: 'folder',
            parentId: parentId
        };

        // Folders only need metadata doc
        await setDoc(docRef, folderData);
        return docRef.id;
    } catch (error) {
        console.error("Create Folder Failed:", error);
        throw error;
    }
};

/**
 * 读取略读「一 session 一文档」新柜子：sessions/{id}/skims/{skimId}。
 * 子集合为空（当前阶段尚无任何子文档）⇒ 返回 []，调用方据此回退老数组 data/main.skimSessions。
 */
export const readSkimSessions = async (sessionId: string): Promise<PersistedSkimSession[]> => {
    try {
        const skimsRef = collection(db, "sessions", sessionId, "skims");
        const snapshot = await getDocs(skimsRef);
        if (snapshot.empty) return [];
        return await Promise.all(snapshot.docs.map(async (skimDoc) => {
            const session = skimDoc.data() as PersistedSkimSession;
            const deck = session.recordDeck;
            if (!deck || deck.orderedCardIds.length === 0) return session;

            const cardsSnapshot = await getDocs(collection(skimDoc.ref, 'cards'));
            if (cardsSnapshot.empty) return session;
            const cards = { ...deck.cards };
            cardsSnapshot.docs.forEach((cardDoc) => {
                const stored = cardDoc.data() as {
                    messages?: PersistedSkimSession['messages'];
                    digest?: typeof cards[string]['digest'];
                };
                const existing = cards[cardDoc.id];
                if (!existing) return;
                cards[cardDoc.id] = {
                    ...existing,
                    messages: stored.messages ?? existing.messages ?? [],
                    ...(stored.digest ? { digest: stored.digest } : {}),
                };
            });
            return { ...session, recordDeck: { ...deck, cards } };
        }));
    } catch (error) {
        console.error("[Firestore] Read Skims Failed:", error);
        return [];
    }
};

/**
 * 写略读「一 session 一文档」新柜子：每个 session 写成 sessions/{id}/skims/{skimId} 子文档。
 * 用 writeBatch 保证多子文档原子写入。本阶段只 set（新增/覆盖），不做「差量删除已移除段」——
 * 删除清理留待「删除略读 session」功能落地时一并处理（见 deleteDoc 待办）。
 */
export const writeSkimSessions = async (sessionId: string, skimSessions: PersistedSkimSession[]) => {
    for (const s of skimSessions) {
        const batch = writeBatch(db);
        const ref = doc(db, "sessions", sessionId, "skims", s.id);
        const deck = s.recordDeck;
        const rootSession = deck
            ? {
                ...s,
                recordDeck: {
                    ...deck,
                    cards: Object.fromEntries(Object.entries(deck.cards).map(([cardId, card]) => [
                        cardId,
                        { ...card, messages: [], digest: undefined },
                    ])),
                },
            }
            : s;
        batch.set(ref, JSON.parse(JSON.stringify(rootSession)));

        const cardsRef = collection(ref, 'cards');
        const existingCards = await getDocs(cardsRef);
        const desiredCardIds = new Set(deck?.orderedCardIds ?? []);
        existingCards.docs.forEach((cardDoc) => {
            if (!desiredCardIds.has(cardDoc.id)) batch.delete(cardDoc.ref);
        });
        if (deck) {
            deck.orderedCardIds.forEach((cardId) => {
                const card = deck.cards[cardId];
                if (!card) return;
                batch.set(doc(cardsRef, cardId), JSON.parse(JSON.stringify({
                    messages: card.messages ?? [],
                    digest: card.digest ?? null,
                    updatedAt: Date.now(),
                })));
            });
        }
        await batch.commit();
    }
};

/** 永久删除一条领读会话及其唱片对话子文档；不会触碰同文件下的其他领读或私教。 */
export const deleteSkimSessionFromCloud = async (sessionId: string, skimId: string) => {
    const ref = doc(db, "sessions", sessionId, "skims", skimId);
    const legacyRef = doc(db, "sessions", sessionId, "data", "main");
    const [cardsSnapshot, legacySnapshot] = await Promise.all([
        getDocs(collection(ref, 'cards')),
        getDoc(legacyRef),
    ]);
    const batch = writeBatch(db);
    cardsSnapshot.docs.forEach((cardDoc) => batch.delete(cardDoc.ref));
    batch.delete(ref);
    if (legacySnapshot.exists()) {
        const legacySessions = legacySnapshot.data().skimSessions;
        if (Array.isArray(legacySessions)) {
            const remaining = legacySessions.filter((session: PersistedSkimSession) => session?.id !== skimId);
            batch.update(legacyRef, remaining.length > 0
                ? { skimSessions: remaining }
                : { skimSessions: deleteField() });
        }
    }
    await batch.commit();
};

export const fetchSessionDetails = async (sessionId: string): Promise<Partial<CloudSession>> => {
    try {
        const heavyRef = doc(db, "sessions", sessionId, "data", "main");
        const snapshot = await getDoc(heavyRef);
        const fullData = snapshot.exists() ? (snapshot.data() as Partial<CloudSession>) : {};
        // 兼容读取：新柜子（skims/ 子集合）优先；子集合为空时回退老数组 data/main.skimSessions（行为照旧）。
        const skimDocs = await readSkimSessions(sessionId);
        if (skimDocs.length > 0) {
            fullData.skimSessions = skimDocs;
        }
        return fullData;
    } catch (error) {
        console.error("[Firestore] Fetch Details Failed:", error);
        return {};
    }
};

export const updateCloudSessionState = async (sessionId: string, data: Partial<CloudSession>) => {
  try {
    // skimSessions 改走子集合（sessions/{id}/skims/{skimId}），不再进 data/main，绕开单文档 1MB 上限。
    // activeSkimIndex 仍随 rest 走 heavy → data/main（轻量字段，原路不变）。
    const { skimSessions, ...rest } = data;
    const { metaUpdates, heavyUpdates } = splitUpdateData(rest);
    const promises = [];

    if (Object.keys(metaUpdates).length > 0) {
        metaUpdates.updatedAt = Timestamp.now();
        const rootRef = doc(db, "sessions", sessionId);
        const cleanMeta = JSON.parse(JSON.stringify(metaUpdates));
        promises.push(updateDoc(rootRef, cleanMeta));
    }

    if (Object.keys(heavyUpdates).length > 0) {
        const heavyRef = doc(db, "sessions", sessionId, "data", "main");
        const cleanHeavy = JSON.parse(JSON.stringify(heavyUpdates));
        promises.push(updateDoc(heavyRef, cleanHeavy));
    }

    // 本次更新携带 skimSessions（未被 isUntouched 抑制）⇒ 拆子文档写。undefined 则跳过（语义同读取层）。
    if (skimSessions !== undefined) {
        promises.push(writeSkimSessions(sessionId, skimSessions));
    }

    if (promises.length > 0) {
        await Promise.all(promises);
    }
  } catch (error) {
    console.error("[Sync] Update Failed:", error);
  }
};

export const renameCloudSession = async (sessionId: string, newName: string) => {
  try {
    const sessionRef = doc(db, "sessions", sessionId);
    await updateDoc(sessionRef, { customTitle: newName });
  } catch (error) {
    console.error("[Firestore] Rename Failed:", error);
    throw error;
  }
};

export const moveSession = async (sessionId: string, newParentId: string | null) => {
    try {
        const sessionRef = doc(db, "sessions", sessionId);
        await updateDoc(sessionRef, { parentId: newParentId, updatedAt: Timestamp.now() });
    } catch (error) {
        console.error("Move Session Failed:", error);
        throw error;
    }
};

export const deleteCloudSession = async (sessionId: string) => {
  try {
    const heavyRef = doc(db, "sessions", sessionId, "data", "main");
    await deleteDoc(heavyRef);
    const rootRef = doc(db, "sessions", sessionId);
    await deleteDoc(rootRef);
  } catch (error) {
    console.error("[Firestore] Delete Failed:", error);
    throw error;
  }
};

export const getUserSessions = async (user: User): Promise<CloudSession[]> => {
  try {
    const q = query(
      collection(db, "sessions"), 
      orderBy("createdAt", "desc"),
      firestoreLimit(100) // Increase limit for folders
    );
    
    const snapshot = await getDocs(q);
    const sessions: CloudSession[] = [];
    snapshot.forEach(doc => {
      const data = doc.data() as any;
      if (data.userId === user.uid) {
        sessions.push({ 
            id: doc.id, 
            ...data,
            type: data.type || 'file', // Backwards compatibility
            parentId: data.parentId || null // Backwards compatibility
        } as CloudSession);
      }
    });
    return sessions;
  } catch (error) {
    console.error("[Firebase] Get Sessions Failed:", error);
    return [];
  }
};

// --- Calendar & Memo Cloud Functions (User Subcollections) ---

export const addCalendarEvent = async (user: User, eventData: Omit<CalendarEvent, 'id' | 'userId'>): Promise<CalendarEvent> => {
    try {
        const eventsRef = collection(db, "users", user.uid, "events");
        const docRef = await addDoc(eventsRef, { ...eventData, userId: user.uid });
        return { ...eventData, id: docRef.id, userId: user.uid };
    } catch (e) {
        console.error("Add Event Failed", e);
        throw e;
    }
};

export const getCalendarEvents = async (user: User): Promise<CalendarEvent[]> => {
    try {
        const eventsRef = collection(db, "users", user.uid, "events");
        // We can optimize queries later, for now get all
        const q = query(eventsRef);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CalendarEvent));
    } catch (e) {
        console.error("Get Events Failed", e);
        return [];
    }
};

export const deleteCalendarEvent = async (userId: string, eventId: string): Promise<void> => {
    try {
        const eventRef = doc(db, "users", userId, "events", eventId);
        await deleteDoc(eventRef);
    } catch (e) {
        console.error("Delete Event Failed", e);
        throw e;
    }
};

export const addMemo = async (user: User, content: string): Promise<Memo> => {
    try {
        const memosRef = collection(db, "users", user.uid, "memos");
        const newMemo = {
            userId: user.uid,
            content,
            createdAt: Date.now()
        };
        const docRef = await addDoc(memosRef, newMemo);
        return { ...newMemo, id: docRef.id };
    } catch (e) {
        console.error("Add Memo Failed", e);
        throw e;
    }
};

export const getMemos = async (user: User): Promise<Memo[]> => {
    try {
        const memosRef = collection(db, "users", user.uid, "memos");
        const q = query(memosRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Memo));
    } catch (e) {
        console.error("Get Memos Failed", e);
        return [];
    }
};

export const deleteMemo = async (userId: string, memoId: string): Promise<void> => {
    try {
        const memoRef = doc(db, "users", userId, "memos", memoId);
        await deleteDoc(memoRef);
    } catch (e) {
        console.error("Delete Memo Failed", e);
        throw e;
    }
};

// --- 私教模式独立云存（users/{uid}/tutorSessions 子集合，与 sessions 集合物理隔离）---
// 照 events / memos 用户子集合模式；不碰 sessions / splitUpdateData / createCloudSession / updateCloudSessionState。
// 注：TutorSession 自带客户端生成的 id，故用 setDoc(按 id 寻址) 而非 addDoc(自动 id)，
// 让云端文档 id 与本地 IndexedDB keyPath 'id' 对齐，便于后续阶段做本地↔云同步。

/** 单条 upsert：以 session.id 作云端文档 id（setDoc 即存在则覆盖、不存在则建） */
export const saveTutorSessionToCloud = async (user: User, session: TutorSession): Promise<void> => {
    try {
        const ref = doc(db, "users", user.uid, "tutorSessions", session.id);
        await setDoc(ref, { ...session, userId: user.uid });
    } catch (e) {
        console.error("Save Tutor Session Failed", e);
        throw e;
    }
};

/** 拉取当前用户全部私教会话（按 createdAt 降序） */
export const getTutorSessionsFromCloud = async (user: User): Promise<TutorSession[]> => {
    try {
        const ref = collection(db, "users", user.uid, "tutorSessions");
        const q = query(ref, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TutorSession));
    } catch (e) {
        console.error("Get Tutor Sessions Failed", e);
        return [];
    }
};

/** 按 id 删单条 */
export const deleteTutorSessionFromCloud = async (userId: string, sessionId: string): Promise<void> => {
    try {
        const ref = doc(db, "users", userId, "tutorSessions", sessionId);
        await deleteDoc(ref);
    } catch (e) {
        console.error("Delete Tutor Session Failed", e);
        throw e;
    }
};

// --- Joint Review Packs (Dashboard multi-material review) ---

export const createJointReviewPack = async (
    user: User,
    input: { title: string; materials: JointReviewMaterial[] }
): Promise<JointReviewPack> => {
    try {
        const now = Date.now();
        const packsRef = collection(db, "users", user.uid, "jointReviewPacks");
        const payload = {
            userId: user.uid,
            title: input.title.trim(),
            materials: input.materials,
            summaryMarkdown: '',
            guideMessages: [],
            examPrepMarkdown: '',
            createdAt: now,
            updatedAt: now,
            generatedAt: null,
            examPrepGeneratedAt: null,
        };
        const ref = await addDoc(packsRef, payload);
        return { id: ref.id, ...payload };
    } catch (e) {
        console.error("Create Joint Review Pack Failed", e);
        throw e;
    }
};

export const getJointReviewPacks = async (user: User): Promise<JointReviewPack[]> => {
    try {
        const packsRef = collection(db, "users", user.uid, "jointReviewPacks");
        const q = query(packsRef, orderBy("updatedAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as JointReviewPack));
    } catch (e) {
        console.error("Get Joint Review Packs Failed", e);
        return [];
    }
};

export const updateJointReviewPack = async (
    user: User,
    packId: string,
    partial: Partial<Pick<JointReviewPack, 'title' | 'materials' | 'summaryMarkdown' | 'guideMessages' | 'examPrepMarkdown' | 'generatedAt' | 'examPrepGeneratedAt'>>
): Promise<void> => {
    try {
        const ref = doc(db, "users", user.uid, "jointReviewPacks", packId);
        await updateDoc(ref, {
            ...partial,
            updatedAt: Date.now(),
        });
    } catch (e) {
        console.error("Update Joint Review Pack Failed", e);
        throw e;
    }
};

export const deleteJointReviewPack = async (userId: string, packId: string): Promise<void> => {
    try {
        const ref = doc(db, "users", userId, "jointReviewPacks", packId);
        await deleteDoc(ref);
    } catch (e) {
        console.error("Delete Joint Review Pack Failed", e);
        throw e;
    }
};

// --- Exam Hub (exams / examMaterials / dailyPlanCache) ---

const examAtToMillis = (v: unknown): number | null => {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (v instanceof Timestamp) return v.toMillis();
    if (typeof (v as { toMillis?: () => number }).toMillis === 'function') return (v as Timestamp).toMillis();
    return null;
};

const DISCIPLINE_VALUES: DisciplineBand[] = [
  'humanities_social',
  'business_mgmt',
  'stem',
  'arts_creative',
  'unspecified',
];

function parseDisciplineBand(v: unknown): DisciplineBand | undefined {
  if (typeof v !== 'string') return undefined;
  return DISCIPLINE_VALUES.includes(v as DisciplineBand) ? (v as DisciplineBand) : undefined;
}

const examDocToExam = (id: string, data: Record<string, unknown>): Exam => ({
    id,
    userId: String(data.userId || ''),
    title: String(data.title || ''),
    examAt: examAtToMillis(data.examAt),
    color: data.color != null ? String(data.color) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    disciplineBand: parseDisciplineBand(data.disciplineBand),
    createdAt: examAtToMillis(data.createdAt) ?? Date.now(),
    updatedAt: examAtToMillis(data.updatedAt) ?? Date.now(),
});

const materialDocToLink = (id: string, data: Record<string, unknown>): ExamMaterialLink => ({
    id,
    userId: String(data.userId || ''),
    examId: String(data.examId || ''),
    sourceType: data.sourceType === 'sessionId' ? 'sessionId' : 'fileHash',
    fileHash: data.fileHash != null ? String(data.fileHash) : undefined,
    cloudSessionId: data.cloudSessionId != null ? String(data.cloudSessionId) : undefined,
    fileName: String(data.fileName || ''),
    sortIndex: typeof data.sortIndex === 'number' ? data.sortIndex : undefined,
    addedAt: examAtToMillis(data.addedAt) ?? Date.now(),
});

export const createExam = async (
    user: User,
    input: { title: string; examAt: number | null; color?: string; notes?: string; disciplineBand?: DisciplineBand }
): Promise<Exam> => {
    const now = Timestamp.now();
    const examAtTs = input.examAt != null ? Timestamp.fromMillis(input.examAt) : null;
    const payload = {
        userId: user.uid,
        title: input.title.trim(),
        examAt: examAtTs,
        color: input.color ?? '#6366f1',
        notes: input.notes?.trim() ?? '',
        disciplineBand: input.disciplineBand && input.disciplineBand !== 'unspecified' ? input.disciplineBand : 'unspecified',
        createdAt: now,
        updatedAt: now,
    };
    const ref = await addDoc(collection(db, 'exams'), payload);
    return examDocToExam(ref.id, { ...payload, examAt: input.examAt });
};

export const updateExam = async (
    user: User,
    examId: string,
    partial: Partial<Pick<Exam, 'title' | 'examAt' | 'color' | 'notes' | 'disciplineBand'>>
): Promise<void> => {
    const ref = doc(db, 'exams', examId);
    const snap = await getDoc(ref);
    if (!snap.exists() || (snap.data() as { userId?: string }).userId !== user.uid) throw new Error('无权修改该考试');
    const u: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (partial.title != null) u.title = partial.title.trim();
    if (partial.examAt !== undefined) u.examAt = partial.examAt != null ? Timestamp.fromMillis(partial.examAt) : null;
    if (partial.color != null) u.color = partial.color;
    if (partial.notes != null) u.notes = partial.notes;
    if (partial.disciplineBand !== undefined) {
        u.disciplineBand = partial.disciplineBand === 'unspecified' ? 'unspecified' : partial.disciplineBand;
    }
    await updateDoc(ref, u);
};

export const deleteExam = async (user: User, examId: string): Promise<void> => {
    const ref = doc(db, 'exams', examId);
    const snap = await getDoc(ref);
    if (!snap.exists() || (snap.data() as { userId?: string }).userId !== user.uid) throw new Error('无权删除该考试');
    const mq = query(collection(db, 'examMaterials'), where('userId', '==', user.uid));
    const matSnap = await getDocs(mq);
    await Promise.all(
        matSnap.docs.filter((d) => (d.data() as { examId?: string }).examId === examId).map((d) => deleteDoc(d.ref))
    );
    await deleteDoc(ref);
};

export const listExams = async (user: User): Promise<Exam[]> => {
    try {
        const q = query(collection(db, 'exams'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const list: Exam[] = [];
        snap.forEach((d) => list.push(examDocToExam(d.id, d.data() as Record<string, unknown>)));
        return list.sort((a, b) => {
            if (a.examAt == null && b.examAt == null) return b.updatedAt - a.updatedAt;
            if (a.examAt == null) return 1;
            if (b.examAt == null) return -1;
            return a.examAt - b.examAt;
        });
    } catch (e) {
        console.error('listExams failed', e);
        return [];
    }
};

export const addExamMaterialLink = async (
    user: User,
    input: Omit<ExamMaterialLink, 'id' | 'userId' | 'addedAt'> & { examId: string }
): Promise<ExamMaterialLink> => {
    const now = Timestamp.now();
    const payload = {
        userId: user.uid,
        examId: input.examId,
        sourceType: input.sourceType,
        fileHash: input.fileHash ?? null,
        cloudSessionId: input.cloudSessionId ?? null,
        fileName: input.fileName,
        sortIndex: input.sortIndex ?? Date.now(),
        addedAt: now,
    };
    const ref = await addDoc(collection(db, 'examMaterials'), payload);
    return materialDocToLink(ref.id, payload as Record<string, unknown>);
};

export const removeExamMaterialLink = async (user: User, linkId: string): Promise<void> => {
    const ref = doc(db, 'examMaterials', linkId);
    const snap = await getDoc(ref);
    if (!snap.exists() || (snap.data() as { userId?: string }).userId !== user.uid) throw new Error('无权删除该关联');
    await deleteDoc(ref);
};

export const listExamMaterialLinks = async (user: User): Promise<ExamMaterialLink[]> => {
    try {
        const q = query(collection(db, 'examMaterials'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const list: ExamMaterialLink[] = [];
        snap.forEach((d) => list.push(materialDocToLink(d.id, d.data() as Record<string, unknown>)));
        return list.sort((a, b) => b.addedAt - a.addedAt);
    } catch (e) {
        console.error('listExamMaterialLinks failed', e);
        return [];
    }
};

const dailyPlanDocId = (userId: string, dateStr: string) => `${userId}_${dateStr}`;

export const getDailyPlanCache = async (userId: string, dateStr: string): Promise<DailyPlanCacheDoc | null> => {
    try {
        const ref = doc(db, 'dailyPlanCache', dailyPlanDocId(userId, dateStr));
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        const data = snap.data() as Record<string, unknown>;
        if (data.userId !== userId) return null;
        return {
            userId: String(data.userId),
            date: String(data.date),
            selectedExamIds: Array.isArray(data.selectedExamIds) ? data.selectedExamIds.map(String) : [],
            segments: Array.isArray(data.segments) ? (data.segments as DailySegment[]) : [],
            generatedAt: typeof data.generatedAt === 'number' ? data.generatedAt : Date.now(),
            budgetMinutes: typeof data.budgetMinutes === 'number' ? data.budgetMinutes : 30,
            version: typeof data.version === 'number' ? data.version : 1,
            maintenance: data.maintenance as DailyPlanCacheDoc['maintenance'] | undefined,
        };
    } catch (e) {
        console.error('getDailyPlanCache failed', e);
        return null;
    }
};

export const setDailyPlanCache = async (user: User, doc: Omit<DailyPlanCacheDoc, 'userId'> & { date: string }): Promise<void> => {
    const id = dailyPlanDocId(user.uid, doc.date);
    const ref = doc(db, 'dailyPlanCache', id);
    await setDoc(ref, {
        userId: user.uid,
        date: doc.date,
        selectedExamIds: doc.selectedExamIds,
        segments: doc.segments,
        generatedAt: doc.generatedAt,
        budgetMinutes: doc.budgetMinutes,
        version: doc.version,
        maintenance: doc.maintenance ?? null,
    });
};

export const deleteDailyPlanCache = async (user: User, dateStr: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, 'dailyPlanCache', dailyPlanDocId(user.uid, dateStr)));
    } catch (e) {
        console.error('deleteDailyPlanCache failed', e);
    }
};

export const saveTinyStudyEntrySessionToCloud = async (
    user: User,
    session: TinyStudyEntrySession
): Promise<void> => {
    const ref = doc(db, 'users', user.uid, 'tinyStudyEntrySessions', session.cloudSessionId);
    const payload = JSON.parse(JSON.stringify({ ...session, userId: user.uid }));
    await setDoc(ref, payload);
};

export const getTinyStudyEntrySessionFromCloud = async (
    user: User,
    cloudSessionId: string
): Promise<TinyStudyEntrySession | null> => {
    const ref = doc(db, 'users', user.uid, 'tinyStudyEntrySessions', cloudSessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as TinyStudyEntrySession;
};

export { auth, db };
