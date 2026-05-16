/// <reference types="vite/client" />

interface DesktopPetApi {
  setIgnoreMouseEvents: (shouldIgnore: boolean) => Promise<void>;
  resetPosition: () => Promise<void>;
  moveBy: (dx: number, dy: number) => Promise<void>;
  snapToNearestEdge: () => Promise<void>;
  snapToRightEdge: () => Promise<void>;
  quit: () => Promise<void>;
  onSwitchView: (callback: (payload: unknown) => void) => () => void;
}

interface Window {
  electronAPI?: DesktopPetApi;
  desktopPet?: DesktopPetApi;
}
