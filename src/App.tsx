import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Avatar } from './Avatar';

function App() {
  return (
    // Bikin background full screen warna abu-abu gelap
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1a1a1a' }}>

      {/* Panggung Utama 3D (Canvas) */}
      <Canvas camera={{ position: [0, 1.3, 1.5], fov: 40, near: 0.01 }}>

        {/* Lampu Ruangan (Biar karakternya terang merata) */}
        <ambientLight intensity={1.5} />
        <directionalLight position={[1, 2, 3]} intensity={1.5} />

        {/* Panggil Model VRM Lu di Sini */}
        {/* GANTI '/sherly.vrm' sesuai dengan nama file lu di folder public! */}
        <Avatar url="/SherlyHitomi_.vrm" />

        {/* Fitur biar lu bisa putar-putar kamera pake mouse */}
        <OrbitControls target={[0, 1.3, 0]} />

      </Canvas>
    </div>
  );
}

export default App;