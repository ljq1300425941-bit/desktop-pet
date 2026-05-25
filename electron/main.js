import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WINDOW_WIDTH = 96;
const WINDOW_HEIGHT = 112;
const DEV_SERVER_URL = "http://127.0.0.1:5173";
const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const WEATHER_REQUEST_TIMEOUT_MS = 10000;
const APP_VERSION = "3.0.0";
const DEFAULT_SETTINGS = {
  weatherEnabled: true,
  locationMode: "auto",
  fixedLocation: {
    label: "Harbin",
    latitude: 45.7421,
    longitude: 126.663
  },
  alwaysOnTop: true,
  launchAtStartup: false
};

let petWindow = null;
let tray = null;
let latestWeatherSnapshot = null;
let weatherRefreshTimer = null;
let settings = { ...DEFAULT_SETTINGS };

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidFixedLocation(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.label === "string" &&
      Number.isFinite(Number(value.latitude)) &&
      Number.isFinite(Number(value.longitude))
  );
}

function normalizeSettings(value) {
  const nextSettings = {
    ...DEFAULT_SETTINGS,
    ...(value && typeof value === "object" ? value : {})
  };

  nextSettings.weatherEnabled = Boolean(nextSettings.weatherEnabled);
  nextSettings.locationMode = nextSettings.locationMode === "fixed" ? "fixed" : "auto";
  nextSettings.fixedLocation = isValidFixedLocation(nextSettings.fixedLocation)
    ? {
        label: nextSettings.fixedLocation.label,
        latitude: Number(nextSettings.fixedLocation.latitude),
        longitude: Number(nextSettings.fixedLocation.longitude)
      }
    : DEFAULT_SETTINGS.fixedLocation;
  nextSettings.alwaysOnTop = Boolean(nextSettings.alwaysOnTop);
  nextSettings.launchAtStartup = Boolean(nextSettings.launchAtStartup);

  return nextSettings;
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function saveSettings() {
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function loadSettings() {
  try {
    if (fs.existsSync(getSettingsPath())) {
      const parsedSettings = JSON.parse(fs.readFileSync(getSettingsPath(), "utf8"));
      settings = normalizeSettings(parsedSettings);
    } else {
      settings = normalizeSettings(DEFAULT_SETTINGS);
      saveSettings();
    }
  } catch (error) {
    console.warn("[settings] Failed to load settings, using defaults:", error);
    settings = normalizeSettings(DEFAULT_SETTINGS);
    saveSettings();
  }
}

function sendWeatherUpdate(snapshot) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  petWindow.webContents.send("weather:updated", snapshot);
}

function applyAlwaysOnTopSetting() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  petWindow.setAlwaysOnTop(Boolean(settings.alwaysOnTop), "screen-saver");
}

function applyLaunchAtStartupSetting() {
  app.setLoginItemSettings({
    openAtLogin: Boolean(settings.launchAtStartup)
  });
}

function applyWeatherEnabledSetting() {
  if (settings.weatherEnabled) {
    startWeatherService();
    return;
  }

  stopWeatherService();
  latestWeatherSnapshot = null;
  sendWeatherUpdate(null);
}

function refreshTrayMenu() {
  tray?.setContextMenu(createContextMenu());
}

function applySettings() {
  applyAlwaysOnTopSetting();
  applyLaunchAtStartupSetting();
  applyWeatherEnabledSetting();
  refreshTrayMenu();
}

function updateSettings(patch) {
  const shouldRefreshWeather = Boolean(
    patch &&
      typeof patch === "object" &&
      ("locationMode" in patch || "fixedLocation" in patch)
  );

  settings = normalizeSettings({
    ...settings,
    ...(patch && typeof patch === "object" ? patch : {})
  });
  saveSettings();
  applySettings();
  if (settings.weatherEnabled && shouldRefreshWeather) {
    refreshWeather();
  }
  return settings;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveIpLocation() {
  try {
    const location = await fetchJson("https://ipapi.co/json/");
    return {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      city: location.city || undefined,
      region: location.region || undefined
    };
  } catch (error) {
    console.warn("[weather] ipapi.co location failed, trying fallback:", error);
  }

  const fallback = await fetchJson(
    "http://ip-api.com/json/?fields=status,message,regionName,city,lat,lon,timezone"
  );

  if (fallback.status !== "success") {
    throw new Error(fallback.message || "Fallback IP location failed");
  }

  return {
    latitude: Number(fallback.lat),
    longitude: Number(fallback.lon),
    city: fallback.city || undefined,
    region: fallback.regionName || undefined
  };
}

function mapWeatherToPetMode(currentWeather) {
  const apparentTemperature = currentWeather?.apparent_temperature;
  const weatherCode = Number(currentWeather?.weather_code);
  const precipitation = Number(currentWeather?.precipitation) || 0;
  const rain = Number(currentWeather?.rain) || 0;
  const showers = Number(currentWeather?.showers) || 0;
  const isDay = Number(currentWeather?.is_day) === 1;
  const totalRain = precipitation + rain + showers;

  if (isNumber(apparentTemperature) && apparentTemperature >= 32) {
    return "hot_wilted";
  }

  if (weatherCode === 0) {
    return isDay ? "sunny_sunbathe" : "sunny_happy";
  }

  if ([1, 2, 3, 45, 48].includes(weatherCode)) {
    return "cloudy_quiet";
  }

  if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
    return !isDay || totalRain >= 2 || weatherCode >= 63 ? "rain_sleep" : "rain_sad";
  }

  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
    return "rain_sleep";
  }

  if (weatherCode >= 95 && weatherCode <= 99) {
    return "rain_sad";
  }

  return "cloudy_quiet";
}

async function resolveWeatherSnapshot() {
  const location =
    settings.locationMode === "fixed" && isValidFixedLocation(settings.fixedLocation)
      ? {
          latitude: settings.fixedLocation.latitude,
          longitude: settings.fixedLocation.longitude,
          city: settings.fixedLocation.label,
          region: undefined
        }
      : await resolveIpLocation();
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("IP location did not include valid latitude/longitude");
  }

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(latitude));
  weatherUrl.searchParams.set("longitude", String(longitude));
  weatherUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,precipitation,rain,showers,cloud_cover,is_day"
  );
  weatherUrl.searchParams.set("timezone", "auto");

  const weather = await fetchJson(weatherUrl.toString());
  const currentWeather = weather.current ?? {};

  return {
    mode: mapWeatherToPetMode(currentWeather),
    city: location.city || undefined,
    region: location.region || undefined,
    temperature: isNumber(currentWeather.temperature_2m) ? currentWeather.temperature_2m : undefined,
    apparentTemperature: isNumber(currentWeather.apparent_temperature)
      ? currentWeather.apparent_temperature
      : undefined,
    weatherCode: isNumber(currentWeather.weather_code) ? currentWeather.weather_code : undefined,
    updatedAt: new Date().toISOString()
  };
}

async function refreshWeather() {
  if (!settings.weatherEnabled) {
    latestWeatherSnapshot = null;
    sendWeatherUpdate(null);
    return null;
  }

  try {
    latestWeatherSnapshot = await resolveWeatherSnapshot();
    sendWeatherUpdate(latestWeatherSnapshot);
    return latestWeatherSnapshot;
  } catch (error) {
    console.warn("[weather] Failed to refresh weather:", error);
    return latestWeatherSnapshot;
  }
}

function startWeatherService() {
  if (!settings.weatherEnabled) {
    return;
  }

  if (weatherRefreshTimer !== null) {
    return;
  }

  refreshWeather();
  weatherRefreshTimer = setInterval(refreshWeather, WEATHER_REFRESH_MS);
}

function stopWeatherService() {
  if (weatherRefreshTimer !== null) {
    clearInterval(weatherRefreshTimer);
    weatherRefreshTimer = null;
  }
}

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
    { type: "separator" },
    {
      label: "Weather",
      type: "checkbox",
      checked: settings.weatherEnabled,
      click: (menuItem) => updateSettings({ weatherEnabled: menuItem.checked })
    },
    {
      label: "Refresh Weather",
      enabled: settings.weatherEnabled,
      click: () => refreshWeather()
    },
    {
      label: "Location Mode",
      submenu: [
        {
          label: "Auto Location",
          type: "radio",
          checked: settings.locationMode === "auto",
          click: () => updateSettings({ locationMode: "auto" })
        },
        {
          label: `Fixed: ${settings.fixedLocation.label}`,
          type: "radio",
          checked: settings.locationMode === "fixed",
          click: () => updateSettings({ locationMode: "fixed" })
        }
      ]
    },
    { type: "separator" },
    {
      label: "Always On Top",
      type: "checkbox",
      checked: settings.alwaysOnTop,
      click: (menuItem) => updateSettings({ alwaysOnTop: menuItem.checked })
    },
    {
      label: "Launch at Startup",
      type: "checkbox",
      checked: settings.launchAtStartup,
      click: (menuItem) => updateSettings({ launchAtStartup: menuItem.checked })
    },
    {
      label: "Reset Position",
      click: () => keepWindowOnScreen(petWindow)
    },
    {
      label: `Version ${APP_VERSION}`,
      enabled: false
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
    alwaysOnTop: settings.alwaysOnTop,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  applyAlwaysOnTopSetting();
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
  loadSettings();
  await createPetWindow();
  createTray();
  applySettings();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  stopWeatherService();
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

ipcMain.handle("weather:get-current", () => (settings.weatherEnabled ? latestWeatherSnapshot : null));

ipcMain.handle("weather:refresh", () => refreshWeather());

ipcMain.handle("weather:set-enabled", (_event, shouldEnable) =>
  updateSettings({ weatherEnabled: Boolean(shouldEnable) })
);

ipcMain.handle("settings:get", () => settings);

ipcMain.handle("settings:update", (_event, patch) => updateSettings(patch));
