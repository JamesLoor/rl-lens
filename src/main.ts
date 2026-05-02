import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { RLSocketClient, SocketStatus } from './socket/client';
import { MatchCollector } from './match/collector';
import { analyzeMatch, buildDemoResult, MatchResult } from './match/analyzer';
import { createDB } from './db/queries';
import type { MatchBuffer } from './match/collector';

const RL_PORT = 49123;

let mainWindow: BrowserWindow | null = null;
let logFile: string | null = null;
let lastResult: MatchResult | null = null;
let lastSocketStatus: { status: SocketStatus; port: number } | null = null;
const logBuffer: string[] = [];
const LOG_BUFFER_SIZE = 400;

function initLog(userData: string): void {
  const logDir = path.join(userData, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  logFile = path.join(logDir, `${date}.log`);
}

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] ${msg}${data !== undefined ? ' ' + JSON.stringify(data) : ''}\n`;
  const trimmed = line.trimEnd();
  logBuffer.push(trimmed);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  if (logFile) fs.appendFileSync(logFile, line);
  console.log(trimmed);
  mainWindow?.webContents.send('log:line', trimmed);
}

function send(channel: string, data: unknown): void {
  mainWindow?.webContents.send(channel, data);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 720,
    minWidth: 380,
    minHeight: 500,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(
    path.join(__dirname, '..', 'src', 'renderer', 'index.html')
  );

  mainWindow.webContents.on('did-finish-load', () => {
    if (lastSocketStatus) send('socket:status', lastSocketStatus);
    if (lastResult) send('match:result', lastResult);
    for (const line of logBuffer) send('log:line', line);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  initLog(userData);
  log('INFO', 'App started', { port: RL_PORT });

  const db = createDB(path.join(userData, 'matches.db'));
  createWindow();

  const collector = new MatchCollector();
  const socket = new RLSocketClient(RL_PORT);

  socket.on('status', (status: SocketStatus) => {
    log('INFO', 'Socket status changed', status);
    lastSocketStatus = { status, port: RL_PORT };
    send('socket:status', lastSocketStatus);

    if (status === 'disconnected' || status === 'error') {
      collector.discardIfActive();
    }
  });

  const seenEvents = new Set<string>();
  socket.on('rl_event', (event: { Event: string; Data: unknown }) => {
    if (!seenEvents.has(event.Event)) {
      seenEvents.add(event.Event);
      log('INFO', 'New event type seen', event.Event);
    }
    collector.handle(event);
  });

  collector.on('playlist_detected', (info: { arena: string; playlist: string; maxPerTeam: number }) => {
    log('INFO', 'Playlist detected', info);
  });

  collector.on('match:start', () => {
    log('INFO', 'Match created — loading');
    send('match:state', 'loading');
  });

  collector.on('round:active', () => {
    log('INFO', 'Round active — match underway');
    send('match:state', 'active');
  });

  collector.on('match:end', (buffer) => {
    log('INFO', 'Match ended — analyzing');
    send('match:state', 'analyzing');

    try {
      const history = db.getRecentStats(20, buffer.playlist);
      const result = analyzeMatch(buffer, history);
      result.matchNumber = db.insertMatch(result, buffer);
      lastResult = result;
      log('INFO', 'Analysis complete', { insights: result.insights.length });
      send('match:result', result);
      send('match:state', 'done');
    } catch (err) {
      log('ERROR', 'Analysis failed', err);
      send('match:state', 'idle');
    }
  });

  collector.on('match:discard', () => {
    log('WARN', 'Match discarded — incomplete data');
    send('match:state', 'idle');
  });

  ipcMain.on('match:demo', () => {
    log('INFO', 'Demo mode requested');
    const demo = buildDemoResult();
    send('match:result', demo);
    send('match:state', 'done');
  });

  ipcMain.handle('match:history', () => {
    const rows = db.getRawMatches(50);
    const emptyHistory = {
      avgShootingPct: null, avgBoostStarvation: null,
      avgTouchesPerMin: null, avgSaves: null,
      matchCount: 0, bestShootingPct: null,
    };
    return rows
      .filter(r => r.rawBuffer != null)
      .map(r => {
        try {
          const parsed = JSON.parse(r.rawBuffer!);
          const buffer: MatchBuffer = { finalTeamScores: [], roundActive: false, ...parsed };
          const result = analyzeMatch(buffer, emptyHistory);
          result.matchNumber = r.id;
          return result;
        } catch (err) {
          log('WARN', 'Failed to re-analyze match', { id: r.id, err });
          return null;
        }
      })
      .filter(r => r !== null);
  });

  ipcMain.on('setup:run', () => {
    const batPath = path.join(app.getAppPath(), 'setup-rl-api.bat');
    if (fs.existsSync(batPath)) {
      shell.openPath(batPath);
    } else {
      log('WARN', 'setup-rl-api.bat not found', batPath);
    }
  });

  socket.connect();

  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
