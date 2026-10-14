// Uploaded files kept in this browser (IndexedDB), so bank records can be
// filed behind the account without uploading them twice. In Case Control
// they would live in the case's document storage instead.

const DB_NAME = "docbuilder-files";
const STORE = "files";

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  opening.catch(() => (opening = null));
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Files that couldn't be stored (private windows, blocked storage) stay here for this visit. */
const memory = new Map<string, Uint8Array>();

/** False when the file could only be kept until the page is closed. */
export async function putFile(id: string, bytes: Uint8Array): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put(new Blob([bytes as BlobPart]), id));
    return true;
  } catch {
    memory.set(id, bytes);
    return false;
  }
}

export async function getFile(id: string): Promise<Uint8Array | null> {
  if (memory.has(id)) return memory.get(id)!;
  try {
    const blob = await run<Blob | undefined>("readonly", (s) => s.get(id));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export async function deleteFiles(ids: string[]): Promise<void> {
  for (const id of ids) {
    memory.delete(id);
    try {
      await run("readwrite", (s) => s.delete(id));
    } catch {
      // Nothing stored.
    }
  }
}

export async function clearFiles(): Promise<void> {
  memory.clear();
  try {
    await run("readwrite", (s) => s.clear());
  } catch {
    // Nothing stored.
  }
}

/** Whether a file is still kept in this browser. */
export async function hasFile(id: string): Promise<boolean> {
  if (memory.has(id)) return true;
  try {
    return (await run<IDBValidKey | undefined>("readonly", (s) => s.getKey(id))) !== undefined;
  } catch {
    return false;
  }
}
