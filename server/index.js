const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
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

// ENCRYPTION HELPERS 
// Use a fixed key so history doesn't break on server restart
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

// STATE MANAGEMENT
const MAX_CAPACITY = 4;
const roomUsers = new Map(); // socket.id -> {username, publicKey}

io.on("connection", (socket) => {

    socket.on("join_room", (data) => {
        const username = String(data.username || "").trim();
        
        // Validations
        if (!username) return socket.emit("room_error", "Username is required.");
        if (roomUsers.size >= MAX_CAPACITY) return socket.emit("room_error", "Room is full.");
        
        const exists = [...roomUsers.values()].some(u => u.username.toLowerCase() === username.toLowerCase());
        if (exists) return socket.emit("room_error", "Username taken.");

        // Setup User
        roomUsers.set(socket.id, { username, publicKey: data.publicKey });
        socket.username = username;
        socket.join("LOBBY");

        // 1. Confirm Join
        socket.emit("room_joined", {
            username: username,
            users: [...roomUsers.values()].map(u => u.username),
            capacity: MAX_CAPACITY
        });

        // 2. Send History from DB
        db.all("SELECT sender, ciphertext, nonce FROM messages ORDER BY id ASC", (err, rows) => {
            if (!err) {
                const history = rows.map(row => ({
                    username: row.sender,
                    message: decrypt(row.ciphertext, row.nonce),
                    timestamp: "Past"
                }));
                socket.emit("message_history", history);
            }
        });

        // 3. Update Participants List 
        socket.to("LOBBY").emit("user_joined", username);
        io.to("LOBBY").emit("room_users_update", {
            users: [...roomUsers.values()].map(u => u.username),
            capacity: MAX_CAPACITY
        });
    });

    socket.on("chat_message", (data) => {
        if (!socket.username) return;

        // Encrypt before storing
        const { ciphertext, nonce } = encrypt(data.message);

        db.run(
            `INSERT INTO messages (room_id, sender, ciphertext, nonce, signature) VALUES (?, ?, ?, ?, ?)`,
            ["LOBBY", socket.username, ciphertext, nonce, data.signature],
            (err) => {
                if (err) return;
                io.to("LOBBY").emit("chat_message", {
                    username: socket.username,
                    message: data.message,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        );
    });

    // Typing Indicators
    socket.on("typing_start", () => socket.to("LOBBY").emit("user_typing", socket.username));
    socket.on("typing_stop", () => socket.to("LOBBY").emit("user_stopped_typing", socket.username));

    const handleLeave = () => {
        if (socket.username) {
            const name = socket.username;
            roomUsers.delete(socket.id);
            socket.to("LOBBY").emit("user_left", name);
            io.to("LOBBY").emit("room_users_update", {
                users: [...roomUsers.values()].map(u => u.username),
                capacity: MAX_CAPACITY
            });
        }
    };

    socket.on("leave_room", handleLeave);
    socket.on("disconnect", handleLeave);
});

server.listen(3000, () => console.log(`Server: http://localhost:3000`));