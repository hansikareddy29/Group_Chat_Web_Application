const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server =
    http.createServer(app);

const io =
    new Server(server);


app.use(
    express.static("public")
);


// ========================================
// ROOM STORAGE
// ========================================

const rooms = new Map();


// ========================================
// ROOM CODE
// ========================================

function generateRoomCode() {

    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

}


// ========================================
// MESSAGE ID
// ========================================

function generateMessageId() {

    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 10)
    );

}


// ========================================
// SOCKET CONNECTION
// ========================================

io.on(
    "connection",
    (socket) => {

        console.log(
            "Connected:",
            socket.id
        );


        // ====================================
        // CREATE ROOM
        // ====================================

        socket.on(
            "create_room",
            (data) => {

                const username =
                    String(
                        data.username || ""
                    ).trim();


                const capacity =
                    Number(
                        data.capacity
                    );


                let duration =
                    null;


                if (
                    data.duration !==
                    "none"
                ) {

                    duration =
                        Number(
                            data.duration
                        );

                }


                // Username

                if (
                    username.length === 0 ||
                    username.length > 30
                ) {

                    socket.emit(
                        "room_error",
                        "Username must be between 1 and 30 characters."
                    );

                    return;
                }


                // Capacity

                if (
                    !Number.isInteger(
                        capacity
                    ) ||
                    capacity < 2 ||
                    capacity > 100
                ) {

                    socket.emit(
                        "room_error",
                        "Capacity must be between 2 and 100."
                    );

                    return;
                }


                // Duration

                if (
                    duration !== null &&
                    (
                        !Number.isInteger(
                            duration
                        ) ||
                        duration < 1 ||
                        duration > 120
                    )
                ) {

                    socket.emit(
                        "room_error",
                        "Duration must be between 1 and 120 minutes."
                    );

                    return;
                }


                // Generate code

                let roomCode;


                do {

                    roomCode =
                        generateRoomCode();

                }

                while (
                    rooms.has(
                        roomCode
                    )
                );


                // Expiry

                let expiresAt =
                    null;


                if (
                    duration !== null
                ) {

                    expiresAt =
                        Date.now() +
                        duration *
                        60 *
                        1000;

                }


                // Room object

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

                    sequence:
                        0,

                    emptyTimer:
                        null,

                    durationTimer:
                        null

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


                // Duration timer

                if (
                    duration !== null
                ) {

                    room.durationTimer =
                        setTimeout(
                            () => {

                                const currentRoom =
                                    rooms.get(
                                        roomCode
                                    );


                                if (
                                    !currentRoom
                                ) {

                                    return;
                                }


                                io.to(
                                    roomCode
                                ).emit(
                                    "room_expired"
                                );


                                rooms.delete(
                                    roomCode
                                );


                                console.log(
                                    `Room ${roomCode} expired`
                                );

                            },

                            duration *
                            60 *
                            1000
                        );

                }


                socket.emit(
                    "room_created",
                    {
                        roomCode,
                        expiresAt
                    }
                );


                console.log(
                    `${username} created ${roomCode}`
                );

            }
        );


        // ====================================
        // JOIN ROOM
        // ====================================

        socket.on(
            "join_room",
            (data) => {

                const username =
                    String(
                        data.username || ""
                    ).trim();


                const roomCode =
                    String(
                        data.roomCode || ""
                    )
                    .trim()
                    .toUpperCase();


                const room =
                    rooms.get(
                        roomCode
                    );


                if (
                    username.length === 0 ||
                    username.length > 30
                ) {

                    socket.emit(
                        "room_error",
                        "Username must be between 1 and 30 characters."
                    );

                    return;
                }


                if (!room) {

                    socket.emit(
                        "room_error",
                        "Room does not exist."
                    );

                    return;
                }


                // Expiry check

                if (
                    room.expiresAt !== null &&
                    Date.now() >=
                        room.expiresAt
                ) {

                    socket.emit(
                        "room_error",
                        "Room has expired."
                    );

                    return;
                }


                // Capacity check

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


                // Cancel empty timer

                if (
                    room.emptyTimer
                ) {

                    clearTimeout(
                        room.emptyTimer
                    );

                    room.emptyTimer =
                        null;

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


                socket.emit(
                    "room_joined",
                    {
                        roomCode,
                        expiresAt:
                            room.expiresAt
                    }
                );


                socket.to(
                    roomCode
                ).emit(
                    "user_joined",
                    username
                );


                console.log(
                    `${username} joined ${roomCode}`
                );

            }
        );


        // ====================================
        // CHAT MESSAGE
        // ====================================

        socket.on(
            "chat_message",
            (data) => {

                const roomCode =
                    socket.roomCode;


                const room =
                    rooms.get(
                        roomCode
                    );


                if (!room) {

                    return;
                }


                // Verify membership

                if (
                    !room.users.has(
                        socket.id
                    )
                ) {

                    return;
                }


                // Verify expiry

                if (
                    room.expiresAt !== null &&
                    Date.now() >=
                        room.expiresAt
                ) {

                    return;
                }


                const message =
                    String(
                        data.message || ""
                    ).trim();


                if (
                    message.length === 0 ||
                    message.length > 1000
                ) {

                    return;
                }


                // --------------------------------
                // SERVER SEQUENCE NUMBER
                // --------------------------------

                room.sequence += 1;


                const sequence =
                    room.sequence;


                const messageId =
                    generateMessageId();


                const messageObject = {

                    messageId:

                        messageId,

                    sequence:

                        sequence,

                    senderId:

                        socket.id,

                    sender:

                        socket.username,

                    message:

                        message,

                    seenBy:

                        new Set([
                            socket.id
                        ])

                };


                room.messages.set(
                    messageId,
                    messageObject
                );


                // Broadcast

                io.to(
                    roomCode
                ).emit(
                    "chat_message",
                    {

                        messageId:

                            messageId,

                        sequence:

                            sequence,

                        username:

                            socket.username,

                        message:

                            message

                    }
                );


                // Server received it

                socket.emit(
                    "message_sent",
                    messageId
                );

            }
        );


        // ====================================
        // MESSAGE SEEN
        // ====================================

        socket.on(
            "message_seen",
            (data) => {

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


                // User must belong to room

                if (
                    !room.users.has(
                        socket.id
                    )
                ) {

                    return;
                }


                message.seenBy.add(
                    socket.id
                );


                const seenCount =
                    message.seenBy.size;


                const totalUsers =
                    room.users.size;


                // Tell sender

                io.to(
                    message.senderId
                ).emit(
                    "message_seen_update",
                    {

                        messageId:
                            data.messageId,

                        seenCount:

                            seenCount,

                        totalUsers:

                            totalUsers

                    }
                );

            }
        );


        // ====================================
        // DISCONNECT
        // ====================================

        socket.on(
            "disconnect",
            () => {

                const roomCode =
                    socket.roomCode;


                const username =
                    socket.username;


                if (
                    !roomCode
                ) {

                    return;
                }


                const room =
                    rooms.get(
                        roomCode
                    );


                if (!room) {

                    return;
                }


                room.users.delete(
                    socket.id
                );


                socket.to(
                    roomCode
                ).emit(
                    "user_left",
                    username
                );


                console.log(
                    `${username} left ${roomCode}`
                );


                // --------------------------------
                // Empty room grace period
                // --------------------------------

                if (
                    room.users.size === 0
                ) {

                    console.log(
                        `${roomCode} is empty. ` +
                        `Starting 2-minute grace period.`
                    );


                    room.emptyTimer =
                        setTimeout(
                            () => {

                                const currentRoom =
                                    rooms.get(
                                        roomCode
                                    );


                                if (
                                    !currentRoom
                                ) {

                                    return;
                                }


                                if (
                                    currentRoom.users.size ===
                                    0
                                ) {

                                    if (
                                        currentRoom.durationTimer
                                    ) {

                                        clearTimeout(
                                            currentRoom.durationTimer
                                        );

                                    }


                                    rooms.delete(
                                        roomCode
                                    );


                                    console.log(
                                        `${roomCode} deleted`
                                    );

                                }

                            },

                            2 * 60 * 1000
                        );

                }

            }
        );

    }
);


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