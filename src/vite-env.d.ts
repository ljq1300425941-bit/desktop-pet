/// <reference types="vite/client" />
type WeatherPetMode =
  | "sunny_happy"
  | "sunny_sunbathe"
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

interface DesktopPetApi {
  setIgnoreMouseEvents: (shouldIgnore: boolean) => Promise<void>;
  resetPosition: () => Promise<void>;
  moveBy: (dx: number, dy: number) => Promise<void>;
  snapToNearestEdge: () => Promise<void>;
  snapToRightEdge: () => Promise<void>;
  quit: () => Promise<void>;
  getWeather: () => Promise<PetWeatherSnapshot | null>;
  onWeatherUpdated: (callback: (payload: PetWeatherSnapshot) => void) => () => void;
  onSwitchView: (callback: (payload: unknown) => void) => () => void;
}

interface Window {
  electronAPI?: DesktopPetApi;
  desktopPet?: DesktopPetApi;
}
