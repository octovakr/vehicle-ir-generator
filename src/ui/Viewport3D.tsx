import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimulationConfig } from '../acoustic/types';

/**
 * 3D scene viewport (visualization only — contains no acoustic math).
 *
 * Coordinate mapping between simulation space and Three.js space:
 *   simulation x (width, 0=left)   → three.x, centered on the room
 *   simulation y (length, 0=front) → three.z, centered on the room
 *   simulation z (height, 0=floor) → three.y (up)
 */

const SOURCE_COLOR = 0xe0964f;
const MIC_COLOR = 0x58a6ff;
const ROOM_EDGE_COLOR = 0x4a4f58;
const ROOM_FACE_COLOR = 0x1b1e23;
const FLOOR_GRID_COLOR = 0x2a2e35;

export function Viewport3D({ config }: { config: SimulationConfig }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);

  // One-time scene / renderer / camera / controls setup.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0f11);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    camera.position.set(3.2, 2.6, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.8;
    controls.maxDistance = 25;
    controls.target.set(0, 0.5, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const directional = new THREE.DirectionalLight(0xffffff, 1.2);
    directional.position.set(4, 6, 3);
    scene.add(ambient, directional);

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

  // Rebuild the dynamic content (room + markers) whenever the config changes.
  useEffect(() => {
    const group = dynamicGroupRef.current;
    if (!group) return;

    disposeChildren(group);

    const { widthMeters: W, lengthMeters: L, heightMeters: H } = config.vehicle;
    const toThree = (x: number, y: number, z: number): THREE.Vector3 =>
      new THREE.Vector3(x - W / 2, z, y - L / 2);

    // Room shell: translucent faces + edge lines.
    const boxGeometry = new THREE.BoxGeometry(W, H, L);
    const faces = new THREE.Mesh(
      boxGeometry,
      new THREE.MeshStandardMaterial({
        color: ROOM_FACE_COLOR,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    faces.position.set(0, H / 2, 0);
    group.add(faces);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeometry),
      new THREE.LineBasicMaterial({ color: ROOM_EDGE_COLOR }),
    );
    edges.position.set(0, H / 2, 0);
    group.add(edges);

    // Floor grid for spatial orientation.
    const grid = new THREE.GridHelper(
      Math.max(W, L),
      Math.round(Math.max(W, L) * 4),
      FLOOR_GRID_COLOR,
      FLOOR_GRID_COLOR,
    );
    grid.position.y = 0.001;
    group.add(grid);

    // Front-of-vehicle indicator (small arrow on the floor pointing to y=0).
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0.02, -L / 2 + 0.28),
      0.25,
      0x6b7078,
      0.09,
      0.05,
    );
    group.add(arrow);

    // Source markers: spheres.
    for (const source of config.sources) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 20, 20),
        new THREE.MeshStandardMaterial({
          color: SOURCE_COLOR,
          transparent: !source.enabled,
          opacity: source.enabled ? 1 : 0.3,
        }),
      );
      marker.position.copy(toThree(source.position.x, source.position.y, source.position.z));
      group.add(marker);
      group.add(makeLabelSprite(source.label, marker.position, '#e0964f'));
    }

    // Microphone markers: octahedra (visually distinct from sources).
    for (const microphone of config.microphones) {
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.05),
        new THREE.MeshStandardMaterial({
          color: MIC_COLOR,
          transparent: !microphone.enabled,
          opacity: microphone.enabled ? 1 : 0.3,
        }),
      );
      marker.position.copy(
        toThree(microphone.position.x, microphone.position.y, microphone.position.z),
      );
      group.add(marker);
      group.add(makeLabelSprite(microphone.label, marker.position, '#58a6ff'));
    }
  }, [config]);

  return (
    <div className="viewport" ref={containerRef}>
      <div className="viewport-legend">
        <div className="legend-row">
          <span className="item-dot source" /> Speech source
        </div>
        <div className="legend-row">
          <span className="item-dot mic" /> Microphone
        </div>
      </div>
      <div className="viewport-hint">Drag to rotate · Scroll to zoom · Right-drag to pan</div>
    </div>
  );
}

/** Small billboard text label rendered onto a canvas texture. */
function makeLabelSprite(text: string, position: THREE.Vector3, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const scale = 4;
  const font = `${11 * scale}px Inter, sans-serif`;
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  canvas.width = Math.ceil(textWidth + 8 * scale);
  canvas.height = 18 * scale;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4 * scale, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  const worldHeight = 0.09;
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1);
  sprite.position.copy(position).add(new THREE.Vector3(0, 0.1, 0));
  return sprite;
}

function disposeChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
        node.geometry.dispose();
        const material = node.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
      if (node instanceof THREE.Sprite) {
        node.material.map?.dispose();
        node.material.dispose();
      }
    });
  }
}
