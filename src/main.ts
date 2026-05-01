import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { RLSocketClient, SocketStatus } from './socket/client';
import { MatchCollector } from './match/collector';
import { analyzeMatch, buildDemoResult, MatchResult } from './match/analyzer';
import { createDB } from './db/queries';

const RL_PORT = 49122;

let mainWindow: BrowserWindow | null = null;
let logFile: string | null = null;
let lastResult: MatchResult | null = null;

function initLog(userData: string): void {
  const logDir = path.join(userData, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  logFile = path.join(logDir, `${date}.log`);
}

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] ${msg}${data !== undefined ? ' ' + JSON.stringify(data) : ''}\n`;
  if (logFile) fs.appendFileSync(logFile, line);
  console.log(line.trimEnd());
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
    // Re-send last known state to renderer on reload
    if (lastResult) send('match:result', lastResult);
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
    send('socket:status', { status, port: RL_PORT });

    if (status === 'disconnected' || status === 'error') {
      collector.discardIfActive();
    }
  });

  socket.on('rl_event', (event: { event: string; data: unknown }) => {
    collector.handle(event);
  });

  collector.on('match:start', () => {
    log('INFO', 'Match started — capturing');
    send('match:state', 'capturing');
  });

  collector.on('match:end', (buffer) => {
    log('INFO', 'Match ended — analyzing');
    send('match:state', 'analyzing');

    try {
      const history = db.getRecentStats(20);
      const result = analyzeMatch(buffer, history);
      result.matchNumber = db.insertMatch(result);
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

  socket.connect();

  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
