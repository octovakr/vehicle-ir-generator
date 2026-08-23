import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimulationConfig } from '../acoustic/types';
import { buildSceneContent, disposeObject3D } from './vehicleScene';

/**
 * 3D scene viewport (visualization only — contains no acoustic math).
 *
 * Coordinate mapping between simulation space and Three.js space:
 *   simulation x (width, 0=left)   → three.x, centered on the cabin
 *   simulation y (length, 0=front) → three.z, centered on the cabin
 *   simulation z (height, 0=floor) → three.y (up)
 */

export function Viewport3D({ config }: { config: SimulationConfig }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0f11);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    camera.position.set(4.2, 2.8, 5.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.8;
    controls.maxDistance = 25;
    controls.target.set(0, 0.55, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(4, 6, 3);
    const fill = new THREE.DirectionalLight(0xc5d0dc, 0.35);
    fill.position.set(-3, 2, -2);
    const cabinFill = new THREE.PointLight(0xfff4e8, 0.55, 8, 1.4);
    cabinFill.position.set(0, 1.1, 0);
    scene.add(ambient, key, fill, cabinFill);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    let disposed = false;
    const animate = (): void => {
      if (disposed) return;
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    const resize = (): void => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    animate();

    return () => {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const group = dynamicGroupRef.current;
    if (!group) return;
    disposeChildren(group);
    group.add(buildSceneContent(config));
  }, [config]);

  const namedVehicle = config.vehicleModelId !== 'rectangular';

  return (
    <div className="viewport" ref={containerRef}>
      <div className="viewport-legend">
        <div className="legend-row">
          <span className="item-dot source" /> Speech source
        </div>
        <div className="legend-row">
          <span className="item-dot mic" /> Microphone
        </div>
        {namedVehicle && (
          <div className="legend-row">
            <span className="item-dot interior" /> Seats / interior
          </div>
        )}
      </div>
      <div className="viewport-hint">Drag to rotate · Scroll to zoom · Right-drag to pan</div>
    </div>
  );
}

function disposeChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject3D(child);
  }
}
