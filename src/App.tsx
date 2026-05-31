import { useState, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Avatar } from './Avatar';
import { OrbitControls } from '@react-three/drei';

function App() {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState<string>("Siap bicara!");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Ref Web Audio API untuk memproses suara AI
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // 1. Mulai Rekam Suara User
  const startRecording = async () => {
    audioChunksRef.current = [];
    setStatusText("Meminta izin mikrofon...");
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
      setStatusText("Merekam... Lepas tombol untuk kirim.");
    } catch (err: any) {
      console.error("Gagal akses mic untuk merekam:", err);
      setStatusText(`Error Mic: ${err.message || err}. Pastikan izin mic aktif!`);
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

  // Ref untuk menyimpan interval lip-sync agar bisa di-clear
  const lipsyncIntervalRef = useRef<any>(null);

  // 3. Kirim File Audio ke API FastAPI Temen Lu
  const sendAudioToBackend = async (audioBlob: Blob) => {
    setIsLoading(true);
    setStatusText("Mengirim suara ke Serly AI...");
    const formData = new FormData();
    formData.append("file", audioBlob, "user_input.wav");

    try {
      const response = await fetch("http://localhost:8000/api/voice-chat", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || "Gagal merespon dari API"}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (data.status === "fallback") {
          console.warn("ElevenLabs TTS failed, using Web Speech API fallback:", data.error);
          playFallbackSpeech(data.text);
        } else {
          throw new Error(data.message || "Terjadi kesalahan di backend.");
        }
      } else {
        // Matikan jika ada SpeechSynthesis yang sedang berjalan
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }

        // Ambil teks respon AI dari header jika ada
        const safeText = response.headers.get("X-AI-Response-Text");
        const aiResponseText = safeText ? decodeURIComponent(safeText) : "Serly sedang menjawab...";

        const resBlob = await response.blob();
        const audioUrl = URL.createObjectURL(resBlob);

        playResponseAudio(audioUrl, aiResponseText);
      }
    } catch (error: any) {
      console.error("Error pas manggil API:", error);
      setStatusText(`Gagal: ${error.message || error}. Pastikan backend menyala!`);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulasi gerakan mulut (lip sync) untuk Web Speech API
  const simulateMouthMovement = (text: string) => {
    if (lipsyncIntervalRef.current) {
      clearInterval(lipsyncIntervalRef.current);
    }

    // Durasi perkiraan berdasarkan panjang teks (sekitar 80ms per karakter)
    const totalDuration = Math.max(1000, text.length * 85);
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 80;
      if (elapsed >= totalDuration) {
        clearInterval(interval);
        setAnalyser(null);
        lipsyncIntervalRef.current = null;
      } else {
        // Buat mock AnalyserNode khusus untuk dibaca Avatar.tsx
        const mockAnalyser = {
          frequencyBinCount: 1,
          getByteFrequencyData: (array: Uint8Array) => {
            // Berikan nilai acak tinggi-rendah agar mulut model terbuka-tutup realistis
            array[0] = 10 + Math.random() * 45; 
          }
        } as unknown as AnalyserNode;
        setAnalyser(mockAnalyser);
      }
    }, 80);

    lipsyncIntervalRef.current = interval;
  };

  // Putar suara menggunakan Web Speech API (sebagai cadangan jika ElevenLabs error)
  const playFallbackSpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (lipsyncIntervalRef.current) {
        clearInterval(lipsyncIntervalRef.current);
        setAnalyser(null);
      }

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Cari suara bahasa Indonesia yang pas jika tersedia
      const voices = window.speechSynthesis.getVoices();
      const idVoice = voices.find(v => v.lang.startsWith('id') || v.lang.startsWith('in'));
      if (idVoice) {
        utterance.voice = idVoice;
      }
      
      utterance.onstart = () => {
        setStatusText(text);
        simulateMouthMovement(text);
      };

      utterance.onend = () => {
        setStatusText("Siap bicara!");
        if (lipsyncIntervalRef.current) {
          clearInterval(lipsyncIntervalRef.current);
          lipsyncIntervalRef.current = null;
        }
        setAnalyser(null);
      };

      utterance.onerror = (e) => {
        console.error("SpeechSynthesis error:", e);
        setStatusText("Gagal memutar suara.");
        if (lipsyncIntervalRef.current) {
          clearInterval(lipsyncIntervalRef.current);
          lipsyncIntervalRef.current = null;
        }
        setAnalyser(null);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setStatusText(text);
      console.warn("Browser tidak mendukung SpeechSynthesis.");
    }
  };

  // 4. Putar Suara Balasan AI & Sambungkan Analyser-nya ke Avatar
  const playResponseAudio = (url: string, text: string) => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const ana = ctx.createAnalyser();
      ana.fftSize = 256;

      const audioEl = new Audio();
      const source = ctx.createMediaElementSource(audioEl);
      source.connect(ana);
      ana.connect(ctx.destination);

      audioContextRef.current = ctx;
      audioElementRef.current = audioEl;
      setAnalyser(ana);
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    if (audioElementRef.current) {
      audioElementRef.current.src = url;
      setStatusText(text);
      
      audioElementRef.current.onended = () => {
        setStatusText("Siap bicara!");
      };
      
      audioElementRef.current.onerror = (e) => {
        setStatusText("Gagal memutar audio balasan.");
        console.error("Audio playback error:", e);
      };

      audioElementRef.current.play().catch(err => {
        console.error("Play failed:", err);
        setStatusText("Klik layar terlebih dahulu untuk mengaktifkan audio.");
      });
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
          <Suspense fallback={null}>
            <Avatar url="/SherlyHitomi_.vrm" analyser={analyser} />
          </Suspense>
          {/* OrbitControls agar bisa diputar dan di-zoom dengan scroll mouse */}
          <OrbitControls target={[0, 1.3, 0]} />
        </Canvas>
      </div>

      {/* SEKTOR INTERAKSI / CHAT BAR */}
      <div style={{ width: '30%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderLeft: '1px solid #333' }}>
        <h2 style={{ color: 'white', marginBottom: '10px' }}>SerlyHitomi AI</h2>
        
        {/* Status indicator box */}
        <div style={{ 
          backgroundColor: '#2b2b2b', 
          color: statusText.startsWith('Gagal') || statusText.startsWith('Error') ? '#ff4d4d' : '#4da6ff',
          padding: '10px 20px', 
          borderRadius: '10px', 
          marginBottom: '20px',
          fontSize: '14px',
          fontWeight: '500',
          textAlign: 'center',
          maxWidth: '80%',
          wordBreak: 'break-word',
          border: '1px solid #444'
        }}>
          Status: {statusText}
        </div>

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
              transition: '0.2s',
              boxShadow: isRecording ? '0 0 15px #ff4d4d' : 'none'
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