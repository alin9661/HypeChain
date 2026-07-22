import * as THREE from "three";
import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal, useFrame } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";

import { DofPointsMaterial } from "./shaders/pointMaterial";
import { SimulationMaterial } from "./shaders/simulationMaterial";
import * as easing from "maath/easing";

export function Particles({
  speed,
  aperture,
  focus,
  size = 512,
  noiseScale = 1.0,
  noiseIntensity = 0.5,
  timeScale = 0.5,
  pointSize = 2.0,
  opacity = 1.0,
  planeScale = 1.0,
  useManualTime = false,
  manualTime = 0,
  introspect = false,
  rippleNonce = 0,
  ...props
}: {
  speed: number;
  // fov: number
  aperture: number;
  focus: number;
  size: number;
  noiseScale?: number;
  noiseIntensity?: number;
  timeScale?: number;
  pointSize?: number;
  opacity?: number;
  planeScale?: number;
  useManualTime?: boolean;
  manualTime?: number;
  introspect?: boolean;
  /** Increment to fire a one-shot directional wave-packet ripple. */
  rippleNonce?: number;
}) {
  // Reveal animation state
  const revealStartTime = useRef<number | null>(null);
  const [isRevealing, setIsRevealing] = useState(true);
  const revealDuration = 3.5; // seconds

  // Wallet-connect ripple (directional wave packet) + ambient engagement effects
  const rippleStartTime = useRef<number | null>(null);
  const pendingRipple = useRef(false);
  const rippleDuration = 3.0; // seconds for the wavefront to cross
  const idleNudge = useRef(0);     // E2 — idle-pulse contribution to uTransition
  const clockNudge = useRef(0);    // E6 — intake-clock heartbeat contribution
  const lastActivity = useRef(0);  // wall-clock ms of last pointer/key activity
  const reducedMotion = useRef(false);
  // E4 — captured once from the live scene camera so parallax offsets from
  // whatever <Canvas camera> set, not a hardcoded duplicate of index.tsx.
  const cameraBase = useRef<{ x: number; y: number; z: number } | null>(null);
  // Create simulation material with scale parameter
  const simulationMaterial = useMemo(() => {
    return new SimulationMaterial(planeScale);
  }, [planeScale]);

  const target = useFBO(size, size, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
  });

  const dofPointsMaterial = useMemo(() => {
    const m = new DofPointsMaterial();
    m.uniforms.positions.value = target.texture;
    m.uniforms.initialPositions.value =
      simulationMaterial.uniforms.positions.value;
    return m;
  }, [simulationMaterial]);

  const [scene] = useState(() => new THREE.Scene());
  const [camera] = useState(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 1 / Math.pow(2, 53), 1)
  );
  const [positions] = useState(
    () =>
      new Float32Array([
        -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0,
      ])
  );
  const [uvs] = useState(
    () => new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0])
  );

  const particles = useMemo(() => {
    const length = size * size;
    const particles = new Float32Array(length * 3);
    for (let i = 0; i < length; i++) {
      const i3 = i * 3;
      particles[i3 + 0] = (i % size) / size;
      particles[i3 + 1] = i / size / size;
    }
    return particles;
  }, [size]);

  // Fire the directional ripple when rippleNonce increments (Connect Wallet click).
  useEffect(() => {
    if (rippleNonce > 0 && !reducedMotion.current) pendingRipple.current = true;
  }, [rippleNonce]);

  // E2 idle pulse + E6 intake-clock heartbeat — both feed uTransition nudges.
  // Wall-clock driven; the scalar nudges are read in useFrame (no clock mixing).
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Track prefers-reduced-motion live so an OS toggle mid-session is honored.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = mq.matches;
    const onMQ = (e: MediaQueryListEvent) => {
      reducedMotion.current = e.matches;
    };
    mq.addEventListener("change", onMQ);

    const markActivity = () => {
      lastActivity.current = performance.now();
    };
    window.addEventListener("pointermove", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    lastActivity.current = performance.now();

    const interval = window.setInterval(() => {
      if (reducedMotion.current) return; // respect a live reduced-motion toggle
      // E6 — 1Hz heartbeat, brighter on the top-of-minute
      clockNudge.current = new Date().getSeconds() === 0 ? 0.18 : 0.06;
      window.setTimeout(() => {
        clockNudge.current = 0;
      }, 150);
      // E2 — idle pulse after 8s of no pointer / key activity
      if (performance.now() - lastActivity.current > 8000) {
        idleNudge.current = 0.3;
        window.setTimeout(() => {
          idleNudge.current = 0;
        }, 900);
      }
    }, 1000);

    return () => {
      mq.removeEventListener("change", onMQ);
      window.removeEventListener("pointermove", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.clearInterval(interval);
    };
  }, []);

  useFrame((state, delta) => {
    if (!dofPointsMaterial || !simulationMaterial) return;

    state.gl.setRenderTarget(target);
    state.gl.clear();
    // @ts-ignore
    state.gl.render(scene, camera);
    state.gl.setRenderTarget(null);

    // Use manual time if enabled, otherwise use elapsed time
    const currentTime = useManualTime ? manualTime : state.clock.elapsedTime;

    // Initialize reveal start time on first frame
    if (revealStartTime.current === null) {
      revealStartTime.current = currentTime;
    }

    // Directional ripple — start on the next frame after a Connect Wallet click,
    // then advance progress 0→1 over rippleDuration and feed the sim shader.
    if (pendingRipple.current) {
      rippleStartTime.current = currentTime;
      pendingRipple.current = false;
    }
    let rippleProgress = 0;
    if (rippleStartTime.current !== null) {
      rippleProgress = (currentTime - rippleStartTime.current) / rippleDuration;
      if (rippleProgress >= 1.0) {
        rippleProgress = 0;
        rippleStartTime.current = null;
      }
    }
    simulationMaterial.uniforms.uRippleProgress.value = rippleProgress;

    // Calculate reveal progress
    const revealElapsed = currentTime - revealStartTime.current;
    const revealProgress = Math.min(revealElapsed / revealDuration, 1.0);

    // Ease out the reveal animation
    const easedProgress = 1 - Math.pow(1 - revealProgress, 3);

    // Map progress to reveal factor (0 = fully hidden, higher values = more revealed)
    // We want to start from center (0) and expand outward (higher values)
    const revealFactor = easedProgress * 4.0; // Doubled the radius for larger coverage

    if (revealProgress >= 1.0 && isRevealing) {
      setIsRevealing(false);
    }

    dofPointsMaterial.uniforms.uTime.value = currentTime;

    dofPointsMaterial.uniforms.uFocus.value = focus;
    // DoF blur eases off as the morph completes — the field comes into
    // focus as specimens formalize. Kept mild (25%): uBlur doubles as the
    // point-size term in the vertex shader, so cutting it harder would
    // cancel the 60% morph swell. Reads the damped value from the frame
    // loop below (one frame of lag, imperceptible).
    dofPointsMaterial.uniforms.uBlur.value =
      aperture * (1.0 - 0.25 * dofPointsMaterial.uniforms.uShapeMorph.value);

    // Hover introspect (production) generalized: when not hovering, the idle
    // pulse + intake-clock heartbeat nudge uTransition too. Asymmetric smooth
    // time — slower easing in (0.35s), faster out (0.2s).
    const transitionTarget = introspect
      ? 1.0
      : Math.max(idleNudge.current, clockNudge.current);
    const transitionRising =
      transitionTarget > dofPointsMaterial.uniforms.uTransition.value;
    easing.damp(
      dofPointsMaterial.uniforms.uTransition,
      "value",
      transitionTarget,
      transitionRising ? 0.35 : 0.2,
      delta
    );

    // Scroll morph — circle → chamfered octagon as the hero scrolls away.
    // Read scrollY directly each frame (a stored value, no layout forced);
    // fully converted by ~85% of one viewport of scroll. Reduced motion
    // pins the field to circles.
    const morphTarget = reducedMotion.current
      ? 0
      : Math.min(Math.max(window.scrollY / (window.innerHeight * 0.85), 0), 1);
    easing.damp(
      dofPointsMaterial.uniforms.uShapeMorph,
      "value",
      morphTarget,
      0.25,
      delta
    );
    if (process.env.NODE_ENV !== "production") {
      // QA probe: `__hcMorph` in the console reports the live morph value.
      // Absent → the tab is running a stale bundle without the morph code.
      (window as unknown as { __hcMorph?: number }).__hcMorph =
        dofPointsMaterial.uniforms.uShapeMorph.value;
    }

    simulationMaterial.uniforms.uTime.value = currentTime;
    simulationMaterial.uniforms.uNoiseScale.value = noiseScale;
    simulationMaterial.uniforms.uNoiseIntensity.value = noiseIntensity;
    simulationMaterial.uniforms.uTimeScale.value = timeScale * speed;

    // Update point material uniforms
    dofPointsMaterial.uniforms.uPointSize.value = pointSize;
    dofPointsMaterial.uniforms.uOpacity.value = opacity;
    dofPointsMaterial.uniforms.uRevealFactor.value = revealFactor;
    dofPointsMaterial.uniforms.uRevealProgress.value = easedProgress;

    // E4 — cursor parallax: offset the scene camera toward the pointer
    // (state.pointer is normalized -1..1) while keeping it aimed at the origin.
    // Base position is captured once from the live camera, so this stays
    // correct if <Canvas camera> is ever retuned.
    if (!reducedMotion.current) {
      if (cameraBase.current === null) {
        cameraBase.current = {
          x: state.camera.position.x,
          y: state.camera.position.y,
          z: state.camera.position.z,
        };
      }
      const base = cameraBase.current;
      state.camera.position.set(
        base.x + state.pointer.x * 0.12,
        base.y + state.pointer.y * 0.08,
        base.z
      );
      state.camera.lookAt(0, 0, 0);
    }
  });

  return (
    <>
      {createPortal(
        // @ts-ignore
        <mesh material={simulationMaterial}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[positions, 3]}
            />
            <bufferAttribute attach="attributes-uv" args={[uvs, 2]} />
          </bufferGeometry>
        </mesh>,
        // @ts-ignore
        scene
      )}
      {/* @ts-ignore */}
      <points material={dofPointsMaterial} {...props}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
      </points>

      {/* Plane showing simulation texture */}
      {/* <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={target.texture} />
      </mesh> */}
    </>
  );
}
