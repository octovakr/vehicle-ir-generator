/**
 * Filesystem abstraction (rule: keep native APIs behind abstractions).
 *
 * Inside Electron this uses the native open/save dialogs exposed by the
 * preload bridge. When the renderer runs in a plain browser during
 * development, it falls back to <input type="file"> and download links so
 * the app remains testable. In both cases "open" means reading a LOCAL file;
 * no data ever leaves the machine.
 */

export interface OpenedAudioFile {
  filePath: string;
  fileName: string;
  data: ArrayBuffer;
}

interface VehicleIRBridge {
  openAudioFile(): Promise<OpenedAudioFile | null>;
  saveFile(
    defaultFileName: string,
    data: ArrayBuffer,
    filterName: string,
    extensions: string[],
  ): Promise<{ filePath: string } | null>;
}

declare global {
  interface Window {
    vehicleIR?: VehicleIRBridge;
  }
}

export function isDesktopShell(): boolean {
  return typeof window !== 'undefined' && !!window.vehicleIR;
}

/** Open a local audio file via the native dialog (or browser fallback). */
export async function openLocalAudioFile(): Promise<OpenedAudioFile | null> {
  if (window.vehicleIR) {
    return window.vehicleIR.openAudioFile();
  }
  return browserOpenFile();
}

/** Save binary data to a local file via the native dialog (or browser download). */
export async function saveLocalFile(
  defaultFileName: string,
  data: ArrayBuffer,
  filterName: string,
  extensions: string[],
): Promise<{ filePath: string } | null> {
  if (window.vehicleIR) {
    return window.vehicleIR.saveFile(defaultFileName, data, filterName, extensions);
  }
  const blob = new Blob([data]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = defaultFileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return { filePath: defaultFileName };
}

function browserOpenFile(): Promise<OpenedAudioFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.wav,.mp3,.flac,.ogg,.m4a';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const data = await file.arrayBuffer();
      resolve({ filePath: file.name, fileName: file.name, data });
    };
    // Some browsers never fire onchange when the dialog is cancelled; the
    // promise then simply stays pending, which is harmless for this flow.
    input.click();
  });
}
