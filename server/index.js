const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ========================================
// STATE MANAGEMENT
// ========================================
const MAX_CAPACITY = 4;
const roomUsers = new Map(); // socket.id -> username
let messageHistory = [];     // Stores last 50 messages

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // JOIN LOGIC
    socket.on("join_room", (data) => {
        const username = String(data.username || "").trim();

        // Validations
        if (!username) return socket.emit("room_error", "Username is required.");
        if (roomUsers.size >= MAX_CAPACITY) return socket.emit("room_error", "Room is full (Max 4).");
        
        const exists = [...roomUsers.values()].some(u => u.toLowerCase() === username.toLowerCase());
        if (exists) return socket.emit("room_error", "Username already taken.");

        // Setup User
        roomUsers.set(socket.id, username);
        socket.username = username;
        socket.join("LOBBY");

        // 1. Confirm Join
        socket.emit("room_joined", {
            username: username,
            users: [...roomUsers.values()],
            capacity: MAX_CAPACITY
        });

        // 2. FEATURE: Send Message History to the new user
        socket.emit("message_history", messageHistory);

        // 3. Notify others
        socket.to("LOBBY").emit("user_joined", username);
        io.to("LOBBY").emit("room_users_update", {
            users: [...roomUsers.values()],
            capacity: MAX_CAPACITY
        });
    });

    // CHAT MESSAGE LOGIC
    socket.on("chat_message", (data) => {
        if (!socket.username) return;

        const msgData = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            username: socket.username,
            message: data.message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            senderId: socket.id
        };

        // FEATURE: Save to history
        messageHistory.push(msgData);
        if (messageHistory.length > 50) messageHistory.shift();

        io.to("LOBBY").emit("chat_message", msgData);
    });

    // FEATURE: TYPING INDICATORS
    socket.on("typing_start", () => {
        socket.to("LOBBY").emit("user_typing", socket.username);
    });

    socket.on("typing_stop", () => {
        socket.to("LOBBY").emit("user_stopped_typing", socket.username);
    });

    // LEAVE / DISCONNECT
    const handleLeave = () => {
        if (socket.username) {
            const name = socket.username;
            roomUsers.delete(socket.id);
            
            socket.to("LOBBY").emit("user_left", name);
            socket.to("LOBBY").emit("user_stopped_typing", name);
            
            io.to("LOBBY").emit("room_users_update", {
                users: [...roomUsers.values()],
                capacity: MAX_CAPACITY
            });
            socket.username = null;
        }
    };

    socket.on("leave_room", handleLeave);
    socket.on("disconnect", handleLeave);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});