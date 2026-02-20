
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  getDocs, 
  query, 
  orderBy, 
  limit, 
  Timestamp, 
  initializeFirestore, 
  enableIndexedDbPersistence 
} from 'firebase/firestore';

import { ChatCache, ExplanationCache, AnnotationCache, ChatMessage, StudyMap, ViewMode, SkimStage, QuizData, DocType, NotebookData, CloudSession, CalendarEvent, Memo, DungeonState } from '../types';

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
    const objectPath = `users/${user.uid}/uploads/${safeFileName}`;
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

export const createCloudSession = async (user: User, fileName: string, fileUrl: string): Promise<string> => {
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
      parentId: null // Default root
    };

    const heavyData = {
      chatCache: {},
      explanations: {},
      annotations: {},
      notebookData: {}, 
      skimMessages: [],
      viewMode: 'deep',
      docType: 'STEM',
      currentIndex: 0,
      skimTopHeight: 60,
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

export const fetchSessionDetails = async (sessionId: string): Promise<Partial<CloudSession>> => {
    try {
        const heavyRef = doc(db, "sessions", sessionId, "data", "main");
        const snapshot = await getDoc(heavyRef);
        if (snapshot.exists()) {
            return snapshot.data() as Partial<CloudSession>;
        }
        return {};
    } catch (error) {
        console.error("[Firestore] Fetch Details Failed:", error);
        return {};
    }
};

export const updateCloudSessionState = async (sessionId: string, data: Partial<CloudSession>) => {
  try {
    const { metaUpdates, heavyUpdates } = splitUpdateData(data);
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
      limit(100) // Increase limit for folders
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

// --- Dungeon State Cloud Functions (User-level) ---

export const saveDungeonState = async (user: User, state: DungeonState): Promise<void> => {
    try {
        const dungeonRef = doc(db, "users", user.uid, "dungeon", "state");
        await setDoc(dungeonRef, {
            ...state,
            lastSaved: Timestamp.now()
        }, { merge: true });
    } catch (e) {
        console.error("[Firebase] Save Dungeon State Failed:", e);
        throw e;
    }
};

export const loadDungeonState = async (user: User): Promise<DungeonState | null> => {
    try {
        const dungeonRef = doc(db, "users", user.uid, "dungeon", "state");
        const snapshot = await getDoc(dungeonRef);
        if (snapshot.exists()) {
            const data = snapshot.data();
            // Remove Firestore timestamp fields
            const { lastSaved, ...state } = data;
            return state as DungeonState;
        }
        return null;
    } catch (e) {
        console.error("[Firebase] Load Dungeon State Failed:", e);
        return null;
    }
};

export { auth, db };
