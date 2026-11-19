'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { firebaseConfig, isFirebaseConfigured, isRtdbConfigured } from './config';

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedRtdb: Database | null = null;
let cachedFunctions: Functions | null = null;
let connectionTested = false;

export function getFirebaseServices(): {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  rtdb: Database | null;
  functions: Functions | null;
} {
  if (typeof window === 'undefined' || !isFirebaseConfigured()) {
    return { app: null, auth: null, db: null, rtdb: null, functions: null };
  }

  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  if (!cachedAuth) {
    cachedAuth = getAuth(cachedApp);
  }
  if (!cachedDb) {
    cachedDb = firebaseConfig.firestoreDatabaseId
      ? getFirestore(cachedApp, firebaseConfig.firestoreDatabaseId)
      : getFirestore(cachedApp);
  }
  if (!cachedRtdb && isRtdbConfigured()) {
    cachedRtdb = getDatabase(cachedApp, firebaseConfig.databaseURL);
  }
  if (!cachedFunctions) {
    cachedFunctions = getFunctions(cachedApp, firebaseConfig.functionsRegion);
  }

  if (!connectionTested && cachedDb) {
    connectionTested = true;
    void testConnection(cachedDb);
  }

  return {
    app: cachedApp,
    auth: cachedAuth,
    db: cachedDb,
    rtdb: cachedRtdb,
    functions: cachedFunctions,
  };
}

async function testConnection(db: Firestore): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
    }
  }
}
