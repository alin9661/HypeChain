import * as THREE from 'three'
import { periodicNoiseGLSL } from './utils'

// Function to generate equally distributed points on a plane
function getPlane(count: number, components: number, size: number = 512, scale: number = 1.0) {
  const length = count * components
  const data = new Float32Array(length)
  
  for (let i = 0; i < count; i++) {
    const i4 = i * components
    
    // Calculate grid position
    const x = (i % size) / (size - 1) // Normalize to [0, 1]
    const z = Math.floor(i / size) / (size - 1) // Normalize to [0, 1]
    
    // Convert to centered coordinates [-0.5, 0.5] and apply scale
    data[i4 + 0] = (x - 0.5) * 2 * scale // X position: scaled range
    data[i4 + 1] = 0 // Y position: flat plane at y=0
    data[i4 + 2] = (z - 0.5) * 2 * scale // Z position: scaled range
    data[i4 + 3] = 1.0 // W component (for RGBA texture)
  }
  
  return data
}

export class SimulationMaterial extends THREE.ShaderMaterial {
  constructor(scale: number = 10.0) {
    const positionsTexture = new THREE.DataTexture(getPlane(512 * 512, 4, 512, scale), 512, 512, THREE.RGBAFormat, THREE.FloatType)
    positionsTexture.needsUpdate = true

    super({
      vertexShader: /* glsl */`varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
      fragmentShader: /* glsl */`uniform sampler2D positions;
      uniform float uTime;
      uniform float uNoiseScale;
      uniform float uNoiseIntensity;
      uniform float uTimeScale;
      uniform float uLoopPeriod;
      uniform float uRippleProgress;
      uniform float uRippleAmplitude;
      uniform float uPlaneExtent;
      varying vec2 vUv;

      ${periodicNoiseGLSL}

      void main() {
        // Get the original particle position
        vec3 originalPos = texture2D(positions, vUv).rgb;

        // Use continuous time that naturally loops through sine/cosine periodicity
        float continuousTime = uTime * uTimeScale * (6.28318530718 / uLoopPeriod);
        // float continuousTime = 0.0;

        // Scale position for noise input
        vec3 noiseInput = originalPos * uNoiseScale;

        // Generate periodic displacement for each axis using different phase offsets
        float displacementX = periodicNoise(noiseInput + vec3(0.0, 0.0, 0.0), continuousTime);
        float displacementY = periodicNoise(noiseInput + vec3(50.0, 0.0, 0.0), continuousTime + 2.094); // +120°
        float displacementZ = periodicNoise(noiseInput + vec3(0.0, 50.0, 0.0), continuousTime + 4.188); // +240°

        // Apply distortion to original position
        vec3 distortion = vec3(displacementX, displacementY, displacementZ) * uNoiseIntensity;
        vec3 finalPos = originalPos + distortion;

        // Directional wave packet — a few oscillation cycles under a gaussian
        // envelope sweeping monotonically +x; never reverts. Fired by the
        // Connect Wallet click (uRippleProgress ramps 0→1 over rippleDuration).
        if (uRippleProgress > 0.0 && uRippleProgress < 1.0) {
          float frontX = mix(-uPlaneExtent, uPlaneExtent + 3.0, uRippleProgress);
          float d = originalPos.x - frontX;
          float width = 3.4;
          float env = exp(-(d * d) / (width * width * 0.5));
          float carrier = sin(d * 2.4);
          float decay = 1.0 - 0.35 * uRippleProgress;
          finalPos.y += env * carrier * decay * uRippleAmplitude;
        }

        gl_FragColor = vec4(finalPos, 1.0);
      }`,
      uniforms: {
        positions: { value: positionsTexture },
        uTime: { value: 0 },
        uNoiseScale: { value: 1.0 },
        uNoiseIntensity: { value: 0.5 },
        uTimeScale: { value: 1 },
        uLoopPeriod: { value: 24.0 },
        uRippleProgress: { value: 0 },
        uRippleAmplitude: { value: 0.9 },
        uPlaneExtent: { value: scale }
      }
    })
  }
}
