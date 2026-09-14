const express = require("express");
const https = require("https");
const fs = require("fs");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const INSTANCE_NAME = process.env.INSTANCE_NAME || "Sys2";
const DB_HOST = "172.17.0.51";

app.use(express.static("public"));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const options = {
    key: fs.readFileSync("key.pem"),
    cert: fs.readFileSync("cert.pem")
};

const server = https.createServer(options, app);
const io = new Server(server, { cors: { origin: "*" } });

const pool = new Pool({
    user: 'student', host: DB_HOST, database: 'chat_db',
    password: 'password123', port: 5432,
    max: 50, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('PG error:', err.message));
process.on('uncaughtException', (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (reason) => console.error('Rejection:', reason));

const MASTER_KEY = crypto.scryptSync("password", "salt", 32);

function encrypt(text) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, nonce);
    let ct = cipher.update(text, 'utf8', 'hex');
    ct += cipher.final('hex');
    return { ciphertext: ct + cipher.getAuthTag().toString('hex'), nonce: nonce.toString('hex') };
}

function decrypt(encData, nonceHex) {
    try {
        const nonce = Buffer.from(nonceHex, 'hex');
        const tag = Buffer.from(encData.slice(-32), 'hex');
        const ct = encData.slice(0, -32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, nonce);
        decipher.setAuthTag(tag);
        return decipher.update(ct, 'hex', 'utf8') + decipher.final('utf8');
    } catch (e) { return ""; }
}

function verifySignature(message, signatureHex, publicKeyJWK) {
    try {
        if (!publicKeyJWK || !signatureHex) return false;
        const key = crypto.createPublicKey({ key: publicKeyJWK, format: 'jwk' });
        const v = crypto.createVerify('SHA256');
        v.update(message);
        return v.verify({ key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatureHex, 'hex'));
    } catch (e) { return false; }
}

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                message_id TEXT UNIQUE,
                room_id TEXT DEFAULT 'LOBBY',
                sender TEXT,
                ciphertext TEXT,
                nonce TEXT,
                signature TEXT,
                public_key TEXT,
                origin_node TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_id TEXT UNIQUE;
        `);
        console.log(`[${INSTANCE_NAME}] DB ready.`);
    } catch (err) { console.error("DB Init:", err.message); }
}
initDatabase();

// ─── ASYNC WRITE QUEUE ──────────────────────────────────────
// In-memory store: key=messageId, value={clientName, msg, timestamp}
const inMemoryStore = new Map();
const writeQueue = [];
let flushing = false;

// Flush queue to DB every 50ms in batches
setInterval(async () => {
    if (flushing || writeQueue.length === 0) return;
    flushing = true;
    const batch = writeQueue.splice(0, 100);
    for (const item of batch) {
        try {
            const { ciphertext, nonce } = encrypt(item.msg);
            await pool.query(
                `INSERT INTO messages (message_id, room_id, sender, ciphertext, nonce, origin_node)
                 VALUES ($1, 'LOBBY', $2, $3, $4, $5) ON CONFLICT (message_id) DO NOTHING`,
                [item.messageId, item.clientName, ciphertext, nonce, INSTANCE_NAME]
            );
        } catch (e) {
            // Re-queue on failure (once)
            if (!item.retried) { item.retried = true; writeQueue.push(item); }
        }
    }
    flushing = false;
}, 10);

// ─── ROUTES ─────────────────────────────────────────────────
app.get('/health', (req, res) => res.status(200).send('ok'));

// POST /message — respond INSTANTLY, write DB in background
app.post("/message", (req, res) => {
    const clientName = req.body["client-name"] || req.query["client-name"];
    const msg = req.body.msg || req.query.msg;
    const messageId = req.body.message_id || req.body.id ||
                      req.headers["x-message-id"] || crypto.randomUUID();

    if (!clientName || !msg) {
        return res.status(400).json({ error: "Missing client-name or msg" });
    }

    // Store in memory immediately
    inMemoryStore.set(messageId, {
        messageId, clientName, msg,
        timestamp: new Date().toISOString()
    });

    // Queue for background DB write
    writeQueue.push({ messageId, clientName, msg });

    // Respond immediately — no DB wait
    return res.status(200).json({ status: "ok", message_id: messageId });
});

// GET /feed — return in-memory store (includes un-flushed messages too)
app.get("/feed", async (req, res) => {
    try {
        // Get committed messages from DB
        const result = await pool.query(
            "SELECT id, message_id, sender, ciphertext, nonce, timestamp FROM messages ORDER BY id ASC"
        );
        const dbMessages = result.rows.map(row => ({
            id: row.id,
            message_id: row.message_id,
            "client-name": row.sender,
            msg: decrypt(row.ciphertext, row.nonce),
            timestamp: row.timestamp
        }));

        // Add any pending in-memory messages not yet in DB
        const dbIds = new Set(dbMessages.map(m => m.message_id));
        let extra = [];
        for (const [id, item] of inMemoryStore) {
            if (!dbIds.has(id)) {
                extra.push({
                    id: null,
                    message_id: id,
                    "client-name": item.clientName,
                    msg: item.msg,
                    timestamp: item.timestamp
                });
            }
        }

        res.status(200).json([...dbMessages, ...extra]);
    } catch (err) {
        // Fallback: return in-memory store only
        const messages = [];
        for (const [id, item] of inMemoryStore) {
            messages.push({
                id: null,
                message_id: id,
                "client-name": item.clientName,
                msg: item.msg,
                timestamp: item.timestamp
            });
        }
        res.status(200).json(messages);
    }
});

// ─── INTER-INSTANCE SYNC ─────────────────────────────────────
let lastProcessedId = 0;
pool.query("SELECT MAX(id) FROM messages")
    .then(r => { lastProcessedId = r.rows[0].max || 0; })
    .catch(() => {});

setInterval(async () => {
    try {
        const res = await pool.query(
            "SELECT * FROM messages WHERE id > $1 ORDER BY id ASC LIMIT 100",
            [lastProcessedId]
        );
        for (let row of res.rows) {
            lastProcessedId = Math.max(lastProcessedId, row.id);
            // Add to in-memory store for feed completeness
            if (!inMemoryStore.has(row.message_id)) {
                const decryptedContent = decrypt(row.ciphertext, row.nonce);
                inMemoryStore.set(row.message_id, {
                    messageId: row.message_id,
                    clientName: row.sender,
                    msg: decryptedContent,
                    timestamp: row.timestamp
                });
            }
            if (row.origin_node !== INSTANCE_NAME && io.sockets.adapter.rooms.get("LOBBY")?.size > 0) {
                const decryptedContent = decrypt(row.ciphertext, row.nonce);
                const isStillValid = (row.public_key && row.signature)
                    ? verifySignature(decryptedContent, row.signature, JSON.parse(row.public_key))
                    : true;
                io.to("LOBBY").emit("chat_message", {
                    username: row.sender,
                    message: decryptedContent,
                    timestamp: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    verified: isStillValid
                });
            }
        }
    } catch (e) {}
}, 100);

// ─── SOCKET.IO ───────────────────────────────────────────────
const roomUsers = new Map();
io.on("connection", (socket) => {
    socket.on("join_room", (data) => {
        const username = String(data.username || "").trim();
        if (!username) return;
        socket.username = username;
        roomUsers.set(socket.id, { username, publicKey: data.publicKey });
        socket.join("LOBBY");
        socket.emit("room_joined", {
            username,
            users: [...roomUsers.values()].map(u => u.username),
            capacity: 4
        });
        io.to("LOBBY").emit("system_log", `${username} joined via ${INSTANCE_NAME}`);
    });

    socket.on("chat_message", async (data) => {
        if (!socket.username) return;
        const userData = roomUsers.get(socket.id);
        if (!userData) return;
        const isValid = verifySignature(data.message, data.signature, userData.publicKey);
        const { ciphertext, nonce } = encrypt(data.message);
        const messageId = crypto.randomUUID();
        try {
            const res = await pool.query(
                `INSERT INTO messages (message_id, room_id, sender, ciphertext, nonce, signature, public_key, origin_node)
                 VALUES ($1, 'LOBBY', $2, $3, $4, $5, $6, $7) RETURNING id`,
                [messageId, socket.username, ciphertext, nonce, data.signature, JSON.stringify(userData.publicKey), INSTANCE_NAME]
            );
            lastProcessedId = Math.max(lastProcessedId, res.rows[0].id);
            io.to("LOBBY").emit("chat_message", {
                username: socket.username,
                message: data.message,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                verified: isValid
            });
        } catch (err) {}
    });

    socket.on("disconnect", () => {
        if (socket.username) {
            roomUsers.delete(socket.id);
            io.to("LOBBY").emit("room_users_update", {
                users: [...roomUsers.values()].map(u => u.username),
                capacity: 4
            });
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[${INSTANCE_NAME}] Server running on port ${PORT}`);
});
