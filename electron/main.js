import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WINDOW_WIDTH = 96;
const WINDOW_HEIGHT = 112;
const DEV_SERVER_URL = "http://127.0.0.1:5173";

let petWindow = null;
let tray = null;

function getStartBounds() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  return {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: Math.round(x + width - WINDOW_WIDTH - 36),
    y: Math.round(y + height - WINDOW_HEIGHT - 36)
  };
}

function keepWindowOnScreen(targetWindow) {
  if (!targetWindow) {
    return;
  }

  const currentBounds = targetWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const area = display.workArea;

  const nextX = Math.min(
    Math.max(currentBounds.x, area.x),
    area.x + area.width - currentBounds.width
  );
  const nextY = Math.min(
    Math.max(currentBounds.y, area.y),
    area.y + area.height - currentBounds.height
  );

  targetWindow.setBounds({ ...currentBounds, x: nextX, y: nextY });
}

function movePetWindowBy(dx, dy) {
  if (!petWindow) {
    return;
  }

  const bounds = petWindow.getBounds();
  petWindow.setBounds({
    ...bounds,
    x: bounds.x + Math.round(dx),
    y: bounds.y + Math.round(dy)
  });
}

function snapPetWindowToNearestEdge() {
  if (!petWindow) {
    return;
  }

  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;

  const distances = [
    { edge: "left", value: Math.abs(bounds.x - area.x) },
    { edge: "right", value: Math.abs(area.x + area.width - (bounds.x + bounds.width)) },
    { edge: "top", value: Math.abs(bounds.y - area.y) },
    { edge: "bottom", value: Math.abs(area.y + area.height - (bounds.y + bounds.height)) }
  ];
  const nearest = distances.sort((a, b) => a.value - b.value)[0].edge;

  const nextBounds = { ...bounds };
  if (nearest === "left") {
    nextBounds.x = area.x;
  } else if (nearest === "right") {
    nextBounds.x = area.x + area.width - bounds.width;
  } else if (nearest === "top") {
    nextBounds.y = area.y;
  } else {
    nextBounds.y = area.y + area.height - bounds.height;
  }

  nextBounds.x = Math.min(Math.max(nextBounds.x, area.x), area.x + area.width - bounds.width);
  nextBounds.y = Math.min(Math.max(nextBounds.y, area.y), area.y + area.height - bounds.height);

  petWindow.setBounds(nextBounds);
}

function snapPetWindowToRightEdge() {
  if (!petWindow) {
    return;
  }

  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const nextX = area.x + area.width - bounds.width;
  const nextY = Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height);

  petWindow.setBounds({ ...bounds, x: nextX, y: nextY });
}

function createContextMenu() {
  return Menu.buildFromTemplate([
    {
      label: petWindow?.isVisible() ? "Hide Pet" : "Show Pet",
      click: () => {
        if (!petWindow) {
          return;
        }

        if (petWindow.isVisible()) {
          petWindow.hide();
        } else {
          petWindow.showInactive();
        }
      }
    },
    {
      label: "Reset Position",
      click: () => keepWindowOnScreen(petWindow)
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit()
    }
  ]);
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAI0lEQVR4AWP4z8Dwn4ECwESJ5lEDRg0YNWDUgFEDBg0AqH4DHfLb2V0AAAAASUVORK5CYII="
  );

  tray = new Tray(icon);
  tray.setToolTip("Desktop Pet");
  tray.setContextMenu(createContextMenu());
  tray.on("click", () => {
    if (!petWindow) {
      return;
    }

    petWindow.isVisible() ? petWindow.hide() : petWindow.showInactive();
    tray?.setContextMenu(createContextMenu());
  });
}

async function createPetWindow() {
  petWindow = new BrowserWindow({
    ...getStartBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.env.VITE_DEV_SERVER_URL) {
    await petWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!app.isPackaged) {
    await petWindow.loadURL(DEV_SERVER_URL);
  } else {
    await petWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  petWindow.webContents.on("context-menu", () => {
    tray?.setContextMenu(createContextMenu());
    createContextMenu().popup({ window: petWindow });
  });

  petWindow.on("show", () => tray?.setContextMenu(createContextMenu()));
  petWindow.on("hide", () => tray?.setContextMenu(createContextMenu()));
}

app.whenReady().then(async () => {
  app.setName("Desktop Pet");
  await createPetWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

ipcMain.handle("pet:set-ignore-mouse-events", (_event, shouldIgnore) => {
  petWindow?.setIgnoreMouseEvents(Boolean(shouldIgnore), { forward: true });
});

ipcMain.handle("window:reset-position", () => {
  keepWindowOnScreen(petWindow);
});

ipcMain.handle("window:move-by", (_event, dx, dy) => {
  movePetWindowBy(Number(dx) || 0, Number(dy) || 0);
});

ipcMain.handle("window:snap-to-nearest-edge", () => {
  snapPetWindowToNearestEdge();
});

ipcMain.handle("window:snap-to-right-edge", () => {
  snapPetWindowToRightEdge();
});

ipcMain.handle("app:quit", () => {
  app.quit();
});
