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

// DATABASE SETUP
const db = new sqlite3.Database("chat.db");
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        sender TEXT,
        ciphertext TEXT,
        nonce TEXT,
        signature TEXT,
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
    } catch (e) { return "[Message Corrupted]"; }
}


// SIGNATURE VERIFICATION 
function verifySignature(message, signatureHex, publicKeyJWK) {
    try {
        const publicKey = crypto.createPublicKey({ key: publicKeyJWK, format: 'jwk' });
        const verify = crypto.createVerify('SHA256');
        verify.update(message);
        verify.end();
        
        // Browser ECDSA signatures using 'ieee-p1363' encoding
        return verify.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatureHex, 'hex'));
    } catch (e) {
        console.error("Verification Error:", e);
        return false;
    }
}

const MAX_CAPACITY = 4;
const roomUsers = new Map(); // socket.id -> {username, publicKey}

io.on("connection", (socket) => {

    socket.on("join_room", (data) => {
        const username = String(data.username || "").trim();
        if (!username || roomUsers.size >= MAX_CAPACITY) return socket.emit("room_error", "Error joining.");

        // Store the user's public key 
        roomUsers.set(socket.id, { username, publicKey: data.publicKey });
        socket.username = username;
        socket.join("LOBBY");

        socket.emit("room_joined", {
            username: username,
            users: [...roomUsers.values()].map(u => u.username),
            capacity: MAX_CAPACITY
        });

        db.all("SELECT sender, ciphertext, nonce FROM messages ORDER BY id ASC", (err, rows) => {
            if (!err) {
                const history = rows.map(row => ({
                    username: row.sender,
                    message: decrypt(row.ciphertext, row.nonce),
                    timestamp: "Past",
                    verified: true // Assuming history is authentic
                }));
                socket.emit("message_history", history);
            }
        });

        socket.to("LOBBY").emit("user_joined", username);
        io.to("LOBBY").emit("room_users_update", {
            users: [...roomUsers.values()].map(u => u.username),
            capacity: MAX_CAPACITY
        });
    });

    socket.on("chat_message", (data) => {
        if (!socket.username) return;

        const userData = roomUsers.get(socket.id);
        
        // 1. VERIFY SIGNATURE 
        const isValid = verifySignature(data.message, data.signature, userData.publicKey);
        
        if (isValid) {
            console.log(`[SECURE] Signature VERIFIED for sender: ${socket.username}`);
        } else {
            console.log(`[DANGER] Signature FAILED for sender: ${socket.username}`);
        }

        // 2. ENCRYPT & STORE
        const { ciphertext, nonce } = encrypt(data.message);
        db.run(
            `INSERT INTO messages (room_id, sender, ciphertext, nonce, signature) VALUES (?, ?, ?, ?, ?)`,
            ["LOBBY", socket.username, ciphertext, nonce, data.signature],
            (err) => {
                if (err) return;
                io.to("LOBBY").emit("chat_message", {
                    username: socket.username,
                    message: data.message,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    verified: isValid // Send verification status to clients
                });
            }
        );
    });

    socket.on("disconnect", () => {
        if (socket.username) {
            roomUsers.delete(socket.id);
            io.to("LOBBY").emit("room_users_update", {
                users: [...roomUsers.values()].map(u => u.username),
                capacity: MAX_CAPACITY
            });
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is LIVE at https://10.1.75.79:${PORT}`);
});