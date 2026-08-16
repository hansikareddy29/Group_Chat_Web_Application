const express = require("express");
const https = require("https");
const fs = require("fs");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const app = express();

// SSL Configuration 
const options = {
    key: fs.readFileSync("key.pem"),
    cert: fs.readFileSync("cert.pem")
};

const server = https.createServer(options, app);
const io = new Server(server);

app.use(express.static("public"));


// 1. DATABASE SETUP 
const db = new sqlite3.Database("chat.db");
db.serialize(() => {
    // Added 'public_key' to the table to allow for historical signature verification
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


// 2. ENCRYPTION HELPERS 
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


// 3. SIGNATURE VERIFICATION

function verifySignature(message, signatureHex, publicKeyJWK) {
    try {
        // Convert the stored JWK string/object back into a usable Public Key
        const publicKey = crypto.createPublicKey({ key: publicKeyJWK, format: 'jwk' });
        const verify = crypto.createVerify('SHA256');
        verify.update(message);
        verify.end();
        
        // Browser ECDSA signatures use 'ieee-p1363' encoding
        return verify.verify(
            { key: publicKey, dsaEncoding: 'ieee-p1363' }, 
            Buffer.from(signatureHex, 'hex')
        );
    } catch (e) {
        return false;
    }
}


// 4. STATE MANAGEMENT & SOCKET LOGIC

const MAX_CAPACITY = 4;
const roomUsers = new Map(); // socket.id -> {username, publicKey}

io.on("connection", (socket) => {

    socket.on("join_room", (data) => {
        const username = String(data.username || "").trim();
        if (!username || roomUsers.size >= MAX_CAPACITY) return socket.emit("room_error", "Error joining.");

        // Store current user session data
        roomUsers.set(socket.id, { username, publicKey: data.publicKey });
        socket.username = username;
        socket.join("LOBBY");

        socket.emit("room_joined", {
            username: username,
            users: [...roomUsers.values()].map(u => u.username),
            capacity: MAX_CAPACITY
        });

        // LOAD HISTORY WITH RE-VERIFICATION
        db.all("SELECT sender, ciphertext, nonce, signature, public_key FROM messages ORDER BY id ASC", (err, rows) => {
            if (!err) {
                const history = rows.map(row => {
                    const decryptedContent = decrypt(row.ciphertext, row.nonce);
                    
                    // RE-VERIFY the historical signature using the stored Public Key
                    const isStillValid = verifySignature(
                        decryptedContent, 
                        row.signature, 
                        JSON.parse(row.public_key)
                    );

                    return {
                        username: row.sender,
                        message: decryptedContent,
                        timestamp: "Past",
                        verified: isStillValid // Now verified dynamically from DB!
                    };
                });
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
        
        // 1. VERIFY SIGNATURE (Live)
        const isValid = verifySignature(data.message, data.signature, userData.publicKey);
        
        if (isValid) {
            console.log(`[SECURE] Signature VERIFIED for sender: ${socket.username}`);
        } else {
            console.log(`[DANGER] Signature FAILED for sender: ${socket.username}`);
        }

        // 2. ENCRYPT 
        const { ciphertext, nonce } = encrypt(data.message);

        // 3. STORE EVERYTHING (including public_key as a string)
        db.run(
            `INSERT INTO messages (room_id, sender, ciphertext, nonce, signature, public_key) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                "LOBBY", 
                socket.username, 
                ciphertext, 
                nonce, 
                data.signature, 
                JSON.stringify(userData.publicKey)
            ],
            (err) => {
                if (err) return;
                // Broadcast to others
                io.to("LOBBY").emit("chat_message", {
                    username: socket.username,
                    message: data.message,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    verified: isValid 
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


// 5. SERVER START

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is LIVE at https://10.1.75.79:${PORT}`);
});