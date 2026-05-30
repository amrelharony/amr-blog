"use client";
import { useEffect, useState } from "react";
import { initAudio, isEnabled, setEnabled } from "@/lib/audio/spatial";

// Audio on/off toggle. Mounting also initializes the spatial-audio engine
// (gesture gate + delegated hover/click listeners).
export default function AudioToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    initAudio();
    setOn(isEnabled());
  }, []);

  const toggle = () => setOn(setEnabled(!on));

  return (
    <button
      className={"sc-btn" + (on ? " active" : "")}
      onClick={toggle}
      title={on ? "Sound on" : "Sound off"}
      aria-label="Toggle sound effects"
    >
      <i className={"fa-solid " + (on ? "fa-volume-high" : "fa-volume-xmark")} aria-hidden="true" />
    </button>
  );
}
