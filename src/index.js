import makeWASocket, { areJidsSameUser, DisconnectReason, useMultiFileAuthState, downloadContentFromMessage } from '@whiskeysockets/baileys'
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

async function extractMessageContent(message) {
    const content = unwrapMessage(message);

    if (!content) {
        return {
            text: "",
            imageDataUrl: null
        };
    }

    const text = (
        content.conversation ??
        content.extendedTextMessage?.text ??
        content.imageMessage?.caption ??
        content.videoMessage?.caption ??
        content.documentMessage?.caption ??
        ""
    ).trim();

    let imageDataUrl = null;

    if (content.imageMessage) {
        const imageMessage = content.imageMessage;

        const stream = await downloadContentFromMessage(
            imageMessage,
            "image"
        );

        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);

        const mimeType = imageMessage.mimetype || "image/jpeg";
        const base64Image = buffer.toString("base64");

        imageDataUrl = `data:${mimeType};base64,${base64Image}`;
    }

    return {
        text,
        imageDataUrl
    };
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
            const contextInfo =
                messageContent?.extendedTextMessage?.contextInfo ??
                messageContent?.imageMessage?.contextInfo ??
                messageContent?.videoMessage?.contextInfo ??
                messageContent?.documentMessage?.contextInfo;

            //ambil teks pesan yang di reply
            const quotedMessage = contextInfo?.quotedMessage;
            // const quotedContent = await extractMessageContent(quotedMessage);
            // const messageContentData = await extractMessageContent(msg.message);

            const mentionedJids = contextInfo?.mentionedJid ?? [];
            const botJids = sock.user?.lid

            const isBotMentioned = botJids && mentionedJids.some((jid) =>
                areJidsSameUser(jid, botJids)
            );

            if (isGroup && !isBotMentioned) {
                return;
            }

            const messageContentData = await extractMessageContent(msg.message);
            const quotedContentData = await extractMessageContent(quotedMessage);

            const messageText = messageContentData.text
                .replace(/@\d+/g, "")
                .trim();

            const quotedText = quotedContentData.text;

            if (
                !messageText &&
                !quotedText &&
                !messageContentData.imageDataUrl &&
                !quotedContentData.imageDataUrl
            ) {
                await sock.sendMessage(remoteJid, {
                    text: "Silakan tulis pertanyaan atau kirim gambar setelah tag saya."
                });

                return;
            }

            const userContent = [];

            if (quotedText) {
                userContent.push({
                    type: "text",
                    text: `Pesan yang di-reply:
                    "${quotedText}"`
                });
            }

            if (quotedContentData.imageDataUrl) {
                userContent.push({
                    type: "text",
                    text: "Berikut adalah gambar dari pesan yang di-reply:"
                });

                userContent.push({
                    type: "image_url",
                    image_url: {
                        url: quotedContentData.imageDataUrl
                    }
                });
            }

            if (messageText) {
                userContent.push({
                    type: "text",
                    text: `Pertanyaan atau instruksi user:
                    "${messageText}"`
                });
            }

            if (messageContentData.imageDataUrl) {
                userContent.push({
                    type: "text",
                    text: messageText || "Tolong jelaskan atau analisis gambar ini."
                });

                userContent.push({
                    type: "image_url",
                    image_url: {
                        url: messageContentData.imageDataUrl
                    }
                });
            }

            // indikator mengetik
            await sock.sendPresenceUpdate("composing", remoteJid);

            const reply = await generateReply(userContent)
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
