const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, PHONENUMBER_MCC } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const { Boom } = require('@hapi/boom');
const readline = require('readline');
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const logger = Pino({ level: 'silent' });

const use  = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, is  } = await fetchLatestBaileysVersion();
    console.log(`using Baileys v${version.join('.')}`);

    const client = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: ['Malvin C Leo Bot', 'Chrome', '1.0.0'],
    });

    client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.badAuthToken) {
                console.log('Bad Session File, Please Delete Session and Scan Again');
                client.logout();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log('Connection closed, reconnecting....');
                use();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log('Connection Lost from Server, reconnecting...');
                use();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log('Connection Replaced, Another New Session Opened, Please Close Current Session First');
                client.logout();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log('Device Logged Out, Please Delete Session and Scan Again.');
                client.logout();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log('Restart Required, Restarting...');
                use();
            } else if (reason === DisconnectReason.timedOut) {
                console.log('Connection TimedOut, Reconnecting...');
                use();
            } else {
                client.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect?.error}`);
            }
        } else if (connection === 'open') {
            console.log('opened connection');
        }
    });

    client.ev.on('creds.update', saveCreds);

    // Pairing Code Logic
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (text) => new Promise(resolve => rl.question(text, resolve));

    if (!client.user && !client.authState.creds.registered) {
        const phoneNumber = await question('Please enter your WhatsApp phone number (e.g., 263xxxxxxxxxx): ');
        const code = await client.requestPairingCode(phoneNumber.trim());
        console.log(`Your Pairing Code: ${code}`);
    }

    const prefix = "."; // Bot command prefix

    client.ev.on('messages.upsert', async ({ messages }) => {
        const M = messages[0];
        if (!M.message) return;
        if (M.key.fromMe) return;

        const sender = M.key.remoteJid;
        const text = M.message.conversation || M.message.extendedTextMessage?.text || '';

        if (text.startsWith(prefix)) {
            const args = text.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            // Command handling logic (will be implemented later)
            console.log(`Received command: ${commandName} from ${sender}`);
            await client.sendMessage(sender, { text: `Command received: ${commandName}` });
        }
    });
};

use();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the pairing page at http://localhost:${PORT}`);
});
