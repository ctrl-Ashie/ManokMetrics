const DATABASE_NAME = "manokmetrics-local-data";
const DATABASE_VERSION = 1;
const STORE_NAME = "imported-datasets";

function storageError(error) {
  const message = error?.message || "Browser storage is unavailable.";
  return new Error(`Imported dataset storage failed: ${message}`);
}

function ensureIndexedDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("Imported dataset storage is unavailable in this browser.");
  }
}

function openDatabase() {
  ensureIndexedDb();
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError(request.error));
  });
}

function transactionRequest(mode, run) {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError(request.error));
    transaction.onabort = () => reject(storageError(transaction.error));
    transaction.oncomplete = () => database.close();
  }));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listImportedDatasets() {
  const records = await transactionRequest("readonly", store => store.getAll());
  return (records || [])
    .map(({ csv, ...metadata }) => metadata)
    .sort((a, b) => String(b.storedAt).localeCompare(String(a.storedAt)));
}

export async function saveImportedDataset({ filename, csv, metadata }) {
  if (typeof filename !== "string" || !filename.trim() || typeof csv !== "string") {
    throw new Error("The imported dataset has invalid storage data.");
  }
  const record = {
    ...metadata,
    id: createId(),
    originalFilename: filename,
    csv,
    storedAt: new Date().toISOString(),
  };
  await transactionRequest("readwrite", store => store.put(record));
  return { ...record, csv: undefined };
}

export async function getImportedDataset(id) {
  if (!id) throw new Error("No imported dataset was selected.");
  return transactionRequest("readonly", store => store.get(id));
}

export async function deleteImportedDataset(id) {
  if (!id) throw new Error("No imported dataset was selected.");
  await transactionRequest("readwrite", store => store.delete(id));
}
