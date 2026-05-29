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
    allow_origins=["http://localhost:5173"],  # Port React
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
        
        # Sediakan wadah file di memori agar bisa dibaca SDK
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "input.wav" 

        # 2. [STT] Kirim ke ElevenLabs untuk diubah jadi Teks Tulisan
        # Menggunakan model dasar 'scribe' untuk Speech-to-Text
        stt_result = twelve_client.speech_to_text.transcribe(
            file=audio_file,
            model_id="scribe"
        )
        user_text = stt_result.text
        print(f"User berkata: {user_text}")

        # 3. [OTAK AI] Kirim teks ke Groq (Pakai Llama 3 atau Mixtral biar kenceng)
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
            model="llama3-8b-8192", # Model andalan Groq yang super cepat
        )
        ai_response = chat_completion.choices[0].message.content
        print(f"Respon SerlyHitomi: {ai_response}")

        # 4. [TTS] Ubah teks jawaban Groq tadi menjadi suara lewat ElevenLabs
        # Kita pakai model multilingual v2 agar pelafalan bahasa Indonesianya natural
        audio_generator = twelve_client.generate(
            text=ai_response,
            voice="Bella", # Bisa diganti ID/Nama Voice ElevenLabs favorit lu
            model="eleven_multilingual_v2"
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