"use client";
import { useEffect, useRef, useState } from "react";

// Text-to-speech narration — ported from Js/blog-tts.js. Reads the article body
// sentence-by-sentence with a floating player (prev/play-pause/next/speed/scrub),
// highlighting the current block.
export default function TtsButton() {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [supported, setSupported] = useState(true);
  const [total, setTotal] = useState(1); // sentence count, mirrored into state for render

  const sentences = useRef<{ el: HTMLElement; text: string }[]>([]);
  const playingRef = useRef(false);
  const idxRef = useRef(0);
  const speedRef = useRef(1);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);
  // Voices load asynchronously in Chromium — getVoices() is [] until `voiceschanged`
  // fires. Prime + cache them so the first "Listen" picks the preferred voice.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      const v = speechSynthesis.getVoices();
      if (v.length) voicesRef.current = v;
    };
    load();
    speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, []);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(
    () => () => {
      try {
        speechSynthesis.cancel();
      } catch {}
    },
    [],
  );

  const clearHighlights = () => sentences.current.forEach((s) => s.el.classList.remove("lb-tts-highlight"));

  const speakAt = (i: number) => {
    const list = sentences.current;
    if (i >= list.length) {
      stop();
      return;
    }
    idxRef.current = i;
    setIdx(i);
    clearHighlights();
    list[i].el.classList.add("lb-tts-highlight");
    list[i].el.scrollIntoView({ behavior: "smooth", block: "center" });
    const u = new SpeechSynthesisUtterance(list[i].text);
    u.rate = speedRef.current;
    u.lang = "en-US";
    const voices = voicesRef.current.length ? voicesRef.current : speechSynthesis.getVoices();
    const v =
      voices.find((x) => x.name.includes("Google") && x.lang.startsWith("en")) ||
      voices.find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    u.onend = () => {
      if (playingRef.current) speakAt(idxRef.current + 1);
    };
    speechSynthesis.speak(u);
  };

  const start = () => {
    const content = document.querySelector(".lb-content");
    if (!content) return;
    sentences.current = Array.from(content.querySelectorAll("p,li,h2,h3,h4,blockquote"))
      .map((el) => ({ el: el as HTMLElement, text: (el.textContent || "").trim() }))
      .filter((s) => s.text.length > 2);
    if (!sentences.current.length) return;
    setTotal(sentences.current.length);
    playingRef.current = true;
    setPlaying(true);
    setPaused(false);
    speakAt(0);
  };
  const stop = () => {
    playingRef.current = false;
    setPlaying(false);
    setPaused(false);
    try {
      speechSynthesis.cancel();
    } catch {}
    clearHighlights();
  };
  const togglePause = () => {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      setPaused(false);
    } else {
      speechSynthesis.pause();
      setPaused(true);
    }
  };
  const jump = (i: number) => {
    try {
      speechSynthesis.cancel();
    } catch {}
    speakAt(Math.max(0, Math.min(sentences.current.length - 1, i)));
  };
  const cycleSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5];
    const ns = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(ns);
    speedRef.current = ns;
    if (speechSynthesis.speaking) jump(idxRef.current);
  };

  if (!supported) return null;

  return (
    <>
      <button className={"lb-tts-btn" + (playing ? " active" : "")} onClick={() => (playing ? stop() : start())}>
        <i className="fa-solid fa-headphones" aria-hidden="true" /> {playing ? "Stop" : "Listen"}
      </button>
      {playing && (
        <div className="lb-tts-player visible">
          <div className="lb-tts-controls">
            <button className="lb-tts-ctrl-btn" onClick={() => jump(idxRef.current - 1)} title="Previous">
              ⏮
            </button>
            <button className="lb-tts-ctrl-btn active" onClick={togglePause} title="Play/Pause">
              {paused ? "▶" : "⏸"}
            </button>
            <button className="lb-tts-ctrl-btn" onClick={() => jump(idxRef.current + 1)} title="Next">
              ⏭
            </button>
          </div>
          <div
            className="lb-tts-progress"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              jump(Math.floor(((e.clientX - r.left) / r.width) * total));
            }}
          >
            <div className="lb-tts-progress-fill" style={{ width: `${(idx / total) * 100}%` }} />
          </div>
          <button className="lb-tts-speed" onClick={cycleSpeed}>
            {speed}x
          </button>
          <button className="lb-tts-close" onClick={stop} title="Stop">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
