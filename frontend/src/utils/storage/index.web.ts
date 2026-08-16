// Web storage (Metro picks index.ts on native).
// Helpers never throw: reads return `fallback`, writes return `false`.
// Values supported: string | number | boolean | null (JSON-serialized on disk).
// Usage: import { storage } from "@/src/utils/storage"; await storage.getItem(key, fallback);
// No Keychain on web — secure* helpers reuse AsyncStorage (no expo-secure-store).

import AsyncStorage from "@react-native-async-storage/async-storage";

import { AssertNoExtras, StorageBase, StorageItemValue } from "./storage-base";

export class Storage extends StorageBase {
  private secureKey(key: string) {
    return `laps_turni_secure_${key}`;
  }

  private browserStorage() {
    return typeof window === "undefined" ? null : window.localStorage;
  }

  // General KV — backed by AsyncStorage (its built-in web shim uses IndexedDB).
  async getItem<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return this.retrieve(raw, fallback);
    } catch (e) {
      this.warn("getItem", key, e);
      return fallback;
    }
  }

  async setItem<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      this.warn("setItem", key, e);
      return false;
    }
  }

  async removeItem(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (e) {
      this.warn("removeItem", key, e);
      return false;
    }
  }

  // Auth data uses localStorage directly so a normal browser keeps the session
  // after the page or browser is closed. A legacy AsyncStorage value is migrated.
  async secureGet<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null> {
    try {
      const browserStorage = this.browserStorage();
      const raw = browserStorage?.getItem(this.secureKey(key)) ?? null;
      if (raw !== null) return this.retrieve(raw, fallback);
    } catch (e) {
      this.warn("secureGet", key, e);
    }

    const legacyValue = await this.getItem(key, fallback);
    if (legacyValue !== null && legacyValue !== fallback) {
      await this.secureSet(key, legacyValue);
    }
    return legacyValue;
  }

  async secureSet<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean> {
    try {
      const browserStorage = this.browserStorage();
      if (!browserStorage) return this.setItem(key, value);
      browserStorage.setItem(this.secureKey(key), JSON.stringify(value));
      return true;
    } catch (e) {
      this.warn("secureSet", key, e);
      return this.setItem(key, value);
    }
  }

  async secureRemove(key: string): Promise<boolean> {
    let removed = true;
    try {
      this.browserStorage()?.removeItem(this.secureKey(key));
    } catch (e) {
      this.warn("secureRemove", key, e);
      removed = false;
    }
    const legacyRemoved = await this.removeItem(key);
    return removed && legacyRemoved;
  }
}

export const storage = new Storage();

// Compile-time guard: any new method must be declared in storage-base.ts first.
export type NoExtraStorageMethods = AssertNoExtras<Exclude<keyof Storage, keyof StorageBase>>;
