import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
# pyrefly: ignore [missing-import]
from groq import Groq
# pyrefly: ignore [missing-import]
from elevenlabs.client import ElevenLabs
import io

app = FastAPI(title="SerlyHitomi AI Assistant API")

# Konfigurasi CORS agar React teman lu bisa akses
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====== SETUP API KEYS ======
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# Inisialisasi Client
groq_client = Groq(api_key=GROQ_API_KEY)
twelve_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

@app.get("/")
def index():
    return {"status": "running", "assistant_name": "SerlyHitomi"}

# ====== ENDPOINT UTAMA: PROSES SUARA ======
@app.post("/api/voice-chat")
async def voice_chat(file: UploadFile = File(...)):
    try:
        # 1. Baca file audio mentah yang dikirim oleh React teman lu
        audio_bytes = await file.read()
        
        # 2. [STT] Kirim ke Groq Whisper untuk diubah jadi Teks Tulisan (Sangat Cepat & 100% Gratis!)
        stt_result = groq_client.audio.transcriptions.create(
            file=("user_input.wav", audio_bytes),
            model="whisper-large-v3"
        )
        user_text = stt_result.text
        print(f"User berkata: {user_text}")

        # 3. [OTAK AI] Kirim teks ke Groq (Pakai Llama 3.1 8B Instant yang super cepat dan aktif)
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "Nama kamu adalah SerlyHitomi, asisten AI yang anggun, cerdas, ramah, dan berbicara menggunakan bahasa Indonesia yang santai."
                },
                {
                    "role": "user",
                    "content": user_text
                }
            ],
            model="llama-3.1-8b-instant",
        )
        ai_response = chat_completion.choices[0].message.content
        print(f"Respon SerlyHitomi: {ai_response}")

        # 4. [TTS] Ubah teks jawaban Groq tadi menjadi suara lewat ElevenLabs (Menggunakan SDK 2.x terbaru)
        audio_generator = twelve_client.text_to_speech.convert(
            voice_id="EXAVITQu4vr4xnSDxMaL",  # ID untuk suara "Bella"
            text=ai_response,
            model_id="eleven_multilingual_v2"
        )

        # Ubah generator menjadi bytes utuh
        audio_output = b"".join(audio_generator)

        # 5. Kirim balik file audio .mp3 langsung sebagai stream ke React teman lu
        return StreamingResponse(
            io.BytesIO(audio_output), 
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=response.mp3"}
        )

    except Exception as e:
        return {"status": "error", "message": str(e)}