/**
 * Local project persistence in IndexedDB. Projects (including the source PDF
 * and images) are stored only in this browser on this device — never uploaded.
 */
import type { Project, ProjectImage } from "../forms/model";

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: number;
  project: Project;
  source: Uint8Array | null;
  sourceName: string | null;
  images: Record<string, ProjectImage>;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  pages: number;
  fields: number;
}

const DB = "pdfquick-forms";
const STORE = "projects";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser can't save projects locally."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open local storage."));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error("Local storage error."));
      t.onabort = () => reject(t.error ?? new Error("Local storage is full or unavailable."));
    });
  } finally {
    db.close();
  }
}

export async function saveProject(p: SavedProject): Promise<void> {
  await tx("readwrite", (s) => s.put({ ...p, updatedAt: Date.now() }));
}

export async function loadProject(id: string): Promise<SavedProject | undefined> {
  return tx<SavedProject | undefined>("readonly", (s) => s.get(id) as IDBRequest<SavedProject | undefined>);
}

export async function deleteProject(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<SavedProject[]>("readonly", (s) => s.getAll() as IDBRequest<SavedProject[]>);
  return all
    .map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      pages: p.project.pages.length,
      fields: p.project.elements.filter((e) => !["heading", "paragraph", "line", "rect", "image"].includes(e.type)).length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
