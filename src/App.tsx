import React, { useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Avatar } from './Avatar'; // Sesuaikan lokasi file Avatar.tsx lu

function App() {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Ref Web Audio API untuk memproses suara AI
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // 1. Mulai Rekam Suara User
  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        sendAudioToBackend(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Gagal akses mic untuk merekam:", err);
    }
  };

  // 2. Berhenti Rekam & Otomatis Kirim
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  // 3. Kirim File Audio ke API FastAPI Temen Lu
  const sendAudioToBackend = async (audioBlob: Blob) => {
    setIsLoading(true);
    const formData = new FormData();
    // Key harus "file" sesuai di parameter FastAPI temen lu: voice_chat(file: UploadFile = File(...))
    formData.append("file", audioBlob, "user_input.wav");

    try {
      const response = await fetch("http://localhost:8000/api/voice-chat", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Gagal merespon dari API");

      // Terima stream MP3 hasil olahan ElevenLabs
      const resBlob = await response.blob();
      const audioUrl = URL.createObjectURL(resBlob);

      // Putar audio dan sinkronkan ke Avatar
      playResponseAudio(audioUrl);
    } catch (error) {
      console.error("Error pas manggil API:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Putar Suara Balasan AI & Sambungkan Analyser-nya ke Avatar
  const playResponseAudio = (url: string) => {
    // Inisialisasi AudioContext & Analyser Node sekali saja (Singleton Pattern)
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const ana = ctx.createAnalyser();
      ana.fftSize = 256;

      const audioEl = new Audio();
      // Hubungkan elemen audio ke context agar bisa dibaca frekuensinya
      const source = ctx.createMediaElementSource(audioEl);
      source.connect(ana);
      ana.connect(ctx.destination); // Output tetap keluar ke speaker laptop

      audioContextRef.current = ctx;
      audioElementRef.current = audioEl;
      setAnalyser(ana);
    }

    // Hindari autoplays block kebijakan browser
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    if (audioElementRef.current) {
      audioElementRef.current.src = url;
      audioElementRef.current.play();
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', backgroundColor: '#1a1a1a' }}>

      {/* SEKTOR AVATAR 3D */}
      <div style={{ width: '70%', height: '100%' }}>
        <Canvas camera={{ position: [0, 1.4, 0.8], fov: 40 }}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[1, 2, 3]} intensity={1.5} />
          {/* Oper state analyser ke dalam avatar */}
          <Avatar url="/sherly.vrm" analyser={analyser} />
        </Canvas>
      </div>

      {/* SEKTOR INTERAKSI / CHAT BAR */}
      <div style={{ width: '30%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderLeft: '1px solid #333' }}>
        <h2 style={{ color: 'white', marginBottom: '20px' }}>SerlyHitomi AI</h2>

        {isLoading ? (
          <p style={{ color: '#aaa' }}>Serly sedang berpikir & bersuara...</p>
        ) : (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            style={{
              padding: '20px 40px',
              fontSize: '18px',
              cursor: 'pointer',
              borderRadius: '50px',
              border: 'none',
              backgroundColor: isRecording ? '#ff4d4d' : '#4da6ff',
              color: 'white',
              fontWeight: 'bold',
              transition: '0.2s'
            }}
          >
            {isRecording ? "Lepas untuk Kirim..." : "Tahan untuk Bicara"}
          </button>
        )}
        <p style={{ color: '#666', marginTop: '10px', fontSize: '12px' }}>*Gunakan mic laptop lu untuk ngobrol</p>
      </div>

    </div>
  );
}

export default App;