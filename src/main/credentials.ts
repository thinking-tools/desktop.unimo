import { safeStorage } from 'electron';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto';
import Store from 'electron-store';

interface PinEnvelope {
  salt: string;
  iv: string;
  tag: string;
}

interface Account {
  id: string;
  name: string;
  endpoint: string;
  pin: PinEnvelope | null;
  data: string;
}

export interface AccountInfo {
  id: string;
  name: string;
  endpoint: string;
  pinProtected: boolean;
}

interface CredentialStore {
  accounts: Account[];
}

const store = new Store<{ data: string }>({
  name: 'credentials',
  fileExtension: 'enc',
});

let cache: AccountInfo[] | null = null;

const safePack = (value: CredentialStore): string =>
  safeStorage.encryptString(JSON.stringify(value)).toString('base64');

const safeUnpack = (): CredentialStore => {
  const raw = store.get('data');
  if (!raw) return { accounts: [] };
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(raw, 'base64')));
  } catch {
    return { accounts: [] };
  }
};

const toInfo = (a: Account): AccountInfo => ({
  id: a.id,
  name: a.name,
  endpoint: a.endpoint,
  pinProtected: a.pin !== null,
});

const syncCache = (accounts: Account[]) => {
  cache = accounts.map(toInfo);
};

const deriveKey = (pin: string, salt: Buffer) => scryptSync(pin, salt, 32);

const pinEncrypt = (plain: string, pin: string): { data: string; envelope: PinEnvelope } => {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = deriveKey(pin, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    data: encrypted.toString('base64'),
    envelope: {
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    },
  };
};

const pinDecrypt = (ciphertext: string, pin: string, envelope: PinEnvelope): string => {
  const key = deriveKey(pin, Buffer.from(envelope.salt, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return decipher.update(ciphertext, 'base64', 'utf8') + decipher.final('utf8');
};

export const credentials = {
  available: () => safeStorage.isEncryptionAvailable(),

  /** Load accounts into memory. Call once at startup. */
  init: () => {
    syncCache(safeUnpack().accounts);
  },

  /** List accounts (from cache, no disk read). */
  list: (): AccountInfo[] => cache ?? [],

  /** Get decrypted secrets for an account. */
  get: (id: string, pin?: string): Record<string, unknown> | null => {
    const account = safeUnpack().accounts.find(a => a.id === id);
    if (!account) return null;
    if (account.pin) {
      if (!pin) throw new Error('PIN required');
      return JSON.parse(pinDecrypt(account.data, pin, account.pin));
    }
    return JSON.parse(account.data);
  },

  /** Store or update an account. */
  store: (name: string, endpoint: string, data: Record<string, unknown>, pin?: string) => {
    const s = safeUnpack();
    const json = JSON.stringify(data);
    const id = `${name}@${endpoint}`;
    let account: Account;
    if (pin) {
      const { data: encrypted, envelope } = pinEncrypt(json, pin);
      account = { id, name, endpoint, pin: envelope, data: encrypted };
    } else {
      account = { id, name, endpoint, pin: null, data: json };
    }
    const idx = s.accounts.findIndex(a => a.id === id);
    if (idx >= 0) s.accounts[idx] = account;
    else s.accounts.push(account);
    store.set('data', safePack(s));
    syncCache(s.accounts);
  },

  remove: (id: string) => {
    const s = safeUnpack();
    s.accounts = s.accounts.filter(a => a.id !== id);
    store.set('data', safePack(s));
    syncCache(s.accounts);
  },

  clear: () => {
    store.delete('data');
    cache = [];
  },
};
