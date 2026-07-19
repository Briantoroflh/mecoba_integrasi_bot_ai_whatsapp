import makeWASocket, { areJidsSameUser, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import { generateReply } from './services/chatservice.js';
import { formatWhatsAppResponse } from './services/responseFormatter.js';

function unwrapMessage(message) {
    if (!message) return null;

    return (
        message.ephemeralMessage?.message ??
        message.viewOnceMessage?.message ??
        message.viewOnceMessageV2?.message ??
        message.documentWithCaptionMessage?.message ??
        message
    );
}

function extractMessageText(message) {
    const content = unwrapMessage(message);

    if (!content) return "";

    return (
        content.conversation ??
        content.extendedTextMessage?.text ??
        content.imageMessage?.caption ??
        content.videoMessage?.caption ??
        content.documentMessage?.caption ??
        ""
    ).trim();
} 

async function connectToWhatsApp() {
    const authDir = process.env.AUTH_DIR ?? 'auth_info_baileys'
    const phoneNumber = process.env.WA_PHONE_NUMBER?.replace(/\D/g, "");

    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    const sock = makeWASocket({
        auth: state
    })

    let pairingCodeRequested = false;
    let pairingTimer;

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (
            connection === "connecting" &&
            !state.creds.registered &&
            phoneNumber &&
            !pairingCodeRequested
        ) {
            pairingCodeRequested = true;

            pairingTimer = setTimeout(async () => {
                try {
                    if (state.creds.registered) {
                        return;
                    }

                    const code = await sock.requestPairingCode(phoneNumber);

                    console.log("WhatsApp pairing code:", code);
                    console.log(
                        "Segera masukkan kode melalui WhatsApp > " +
                        "Perangkat tertaut > Tautkan perangkat dengan nomor telepon"
                    );
                } catch (error) {
                    pairingCodeRequested = false;

                    console.error(
                        "Gagal meminta pairing code:",
                        error?.output ?? error
                    );
                } finally {
                    pairingTimer = undefined;
                }
            }, 5000);
        }

        if (connection === "open") {
            console.log("WhatsApp connected");
        }

        if (connection === "close") {
            if (pairingTimer) {
                clearTimeout(pairingTimer);
                pairingTimer = undefined;
            }

            const statusCode =
                new Boom(lastDisconnect?.error)?.output?.statusCode;

            const shouldReconnect =
                statusCode !== DisconnectReason.loggedOut;

            console.error("Connection closed:", {
                statusCode,
                shouldReconnect
            });

            if (statusCode === 401) {
                console.error(
                    "Sesi WhatsApp ditolak. Auth state perlu dihapus dan pairing ulang."
                );
                return;
            }

            if (shouldReconnect) {
                setTimeout(() => {
                    connectToWhatsApp();
                }, 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]

        if (!msg.key.fromMe && msg.message) {
            console.log('Received message:', msg.message)

            const remoteJid = msg.key.remoteJid;
            const isGroup = remoteJid?.endsWith("@g.us");

            console.log(isGroup);

            const messageContent = unwrapMessage(msg.message);
            const contextInfo = messageContent?.extendedTextMessage?.contextInfo;

            //ambil teks pesan yang di reply
            const quotedMessage = contextInfo?.quotedMessage;
            const quotedText = extractMessageText(quotedMessage);

            const mentionedJids = contextInfo?.mentionedJid ?? [];
            const botJids = sock.user?.lid

            const isBotMentioned = botJids && mentionedJids.some((jid) =>
                areJidsSameUser(jid, botJids)
            );

            if (isGroup && !isBotMentioned) {
                return;
            }

            const messageText = extractMessageText(msg.message);
            const userMsg = messageText.replace(/@\d+/g, "").trim();

            if (!userMsg && !quotedText) {
                await sock.sendMessage(remoteJid, {
                    text: "Silakan tulis pertanyaan setelah tag saya."
                });

                return;
            }

            const prompt = quotedText ? `
                Pesan yang di-reply:
                "${quotedText}"

                Pertanyaan atau instruksi user:
                "${userMsg || "Tolong jelaskan pesan yang di-reply tersebut."}"
                `.trim() : userMsg;

            // indikator mengetik
            await sock.sendPresenceUpdate("composing", remoteJid);

            const reply = await generateReply(prompt)
            const formattedReply = formatWhatsAppResponse(reply);

            await sock.sendPresenceUpdate("paused", remoteJid);

            await sock.sendMessage(remoteJid, {
                text: formattedReply
            })
        }
    })

    return sock
}

connectToWhatsApp()
