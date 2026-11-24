'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Volume2, VolumeX } from 'lucide-react';
import type { UlarScenarioPack } from '@/lib/games/ular-tangga/packs';

export interface UlarDice3DProps {
  value: number | null;
  bonus?: number;
  rollKey: string;
  rollerName?: string | null;
  artStyle: UlarScenarioPack['artStyle'];
  reducedMotion?: boolean;
  compact?: boolean;
}

const DIE_PALETTES: Record<
  UlarScenarioPack['artStyle'],
  {
    faceBg: string;
    faceBorder: string;
    pipColor: string;
    pipAccent: string;
    trayColor: number;
    rimHex: number;
    roughness: number;
    metalness: number;
  }
> = {
  nusantara: {
    faceBg: '#F6EFE2',
    faceBorder: '#D97706',
    pipColor: '#1C1917',
    pipAccent: '#B45309',
    trayColor: 0x1c1711,
    rimHex: 0xf59e0b,
    roughness: 0.28,
    metalness: 0.14,
  },
  cyber: {
    faceBg: '#0F172A',
    faceBorder: '#22D3EE',
    pipColor: '#67E8F9',
    pipAccent: '#38BDF8',
    trayColor: 0x09101d,
    rimHex: 0x22d3ee,
    roughness: 0.24,
    metalness: 0.48,
  },
  mistis: {
    faceBg: '#1E1633',
    faceBorder: '#C084FC',
    pipColor: '#FDE68A',
    pipAccent: '#F59E0B',
    trayColor: 0x130d24,
    rimHex: 0xc084fc,
    roughness: 0.3,
    metalness: 0.28,
  },
};

// Material index mapping on BoxGeometry / RoundedBoxGeometry:
// 0: +X -> pip 3, 1: -X -> pip 4, 2: +Y -> pip 2, 3: -Y -> pip 5, 4: +Z -> pip 1, 5: -Z -> pip 6
const FACE_PIP_MAP = [3, 4, 2, 5, 1, 6] as const;

const PIP_POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.26, 0.26],
    [0.5, 0.5],
    [0.74, 0.74],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.5, 0.5],
    [0.26, 0.74],
    [0.74, 0.74],
  ],
  6: [
    [0.28, 0.24],
    [0.72, 0.24],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.76],
    [0.72, 0.76],
  ],
};

function getTargetEulerForTopFace(face: number): [number, number, number] {
  switch (face) {
    case 1:
      return [-Math.PI / 2, 0, 0];
    case 2:
      return [0, 0, 0];
    case 3:
      return [0, 0, Math.PI / 2];
    case 4:
      return [0, 0, -Math.PI / 2];
    case 5:
      return [Math.PI, 0, 0];
    case 6:
      return [Math.PI / 2, 0, 0];
    default:
      return [-Math.PI / 2, 0, 0];
  }
}

function createDieFaceTexture(
  pips: number,
  palette: (typeof DIE_PALETTES)['nusantara'],
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = palette.faceBg;
    ctx.fillRect(0, 0, size, size);

    // Subtle inset bevel frame
    ctx.strokeStyle = palette.faceBorder;
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, size - 36, size - 36);

    const coords = PIP_POSITIONS[pips] ?? PIP_POSITIONS[1];
    for (const [nx, ny] of coords) {
      const px = nx * size;
      const py = ny * size;
      const radius = pips === 1 ? 26 : 18;

      ctx.beginPath();
      ctx.arc(px, py + 2, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = pips === 1 || pips === 6 ? palette.pipAccent : palette.pipColor;
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0,0,0,0.72)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function playProceduralDiceTick(pitchHz: number, gainPeak: number) {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchHz, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.055);
    gain.gain.setValueAtTime(gainPeak, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.065);
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 120);
  } catch {
    // Ignore autoplay-blocked audio
  }
}

// Pre-allocated math helpers outside animation tick (Zero-GC discipline)
const _euler = new THREE.Euler();
const _targetQuat = new THREE.Quaternion();
const _spinQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getReducedMotionSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const getReducedMotionServerSnapshot = () => false;

export function UlarDice3D({
  value,
  bonus = 0,
  rollKey,
  rollerName,
  artStyle,
  reducedMotion = false,
  compact = false,
}: UlarDice3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const osReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  const effectiveReducedMotion = reducedMotion || osReducedMotion;

  const safeValue = useMemo(() => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 6;
    return Math.max(1, Math.min(6, Math.round(value)));
  }, [value]);

  const animRef = useRef<{
    active: boolean;
    elapsed: number;
    duration: number;
    targetFace: number;
    yawOffset: number;
    spinAxis: THREE.Vector3;
    lastBounceStep: number;
    soundEnabled: boolean;
    triggerRoll: ((nextFace: number, animate: boolean) => void) | null;
  }>({
    active: false,
    elapsed: 0,
    duration: 0.95,
    targetFace: safeValue,
    yawOffset: 0.18,
    spinAxis: new THREE.Vector3(0.7, 0.5, 0.45).normalize(),
    lastBounceStep: -1,
    soundEnabled: false,
    triggerRoll: null,
  });

  const latestRollRef = useRef({ safeValue, hasValue: value !== null, rollKey });

  useEffect(() => {
    latestRollRef.current = { safeValue, hasValue: value !== null, rollKey };
  }, [safeValue, value, rollKey]);

  useEffect(() => {
    animRef.current.soundEnabled = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || effectiveReducedMotion) return;

    const animCtrl = animRef.current;
    let disposed = false;
    let frameId = 0;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      const isSoftwareGl = detectSoftwareWebGL();
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const width = mount.clientWidth || (compact ? 84 : 112);
      const height = mount.clientHeight || (compact ? 84 : 112);
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      mount.innerHTML = '';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 30);
      camera.position.set(0, 2.75, 2.35);
      camera.lookAt(0, 0.42, 0);

      // Studio reflection environment
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envScene = new RoomEnvironment();
      const envRT = pmremGenerator.fromScene(envScene, 0.04);
      scene.environment = envRT.texture;
      envScene.dispose();
      pmremGenerator.dispose();

      // 3-Point Studio Lighting (Warm key + Cool Hemisphere + Subtle Rim)
      const hemi = new THREE.HemisphereLight(0xcbd5e1, 0x0f172a, 0.65);
      scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfff1db, 2.1);
      keyLight.position.set(2.4, 4.2, 2.6);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(512, 512);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 12;
      keyLight.shadow.camera.left = -2.2;
      keyLight.shadow.camera.right = 2.2;
      keyLight.shadow.camera.top = 2.2;
      keyLight.shadow.camera.bottom = -2.2;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
      rimLight.position.set(-2.5, 2.2, -2.4);
      scene.add(rimLight);

      const palette = DIE_PALETTES[artStyle];

      // Grounded Pedestal Tray + Contact Shadow Plane
      const trayGeom = new THREE.CylinderGeometry(1.18, 1.28, 0.14, 32);
      const trayMat = new THREE.MeshStandardMaterial({
        color: palette.trayColor,
        roughness: 0.72,
        metalness: 0.25,
      });
      const trayMesh = new THREE.Mesh(trayGeom, trayMat);
      trayMesh.position.y = -0.07;
      trayMesh.receiveShadow = !isSoftwareGl;
      scene.add(trayMesh);

      const ringGeom = new THREE.TorusGeometry(1.18, 0.035, 10, 48);
      ringGeom.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({
        color: palette.rimHex,
        roughness: 0.25,
        metalness: 0.78,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.y = 0.005;
      scene.add(ringMesh);

      const shadowTex = createContactShadowTexture();
      const shadowGeom = new THREE.PlaneGeometry(1.85, 1.85);
      shadowGeom.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      });
      const shadowPlane = new THREE.Mesh(shadowGeom, shadowMat);
      shadowPlane.position.y = 0.02;
      scene.add(shadowPlane);

      // Beveled Procedural Die
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const dieGeom = new RoundedBoxGeometry(1.06, 1.06, 1.06, 4, 0.14);
      const faceTextures = FACE_PIP_MAP.map((pip) =>
        createDieFaceTexture(pip, palette, maxAniso),
      );
      const dieMaterials = faceTextures.map(
        (tex) =>
          new THREE.MeshStandardMaterial({
            map: tex,
            roughness: palette.roughness,
            metalness: palette.metalness,
          }),
      );
      const dieMesh = new THREE.Mesh(dieGeom, dieMaterials);
      dieMesh.castShadow = !isSoftwareGl;
      dieMesh.position.y = 0.53;
      scene.add(dieMesh);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      const activeRenderer = renderer;
      let renderBusy = false;
      let renderDirty = false;
      let lastTime = performance.now();

      const afterDraw = (cb: () => void) => {
        const gl = activeRenderer.getContext() as WebGL2RenderingContext;
        if (!gl || typeof gl.fenceSync !== 'function') {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      };

      const renderFrame = () => {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const anim = animRef.current;
        if (anim.active) {
          anim.elapsed += dt;
          const t = Math.min(1, anim.elapsed / anim.duration);
          const easeOut = 1 - Math.pow(1 - t, 3);

          // Bounce curve on Y (2 crisp bounces settling to 0.53)
          const bounceHeight =
            t < 0.88 ? Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * 0.95 : 0;
          dieMesh.position.y = 0.53 + bounceHeight;

          // Contact shadow shrinks as die hops higher
          const shadowScale = 1 - bounceHeight * 0.35;
          shadowPlane.scale.set(shadowScale, 1, shadowScale);
          shadowMat.opacity = 0.55 - bounceHeight * 0.25;

          // Sound tick on bounce peaks
          const bounceIdx = Math.floor(t * 2.5);
          if (bounceIdx !== anim.lastBounceStep && t < 0.85) {
            anim.lastBounceStep = bounceIdx;
            if (anim.soundEnabled) {
              playProceduralDiceTick(290 + bounceIdx * 65, 0.08);
            }
          }

          // Target orientation putting authoritative pip face on TOP (+Y)
          const [rx, ry, rz] = getTargetEulerForTopFace(anim.targetFace);
          _euler.set(rx, ry, rz, 'XYZ');
          _targetQuat.setFromEuler(_euler);
          _yawQuat.setFromAxisAngle(_upAxis, anim.yawOffset);
          _targetQuat.premultiply(_yawQuat);

          // Dramatic tumble early, smoothly locking into target orientation
          const spinRemaining = (1 - easeOut) * Math.PI * 3.8;
          _spinQuat.setFromAxisAngle(anim.spinAxis, spinRemaining);
          dieMesh.quaternion.copy(_targetQuat).premultiply(_spinQuat);

          if (t >= 1) {
            anim.active = false;
            dieMesh.position.y = 0.53;
            dieMesh.quaternion.copy(_targetQuat);
            shadowPlane.scale.set(1, 1, 1);
            shadowMat.opacity = 0.55;
          }
        } else {
          const [rx, ry, rz] = getTargetEulerForTopFace(anim.targetFace);
          _euler.set(rx, ry, rz, 'XYZ');
          _targetQuat.setFromEuler(_euler);
          _yawQuat.setFromAxisAngle(_upAxis, anim.yawOffset);
          _targetQuat.premultiply(_yawQuat);
          dieMesh.quaternion.copy(_targetQuat);
          dieMesh.position.y = 0.53;
        }

        activeRenderer.render(scene, camera);
      };

      const requestRender = () => {
        if (disposed) return;
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = window.requestAnimationFrame(() => {
          renderDirty = false;
          renderFrame();
          const done = () => {
            renderBusy = false;
            if (!disposed && (animRef.current.active || renderDirty)) {
              requestRender();
            }
          };
          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      };

      animRef.current.triggerRoll = (nextFace: number, animate: boolean) => {
        const anim = animRef.current;
        anim.targetFace = Math.max(1, Math.min(6, Math.round(nextFace)));
        anim.yawOffset = (((anim.targetFace * 37) % 10) - 5) * 0.045;
        anim.spinAxis
          .set(
            0.55 + ((anim.targetFace % 3) * 0.2),
            0.4 + ((anim.targetFace % 2) * 0.3),
            0.6,
          )
          .normalize();
        anim.lastBounceStep = -1;
        if (animate) {
          anim.active = true;
          anim.elapsed = 0;
          lastTime = performance.now();
        } else {
          anim.active = false;
        }
        requestRender();
      };

      // Initial render for current die value
      const initialRoll = latestRollRef.current;
      animRef.current.triggerRoll(initialRoll.safeValue, false);

      const handleContextLost = (event: Event) => {
        event.preventDefault();
        setWebglFailed(true);
      };
      const handleContextRestored = () => {
        setWebglFailed(false);
        requestRender();
      };
      activeRenderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      activeRenderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const resizeObserver = new ResizeObserver((entries) => {
        if (disposed || !entries[0]) return;
        const rect = entries[0].contentRect;
        if (rect.width > 10 && rect.height > 10) {
          camera.aspect = rect.width / rect.height;
          camera.updateProjectionMatrix();
          activeRenderer.setSize(rect.width, rect.height, false);
          requestRender();
        }
      });
      resizeObserver.observe(mount);

      return () => {
        disposed = true;
        animCtrl.triggerRoll = null;
        window.cancelAnimationFrame(frameId);
        window.clearTimeout(frameId);
        resizeObserver.disconnect();
        activeRenderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        activeRenderer.domElement.removeEventListener(
          'webglcontextrestored',
          handleContextRestored,
        );
        dieGeom.dispose();
        trayGeom.dispose();
        ringGeom.dispose();
        shadowGeom.dispose();
        trayMat.dispose();
        ringMat.dispose();
        shadowMat.dispose();
        shadowTex.dispose();
        faceTextures.forEach((t) => t.dispose());
        dieMaterials.forEach((m) => m.dispose());
        envRT.dispose();
        activeRenderer.dispose();
      };
    } catch {
      window.setTimeout(() => {
        if (!disposed) setWebglFailed(true);
      }, 0);
      if (renderer) renderer.dispose();
    }
  }, [artStyle, compact, effectiveReducedMotion]);

  // Trigger roll animation cleanly when rollKey changes without recreating renderer
  const prevRollKeyRef = useRef(rollKey);
  useEffect(() => {
    if (prevRollKeyRef.current !== rollKey) {
      prevRollKeyRef.current = rollKey;
      animRef.current.triggerRoll?.(safeValue, !effectiveReducedMotion);
    }
  }, [rollKey, safeValue, effectiveReducedMotion]);

  const showFallback = webglFailed || effectiveReducedMotion;

  return (
    <div className="flex items-center gap-3">
      {/* 3D Dice Pedestal Stage */}
      <div
        className={`relative rounded-xl bg-[#0B1018] border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center ${
          compact ? 'w-[76px] h-[76px]' : 'w-[96px] h-[96px] sm:w-[104px] sm:h-[104px]'
        }`}
      >
        {!showFallback ? (
          <div ref={mountRef} className="w-full h-full" aria-hidden="true" />
        ) : (
          <div
            className="w-12 h-12 rounded-xl border-2 border-amber-400/70 bg-slate-900 flex items-center justify-center font-mono-tabular text-2xl font-black text-amber-300 shadow-inner"
            aria-label={`Dadu ${safeValue}`}
          >
            {value ?? '?'}
          </div>
        )}
      </div>

      {/* Clean Unboxed Roll Readout & Sound Toggle */}
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400">
            {value !== null ? 'Hasil Dadu 3D' : 'Dadu Siap'}
          </span>
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            aria-label={soundEnabled ? 'Matikan suara dadu' : 'Nyalakan suara dadu'}
            title={soundEnabled ? 'Suara dadu aktif' : 'Suara dadu mati'}
            className="p-1 rounded-md text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 transition-colors"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-amber-300" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        <div className="font-mono-tabular text-lg sm:text-xl font-black text-white leading-none">
          {value !== null ? (
            <span>
              {safeValue}
              {bonus > 0 ? (
                <span className="text-emerald-300 text-sm ml-1.5">+{bonus} bonus</span>
              ) : null}
            </span>
          ) : (
            <span className="text-slate-500 text-sm font-semibold">Menunggu lemparan</span>
          )}
        </div>

        {rollerName && (
          <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
            Oleh {rollerName}
          </p>
        )}
      </div>
    </div>
  );
}
