import os
import tempfile
import edge_tts
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
# pyrefly: ignore [missing-import]
from groq import Groq
from dotenv import load_dotenv

app = FastAPI(title="SerlyHitomi AI Assistant API")

# Konfigurasi CORS buat React lu
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Sesuaikan port React lu
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====== SETUP API KEYS ======
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Inisialisasi Groq Client
groq_client = Groq(api_key=GROQ_API_KEY)

# Fungsi buat hapus file sampah (biar SSD laptop temen lu ga penuh)
def hapus_file_temp(path: str):
    if os.path.exists(path):
        os.remove(path)

@app.get("/")
def index():
    return {"status": "running", "assistant_name": "SerlyHitomi", "tts_engine": "Edge-TTS"}

# ====== ENDPOINT UTAMA ======
@app.post("/api/voice-chat")
async def voice_chat(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    tmp_in_path = ""
    tmp_out_path = ""
    
    try:
        # 1. BACA SUARA USER & SIMPAN KE FILE SEMENTARA
        audio_bytes = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_in:
            tmp_in.write(audio_bytes)
            tmp_in_path = tmp_in.name

        # 2. [STT] UBAH SUARA USER JADI TEKS VIA GROQ WHISPER (100% GRATIS)
        with open(tmp_in_path, "rb") as audio_file:
            transcription = groq_client.audio.transcriptions.create(
                file=("input.wav", audio_file),
                model="whisper-large-v3",
                prompt="Teks ini berbahasa Indonesia." # Bantu AI ngenalin bahasa
            )
        user_text = transcription.text
        print(f"User berkata: {user_text}")

        # 3. [OTAK AI] KIRIM TEKS KE LLAMA 3 VIA GROQ
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "Nama kamu adalah SerlyHitomi, asisten AI yang anggun, cerdas, ramah, dan berbicara menggunakan bahasa Indonesia yang santai. Jawab dengan singkat dan padat."
                },
                {
                    "role": "user",
                    "content": user_text
                }
            ],
            model="llama-3.1-8b-instant",
        )
        ai_response = chat_completion.choices[0].message.content
        print(f"Respon Serly: {ai_response}")

        # 4. [TTS] UBAH JAWABAN AI JADI SUARA VIA EDGE-TTS
        # Pakai suara 'Gadis' dari Microsoft Azure
        voice = "id-ID-GadisNeural" 
        communicate = edge_tts.Communicate(ai_response, voice)
        
        # Bikin wadah sementara buat file MP3-nya
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_out:
            tmp_out_path = tmp_out.name
            
        # Proses rendering suara
        await communicate.save(tmp_out_path)

        # 5. BERSIH-BERSIH FILE SEMENTARA
        # Hapus file input.wav user karena udah ga kepake
        hapus_file_temp(tmp_in_path) 
        # Hapus file mp3 setelah selesai di-download sama React lu
        background_tasks.add_task(hapus_file_temp, tmp_out_path)

        # 6. KIRIM FILE MP3 KE REACT
        import urllib.parse
        safe_text = urllib.parse.quote(ai_response)
        
        return FileResponse(
            tmp_out_path, 
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=response.mp3",
                "X-AI-Response-Text": safe_text
            }
        )

    except Exception as e:
        # Kalau error, pastikan file sisa tetep dihapus
        hapus_file_temp(tmp_in_path)
        hapus_file_temp(tmp_out_path)
        return {"status": "error", "message": str(e)}