const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));


// ========================================
// ACTIVE ROOMS
// ========================================

const rooms = new Map();


// ========================================
// GENERATE ROOM CODE
// ========================================

function generateRoomCode() {
    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
}


// ========================================
// START EMPTY ROOM GRACE PERIOD
// ========================================

function startEmptyRoomTimer(roomCode, room) {

    if (room.emptyTimer) {
        clearTimeout(room.emptyTimer);
    }

    console.log(
        `Room ${roomCode} is empty. Starting 2-minute grace period.`
    );

    room.emptyTimer = setTimeout(() => {

        const currentRoom = rooms.get(roomCode);

        if (
            currentRoom &&
            currentRoom.users.size === 0
        ) {

            clearRoomTimers(currentRoom);

            rooms.delete(roomCode);

            console.log(
                `Room ${roomCode} deleted after grace period`
            );
        }

    }, 2 * 60 * 1000);
}


// ========================================
// CLEAR ROOM TIMERS
// ========================================

function clearRoomTimers(room) {

    if (room.emptyTimer) {
        clearTimeout(room.emptyTimer);
        room.emptyTimer = null;
    }

    if (room.durationTimer) {
        clearTimeout(room.durationTimer);
        room.durationTimer = null;
    }

    room.warningTimers.forEach(
        timer => clearTimeout(timer)
    );

    room.warningTimers = [];
}


// ========================================
// CONNECTION
// ========================================

io.on("connection", (socket) => {

    console.log(
        "User connected:",
        socket.id
    );


    // ====================================
    // CREATE ROOM
    // ====================================

    socket.on("create_room", (data) => {

        const username =
            String(data.username || "").trim();

        const capacity =
            Number(data.capacity);

        const duration =
            data.duration === "none"
                ? null
                : Number(data.duration);


        // Username validation

        if (!username) {

            socket.emit(
                "room_error",
                "Username is required."
            );

            return;
        }


        // Capacity validation

        if (
            !Number.isInteger(capacity) ||
            capacity < 2 ||
            capacity > 100
        ) {

            socket.emit(
                "room_error",
                "Room capacity must be between 2 and 100."
            );

            return;
        }


        // Duration validation

        if (
            duration !== null &&
            (
                !Number.isInteger(duration) ||
                duration < 1 ||
                duration > 120
            )
        ) {

            socket.emit(
                "room_error",
                "Room duration must be between 1 and 120 minutes."
            );

            return;
        }


        // Generate unique room code

        let roomCode;

        do {

            roomCode =
                generateRoomCode();

        } while (rooms.has(roomCode));


        // Calculate expiry

        const expiresAt =
            duration === null
                ? null
                : Date.now() +
                  duration * 60 * 1000;


        // Create room

        const room = {

            capacity:
                capacity,

            duration:
                duration,

            expiresAt:
                expiresAt,

            users:
                new Map(),

            messages:
                new Map(),

            emptyTimer:
                null,

            durationTimer:
                null,

            warningTimers:
                []
        };


        rooms.set(
            roomCode,
            room
        );


        // Add creator

        room.users.set(
            socket.id,
            username
        );


        socket.username =
            username;

        socket.roomCode =
            roomCode;


        socket.join(
            roomCode
        );


        console.log(
            `${username} created room ${roomCode} ` +
            `(capacity: ${capacity})`
        );


        // ====================================
        // ROOM EXPIRY
        // ====================================

        if (duration !== null) {

            room.durationTimer =
                setTimeout(() => {

                    console.log(
                        `Room ${roomCode} expired`
                    );


                    io.to(roomCode).emit(
                        "room_expired"
                    );


                    clearRoomTimers(
                        room
                    );


                    rooms.delete(
                        roomCode
                    );

                }, duration * 60 * 1000);


            // ====================================
            // 5 MINUTE WARNING
            // ====================================

            if (duration > 5) {

                const fiveMinuteTimer =
                    setTimeout(() => {

                        io.to(roomCode).emit(
                            "room_warning",
                            {
                                message:
                                    "Room expires in 5 minutes."
                            }
                        );

                    }, (duration - 5) * 60 * 1000);


                room.warningTimers.push(
                    fiveMinuteTimer
                );
            }


            // ====================================
            // 1 MINUTE WARNING
            // ====================================

            if (duration > 1) {

                const oneMinuteTimer =
                    setTimeout(() => {

                        io.to(roomCode).emit(
                            "room_warning",
                            {
                                message:
                                    "Room expires in 1 minute."
                            }
                        );

                    }, (duration - 1) * 60 * 1000);


                room.warningTimers.push(
                    oneMinuteTimer
                );
            }

        }


        // Tell creator

        socket.emit(
            "room_created",
            {
                roomCode:
                    roomCode,

                expiresAt:
                    expiresAt,

                duration:
                    duration,

                users:
                    [...room.users.values()]
            }
        );

    });


    // ====================================
    // JOIN ROOM
    // ====================================

    socket.on("join_room", (data) => {

        const username =
            String(data.username || "").trim();

        const roomCode =
            String(data.roomCode || "")
                .trim()
                .toUpperCase();


        if (!username) {

            socket.emit(
                "room_error",
                "Username is required."
            );

            return;
        }


        const room =
            rooms.get(roomCode);


        if (!room) {

            socket.emit(
                "room_error",
                "Room does not exist or has expired."
            );

            return;
        }


        // Check expiry

        if (
            room.expiresAt !== null &&
            Date.now() >= room.expiresAt
        ) {

            socket.emit(
                "room_error",
                "This room has expired."
            );

            return;
        }


        // Capacity

        if (
            room.users.size >=
            room.capacity
        ) {

            socket.emit(
                "room_error",
                "Room is full."
            );

            return;
        }


        // Unique username

        const usernameExists =
            [...room.users.values()]
                .some(
                    existingUsername =>
                        existingUsername.toLowerCase() ===
                        username.toLowerCase()
                );


        if (usernameExists) {

            socket.emit(
                "room_error",
                "This username is already being used in this room."
            );

            return;
        }


        // Cancel empty-room timer

        if (room.emptyTimer) {

            clearTimeout(
                room.emptyTimer
            );

            room.emptyTimer =
                null;

            console.log(
                `Room ${roomCode} grace period cancelled`
            );
        }


        // Add user

        room.users.set(
            socket.id,
            username
        );


        socket.username =
            username;

        socket.roomCode =
            roomCode;


        socket.join(
            roomCode
        );


        console.log(
            `${username} joined ${roomCode} ` +
            `(${room.users.size}/${room.capacity})`
        );


        // Tell joining user

        socket.emit(
            "room_joined",
            {
                roomCode:
                    roomCode,

                expiresAt:
                    room.expiresAt,

                duration:
                    room.duration,

                users:
                    [...room.users.values()]
            }
        );


        // Send previous messages

        for (
            const message of room.messages.values()
        ) {

            socket.emit(
                "chat_message",
                {
                    ...message
                }
            );
        }


        // Notify existing users

        socket.to(roomCode).emit(
            "user_joined",
            username
        );

    });


    // ====================================
    // CHAT MESSAGE
    // ====================================

    socket.on("chat_message", (data) => {

        const roomCode =
            socket.roomCode;

        const room =
            rooms.get(roomCode);


        if (!room) {
            return;
        }


        if (
            !room.users.has(socket.id)
        ) {

            return;
        }


        const message =
            String(data.message || "").trim();


        if (!message) {
            return;
        }


        if (message.length > 1000) {
            return;
        }


        const username =
            room.users.get(
                socket.id
            );


        // Unique message ID

        const messageId =
            `${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 8)}`;


        // All users except sender

        const recipients =
            [...room.users.entries()]
                .filter(
                    ([id]) =>
                        id !== socket.id
                )
                .map(
                    ([, name]) => name
                );


        const messageData = {

            id:
                messageId,

            username:
                username,

            message:
                message,

            timestamp:
                Date.now(),

            senderId:
                socket.id,

            deliveredTo:
                recipients,

            seenBy:
                []
        };


        room.messages.set(
            messageId,
            messageData
        );


        // Broadcast to room

        io.to(roomCode).emit(
            "chat_message",
            {
                ...messageData
            }
        );

    });


    // ====================================
    // MESSAGE SEEN
    // ====================================

    socket.on("message_seen", (data) => {

        const room =
            rooms.get(
                socket.roomCode
            );


        if (!room) {
            return;
        }


        const message =
            room.messages.get(
                data.messageId
            );


        if (!message) {
            return;
        }


        const username =
            room.users.get(
                socket.id
            );


        if (!username) {
            return;
        }


        // Sender cannot mark own message as seen

        if (
            message.senderId ===
            socket.id
        ) {

            return;
        }


        // Make sure this user was a recipient

        if (
            !message.deliveredTo.includes(
                username
            )
        ) {

            return;
        }


        // Add user to seen list only once

        if (
            !message.seenBy.includes(
                username
            )
        ) {

            message.seenBy.push(
                username
            );
        }


        // Update sender

        io.to(message.senderId).emit(
            "message_status_update",
            {
                messageId:
                    message.id,

                deliveredTo:
                    message.deliveredTo,

                seenBy:
                    message.seenBy
            }
        );

    });


    // ====================================
    // TYPING START
    // ====================================

    socket.on("typing_start", () => {

        const roomCode =
            socket.roomCode;

        const room =
            rooms.get(roomCode);


        if (!room) {
            return;
        }


        if (
            !room.users.has(socket.id)
        ) {

            return;
        }


        const username =
            room.users.get(
                socket.id
            );


        socket.to(roomCode).emit(
            "user_typing",
            username
        );

    });


    // ====================================
    // TYPING STOP
    // ====================================

    socket.on("typing_stop", () => {

        const roomCode =
            socket.roomCode;


        if (!roomCode) {
            return;
        }


        const username =
            socket.username;


        if (!username) {
            return;
        }


        socket.to(roomCode).emit(
            "user_stopped_typing",
            username
        );

    });


    // ====================================
    // LEAVE ROOM
    // ====================================

    socket.on("leave_room", () => {

        leaveRoom(
            socket
        );

    });


    // ====================================
    // DISCONNECT
    // ====================================

    socket.on("disconnect", () => {

        leaveRoom(
            socket,
            true
        );

    });

});


// ========================================
// LEAVE ROOM FUNCTION
// ========================================

function leaveRoom(socket, isDisconnect = false) {

    const roomCode =
        socket.roomCode;

    const username =
        socket.username;


    if (
        !roomCode ||
        !username
    ) {

        return;
    }


    const room =
        rooms.get(roomCode);


    if (!room) {

        socket.roomCode =
            null;

        socket.username =
            null;

        return;
    }


    // Remove user

    if (
        room.users.has(socket.id)
    ) {

        room.users.delete(
            socket.id
        );

    }


    console.log(
        `${username} left ${roomCode} ` +
        `(${room.users.size}/${room.capacity})`
    );


    // Stop typing

    socket.to(roomCode).emit(
        "user_stopped_typing",
        username
    );


    // Notify remaining users

    socket.to(roomCode).emit(
        "user_left",
        username
    );


    // Leave Socket.IO room

    socket.leave(
        roomCode
    );


    // Explicit leave acknowledgement

    if (!isDisconnect) {

        socket.emit(
            "room_left"
        );

    }


    // Clear local socket room data

    socket.roomCode =
        null;

    socket.username =
        null;


    // Start grace period if empty

    if (
        room.users.size === 0
    ) {

        startEmptyRoomTimer(
            roomCode,
            room
        );

    }

}


// ========================================
// SERVER
// ========================================

const PORT = 3000;

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);