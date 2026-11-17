import { getDeployStore, getStore } from "@netlify/blobs";

export interface BlobMetadata {
  contentType: string;
  filename?: string;
}

export interface BlobObject {
  data: Uint8Array;
  metadata: BlobMetadata;
}

export interface BlobStorage {
  put(key: string, data: Uint8Array, metadata: BlobMetadata): Promise<void>;
  get(key: string): Promise<BlobObject | null>;
  delete(key: string): Promise<void>;
}

export function createMemoryBlobStorage(): BlobStorage {
  const map = new Map<string, BlobObject>();
  return {
    async put(key, data, metadata) {
      map.set(key, { data: new Uint8Array(data), metadata: { ...metadata } });
    },
    async get(key) {
      const item = map.get(key);
      if (!item) return null;
      return { data: new Uint8Array(item.data), metadata: { ...item.metadata } };
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

export function createNetlifyBlobStorage(
  storeName: string,
  useDeployScope = false,
): BlobStorage {
  const getTargetStore = () =>
    useDeployScope
      ? getDeployStore({ name: storeName, consistency: "strong" })
      : getStore({ name: storeName, consistency: "strong" });

  return {
    async put(key, data, metadata) {
      const store = getTargetStore();
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      await store.set(key, buffer, {
        metadata: {
          contentType: metadata.contentType,
          filename: metadata.filename ?? "",
        },
      });
    },
    async get(key) {
      const store = getTargetStore();
      const entry = await store.getWithMetadata(key, {
        type: "arrayBuffer",
        consistency: "strong",
      });
      if (entry === null) return null;
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      return {
        data: new Uint8Array(entry.data as ArrayBuffer),
        metadata: {
          contentType:
            typeof meta.contentType === "string" && meta.contentType
              ? meta.contentType
              : "application/octet-stream",
          filename: typeof meta.filename === "string" && meta.filename ? meta.filename : undefined,
        },
      };
    },
    async delete(key) {
      const store = getTargetStore();
      await store.delete(key);
    },
  };
}
