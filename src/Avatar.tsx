import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

interface AvatarProps {
    url: string;
    analyser: AnalyserNode | null; // <--- SEKARANG TERIMA ANALYSER DARI PARENT (App.tsx)
}

export const Avatar: React.FC<AvatarProps> = ({ url, analyser }) => {
    const [vrm, setVrm] = useState<VRM | null>(null);

    // Timer buat kedip
    const blinkTimerRef = useRef(0);

    // Bikin titik "target" 3D kasat mata buat dilirik sama model
    const lookAtTarget = useMemo(() => new THREE.Object3D(), []);

    const gltf = useLoader(GLTFLoader, url, (loader) => {
        loader.register((parser) => new VRMLoaderPlugin(parser));
    });

    useEffect(() => {
        if (gltf) {
            const vrmInstance = gltf.userData.vrm as VRM;
            setVrm(vrmInstance);

            // Hadap kamera
            vrmInstance.scene.rotation.y = Math.PI;

            // Tambahkan lookAtTarget ke scene VRM agar posisinya berada di koordinat lokal model
            vrmInstance.scene.add(lookAtTarget);

            // Kasih tau model buat ngeliatin si "target kasat mata"
            if (vrmInstance.lookAt) {
                vrmInstance.lookAt.target = lookAtTarget;
            }

            // --- PERBAIKAN POSE: TANGAN TURUN REALISTIS ---
            if (vrmInstance.humanoid) {
                const leftUpperArm = vrmInstance.humanoid.getNormalizedBoneNode('leftUpperArm');
                const rightUpperArm = vrmInstance.humanoid.getNormalizedBoneNode('rightUpperArm');

                if (leftUpperArm) { leftUpperArm.rotation.z = -1.2; leftUpperArm.rotation.x = 0.15; }
                if (rightUpperArm) { rightUpperArm.rotation.z = 1.2; rightUpperArm.rotation.x = 0.15; }
            }

            // --- MATIKAN OUTLINE MTOON, FIX TRANSPARANSI, & FIX FRUSTUM CULLING ---
            vrmInstance.scene.traverse((object) => {
                if ((object as any).isMesh || (object as any).isSkinnedMesh) {
                    const mesh = object as THREE.Mesh;
                    mesh.frustumCulled = false;

                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    materials.forEach((material) => {
                        if (material) {
                            if ('outlineWidthMode' in material) {
                                (material as any).outlineWidthMode = 'none';
                            }
                            const matName = material.name.toLowerCase();
                            if (material.transparent && (matName.includes('glass') || matName.includes('lens') || matName.includes('eyewear'))) {
                                material.depthWrite = false;
                            }
                            material.needsUpdate = true;
                        }
                    });
                }
            });
        }
    }, [gltf, lookAtTarget]);

    // state: bawaan useFrame buat ngambil info kamera dan kursor mouse
    useFrame((state, delta) => {
        if (vrm) {
            // 1. Update fisika rambut & baju
            vrm.update(delta);

            // 2. Update posisi target ngikutin kursor mouse dengan smoothing (lerp) & micro-saccades
            const time = state.clock.elapsedTime;
            const microSaccadeX = Math.sin(time * 0.8) * 0.04 + Math.cos(time * 2.3) * 0.015;
            const microSaccadeY = Math.cos(time * 0.6) * 0.03 + Math.sin(time * 1.9) * 0.01;

            const targetX = state.pointer.x * 2.0 + microSaccadeX;
            const targetY = 1.3 + (state.pointer.y * 1.0) + microSaccadeY;
            const targetZ = 2.0;

            lookAtTarget.position.x += (targetX - lookAtTarget.position.x) * 0.08;
            lookAtTarget.position.y += (targetY - lookAtTarget.position.y) * 0.08;
            lookAtTarget.position.z += (targetZ - lookAtTarget.position.z) * 0.08;

            // --- ANIMASI IDLE REALISTIS (BERNAPAS & AYUNAN TUBUH ORGANIK) ---
            if (vrm.humanoid) {
                const breath = Math.sin(time * 1.4);
                const chest = vrm.humanoid.getNormalizedBoneNode('chest');
                const spine = vrm.humanoid.getNormalizedBoneNode('spine');
                const hips = vrm.humanoid.getNormalizedBoneNode('hips');
                const neck = vrm.humanoid.getNormalizedBoneNode('neck');
                const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
                const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');

                if (chest) { chest.rotation.x = breath * 0.012 + Math.sin(time * 0.25) * 0.003; chest.rotation.z = Math.cos(time * 0.5) * 0.004; }
                if (spine) { spine.rotation.x = breath * 0.005; spine.rotation.y = Math.sin(time * 0.3) * 0.005; }
                if (hips) { hips.position.y = breath * 0.004; hips.rotation.y = Math.sin(time * 0.4) * 0.01; hips.rotation.z = Math.cos(time * 0.3) * 0.004; }
                if (neck) { neck.rotation.x = breath * 0.003 + Math.sin(time * 0.8) * 0.006; neck.rotation.y = Math.cos(time * 0.4) * 0.008; neck.rotation.z = Math.sin(time * 0.6) * 0.005; }
                if (leftUpperArm) { leftUpperArm.rotation.z = -1.2 + breath * 0.01 + Math.sin(time * 0.45) * 0.005; leftUpperArm.rotation.x = 0.15 + Math.cos(time * 0.3) * 0.01; }
                if (rightUpperArm) { rightUpperArm.rotation.z = 1.2 - breath * 0.01 - Math.sin(time * 0.45) * 0.005; rightUpperArm.rotation.x = 0.15 + Math.cos(time * 0.3) * 0.01; }
            }

            // 3. Logika Kedip Otomatis & LIP-SYNC DARI API
            if (vrm.expressionManager) {
                // Kedip
                blinkTimerRef.current += delta;
                if (blinkTimerRef.current > 4.0) {
                    const blinkProgress = blinkTimerRef.current - 4.0;
                    if (blinkProgress < 0.1) {
                        vrm.expressionManager.setValue('blink', blinkProgress / 0.1);
                    } else if (blinkProgress < 0.2) {
                        vrm.expressionManager.setValue('blink', 1.0 - ((blinkProgress - 0.1) / 0.1));
                    } else {
                        vrm.expressionManager.setValue('blink', 0);
                        blinkTimerRef.current = 0;
                    }
                }

                // --- SINKRONISASI MULUT JAWABAN API JIKA ADA AUDIO YANG DIPUTAR ---
                if (analyser) {
                    const currentDataArray = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(currentDataArray);

                    let sum = 0;
                    for (let i = 0; i < currentDataArray.length; i++) {
                        sum += currentDataArray[i];
                    }
                    const averageVolume = sum / currentDataArray.length;

                    const volumeThreshold = 5; // Lebih kecil karena suara ElevenLabs sangat bersih tanpa noise mic
                    let mouthOpen = 0;

                    if (averageVolume > volumeThreshold) {
                        mouthOpen = (averageVolume - volumeThreshold) / 30; // Sensitivitas pemicu mangap
                        if (mouthOpen > 1) mouthOpen = 1;
                    }

                    const currentAaVal = vrm.expressionManager.getValue('aa') || 0;
                    // Interpolasi 0.4 agar gerakan membuka mulut lebih instan mengikuti ketukan suara digital
                    vrm.expressionManager.setValue('aa', currentAaVal + (mouthOpen - currentAaVal) * 0.4);
                } else {
                    // Pastikan mulut langsung mingkem kalau audio selesai/tidak ada
                    const currentAaVal = vrm.expressionManager.getValue('aa') || 0;
                    vrm.expressionManager.setValue('aa', currentAaVal + (0 - currentAaVal) * 0.2);
                }
            }
        }
    });

    return vrm ? <primitive object={vrm.scene} /> : null;
};