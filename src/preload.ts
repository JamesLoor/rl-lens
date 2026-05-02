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
  onLogLine(cb: (line: string) => void): void {
    ipcRenderer.on('log:line', (_e, line) => cb(line));
  },
  async getMatchHistory(): Promise<unknown[]> {
    return ipcRenderer.invoke('match:history');
  },
  async deleteMatch(id: number): Promise<void> {
    return ipcRenderer.invoke('match:delete', id);
  },
  requestDemo(): void {
    ipcRenderer.send('match:demo');
  },
  runSetup(): void {
    ipcRenderer.send('setup:run');
  },
});
