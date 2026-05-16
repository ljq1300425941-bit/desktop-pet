import { useEffect, useRef, useState } from "react";
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

const VIEW_ORDER: PetView[] = ["front", "side", "back"];
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

function getPetImage(petState: Exclude<PetState, "dragging">, petView: PetView) {
  if (petState === "idle") {
    return VIEW_IMAGES[petView];
  }

  return STATE_IMAGES[petState];
}

export default function DesktopPet() {
  const [petState, setPetState] = useState<PetState>("idle");
  const [petView, setPetView] = useState<PetView>("front");
  const [lastStillState, setLastStillState] = useState<Exclude<PetState, "dragging">>("idle");
  const [isFeedMenuOpen, setIsFeedMenuOpen] = useState(false);
  const [isViewBouncing, setIsViewBouncing] = useState(false);
  const dragPoint = useRef<DragPoint | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMousePassthrough = useRef(false);
  const stateBeforeDrag = useRef<Exclude<PetState, "dragging">>("idle");
  const suppressNextClick = useRef(false);
  const clickTimer = useRef<number | null>(null);
  const viewSwapTimer = useRef<number | null>(null);
  const viewBounceTimer = useRef<number | null>(null);
  const isViewSwitching = useRef(false);
  const shyHoverTimer = useRef<number | null>(null);
  const stateTimer = useRef<number | null>(null);

  const currentImage = getPetImage(petState === "dragging" ? lastStillState : petState, petView);

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

    isViewSwitching.current = false;
    setIsViewBouncing(false);
  };

  const clearStateTimer = () => {
    if (stateTimer.current !== null) {
      window.clearTimeout(stateTimer.current);
      stateTimer.current = null;
    }
  };

  const triggerViewSwitch = () => {
    if (isViewSwitching.current) {
      return;
    }

    clearViewBounceTimer();
    isViewSwitching.current = true;
    setIsViewBouncing(true);

    viewSwapTimer.current = window.setTimeout(() => {
      setPetView((currentView) => getNextView(currentView));
      viewSwapTimer.current = null;
    }, VIEW_SWAP_MS);

    viewBounceTimer.current = window.setTimeout(() => {
      setIsViewBouncing(false);
      isViewSwitching.current = false;
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
    setPetState(nextState);
    setLastStillState(nextState);

    stateTimer.current = window.setTimeout(() => {
      setPetState("idle");
      setLastStillState("idle");
      stateTimer.current = null;
    }, ms);
  };

  const toggleSleeping = () => {
    clearStateTimer();
    setPetState((currentState) => {
      const nextState = currentState === "sleeping" ? "idle" : "sleeping";
      setLastStillState(nextState);
      return nextState;
    });
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (petState === "peek") {
      return;
    }

    updateMousePassthrough(false);
    setIsFeedMenuOpen(false);
    clearShyHoverTimer();
    clearClickTimer();
    clearStateTimer();
    stateBeforeDrag.current = petState === "dragging" ? lastStillState : petState;
    setPetState("dragging");

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
    setPetState(nextState);
    setLastStillState(nextState);

    if (event) {
      updateMousePassthrough(!isInsideInteractiveArea(event.clientX, event.clientY));
    }
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    setIsFeedMenuOpen(false);

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

    if (isViewSwitching.current) {
      return;
    }

    clickTimer.current = window.setTimeout(() => {
      setPetState("idle");
      setLastStillState("idle");
      triggerViewSwitch();
      clickTimer.current = null;
    }, CLICK_DELAY_MS);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (petState === "peek") {
      setIsFeedMenuOpen(false);
      clearClickTimer();
      clearStateTimer();
      resetWindowPosition();
      setPetState("idle");
      setLastStillState("idle");
      return;
    }

    clearClickTimer();
    clearShyHoverTimer();
    setIsFeedMenuOpen((isOpen) => !isOpen);
  };

  const handleSleep = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsFeedMenuOpen(false);
    clearClickTimer();
    clearShyHoverTimer();
    clearStateTimer();
    setPetState("sleeping");
    setLastStillState("sleeping");
  };

  const handlePeek = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsFeedMenuOpen(false);
    clearClickTimer();
    clearShyHoverTimer();
    clearStateTimer();
    snapWindowToRightEdge();
    setPetState("peek");
    setLastStillState("peek");
  };

  const handleFeed = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsFeedMenuOpen(false);
    clearShyHoverTimer();
    clearClickTimer();
    setTemporaryState("eating", EATING_MS);
  };

  const handlePetMouseEnter = () => {
    updateMousePassthrough(false);

    if (petState !== "idle" && petState !== "surprised") {
      return;
    }

    clearShyHoverTimer();
    shyHoverTimer.current = window.setTimeout(() => {
      setPetState("shy");
      setLastStillState("shy");
      shyHoverTimer.current = null;
    }, SHY_HOVER_MS);
  };

  const handlePetMouseLeave = () => {
    clearShyHoverTimer();
    if (!isFeedMenuOpen && !dragPoint.current) {
      updateMousePassthrough(true);
    }

    if (petState === "shy") {
      clearStateTimer();
      setPetState("idle");
      setLastStillState("idle");
    }
  };

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
      className={`pet-root pet-state-${petState}${isViewBouncing ? " pet-view-bounce" : ""}`}
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

        {isFeedMenuOpen && (
          <div className="pet-menu" ref={menuRef} role="menu" aria-label="Pet actions">
            <button type="button" className="pet-menu-button" onClick={handleSleep}>
              Sleep
            </button>
            <button type="button" className="pet-menu-button" onClick={handlePeek}>
              Peek
            </button>
            <button type="button" className="pet-menu-button" onClick={handleFeed}>
              Feed
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
