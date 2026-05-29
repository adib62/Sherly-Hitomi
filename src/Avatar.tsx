import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

interface AvatarProps {
    url: string;
}

export const Avatar: React.FC<AvatarProps> = ({ url }) => {
    const [vrm, setVrm] = useState<VRM | null>(null);

    // Ref untuk animasi dan audio
    const blinkTimerRef = useRef(0);
    const lookAtTarget = useMemo(() => new THREE.Object3D(), []);

    // Ref khusus untuk ngebaca frekuensi suara (Lip-Sync)
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);

    const gltf = useLoader(GLTFLoader, url, (loader) => {
        loader.register((parser) => new VRMLoaderPlugin(parser));
    });

    useEffect(() => {
        // --- 1. SETUP KARAKTER VRM ---
        if (gltf) {
            const vrmInstance = gltf.userData.vrm as VRM;
            setVrm(vrmInstance);
            vrmInstance.scene.rotation.y = Math.PI;
            vrmInstance.scene.add(lookAtTarget);

            if (vrmInstance.lookAt) {
                vrmInstance.lookAt.target = lookAtTarget;
            }

            // Perbaikan Pose
            if (vrmInstance.humanoid) {
                const leftUpperArm = vrmInstance.humanoid.getNormalizedBoneNode('leftUpperArm');
                const rightUpperArm = vrmInstance.humanoid.getNormalizedBoneNode('rightUpperArm');
                if (leftUpperArm) { leftUpperArm.rotation.z = -1.2; leftUpperArm.rotation.x = 0.15; }
                if (rightUpperArm) { rightUpperArm.rotation.z = 1.2; rightUpperArm.rotation.x = 0.15; }
            }

            // Fix Transparansi & Outline
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

    useEffect(() => {
        // --- 2. SETUP MICROPHONE UNTUK LIP-SYNC ---
        let audioContext: AudioContext;

        const setupAudio = async () => {
            try {
                // Minta izin akses mic ke browser
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioContext = new window.AudioContext();

                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256; // Resolusi frekuensi

                const microphone = audioContext.createMediaStreamSource(stream);
                // Kita HANYA connect ke analyser buat baca data, JANGAN connect ke destination biar suara lu ga mantul (echo)
                microphone.connect(analyser);

                analyserRef.current = analyser;
                dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
            } catch (err) {
                console.error("Gagal akses mic (Mungkin belum diizinkan browser):", err);
            }
        };

        setupAudio();

        // Bersihkan mic kalau komponen ditutup
        return () => {
            if (audioContext) {
                audioContext.close();
            }
        };
    }, []);

    useFrame((state, delta) => {
        if (vrm) {
            vrm.update(delta);
            const time = state.clock.elapsedTime;

            // --- ANIMASI MATA & KEPALA ---
            const microSaccadeX = Math.sin(time * 0.8) * 0.04 + Math.cos(time * 2.3) * 0.015;
            const microSaccadeY = Math.cos(time * 0.6) * 0.03 + Math.sin(time * 1.9) * 0.01;
            const targetX = state.pointer.x * 2.0 + microSaccadeX;
            const targetY = 1.3 + (state.pointer.y * 1.0) + microSaccadeY;
            const targetZ = 2.0;

            lookAtTarget.position.x += (targetX - lookAtTarget.position.x) * 0.08;
            lookAtTarget.position.y += (targetY - lookAtTarget.position.y) * 0.08;
            lookAtTarget.position.z += (targetZ - lookAtTarget.position.z) * 0.08;

            // --- ANIMASI TUBUH (IDLE) ---
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

            // --- EKSPRESI WAJAH (KEDIP & LIP-SYNC) ---
            if (vrm.expressionManager) {
                // Logika Kedip Otomatis
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

                // Logika Lip-Sync dari Mic
                if (analyserRef.current && dataArrayRef.current) {
                    // Ambil data frekuensi suara saat ini
                    analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);

                    // Hitung rata-rata volume suara
                    let sum = 0;
                    for (let i = 0; i < dataArrayRef.current.length; i++) {
                        sum += dataArrayRef.current[i];
                    }
                    const averageVolume = sum / dataArrayRef.current.length;

                    // Konversi volume jadi seberapa lebar mulut mangap (0.0 sampai 1.0)
                    const volumeThreshold = 10; // Batas minimal suara (biar ga mangap pas ada noise kipas angin)
                    let mouthOpen = 0;

                    if (averageVolume > volumeThreshold) {
                        // 40 adalah angka sensitivitas, kecilin kalau mau mangapnya lebih lebar meski suara pelan
                        mouthOpen = (averageVolume - volumeThreshold) / 40;
                        if (mouthOpen > 1) mouthOpen = 1;
                    }

                    // Terapkan ke bentuk mulut 'aa' (mangap)
                    // Pake lerp (smoothing) sedikit biar mulutnya gak bergetar patah-patah
                    const currentAa = vrm.expressionManager.getValue('aa') || 0;
                    vrm.expressionManager.setValue('aa', currentAa + (mouthOpen - currentAa) * 0.3);
                }
            }
        }
    });

    return vrm ? <primitive object={vrm.scene} /> : null;
};