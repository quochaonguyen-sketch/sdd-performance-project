"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Nova3DBotProps {
  size?: number;
  className?: string;
  isWaving?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

export function Nova3DBot({
  size = 64,
  className = "",
  isWaving = true,
  interactive = true,
  onClick,
}: Nova3DBotProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const isHoveredRef = useRef(false);
  const clickWaveRef = useRef(0);

  useEffect(() => {
    isHoveredRef.current = isHovered;
  }, [isHovered]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.set(0, 0.1, 4.2);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0); // 100% transparent background
    container.appendChild(renderer.domElement);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    const cyanRim = new THREE.DirectionalLight(0x22d3ee, 2.8);
    cyanRim.position.set(-3, -2, -2);
    scene.add(cyanRim);

    const topFill = new THREE.PointLight(0x60a5fa, 1.8, 10);
    topFill.position.set(0, 3, 2);
    scene.add(topFill);

    // --- Robot Materials ---
    // Pearlescent porcelain white body
    const whiteBodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.12,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    });

    // Dark sleek visor face
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x070b14,
      roughness: 0.08,
      metalness: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    });

    // Glowing cyan eyes & lights
    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 2.5,
      roughness: 0.1,
    });

    // Soft blue accents
    const blueAccentMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.3,
      metalness: 0.3,
    });

    // --- Robot Group ---
    const robotGroup = new THREE.Group();
    scene.add(robotGroup);

    // 1. Torso (plump round cute capsule)
    const torsoGeo = new THREE.SphereGeometry(0.55, 32, 32);
    torsoGeo.scale(1, 1.15, 0.95);
    const torsoMesh = new THREE.Mesh(torsoGeo, whiteBodyMat);
    torsoMesh.position.y = -0.25;
    robotGroup.add(torsoMesh);

    // 2. Chest Emblem (Nova 4-pointed glowing star)
    const starGroup = new THREE.Group();
    starGroup.position.set(0, -0.15, 0.52);

    const starVGeo = new THREE.BoxGeometry(0.06, 0.22, 0.03);
    const starHGeo = new THREE.BoxGeometry(0.22, 0.06, 0.03);
    const starCoreGeo = new THREE.SphereGeometry(0.07, 16, 16);

    const starV = new THREE.Mesh(starVGeo, cyanGlowMat);
    const starH = new THREE.Mesh(starHGeo, cyanGlowMat);
    const starCore = new THREE.Mesh(starCoreGeo, cyanGlowMat);
    starGroup.add(starV);
    starGroup.add(starH);
    starGroup.add(starCore);
    robotGroup.add(starGroup);

    // 3. Head (large cute round head with slight tilt)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.48, 0);
    robotGroup.add(headGroup);

    const headGeo = new THREE.SphereGeometry(0.58, 32, 32);
    headGeo.scale(1.08, 0.98, 1);
    const headMesh = new THREE.Mesh(headGeo, whiteBodyMat);
    headGroup.add(headMesh);

    // 4. Curved Visor Face
    const visorGeo = new THREE.SphereGeometry(0.5, 32, 24, 0, Math.PI, 0, Math.PI * 0.55);
    visorGeo.scale(1.02, 0.88, 0.92);
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.rotation.x = Math.PI * 0.15;
    visorMesh.position.set(0, 0.02, 0.12);
    headGroup.add(visorMesh);

    // 5. Digital Glowing Eyes (large expressive cartoon ovals)
    const eyesGroup = new THREE.Group();
    eyesGroup.position.set(0, 0.04, 0.56);
    headGroup.add(eyesGroup);

    const eyeGeo = new THREE.CapsuleGeometry(0.075, 0.08, 12, 16);
    eyeGeo.rotateZ(Math.PI * 0.05);

    const leftEye = new THREE.Mesh(eyeGeo, cyanGlowMat);
    leftEye.position.set(-0.21, 0, 0);
    eyesGroup.add(leftEye);

    const rightEyeGeo = eyeGeo.clone();
    rightEyeGeo.rotateZ(-Math.PI * 0.1);
    const rightEye = new THREE.Mesh(rightEyeGeo, cyanGlowMat);
    rightEye.position.set(0.21, 0, 0);
    eyesGroup.add(rightEye);

    // 6. Cute Head Antenna Ears
    const earGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.07, 16);
    earGeo.rotateZ(Math.PI / 2);
    const leftEar = new THREE.Mesh(earGeo, blueAccentMat);
    leftEar.position.set(-0.64, 0.02, 0);
    headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, blueAccentMat);
    rightEar.position.set(0.64, 0.02, 0);
    headGroup.add(rightEar);

    // 7. Left Floating Magnetic Arm
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.68, -0.15, 0);
    robotGroup.add(leftArmGroup);

    const armGeo = new THREE.SphereGeometry(0.16, 20, 20);
    armGeo.scale(0.85, 1.25, 0.85);
    const leftArmMesh = new THREE.Mesh(armGeo, whiteBodyMat);
    leftArmGroup.add(leftArmMesh);

    // 8. Right Floating Waving Arm
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.68, -0.15, 0);
    robotGroup.add(rightArmGroup);

    const rightArmMesh = new THREE.Mesh(armGeo, whiteBodyMat);
    rightArmMesh.position.y = 0.1;
    rightArmGroup.add(rightArmMesh);

    // Cute magnetic floating hand with waving fingers
    const handGroup = new THREE.Group();
    handGroup.position.set(0, 0.28, 0);
    rightArmGroup.add(handGroup);

    const palmGeo = new THREE.SphereGeometry(0.11, 16, 16);
    const palmMesh = new THREE.Mesh(palmGeo, whiteBodyMat);
    handGroup.add(palmMesh);

    const fingerGeo = new THREE.SphereGeometry(0.045, 12, 12);
    [-0.06, 0, 0.06].forEach((fx, i) => {
      const finger = new THREE.Mesh(fingerGeo, cyanGlowMat);
      finger.position.set(fx, 0.1 + (i === 1 ? 0.02 : 0), 0);
      handGroup.add(finger);
    });

    // 9. Base Anti-Gravity Glow Ring
    const ringGeo = new THREE.TorusGeometry(0.35, 0.035, 16, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ringMesh = new THREE.Mesh(ringGeo, cyanGlowMat);
    ringMesh.position.set(0, -0.85, 0);
    robotGroup.add(ringMesh);

    // --- Interactive Mouse Tracking ---
    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0;
    let targetRotY = 0;

    const handlePointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - (rect.left + rect.width / 2);
      const clientY = e.clientY - (rect.top + rect.height / 2);
      mouseX = (clientX / window.innerWidth) * 2;
      mouseY = (clientY / window.innerHeight) * 2;
    };

    window.addEventListener("pointermove", handlePointerMove);

    // --- Animation Loop ---
    let animationFrameId: number;
    let blinkTimer = 0;
    let isBlinking = false;
    let blinkProgress = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // 1. Floating Levitation (Breathing)
      const floatY = Math.sin(elapsed * 2.4) * 0.08;
      robotGroup.position.y = floatY;

      // 2. Mouse Tracking & Gentle Sway
      targetRotY = mouseX * 0.45 + (isHoveredRef.current ? Math.sin(elapsed * 4) * 0.1 : 0);
      targetRotX = -mouseY * 0.25;

      robotGroup.rotation.y += (targetRotY - robotGroup.rotation.y) * 0.08;
      robotGroup.rotation.x += (targetRotX - robotGroup.rotation.x) * 0.08;
      robotGroup.rotation.z = Math.sin(elapsed * 1.8) * 0.03;

      // 3. Head Independent Tilt
      headGroup.rotation.y = Math.sin(elapsed * 1.2) * 0.06;
      headGroup.rotation.z = -Math.sin(elapsed * 1.5) * 0.03;

      // 4. Waving Animation (Right Arm)
      if (isWaving) {
        const waveSpeed = isHoveredRef.current || clickWaveRef.current > 0 ? 10 : 5.5;
        const waveAngle = Math.sin(elapsed * waveSpeed) * 0.42;

        rightArmGroup.position.y = 0.08 + Math.sin(elapsed * 2.4) * 0.04;
        rightArmGroup.rotation.z = 0.75 + waveAngle;
        handGroup.rotation.z = waveAngle * 0.6;
        handGroup.rotation.y = Math.cos(elapsed * waveSpeed) * 0.25;
      } else {
        rightArmGroup.position.y = -0.15 + Math.sin(elapsed * 2.4) * 0.02;
        rightArmGroup.rotation.z = -0.15;
      }

      // 5. Left Arm Subtle Idle Sway
      leftArmGroup.position.y = -0.15 - Math.sin(elapsed * 2.4) * 0.02;
      leftArmGroup.rotation.z = 0.15 + Math.sin(elapsed * 2.4) * 0.05;

      // 6. Chest Star & Ring Pulse
      const pulse = 1.8 + Math.sin(elapsed * 4) * 0.7;
      cyanGlowMat.emissiveIntensity = pulse;
      ringMesh.scale.setScalar(0.95 + Math.sin(elapsed * 3) * 0.08);

      // 7. Eye Blinking Logic
      blinkTimer += 0.016;
      if (!isBlinking && blinkTimer > 3.5 && Math.random() < 0.04) {
        isBlinking = true;
        blinkTimer = 0;
        blinkProgress = 0;
      }

      if (isBlinking) {
        blinkProgress += 0.14;
        const scaleY = Math.max(0.08, Math.abs(Math.cos(blinkProgress * Math.PI)));
        eyesGroup.scale.y = scaleY;
        if (blinkProgress >= 1) {
          isBlinking = false;
          eyesGroup.scale.y = 1;
        }
      }

      // 8. Click wave cooldown
      if (clickWaveRef.current > 0) {
        clickWaveRef.current -= 0.016;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("pointermove", handlePointerMove);
      renderer.dispose();
      whiteBodyMat.dispose();
      visorMat.dispose();
      cyanGlowMat.dispose();
      blueAccentMat.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size, isWaving, interactive]);

  const handleClick = () => {
    clickWaveRef.current = 1.5;
    onClick?.();
  };

  return (
    <div
      ref={containerRef}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative inline-flex items-center justify-center select-none overflow-visible cursor-pointer ${className}`}
      style={{ width: size, height: size }}
      aria-label="Nova 3D AI Robot"
    />
  );
}
