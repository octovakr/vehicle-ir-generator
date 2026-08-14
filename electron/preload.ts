/**
 * Preload script: exposes a minimal, typed native-filesystem bridge to the
 * renderer. The renderer accesses it through src/platform/fileSystem.ts,
 * which also provides a browser fallback for development.
 */
import { contextBridge, ipcRenderer } from 'electron';

export interface OpenedAudioFile {
  filePath: string;
  fileName: string;
  data: ArrayBuffer;
}

contextBridge.exposeInMainWorld('vehicleIR', {
  openAudioFile: (): Promise<OpenedAudioFile | null> => ipcRenderer.invoke('dialog:openAudioFile'),
  saveFile: (
    defaultFileName: string,
    data: ArrayBuffer,
    filterName: string,
    extensions: string[],
  ): Promise<{ filePath: string } | null> =>
    ipcRenderer.invoke('dialog:saveFile', { defaultFileName, data, filterName, extensions }),
});
