// electron/main.js — Lavira Media Engine desktop wrapper
// Starts the Express engine as a child process, opens a browser window.
// On first run, shows a setup wizard to collect API keys.
'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const http  = require('http');
const { spawn } = require('child_process');

// ── Paths ─────────────────────────────────────────────────────────────────────
// In production (packaged), resources live in process.resourcesPath/app
// In dev, they sit next to this file
const IS_PACKAGED = app.isPackaged;
const ROOT = IS_PACKAGED
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..');

const ENV_PATH    = path.join(ROOT, '.env');
const SERVER_MAIN = path.join(ROOT, 'src', 'server.js');
const ICON_PATH   = path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : process.platform === 'darwin' ? 'icon.icns' : 'icon.png');

const PORT = 4005;

let win       = null;
let tray      = null;
let serverProc = null;
let serverReady = false;

// ── Determine Node binary ─────────────────────────────────────────────────────
// In packaged app, use the bundled Node via electron's own node.
// process.execPath IS electron; we use it to spawn Node sub-processes safely.
function getNodeBin() {
  // electron-builder bundles a copy of node as a "resource"
  const bundledNode = path.join(process.resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  if (fs.existsSync(bundledNode)) return bundledNode;
  return process.execPath; // fallback: use electron itself (works for spawning)
}

// ── .env check ───────────────────────────────────────────────────────────────
function envExists() {
  if (!fs.existsSync(ENV_PATH)) return false;
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  return content.includes('ANTHROPIC_API_KEY=sk-') || content.includes('PEXELS_API_KEY=');
}

function writeEnv(keys) {
  let base = '';
  try { base = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8'); } catch(_) {}
  if (!base) {
    base = [
      'PORT=4005',
      'UPLOADS_DIR=./uploads',
      'OUTPUTS_DIR=./outputs',
      'ASSETS_DIR=./assets',
      'DB_PATH=./lavira.db',
      'ANTHROPIC_API_KEY=',
      'PEXELS_API_KEY=',
      'GIPHY_API_KEY=',
    ].join('\n') + '\n';
  }
  const updated = base
    .replace(/ANTHROPIC_API_KEY=.*/,  `ANTHROPIC_API_KEY=${keys.anthropic || ''}`)
    .replace(/PEXELS_API_KEY=.*/,     `PEXELS_API_KEY=${keys.pexels || ''}`)
    .replace(/GIPHY_API_KEY=.*/,      `GIPHY_API_KEY=${keys.giphy || ''}`);
  fs.writeFileSync(ENV_PATH, updated, 'utf8');
}

// ── Start Express server ──────────────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const nodeBin = getNodeBin();
    const env = {
      ...process.env,
      PORT: String(PORT),
      ELECTRON: '1',
      // Tell dotenv where to find .env when packaged
      DOTENV_CONFIG_PATH: ENV_PATH,
    };

    serverProc = spawn(nodeBin, [SERVER_MAIN], {
      cwd:  ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProc.stdout.on('data', (d) => {
      const msg = d.toString();
      process.stdout.write('[server] ' + msg);
      if (!serverReady && (msg.includes('listening') || msg.includes(':' + PORT) || msg.includes('ready'))) {
        serverReady = true;
        resolve();
      }
    });

    serverProc.stderr.on('data', (d) => process.stderr.write('[server-err] ' + d.toString()));

    serverProc.on('error', (err) => reject(err));
    serverProc.on('exit', (code) => {
      if (!serverReady) reject(new Error('Server exited with code ' + code));
    });

    // Timeout fallback — probe HTTP regardless of stdout
    let probes = 0;
    const probe = setInterval(() => {
      probes++;
      http.get('http://localhost:' + PORT + '/api/health', (res) => {
        if (res.statusCode < 500) {
          clearInterval(probe);
          if (!serverReady) { serverReady = true; resolve(); }
        }
      }).on('error', () => {});
      if (probes > 30) { clearInterval(probe); reject(new Error('Server did not start in 30s')); }
    }, 1000);
  });
}

// ── Setup wizard window ───────────────────────────────────────────────────────
function openSetupWizard() {
  const w = new BrowserWindow({
    width: 560,
    height: 620,
    resizable: false,
    title: 'Lavira Media — First-time Setup',
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  w.loadFile(path.join(__dirname, 'setup.html'));
  w.setMenuBarVisibility(false);
  return w;
}

// ── Main app window ───────────────────────────────────────────────────────────
function openMainWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Lavira Media Engine',
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  win.loadURL('http://localhost:' + PORT);

  win.once('ready-to-show', () => win.show());

  // Minimize to tray on close (keep server running)
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── System tray ───────────────────────────────────────────────────────────────
function buildTray() {
  const img = fs.existsSync(ICON_PATH)
    ? nativeImage.createFromPath(ICON_PATH)
    : nativeImage.createEmpty();

  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
  tray.setToolTip('Lavira Media Engine');

  const menu = Menu.buildFromTemplate([
    { label: 'Open Lavira', click: () => { if (win) { win.show(); win.focus(); } } },
    { label: 'Open in Browser', click: () => shell.openExternal('http://localhost:' + PORT) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (win) { win.show(); win.focus(); } });
}

// ── IPC: setup wizard → main ──────────────────────────────────────────────────
ipcMain.handle('save-keys', async (_, keys) => {
  try {
    writeEnv(keys);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('get-status', async () => ({ ready: serverReady, port: PORT }));

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Single-instance lock
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  // First-run wizard
  if (!envExists()) {
    const wizard = openSetupWizard();
    await new Promise((resolve) => {
      ipcMain.once('setup-complete', () => {
        wizard.close();
        resolve();
      });
    });
  }

  // Start Express server
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox('Lavira — startup error', 'Could not start the engine:\n\n' + err.message + '\n\nCheck that port 4005 is free and try again.');
    app.quit();
    return;
  }

  buildTray();
  openMainWindow();
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
});

app.on('activate', () => {
  // macOS dock click
  if (win) { win.show(); win.focus(); }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProc) {
    try { serverProc.kill('SIGTERM'); } catch (_) {}
  }
});
