import makeWASocket, { areJidsSameUser, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import { generateReply } from './services/chatservice.js';

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

            const contextInfo = msg.message.extendedTextMessage?.contextInfo;

            const mentionedJids = contextInfo?.mentionedJid ?? [];
            const botJids = sock.user?.lid

            const isBotMentioned = botJids && mentionedJids.some((jid) =>
                areJidsSameUser(jid, botJids)
            );

            if (isGroup && !isBotMentioned) {
                return;
            }

            const messageText = msg.message.conversation ?? msg.message.extendedTextMessage?.text

            const userMsg = messageText.replace(/@\d+/g, "").trim()

            if (!userMsg) {
                await sock.sendMessage(remoteJid, {
                    text: "Silakan tulis pertanyaan setelah tag saya."
                });

                return;
            }

            const reply = await generateReply(messageText)

            await sock.sendMessage(remoteJid, {
                text: reply
            })
        }
    })

    return sock
}

connectToWhatsApp()
