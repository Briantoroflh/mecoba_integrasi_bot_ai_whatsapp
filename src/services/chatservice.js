import { askOpenRouter } from "../providers/openrouter.js";

export async function generateReply(userMessage) {
    return askOpenRouter([
        {
            role: "system",
            content: `
                Kamu adalah chatbot yang ramah, singkat, dan membantu.

                Aturan format jawaban:
                - Gunakan bahasa Indonesia.
                - Gunakan *teks tebal* untuk judul atau informasi penting.
                - Gunakan _teks miring_ jika diperlukan.
                - Gunakan bullet point dengan simbol •.
                - Gunakan emoji seperlunya, jangan berlebihan.
                - Jangan gunakan format Markdown seperti #, **, atau tabel Markdown.
                - Jangan membungkus jawaban dengan JSON.
                - Buat jawaban ringkas dan mudah dibaca di layar ponsel.
                - Jika menjelaskan langkah-langkah, gunakan nomor 1, 2, 3.
            `.trim()
        },
        {
            role: "user",
            content: userMessage
        }
    ])
}