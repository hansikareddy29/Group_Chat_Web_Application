const express = require("express");
const https = require("https");
const fs = require("fs");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
const PORT = 3000;
const INSTANCE_NAME = process.env.INSTANCE_NAME || "Node-App";
const DB_HOST = "172.17.0.51"; // Sys2 IP

app.get('/health', (req, res) => res.status(200).send('ok'));
app.use(express.static("public"));

const options = { key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") };
const server = https.createServer(options, app);
const io = new Server(server, { cors: { origin: "*" } });

const pool = new Pool({
    user: 'student', host: DB_HOST, database: 'chat_db',
    password: 'password123', port: 5432,
});

// Inter-node Sync Loop
let lastProcessedId = 0;
pool.query("SELECT MAX(id) FROM messages").then(res => { lastProcessedId = res.rows[0].max || 0; });

setInterval(async () => {
    try {
        const res = await pool.query("SELECT * FROM messages WHERE id > $1 ORDER BY id ASC", [lastProcessedId]);
        res.rows.forEach(row => {
            lastProcessedId = Math.max(lastProcessedId, row.id);
            if (row.origin_node !== INSTANCE_NAME) {
                const dec = decrypt(row.ciphertext, row.nonce);
                io.to("LOBBY").emit("chat_message", {
                    username: row.sender, message: dec, verified: true, timestamp: "Synced"
                });
            }
        });
    } catch (e) {}
}, 500);

// Cryptography
const MASTER_KEY = crypto.scryptSync("password", "salt", 32);
function encrypt(text) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, nonce);
    let ciphertext = cipher.update(text, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    return { ciphertext: ciphertext + cipher.getAuthTag().toString('hex'), nonce: nonce.toString('hex') };
}
function decrypt(encData, nonceHex) {
    try {
        const nonce = Buffer.from(nonceHex, 'hex');
        const tag = Buffer.from(encData.slice(-32), 'hex');
        const ciphertext = encData.slice(0, -32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, nonce);
        decipher.setAuthTag(tag);
        return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');
    } catch (e) { return "[Error]"; }
}
function verifySignature(message, signatureHex, publicKeyJWK) {
    try {
        const key = crypto.createPublicKey({ key: publicKeyJWK, format: 'jwk' });
        const v = crypto.createVerify('SHA256');
        v.update(message);
        return v.verify({ key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatureHex, 'hex'));
    } catch (e) { return false; }
}

const roomUsers = new Map();
io.on("connection", (socket) => {
    socket.on("join_room", async (data) => {
        socket.username = data.username;
        roomUsers.set(socket.id, { username: data.username, publicKey: data.publicKey });
        socket.join("LOBBY");
        socket.emit("room_joined", { users: [...roomUsers.values()].map(u => u.username), capacity: 4 });
        io.to("LOBBY").emit("system_log", `${data.username} joined via ${INSTANCE_NAME}`);
    });

    socket.on("chat_message", async (data) => {
        const userData = roomUsers.get(socket.id);
        const isValid = verifySignature(data.message, data.signature, userData.publicKey);
        const { ciphertext, nonce } = encrypt(data.message);
        const res = await pool.query(
            "INSERT INTO messages (room_id, sender, ciphertext, nonce, signature, public_key, origin_node) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            ["LOBBY", socket.username, ciphertext, nonce, data.signature, JSON.stringify(userData.publicKey), INSTANCE_NAME]
        );
        lastProcessedId = Math.max(lastProcessedId, res.rows[0].id);
        io.to("LOBBY").emit("chat_message", { username: socket.username, message: data.message, verified: isValid });
    });
});

server.listen(PORT, '0.0.0.0', () => console.log(`[${INSTANCE_NAME}] Running`));
