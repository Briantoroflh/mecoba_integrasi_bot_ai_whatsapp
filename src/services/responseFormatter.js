export function formatWhatsAppResponse(text) {
    if (!text || typeof text !== "string") {
        return "Maaf, saya tidak mendapatkan respons.";
    }

    return text
        .trim()
        // Ubah heading Markdown menjadi teks tebal WhatsApp
        .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")

        // Ubah bold Markdown **teks** menjadi *teks*
        .replace(/\*\*(.+?)\*\*/g, "*$1*")

        // Ubah bullet Markdown menjadi bullet WhatsApp
        .replace(/^\s*[-*]\s+/gm, "• ")

        // Rapikan terlalu banyak baris kosong
        .replace(/\n{3,}/g, "\n\n")

        .trim();
}