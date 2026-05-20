import { useEffect, useReducer, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import petEating from "./assets/pet_eating.png";
import petBack from "./assets/pet_back.png";
import petFront from "./assets/pet_front.png";
import petIdle from "./assets/pet_idle.png";
import petPeek from "./assets/pet_peek.png";
import petShy from "./assets/pet_shy.png";
import petSide from "./assets/pet_side.png";
import petSleep from "./assets/pet_sleep.png";
import petSurprised from "./assets/pet_surprised.png";
import petWeatherCloudyBreeze from "./assets/pet_weather_cloudy_breeze.png";
import petWeatherCloudyQuiet from "./assets/pet_weather_cloudy_quiet.png";
import petWeatherHotWilted from "./assets/pet_weather_hot_wilted.png";
import petWeatherRainSad from "./assets/pet_weather_rain_sad.png";
import petWeatherRainSleep from "./assets/pet_weather_rain_sleep.png";
import petWeatherSunnyHappy from "./assets/pet_weather_sunny_happy.png";
import petWeatherSunnySunbathe from "./assets/pet_weather_sunny_sunbathe.png";
import "./styles.css";

export type PetState =
  | "idle"
  | "surprised"
  | "sleeping"
  | "shy"
  | "eating"
  | "peek"
  | "dragging";

export type PetView = "front" | "side" | "back";

export type WeatherPetMode =
  | "sunny_happy"
  | "sunny_sunbathe"
  | "cloudy_breeze"
  | "cloudy_quiet"
  | "rain_sad"
  | "rain_sleep"
  | "hot_wilted";

type WeatherDisplayMode = { kind: "front" } | { kind: "weather"; mode: WeatherPetMode };

const STATE_IMAGES: Record<Exclude<PetState, "dragging">, string> = {
  idle: petIdle,
  surprised: petSurprised,
  sleeping: petSleep,
  shy: petShy,
  eating: petEating,
  peek: petPeek
};

const VIEW_IMAGES: Record<PetView, string> = {
  front: petFront,
  side: petSide,
  back: petBack
};

const WEATHER_IMAGES: Record<WeatherPetMode, string> = {
  sunny_happy: petWeatherSunnyHappy,
  sunny_sunbathe: petWeatherSunnySunbathe,
  cloudy_breeze: petWeatherCloudyBreeze,
  cloudy_quiet: petWeatherCloudyQuiet,
  rain_sad: petWeatherRainSad,
  rain_sleep: petWeatherRainSleep,
  hot_wilted: petWeatherHotWilted
};

const VIEW_ORDER: PetView[] = ["front", "side", "back"];
const WEATHER_ORDER: WeatherPetMode[] = [
  "sunny_happy",
  "sunny_sunbathe",
  "cloudy_breeze",
  "cloudy_quiet",
  "rain_sad",
  "rain_sleep",
  "hot_wilted"
];
const CLICK_DELAY_MS = 240;
const SURPRISED_MS = 800;
const EATING_MS = 3500;
const SHY_HOVER_MS = 3000;
const VIEW_BOUNCE_MS = 260;
const VIEW_SWAP_MS = 118;

type DragPoint = {
  screenX: number;
  screenY: number;
  moved: boolean;
};

type StillPetState = Exclude<PetState, "dragging">;

type PetMachineState = {
  petState: PetState;
  petView: PetView;
  weatherSnapshot: PetWeatherSnapshot | null;
  weatherDisplayMode: WeatherDisplayMode;
  isWeatherActive: boolean;
  lastStillState: StillPetState;
  isMenuOpen: boolean;
  isViewSwitching: boolean;
};

type PetMachineAction =
  | { type: "START_DRAG"; previousState: StillPetState }
  | { type: "END_DRAG"; nextState: StillPetState }
  | { type: "OPEN_MENU" }
  | { type: "CLOSE_MENU" }
  | { type: "TOGGLE_MENU" }
  | { type: "ENTER_SLEEP" }
  | { type: "TOGGLE_SLEEP" }
  | { type: "ENTER_PEEK" }
  | { type: "EXIT_PEEK" }
  | { type: "ENTER_TEMP_STATE"; state: Exclude<PetState, "idle" | "sleeping" | "dragging"> }
  | { type: "RETURN_IDLE" }
  | { type: "SET_WEATHER_SNAPSHOT"; snapshot: PetWeatherSnapshot }
  | { type: "ADVANCE_WEATHER_DISPLAY" }
  | { type: "CLEAR_WEATHER_MODE" }
  | { type: "START_VIEW_SWITCH" }
  | { type: "SWAP_VIEW" }
  | { type: "FINISH_VIEW_SWITCH" };

const INITIAL_MACHINE_STATE: PetMachineState = {
  petState: "idle",
  petView: "front",
  weatherSnapshot: null,
  weatherDisplayMode: { kind: "front" },
  isWeatherActive: false,
  lastStillState: "idle",
  isMenuOpen: false,
  isViewSwitching: false
};

function moveWindowBy(dx: number, dy: number) {
  if (dx !== 0 || dy !== 0) {
    window.electronAPI?.moveBy(dx, dy);
  }
}

function snapWindowToRightEdge() {
  window.electronAPI?.snapToRightEdge();
}

function resetWindowPosition() {
  window.electronAPI?.resetPosition();
}

function setMousePassthrough(shouldIgnore: boolean) {
  window.electronAPI?.setIgnoreMouseEvents(shouldIgnore);
}

function getNextView(currentView: PetView) {
  const currentIndex = VIEW_ORDER.indexOf(currentView);
  return VIEW_ORDER[(currentIndex + 1) % VIEW_ORDER.length];
}

function isWeatherPetMode(value: unknown): value is WeatherPetMode {
  return typeof value === "string" && WEATHER_ORDER.includes(value as WeatherPetMode);
}

function isSameWeatherDisplayMode(left: WeatherDisplayMode, right: WeatherDisplayMode) {
  if (left.kind !== right.kind) {
    return false;
  }

  return left.kind === "front" || left.mode === (right as { kind: "weather"; mode: WeatherPetMode }).mode;
}

function getWeatherRotationGroup(snapshot: PetWeatherSnapshot | null): WeatherDisplayMode[] {
  if (!snapshot || !isWeatherPetMode(snapshot.mode)) {
    return [{ kind: "front" }];
  }

  if (snapshot.mode === "sunny_happy" || snapshot.mode === "sunny_sunbathe") {
    return [{ kind: "front" }, { kind: "weather", mode: "sunny_happy" }, { kind: "weather", mode: "sunny_sunbathe" }];
  }

  if (snapshot.mode === "rain_sad" || snapshot.mode === "rain_sleep") {
    return [{ kind: "front" }, { kind: "weather", mode: "rain_sad" }, { kind: "weather", mode: "rain_sleep" }];
  }

  if (snapshot.mode === "cloudy_quiet" || snapshot.mode === "cloudy_breeze") {
    return [{ kind: "front" }, { kind: "weather", mode: "cloudy_quiet" }, { kind: "weather", mode: "cloudy_breeze" }];
  }

  return [{ kind: "front" }, { kind: "weather", mode: snapshot.mode }];
}

function getNextWeatherDisplayMode(currentDisplayMode: WeatherDisplayMode, snapshot: PetWeatherSnapshot | null) {
  const group = getWeatherRotationGroup(snapshot);
  const currentIndex = group.findIndex((item) => isSameWeatherDisplayMode(item, currentDisplayMode));

  if (currentIndex === -1) {
    return group[0];
  }

  return group[(currentIndex + 1) % group.length];
}

function getWeatherLabel(snapshot: PetWeatherSnapshot | null) {
  if (!snapshot || !isWeatherPetMode(snapshot.mode)) {
    return "Weather";
  }

  if (snapshot.mode === "sunny_happy" || snapshot.mode === "sunny_sunbathe") {
    return "Sunny";
  }

  if (snapshot.mode === "rain_sad" || snapshot.mode === "rain_sleep") {
    return "Rainy";
  }

  if (snapshot.mode === "hot_wilted") {
    return "Hot";
  }

  return "Cloudy";
}

function formatWeatherInfo(snapshot: PetWeatherSnapshot | null) {
  if (!snapshot) {
    return "Weather loading";
  }

  const place = snapshot.city || snapshot.region || "Current location";
  const temperature = typeof snapshot.temperature === "number" ? `${Math.round(snapshot.temperature)}\u00b0C` : null;
  const label = getWeatherLabel(snapshot);

  return [place, temperature, label].filter(Boolean).join(" · ");
}

function getVisibleWeatherMode(
  petState: Exclude<PetState, "dragging">,
  petView: PetView,
  weatherDisplayMode: WeatherDisplayMode,
  isWeatherActive: boolean
) {
  if (petState !== "idle" || petView !== "front" || !isWeatherActive || weatherDisplayMode.kind !== "weather") {
    return null;
  }

  return weatherDisplayMode.mode;
}

function getWeatherClassName(weatherMode: WeatherPetMode | null) {
  if (weatherMode === null) {
    return "";
  }

  return ` pet-weather-${weatherMode.replace(/_/g, "-")}`;
}

function getPetImage(
  petState: Exclude<PetState, "dragging">,
  petView: PetView,
  weatherDisplayMode: WeatherDisplayMode,
  isWeatherActive: boolean
) {
  if (petState === "idle") {
    if (petView !== "front") {
      return VIEW_IMAGES[petView];
    }

    if (isWeatherActive && weatherDisplayMode.kind === "weather") {
      return WEATHER_IMAGES[weatherDisplayMode.mode];
    }

    return VIEW_IMAGES.front;
  }

  return STATE_IMAGES[petState];
}

function petReducer(state: PetMachineState, action: PetMachineAction): PetMachineState {
  switch (action.type) {
    case "START_DRAG":
      return {
        ...state,
        petState: "dragging",
        lastStillState: action.previousState,
        isMenuOpen: false
      };
    case "END_DRAG":
      return {
        ...state,
        petState: action.nextState,
        lastStillState: action.nextState
      };
    case "OPEN_MENU":
      return { ...state, isMenuOpen: true };
    case "CLOSE_MENU":
      return { ...state, isMenuOpen: false };
    case "TOGGLE_MENU":
      return { ...state, isMenuOpen: !state.isMenuOpen };
    case "ENTER_SLEEP":
      return {
        ...state,
        petState: "sleeping",
        lastStillState: "sleeping",
        isMenuOpen: false
      };
    case "TOGGLE_SLEEP": {
      const nextState = state.petState === "sleeping" ? "idle" : "sleeping";
      return {
        ...state,
        petState: nextState,
        lastStillState: nextState,
        isMenuOpen: false
      };
    }
    case "ENTER_PEEK":
      return {
        ...state,
        petState: "peek",
        lastStillState: "peek",
        isMenuOpen: false
      };
    case "EXIT_PEEK":
      return {
        ...state,
        petState: "idle",
        lastStillState: "idle",
        isMenuOpen: false
      };
    case "ENTER_TEMP_STATE":
      return {
        ...state,
        petState: action.state,
        lastStillState: action.state,
        isMenuOpen: false
      };
    case "RETURN_IDLE":
      return {
        ...state,
        petState: "idle",
        lastStillState: "idle"
      };
    case "SET_WEATHER_SNAPSHOT":
      return {
        ...state,
        weatherSnapshot: action.snapshot,
        weatherDisplayMode: getNextWeatherDisplayMode(state.weatherDisplayMode, action.snapshot),
        isWeatherActive: true
      };
    case "ADVANCE_WEATHER_DISPLAY":
      return {
        ...state,
        weatherDisplayMode: getNextWeatherDisplayMode(state.weatherDisplayMode, state.weatherSnapshot),
        isWeatherActive: state.weatherSnapshot !== null || state.isWeatherActive
      };
    case "CLEAR_WEATHER_MODE":
      return {
        ...state,
        weatherDisplayMode: { kind: "front" },
        isWeatherActive: false
      };
    case "START_VIEW_SWITCH":
      return {
        ...state,
        petState: "idle",
        lastStillState: "idle",
        isMenuOpen: false,
        isViewSwitching: true
      };
    case "SWAP_VIEW":
      return {
        ...state,
        petView: getNextView(state.petView)
      };
    case "FINISH_VIEW_SWITCH":
      return {
        ...state,
        isViewSwitching: false
      };
    default:
      return state;
  }
}

export default function DesktopPet() {
  const [machine, dispatch] = useReducer(petReducer, INITIAL_MACHINE_STATE);
  const dragPoint = useRef<DragPoint | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMousePassthrough = useRef(false);
  const stateBeforeDrag = useRef<StillPetState>("idle");
  const suppressNextClick = useRef(false);
  const clickTimer = useRef<number | null>(null);
  const viewSwapTimer = useRef<number | null>(null);
  const viewBounceTimer = useRef<number | null>(null);
  const isViewSwitchingRef = useRef(false);
  const shyHoverTimer = useRef<number | null>(null);
  const stateTimer = useRef<number | null>(null);

  const {
    petState,
    petView,
    weatherSnapshot,
    weatherDisplayMode,
    isWeatherActive,
    lastStillState,
    isMenuOpen,
    isViewSwitching
  } = machine;
  const displayState = petState === "dragging" ? lastStillState : petState;
  const currentImage = getPetImage(displayState, petView, weatherDisplayMode, isWeatherActive);
  const visibleWeatherMode = getVisibleWeatherMode(displayState, petView, weatherDisplayMode, isWeatherActive);
  const weatherClassName = getWeatherClassName(visibleWeatherMode);
  const weatherInfo = formatWeatherInfo(weatherSnapshot);

  const updateMousePassthrough = (shouldIgnore: boolean) => {
    if (isMousePassthrough.current === shouldIgnore) {
      return;
    }

    isMousePassthrough.current = shouldIgnore;
    setMousePassthrough(shouldIgnore);
  };

  const isInsideInteractiveArea = (clientX: number, clientY: number) => {
    const stageRect = stageRef.current?.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const isInsideStage = Boolean(
      stageRect &&
        clientX >= stageRect.left &&
        clientX <= stageRect.right &&
        clientY >= stageRect.top &&
        clientY <= stageRect.bottom
    );
    const isInsideMenu = Boolean(
      menuRect &&
        clientX >= menuRect.left &&
        clientX <= menuRect.right &&
        clientY >= menuRect.top &&
        clientY <= menuRect.bottom
    );

    return isInsideStage || isInsideMenu;
  };

  const clearClickTimer = () => {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };

  const clearViewBounceTimer = () => {
    if (viewSwapTimer.current !== null) {
      window.clearTimeout(viewSwapTimer.current);
      viewSwapTimer.current = null;
    }

    if (viewBounceTimer.current !== null) {
      window.clearTimeout(viewBounceTimer.current);
      viewBounceTimer.current = null;
    }

    isViewSwitchingRef.current = false;
    dispatch({ type: "FINISH_VIEW_SWITCH" });
  };

  const clearStateTimer = () => {
    if (stateTimer.current !== null) {
      window.clearTimeout(stateTimer.current);
      stateTimer.current = null;
    }
  };

  const triggerViewSwitch = () => {
    if (isViewSwitchingRef.current) {
      return;
    }

    clearViewBounceTimer();
    isViewSwitchingRef.current = true;
    dispatch({ type: "START_VIEW_SWITCH" });

    viewSwapTimer.current = window.setTimeout(() => {
      dispatch({ type: "SWAP_VIEW" });
      viewSwapTimer.current = null;
    }, VIEW_SWAP_MS);

    viewBounceTimer.current = window.setTimeout(() => {
      isViewSwitchingRef.current = false;
      dispatch({ type: "FINISH_VIEW_SWITCH" });
      viewBounceTimer.current = null;
    }, VIEW_BOUNCE_MS);
  };

  const clearShyHoverTimer = () => {
    if (shyHoverTimer.current !== null) {
      window.clearTimeout(shyHoverTimer.current);
      shyHoverTimer.current = null;
    }
  };

  const setTemporaryState = (nextState: Exclude<PetState, "idle" | "sleeping" | "dragging">, ms: number) => {
    clearStateTimer();
    dispatch({ type: "ENTER_TEMP_STATE", state: nextState });

    stateTimer.current = window.setTimeout(() => {
      dispatch({ type: "RETURN_IDLE" });
      stateTimer.current = null;
    }, ms);
  };

  const toggleSleeping = () => {
    clearStateTimer();
    dispatch({ type: "TOGGLE_SLEEP" });
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (petState === "peek") {
      return;
    }

    updateMousePassthrough(false);
    dispatch({ type: "CLOSE_MENU" });
    clearShyHoverTimer();
    clearClickTimer();
    clearStateTimer();
    stateBeforeDrag.current = petState === "dragging" ? lastStillState : petState;
    dispatch({ type: "START_DRAG", previousState: stateBeforeDrag.current });

    dragPoint.current = {
      screenX: event.screenX,
      screenY: event.screenY,
      moved: false
    };
  };

  const stopDragging = (event?: MouseEvent | ReactMouseEvent<HTMLElement>) => {
    if (!dragPoint.current) {
      return;
    }

    const wasMoved = Boolean(dragPoint.current?.moved);
    const nextState = stateBeforeDrag.current === "sleeping" ? "sleeping" : "idle";

    if (wasMoved) {
      suppressNextClick.current = true;
    }

    dragPoint.current = null;
    dispatch({ type: "END_DRAG", nextState });

    if (event) {
      updateMousePassthrough(!isInsideInteractiveArea(event.clientX, event.clientY));
    }
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    dispatch({ type: "CLOSE_MENU" });

    if (dragPoint.current || suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }

    clearClickTimer();

    if (event.detail === 2) {
      if (petState === "sleeping") {
        toggleSleeping();
      } else {
        setTemporaryState("surprised", SURPRISED_MS);
      }
      return;
    }

    if (petState === "sleeping") {
      return;
    }

    if (isViewSwitchingRef.current) {
      return;
    }

    clickTimer.current = window.setTimeout(() => {
      triggerViewSwitch();
      clickTimer.current = null;
    }, CLICK_DELAY_MS);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (petState === "peek") {
      dispatch({ type: "CLOSE_MENU" });
      clearClickTimer();
      clearStateTimer();
      resetWindowPosition();
      dispatch({ type: "EXIT_PEEK" });
      return;
    }

    clearClickTimer();
    clearShyHoverTimer();
    dispatch({ type: "TOGGLE_MENU" });
  };

  const handleSleep = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    dispatch({ type: "CLOSE_MENU" });
    clearClickTimer();
    clearShyHoverTimer();
    clearStateTimer();
    dispatch({ type: "ENTER_SLEEP" });
  };

  const handlePeek = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    dispatch({ type: "CLOSE_MENU" });
    clearClickTimer();
    clearShyHoverTimer();
    clearStateTimer();
    snapWindowToRightEdge();
    dispatch({ type: "ENTER_PEEK" });
  };

  const handleFeed = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    dispatch({ type: "CLOSE_MENU" });
    clearShyHoverTimer();
    clearClickTimer();
    setTemporaryState("eating", EATING_MS);
  };

  const handleWeatherCycle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearClickTimer();
    clearShyHoverTimer();
    dispatch({ type: "ADVANCE_WEATHER_DISPLAY" });
  };

  const handleWeatherClear = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearClickTimer();
    clearShyHoverTimer();
    dispatch({ type: "CLEAR_WEATHER_MODE" });
  };

  const applyWeatherSnapshot = (snapshot: PetWeatherSnapshot | null | undefined) => {
    if (!snapshot || !isWeatherPetMode(snapshot.mode)) {
      return;
    }

    dispatch({ type: "SET_WEATHER_SNAPSHOT", snapshot });
  };

  const handlePetMouseEnter = () => {
    updateMousePassthrough(false);

    if (petState !== "idle" && petState !== "surprised") {
      return;
    }

    clearShyHoverTimer();
    shyHoverTimer.current = window.setTimeout(() => {
      dispatch({ type: "ENTER_TEMP_STATE", state: "shy" });
      shyHoverTimer.current = null;
    }, SHY_HOVER_MS);
  };

  const handlePetMouseLeave = () => {
    clearShyHoverTimer();
    if (!isMenuOpen && !dragPoint.current) {
      updateMousePassthrough(true);
    }

    if (petState === "shy") {
      clearStateTimer();
      dispatch({ type: "RETURN_IDLE" });
    }
  };

  useEffect(() => {
    let isMounted = true;

    window.electronAPI
      ?.getWeather()
      .then((snapshot) => {
        if (isMounted) {
          applyWeatherSnapshot(snapshot);
        }
      })
      .catch((error) => {
        console.warn("[weather] Failed to read current weather:", error);
      });

    const unsubscribe = window.electronAPI?.onWeatherUpdated((snapshot) => {
      applyWeatherSnapshot(snapshot);
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    updateMousePassthrough(true);

    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (!dragPoint.current) {
        updateMousePassthrough(!isInsideInteractiveArea(event.clientX, event.clientY));
        return;
      }

      updateMousePassthrough(false);
      const dx = event.screenX - dragPoint.current.screenX;
      const dy = event.screenY - dragPoint.current.screenY;

      moveWindowBy(dx, dy);

      dragPoint.current = {
        screenX: event.screenX,
        screenY: event.screenY,
        moved: dragPoint.current.moved || Math.abs(dx) + Math.abs(dy) > 1
      };
    };

    const handleGlobalMouseUp = (event: MouseEvent) => {
      stopDragging(event);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      clearClickTimer();
      clearViewBounceTimer();
      clearShyHoverTimer();
      clearStateTimer();
      updateMousePassthrough(false);
    };
  }, []);

  return (
    <main
      className={`pet-root pet-state-${petState}${weatherClassName}${isViewSwitching ? " pet-view-bounce" : ""}`}
      onMouseMove={(event) => {
        if (!dragPoint.current) {
          updateMousePassthrough(!isInsideInteractiveArea(event.clientX, event.clientY));
        }
      }}
      onMouseLeave={() => {
        if (!dragPoint.current) {
          updateMousePassthrough(true);
        }
      }}
    >
      <div className="pet-stage" ref={stageRef}>
        <button
          type="button"
          className="pet-hit-area"
          aria-label={`Desktop pet ${petState}`}
          onMouseDown={handleMouseDown}
          onMouseUp={stopDragging}
          onMouseEnter={handlePetMouseEnter}
          onMouseLeave={handlePetMouseLeave}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onDragStart={(event) => event.preventDefault()}
        >
          <img className="pet-image" src={currentImage} alt="" draggable={false} />
        </button>

        {isMenuOpen && (
          <div className="pet-menu" ref={menuRef} role="menu" aria-label="Pet actions">
            <div className="pet-weather-info" role="status">
              {weatherInfo}
            </div>
            <button type="button" className="pet-menu-button" onClick={handleSleep}>
              Sleep
            </button>
            <button type="button" className="pet-menu-button" onClick={handlePeek}>
              Peek
            </button>
            <button type="button" className="pet-menu-button" onClick={handleFeed}>
              Feed
            </button>
            <button type="button" className="pet-menu-button" onClick={handleWeatherCycle}>
              Weather
            </button>
            <button type="button" className="pet-menu-button" onClick={handleWeatherClear}>
              Clear
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
