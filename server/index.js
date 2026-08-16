const express = require("express");
const https = require("https");
const fs = require("fs");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const app = express();

const options = {
    key: fs.readFileSync("key.pem"),
    cert: fs.readFileSync("cert.pem")
};

const server = https.createServer(options, app);
const io = new Server(server);

app.use(express.static("public"));

const db = new sqlite3.Database("chat.db");
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        sender TEXT,
        ciphertext TEXT,
        nonce TEXT,
        signature TEXT,
        public_key TEXT, 
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const MASTER_KEY = crypto.scryptSync("password", "salt", 32);

function encrypt(text) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, nonce);
    let ciphertext = cipher.update(text, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return { ciphertext: ciphertext + tag, nonce: nonce.toString('hex') };
}

function decrypt(encData, nonceHex) {
    try {
        const nonce = Buffer.from(nonceHex, 'hex');
        const tag = Buffer.from(encData.slice(-32), 'hex');
        const ciphertext = encData.slice(0, -32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, nonce);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return "[Message Corrupted]";
    }
}

function verifySignature(message, signatureHex, publicKeyJWK) {
    try {
        const publicKey = crypto.createPublicKey({ key: publicKeyJWK, format: 'jwk' });
        const verify = crypto.createVerify('SHA256');
        verify.update(message);
        verify.end();
        return verify.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatureHex, 'hex'));
    } catch (e) {
        return false;
    }
}

const roomUsers = new Map(); 

io.on("connection", (socket) => {

    socket.on("join_room", (data) => {
        const username = String(data.username || "").trim();
        if (!username || roomUsers.size >= 4) return socket.emit("room_error", "Error joining room.");

        roomUsers.set(socket.id, { username, publicKey: data.publicKey });
        socket.username = username;
        socket.join("LOBBY");

        socket.emit("room_joined", {
            username: username,
            users: [...roomUsers.values()].map(u => u.username),
            capacity: 4
        });

        io.to("LOBBY").emit("system_log", `${username} joined (Public Key Registered)`);

        db.all("SELECT sender, ciphertext, nonce, signature, public_key FROM messages ORDER BY id ASC", (err, rows) => {
            if (!err) {
                const history = rows.map(row => {
                    const decryptedContent = decrypt(row.ciphertext, row.nonce);
                    const isStillValid = verifySignature(decryptedContent, row.signature, JSON.parse(row.public_key));
                    return {
                        username: row.sender,
                        message: decryptedContent,
                        timestamp: "Past",
                        verified: isStillValid 
                    };
                });
                socket.emit("message_history", history);
            }
        });

        io.to("LOBBY").emit("room_users_update", {
            users: [...roomUsers.values()].map(u => u.username),
            capacity: 4
        });
    });

    socket.on("chat_message", (data) => {
        if (!socket.username) return;
        const userData = roomUsers.get(socket.id);
        const isValid = verifySignature(data.message, data.signature, userData.publicKey);
        
        if (isValid) {
            io.to("LOBBY").emit("system_log", `Authenticity verified for ${socket.username}`);
        } else {
            io.to("LOBBY").emit("system_log", `WARNING: Signature failure from ${socket.username}`);
        }

        const { ciphertext, nonce } = encrypt(data.message);
        db.run(
            `INSERT INTO messages (room_id, sender, ciphertext, nonce, signature, public_key) VALUES (?, ?, ?, ?, ?, ?)`,
            ["LOBBY", socket.username, ciphertext, nonce, data.signature, JSON.stringify(userData.publicKey)],
            (err) => {
                if (err) return;
                io.to("LOBBY").emit("chat_message", {
                    username: socket.username,
                    message: data.message,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    verified: isValid 
                });
            }
        );
    });

    socket.on("typing_start", () => socket.to("LOBBY").emit("user_typing", socket.username));
    socket.on("typing_stop", () => socket.to("LOBBY").emit("user_stopped_typing", socket.username));

    socket.on("disconnect", () => {
        if (socket.username) {
            const name = socket.username;
            roomUsers.delete(socket.id);
            io.to("LOBBY").emit("system_log", `${name} left the room`);
            io.to("LOBBY").emit("room_users_update", {
                users: [...roomUsers.values()].map(u => u.username),
                capacity: 4
            });
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is LIVE at https://10.1.75.79:${PORT}`);
});