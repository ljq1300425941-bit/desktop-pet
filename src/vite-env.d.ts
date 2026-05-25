/// <reference types="vite/client" />
type WeatherPetMode =
  | "sunny_happy"
  | "sunny_sunbathe"
  | "cloudy_breeze"
  | "cloudy_quiet"
  | "rain_sad"
  | "rain_sleep"
  | "hot_wilted";

type PetWeatherSnapshot = {
  mode: WeatherPetMode;
  city?: string;
  region?: string;
  temperature?: number;
  apparentTemperature?: number;
  weatherCode?: number;
  updatedAt: string;
};

type DesktopPetSettings = {
  weatherEnabled: boolean;
  locationMode: "auto" | "fixed";
  fixedLocation?: {
    label: string;
    latitude: number;
    longitude: number;
  };
  alwaysOnTop: boolean;
  launchAtStartup: boolean;
};

interface DesktopPetApi {
  setIgnoreMouseEvents: (shouldIgnore: boolean) => Promise<void>;
  resetPosition: () => Promise<void>;
  moveBy: (dx: number, dy: number) => Promise<void>;
  snapToNearestEdge: () => Promise<void>;
  snapToRightEdge: () => Promise<void>;
  quit: () => Promise<void>;
  getWeather: () => Promise<PetWeatherSnapshot | null>;
  refreshWeather: () => Promise<PetWeatherSnapshot | null>;
  setWeatherEnabled: (shouldEnable: boolean) => Promise<DesktopPetSettings>;
  getSettings: () => Promise<DesktopPetSettings>;
  updateSettings: (patch: Partial<DesktopPetSettings>) => Promise<DesktopPetSettings>;
  onWeatherUpdated: (callback: (payload: PetWeatherSnapshot | null) => void) => () => void;
  onSwitchView: (callback: (payload: unknown) => void) => () => void;
}

interface Window {
  electronAPI?: DesktopPetApi;
  desktopPet?: DesktopPetApi;
}
