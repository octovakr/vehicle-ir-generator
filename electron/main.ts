/**
 * Electron main process.
 *
 * Responsibilities are intentionally minimal: window management and native
 * filesystem access (open/save dialogs, file reads/writes). All acoustic
 * simulation, DSP and audio decoding run in the renderer process so the
 * engine stays independent of Electron APIs.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: 'Vehicle IR Simulator',
    backgroundColor: '#0e0f11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

/**
 * IPC: open a native file dialog for local audio files and return the file
 * bytes. "Upload" in the UI always means reading a local file — no network
 * transfer is involved.
 */
ipcMain.handle('dialog:openAudioFile', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select audio file',
    properties: ['openFile'],
    filters: [
      { name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const data = await fs.readFile(filePath);
  return {
    filePath,
    fileName: path.basename(filePath),
    // Transfer as ArrayBuffer so the renderer can decode it with WebAudio.
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  };
});

/** IPC: native save dialog + binary write (used for WAV / JSON export). */
ipcMain.handle(
  'dialog:saveFile',
  async (_event, args: { defaultFileName: string; data: ArrayBuffer; filterName: string; extensions: string[] }) => {
    const result = await dialog.showSaveDialog({
      title: 'Save file',
      defaultPath: args.defaultFileName,
      filters: [{ name: args.filterName, extensions: args.extensions }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, Buffer.from(args.data));
    return { filePath: result.filePath };
  },
);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
