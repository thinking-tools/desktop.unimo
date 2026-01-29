// actions.ts
import { shell, app } from 'electron';
import { exec } from 'child_process';

export type ActionType = 'app:launch' | 'url:open' | 'file:open' | 'command:run' | 'callback';

export interface Action {
  type: ActionType;
  payload: string;
}

const registry = new Map<string, Action>();

export const register = (id: string, action: Action): void => {
  registry.set(id, action);
};

export const registerBatch = (actions: [string, Action][]): void => {
  for (const [id, action] of actions) registry.set(id, action);
};

export const unregister = (id: string): void => {
  registry.delete(id);
};

export const clear = (): void => registry.clear();

// Callback handlers for internal commands
const callbacks = new Map<string, () => void | Promise<void>>();

export const registerCallback = (name: string, fn: () => void | Promise<void>): void => {
  callbacks.set(name, fn);
};

export const execute = async (id: string): Promise<boolean> => {
  // console.warn(`Executing action: ${id}`);
  const action = registry.get(id);
  if (!action) return false;

  switch (action.type) {
    case 'app:launch':
      if (process.platform === 'darwin') {
        console.log('[execute] Launching app on macOS:', action.payload);
        // Use open -a for app bundles, open for paths
        const cmd = action.payload.endsWith('.app') ? `open -a "${action.payload}"` : `open "${action.payload}"`;
        exec(cmd, (err, stdout, stderr) => {
          if (err) console.error('[execute] exec error:', err, stderr);
        });
      } else {
        await shell.openPath(action.payload);
      }
      break;
    case 'url:open':
      await shell.openExternal(action.payload);
      break;
    case 'file:open':
      await shell.openPath(action.payload);
      break;
    case 'command:run':
      exec(action.payload);
      break;
    case 'callback':
      const cb = callbacks.get(action.payload);
      if (cb) await cb();
      else return false;
      break;
    default:
      return false;
  }
  return true;
};
