import React, { useEffect, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';

interface AvatarProps {
    url: string;
}

export const Avatar: React.FC<AvatarProps> = ({ url }) => {
    const [vrm, setVrm] = useState<VRM | null>(null);

    // Load file VRM menggunakan GLTFLoader bawaan Three.js
    const gltf = useLoader(GLTFLoader, url, (loader) => {
        // Daftarkan plugin VRM agar file .vrm bisa dibaca dengan benar
        loader.register((parser) => new VRMLoaderPlugin(parser));
    });

    useEffect(() => {
        if (gltf) {
            const vrmInstance = gltf.userData.vrm as VRM;
            setVrm(vrmInstance);

            // Memutar model 180 derajat agar menghadap ke kamera
            vrmInstance.scene.rotation.y = Math.PI;
        }
    }, [gltf]);

    // Loop animasi untuk update physics baju/rambut model VRM (SpringBone)
    useFrame((_, delta) => {
        if (vrm) {
            vrm.update(delta);
        }
    });

    // Tampilkan objek 3D di Canvas
    return vrm ? <primitive object={vrm.scene} /> : null;
};