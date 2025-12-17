import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  type FirestoreError,
  type QueryConstraint
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";

type WithId<T> = T & { id: string };

export interface UseCollectionOptions {
  orderByField?: string;
  orderDirection?: "asc" | "desc";
  constraints?: QueryConstraint[];
}

export function useCollection<T = unknown>(
  collectionPath: string,
  options: UseCollectionOptions = {}
) {
  const { orderByField, orderDirection = "asc", constraints = [] } = options;

  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    const baseRef = collection(db, collectionPath);
    const q =
      orderByField != null
        ? query(baseRef, orderBy(orderByField, orderDirection), ...constraints)
        : query(baseRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const next: WithId<T>[] = snapshot.docs.map(docSnap => {
          return { id: docSnap.id, ...(docSnap.data() as T) };
        });
        setData(next);
        setLoading(false);
      },
      err => {
        console.error("Firestore collection subscription error", {
          collectionPath,
          error: err
        });
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionPath, orderByField, orderDirection, ...constraints]);

  return { data, loading, error };
}

export async function addDocument<T extends Record<string, unknown>>(
  collectionPath: string,
  docData: T & { createdAt?: unknown } = {} as T
) {
  const ref = collection(db, collectionPath);
  const toSave = {
    ...docData,
    createdAt: docData.createdAt ?? serverTimestamp()
  };
  await addDoc(ref, toSave);
}

export async function updateDocument<T extends Record<string, unknown>>(
  collectionPath: string,
  id: string,
  partial: Partial<T>
) {
  const ref = doc(db, collectionPath, id);
  await updateDoc(ref, partial);
}


