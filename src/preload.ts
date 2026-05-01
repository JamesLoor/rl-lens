import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('rlStats', {
  onSocketStatus(cb: (data: unknown) => void): void {
    ipcRenderer.on('socket:status', (_e, data) => cb(data));
  },
  onMatchState(cb: (state: unknown) => void): void {
    ipcRenderer.on('match:state', (_e, state) => cb(state));
  },
  onMatchResult(cb: (result: unknown) => void): void {
    ipcRenderer.on('match:result', (_e, result) => cb(result));
  },
  requestDemo(): void {
    ipcRenderer.send('match:demo');
  },
  runSetup(): void {
    ipcRenderer.send('setup:run');
  },
});
