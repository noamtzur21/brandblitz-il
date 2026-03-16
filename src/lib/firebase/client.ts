import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = () => ({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

export function isFirebaseClientConfigured() {
  const cfg = firebaseConfig();
  return Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
}

function assertBrowser() {
  if (typeof window === "undefined") {
    throw new Error("Firebase client was initialized on the server.");
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  assertBrowser();
  if (getApps().length > 0) {
    _app = getApp();
    return _app;
  }

  const cfg = firebaseConfig();
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_* env vars.");
  }

  _app = initializeApp(cfg);
  return _app;
}

export function getClientAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

export function getClientDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getFirebaseApp());
  return _db;
}

export function getClientStorage(): FirebaseStorage {
  if (_storage) return _storage;
  _storage = getStorage(getFirebaseApp());
  return _storage;
}

