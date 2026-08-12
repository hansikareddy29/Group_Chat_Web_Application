const socket = io();


// ========================================
// DOM ELEMENTS
// ========================================

const roomSection =
    document.getElementById("roomSection");

const chat =
    document.getElementById("chat");

const createUsername =
    document.getElementById("createUsername");

const roomCapacity =
    document.getElementById("roomCapacity");

const roomDuration =
    document.getElementById("roomDuration");

const createRoomButton =
    document.getElementById("createRoomButton");

const joinUsername =
    document.getElementById("joinUsername");

const roomCodeInput =
    document.getElementById("roomCodeInput");

const joinRoomButton =
    document.getElementById("joinRoomButton");

const roomCodeDisplay =
    document.getElementById("roomCodeDisplay");

const roomExpiry =
    document.getElementById("roomExpiry");

const roomStatus =
    document.getElementById("roomStatus");

const messages =
    document.getElementById("messages");

const messageInput =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");


// ========================================
// CLIENT STATE
// ========================================

let username = "";

let currentRoom = "";

let roomExpiresAt = null;

let countdownInterval = null;

let expiryWarnings = new Set();

let lastMessageSequence = 0;


// messageId -> DOM element

const myMessages = new Map();


// ========================================
// CREATE ROOM
// ========================================

createRoomButton.addEventListener(
    "click",
    () => {

        const name =
            createUsername.value.trim();

        const capacity =
            Number(roomCapacity.value);

        const duration =
            roomDuration.value;


        if (name === "") {

            alert(
                "Please enter a username."
            );

            return;
        }


        if (
            !Number.isInteger(capacity) ||
            capacity < 2 ||
            capacity > 100
        ) {

            alert(
                "Capacity must be between 2 and 100."
            );

            return;
        }


        username = name;


        socket.emit(
            "create_room",
            {
                username,
                capacity,
                duration
            }
        );

    }
);


// ========================================
// JOIN ROOM
// ========================================

joinRoomButton.addEventListener(
    "click",
    () => {

        const name =
            joinUsername.value.trim();

        const code =
            roomCodeInput.value
                .trim()
                .toUpperCase();


        if (name === "") {

            alert(
                "Please enter a username."
            );

            return;
        }


        if (code === "") {

            alert(
                "Please enter a room code."
            );

            return;
        }


        username = name;

        currentRoom = code;


        socket.emit(
            "join_room",
            {
                username,
                roomCode: code
            }
        );

    }
);


// ========================================
// ROOM CREATED
// ========================================

socket.on(
    "room_created",
    (data) => {

        currentRoom =
            data.roomCode;

        roomExpiresAt =
            data.expiresAt;


        enterChat();


        addSystemMessage(
            `Room created. Code: ${currentRoom}`
        );

    }
);


// ========================================
// ROOM JOINED
// ========================================

socket.on(
    "room_joined",
    (data) => {

        currentRoom =
            data.roomCode;

        roomExpiresAt =
            data.expiresAt;


        enterChat();


        addSystemMessage(
            `You joined room ${currentRoom}`
        );

    }
);


// ========================================
// ENTER CHAT
// ========================================

function enterChat() {

    roomSection.style.display =
        "none";

    chat.style.display =
        "block";


    roomCodeDisplay.textContent =
        currentRoom;


    roomStatus.textContent =
        "Connected";


    startCountdown();


    messageInput.focus();

}


// ========================================
// COUNTDOWN
// ========================================

function startCountdown() {

    if (countdownInterval) {

        clearInterval(
            countdownInterval
        );

    }


    expiryWarnings.clear();


    if (!roomExpiresAt) {

        roomExpiry.textContent =
            "No expiry";

        return;
    }


    updateCountdown();


    countdownInterval =
        setInterval(
            updateCountdown,
            1000
        );

}


function updateCountdown() {

    if (!roomExpiresAt) {

        roomExpiry.textContent =
            "No expiry";

        return;
    }


    const remaining =
        roomExpiresAt -
        Date.now();


    if (remaining <= 0) {

        roomExpiry.textContent =
            "Room expired";


        roomStatus.textContent =
            "Expired";


        clearInterval(
            countdownInterval
        );


        return;
    }


    const totalSeconds =
        Math.floor(
            remaining / 1000
        );


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );


    const seconds =
        totalSeconds % 60;


    let timeText;


    if (hours > 0) {

        timeText =
            `${hours}h ` +
            `${minutes}m ` +
            `${seconds}s`;

    } else {

        timeText =
            `${minutes}m ` +
            `${seconds}s`;

    }


    roomExpiry.textContent =
        `Room expires in: ${timeText}`;


    checkExpiryWarning(
        totalSeconds
    );

}


// ========================================
// EXPIRY WARNINGS
// ========================================

function checkExpiryWarning(
    totalSeconds
) {

    const warningTimes = [
        600,
        300,
        60
    ];


    for (
        const warningTime
        of warningTimes
    ) {

        if (
            totalSeconds <= warningTime &&
            totalSeconds > warningTime - 2 &&
            !expiryWarnings.has(
                warningTime
            )
        ) {

            expiryWarnings.add(
                warningTime
            );


            let text;


            if (
                warningTime === 600
            ) {

                text =
                    "Room expires in 10 minutes.";

            }

            else if (
                warningTime === 300
            ) {

                text =
                    "Room expires in 5 minutes.";

            }

            else {

                text =
                    "Room expires in 1 minute.";

            }


            addSystemMessage(text);

        }

    }

}


// ========================================
// SEND MESSAGE
// ========================================

sendButton.addEventListener(
    "click",
    sendMessage
);


messageInput.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter"
        ) {

            event.preventDefault();

            sendMessage();

        }

    }
);


function sendMessage() {

    const text =
        messageInput.value.trim();


    if (text === "") {

        return;
    }


    socket.emit(
        "chat_message",
        {
            roomCode:
                currentRoom,

            message:
                text
        }
    );


    messageInput.value = "";

}


// ========================================
// RECEIVE MESSAGE
// ========================================

socket.on(
    "chat_message",
    (data) => {

        // Ignore old/out-of-order messages

        if (
            data.sequence <=
            lastMessageSequence
        ) {

            return;
        }


        lastMessageSequence =
            data.sequence;


        const element =
            document.createElement("div");


        element.className =
            "message";


        const userElement =
            document.createElement("span");


        userElement.className =
            "message-user";


        const textElement =
            document.createElement("span");


        if (
            data.username ===
            username
        ) {

            element.classList.add(
                "mine"
            );


            userElement.textContent =
                "You:";

        } else {

            userElement.textContent =
                `${data.username}:`;

        }


        textElement.textContent =
            ` ${data.message}`;


        element.appendChild(
            userElement
        );


        element.appendChild(
            textElement
        );


        // --------------------------------
        // Own message status
        // --------------------------------

        if (
            data.username ===
            username
        ) {

            const status =
                document.createElement(
                    "span"
                );


            status.className =
                "message-status";


            status.textContent =
                "Sent";


            element.appendChild(
                status
            );


            myMessages.set(
                data.messageId,
                {
                    statusElement:
                        status
                }
            );

        }


        messages.appendChild(
            element
        );


        messages.scrollTop =
            messages.scrollHeight;


        // Tell server message is visible

        socket.emit(
            "message_seen",
            {
                messageId:
                    data.messageId
            }
        );

    }
);


// ========================================
// MESSAGE SENT
// ========================================

socket.on(
    "message_sent",
    (messageId) => {

        const message =
            myMessages.get(
                messageId
            );


        if (!message) {

            return;
        }


        message.statusElement.textContent =
            "Sent";

    }
);


// ========================================
// MESSAGE SEEN
// ========================================

socket.on(
    "message_seen_update",
    (data) => {

        const message =
            myMessages.get(
                data.messageId
            );


        if (!message) {

            return;
        }


        if (
            data.seenCount >=
            data.totalUsers
        ) {

            message.statusElement.textContent =
                "Seen";

        }

    }
);


// ========================================
// USER JOINED
// ========================================

socket.on(
    "user_joined",
    (name) => {

        addSystemMessage(
            `${name} joined the room`
        );

    }
);


// ========================================
// USER LEFT
// ========================================

socket.on(
    "user_left",
    (name) => {

        addSystemMessage(
            `${name} left the room`
        );

    }
);


// ========================================
// SYSTEM MESSAGE
// ========================================

function addSystemMessage(text) {

    const element =
        document.createElement("div");


    element.className =
        "system-message";


    element.textContent =
        text;


    messages.appendChild(
        element
    );


    messages.scrollTop =
        messages.scrollHeight;

}


// ========================================
// ROOM ERROR
// ========================================

socket.on(
    "room_error",
    (message) => {

        alert(message);

    }
);


// ========================================
// ROOM EXPIRED
// ========================================

socket.on(
    "room_expired",
    () => {

        roomExpiry.textContent =
            "Room expired";


        roomStatus.textContent =
            "Expired";


        addSystemMessage(
            "This room has expired."
        );


        messageInput.disabled =
            true;


        sendButton.disabled =
            true;


        if (countdownInterval) {

            clearInterval(
                countdownInterval
            );

        }

    }
);


// ========================================
// SOCKET DISCONNECTED
// ========================================

socket.on(
    "disconnect",
    () => {

        roomStatus.textContent =
            "Disconnected";

    }
);


// ========================================
// SOCKET RECONNECTED
// ========================================

socket.on(
    "connect",
    () => {

        if (
            currentRoom !== ""
        ) {

            roomStatus.textContent =
                "Connected";

        }

    }
);