import makeWASocket, { areJidsSameUser, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import { generateReply } from './services/chatservice.js';

async function connectToWhatsApp() {
    const authDir = process.env.AUTH_DIR ?? 'auth_info_baileys'

    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    const sock = makeWASocket({
        auth: state
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'close') {
            const shouldReconnect = new  Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect)

            if (shouldReconnect) {
                connectToWhatsApp()
            }
        } else if (connection === 'open') {
            console.log('opened connection')
        }
    })

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
