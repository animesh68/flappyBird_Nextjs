"use client";

import React, { useEffect, useRef, useState } from "react";

/* ---------------- constants ---------------- */
const BOARD_W = 360;
const BOARD_H = 640;
const BIRD_W = 34;
const BIRD_H = 24;
const BIRD_X = BOARD_W / 8;
const BIRD_Y = BOARD_H / 2;

const PIPE_W = 64;
const PIPE_H = 512;
const PIPE_X = BOARD_W;

type Pipe = {
  img: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  passed?: boolean;
};

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // refs for runtime state
  const rafRef = useRef<number | null>(null);
  const pipesRef = useRef<Pipe[]>([]);
  const velocityYRef = useRef<number>(0);
  const gravity = 0.4;
  const birdRef = useRef({ x: BIRD_X, y: BIRD_Y, width: BIRD_W, height: BIRD_H });

  // assets
  const topPipeImgRef = useRef<HTMLImageElement | null>(null);
  const bottomPipeImgRef = useRef<HTMLImageElement | null>(null);
  const birdFramesRef = useRef<HTMLImageElement[]>([]);
  const fallbackBirdRef = useRef<HTMLImageElement | null>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);

  // animation
  const frameIndexRef = useRef<number>(0);
  const frameTickRef = useRef<number>(0);
  const FRAME_TICK_RATE = 6; // lower = faster flap

  // gameplay
  const scoreRef = useRef<number>(0);
  const gameOverRef = useRef<boolean>(false);
  const placePipesIntervalRef = useRef<number | null>(null);

  // UI state
  const [loaded, setLoaded] = useState(false); // assets ready
  const [running, setRunning] = useState(false); // main loop running
  const [showMenu, setShowMenu] = useState(true); // start menu visible

  // sounds
  const soundWing = useRef<HTMLAudioElement | null>(null);
  const soundHit = useRef<HTMLAudioElement | null>(null);
  const soundDie = useRef<HTMLAudioElement | null>(null);
  const soundSwoosh = useRef<HTMLAudioElement | null>(null);
  const soundPoint = useRef<HTMLAudioElement | null>(null);

  /* ---------- preload assets and idle draw ---------- */
  useEffect(() => {
    // preload images
    const topPipe = new Image();
    topPipe.src = "/toppipe.png";
    topPipeImgRef.current = topPipe;

    const bottomPipe = new Image();
    bottomPipe.src = "/bottompipe.png";
    bottomPipeImgRef.current = bottomPipe;

    const bg = new Image();
    bg.src = "/flappybirdbg.png";
    bgRef.current = bg;

    // bird frames: flappybird0..flappybird3.png (fallback to /flappybird.png)
    const frames: HTMLImageElement[] = [];
    const EXPECTED_FRAMES = 4;
    let frameCallbacks = 0;
    for (let i = 0; i < EXPECTED_FRAMES; i++) {
      const img = new Image();
      img.src = `/flappybird${i}.png`;
      img.onload = () => {
        frameCallbacks++;
        checkLoaded();
      };
      img.onerror = () => {
        frameCallbacks++;
        checkLoaded();
      };
      frames.push(img);
    }
    birdFramesRef.current = frames;

    const fallback = new Image();
    fallback.src = "/flappybird.png";
    fallback.onload = () => checkLoaded();
    fallbackBirdRef.current = fallback;

    soundWing.current = new Audio("/sfx_wing.wav");
    soundHit.current = new Audio("/sfx_hit.wav");
    soundDie.current = new Audio("/sfx_die.wav");
    soundSwoosh.current = new Audio("/sfx_swooshing.wav");
    soundPoint.current = new Audio("/sfx_point.wav");


    let checks = 0;
    function checkLoaded() {
      checks++;
      if (!loaded && checks > 3) {
        setLoaded(true);
      }
    }

    const canvas = canvasRef.current!;
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    const ctx = canvas.getContext("2d")!;

    function idleLoop() {
      ctx.clearRect(0, 0, BOARD_W, BOARD_H);
      if (bgRef.current?.complete) ctx.drawImage(bgRef.current, 0, 0, BOARD_W, BOARD_H);

      const framesReady = birdFramesRef.current.length > 0 && birdFramesRef.current.every(f => f && f.complete && f.naturalWidth > 0);
      const birdImg = framesReady ? birdFramesRef.current[frameIndexRef.current % birdFramesRef.current.length] : fallbackBirdRef.current;
      if (birdImg && birdImg.complete) {
        ctx.drawImage(birdImg, birdRef.current.x, birdRef.current.y, BIRD_W, BIRD_H);
      } else {
        ctx.fillStyle = "yellow";
        ctx.fillRect(birdRef.current.x, birdRef.current.y, BIRD_W, BIRD_H);
      }

      frameTickRef.current++;
      if (frameTickRef.current >= FRAME_TICK_RATE * 2) {
        frameTickRef.current = 0;
        frameIndexRef.current = (frameIndexRef.current + 1) % Math.max(1, birdFramesRef.current.length || 1);
      }

      rafRef.current = requestAnimationFrame(idleLoop);
    }

    rafRef.current = requestAnimationFrame(idleLoop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let last = performance.now();

    function detectCollision(a: { x: number; y: number; width: number; height: number }, b: Pipe) {
      return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      );
    }

    function step(now: number) {
      const dt = (now - last) / 16.666;
      last = now;

      if (!running) {
        requestAnimationFrame(step);
        return;
      }

      // animate bird frame
      frameTickRef.current++;
      if (frameTickRef.current >= FRAME_TICK_RATE) {
        frameTickRef.current = 0;
        frameIndexRef.current = (frameIndexRef.current + 1) % Math.max(1, birdFramesRef.current.length || 1);
      }

      // physics
      velocityYRef.current += gravity;
      birdRef.current.y += velocityYRef.current;

      // clear + draw background
      ctx.clearRect(0, 0, BOARD_W, BOARD_H);
      if (bgRef.current?.complete) ctx.drawImage(bgRef.current, 0, 0, BOARD_W, BOARD_H);

      // update and draw pipes
      for (let i = 0; i < pipesRef.current.length; i++) {
        const pipe = pipesRef.current[i];
        pipe.x += -2;
        if (pipe.img && pipe.img.complete) ctx.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);

        if (!pipe.passed && birdRef.current.x > pipe.x + pipe.width) {
          scoreRef.current += 0.5; // each pair gives +1
          pipe.passed = true;
          soundPoint.current?.play?.();
        }

        if (detectCollision(birdRef.current, pipe)) {
          gameOverRef.current = true;
          soundHit.current?.play?.();
        }
      }

      // draw bird
      const framesReady = birdFramesRef.current.length > 0 && birdFramesRef.current.every(f => f && f.complete && f.naturalWidth > 0);
      const birdImg = framesReady ? birdFramesRef.current[frameIndexRef.current % birdFramesRef.current.length] : fallbackBirdRef.current;
      if (birdImg && birdImg.complete) {
        ctx.drawImage(birdImg, birdRef.current.x, birdRef.current.y, BIRD_W, BIRD_H);
      } else {
        ctx.fillStyle = "yellow";
        ctx.fillRect(birdRef.current.x, birdRef.current.y, BIRD_W, BIRD_H);
      }

      // score display
      ctx.fillStyle = "white";
      ctx.font = "45px sans-serif";
      ctx.fillText(Math.floor(scoreRef.current).toString(), 5, 45);

      // remove off-screen pipes
      while (pipesRef.current.length > 0 && pipesRef.current[0].x < -PIPE_W) pipesRef.current.shift();

      // ground check
      if (birdRef.current.y > BOARD_H - BIRD_H) {
        gameOverRef.current = true;
        soundDie.current?.play?.();
      }

      if (!gameOverRef.current) {
        requestAnimationFrame(step);
      } else {
        // stop spawn interval
        if (placePipesIntervalRef.current) {
          clearInterval(placePipesIntervalRef.current);
          placePipesIntervalRef.current = null;
        }
        setShowMenu(true);
        setRunning(false);
      }
    }

    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [running]);

  /* ---------- pipe spawning & control ---------- */
  function spawnPipePair() {
    const randomPipeY = -PIPE_H / 4 - Math.random() * (PIPE_H / 2);
    const openingSpace = BOARD_H / 4;

    const tp: Pipe = {
      img: topPipeImgRef.current as HTMLImageElement,
      x: PIPE_X,
      y: randomPipeY,
      width: PIPE_W,
      height: PIPE_H,
      passed: false,
    };
    pipesRef.current.push(tp);

    const bp: Pipe = {
      img: bottomPipeImgRef.current as HTMLImageElement,
      x: PIPE_X,
      y: randomPipeY + PIPE_H + openingSpace,
      width: PIPE_W,
      height: PIPE_H,
      passed: false,
    };
    pipesRef.current.push(bp);
  }

  function startGame() {
    // reset gameplay
    birdRef.current = { x: BIRD_X, y: BIRD_Y, width: BIRD_W, height: BIRD_H };
    velocityYRef.current = 0;
    pipesRef.current = [];
    scoreRef.current = 0;
    gameOverRef.current = false;

    // ensure images are present (assign if null)
    if (!topPipeImgRef.current) {
      const t = new Image();
      t.src = "/toppipe.png";
      topPipeImgRef.current = t;
    }
    if (!bottomPipeImgRef.current) {
      const b = new Image();
      b.src = "/bottompipe.png";
      bottomPipeImgRef.current = b;
    }
    if (!bgRef.current) {
      const bg = new Image();
      bg.src = "/flappybirdbg.png";
      bgRef.current = bg;
    }

  //first pair spawn (quickly pipes dikh jae on spawn)
    spawnPipePair();

    // interval spawn
    if (placePipesIntervalRef.current) clearInterval(placePipesIntervalRef.current);
    placePipesIntervalRef.current = window.setInterval(() => {
      if (!gameOverRef.current) spawnPipePair();
    }, 1500);

    soundSwoosh.current?.play?.();
    setRunning(true);
    setShowMenu(false);
  }

  function flap() {
    if (!running) {
      if (showMenu && loaded) {
        startGame();
      }
      return;
    }
    if (gameOverRef.current) {
      startGame();
      return;
    }
    velocityYRef.current = -6;
    soundWing.current?.play?.();
  }

  /* ---------- input handlers ---------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    }
    function onTouch(e: TouchEvent) {
      e.preventDefault();
      flap();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("touchstart", onTouch, { passive: false });

    const c = canvasRef.current;
    if (c) {
      c.addEventListener("click", flap);
      c.addEventListener("touchstart", flap, { passive: false });
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("touchstart", onTouch as any);
      if (c) {
        c.removeEventListener("click", flap);
        c.removeEventListener("touchstart", flap as any);
      }
    };
  }, [running, showMenu, loaded]);

  useEffect(() => {
    return () => {
      if (placePipesIntervalRef.current) clearInterval(placePipesIntervalRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ---------- render (canvas + start menu overlay) ---------- */
  return (
    <div className="canvas-container" role="application" aria-label="Flappy game">
      <canvas ref={canvasRef} />

      {showMenu && (
        <div className="overlay" aria-hidden={!showMenu}>
          <h2 style={{ marginBottom: 6 }}>START GAME!!</h2>
          <p className="small">{loaded ? "Tap/Click canvas or press Start" : "Loading..."}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              className="button"
              onClick={() => {
                if (!loaded) return;
                startGame();
              }}
              disabled={!loaded}
            >
              {loaded ? "Start" : "Loading"}
            </button>
          </div>
          <p className="small" style={{ marginTop: 8 }}>
            Controls: Tap / Click / Space
          </p>
        </div>
      )}
    </div>
  );
}
