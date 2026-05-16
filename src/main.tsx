import React from "react";
import { createRoot } from "react-dom/client";
import DesktopPet from "./pet/DesktopPet";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DesktopPet />
  </React.StrictMode>
);
