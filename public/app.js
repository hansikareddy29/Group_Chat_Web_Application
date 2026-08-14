const socket = io();


// ========================================
// HOME ELEMENTS
// ========================================

const homeScreen =
    document.getElementById("homeScreen");

const createUsername =
    document.getElementById("createUsername");

const capacityInput =
    document.getElementById("capacity");

const durationInput =
    document.getElementById("duration");

const createButton =
    document.getElementById("createButton");

const joinUsername =
    document.getElementById("joinUsername");

const roomCodeInput =
    document.getElementById("roomCodeInput");

const joinButton =
    document.getElementById("joinButton");

const errorMessage =
    document.getElementById("errorMessage");


// ========================================
// CHAT ELEMENTS
// ========================================

const chatScreen =
    document.getElementById("chatScreen");

const roomCodeElement =
    document.getElementById("roomCode");


const currentUsernameElement =
    document.getElementById(
        "currentUsername"
    );


const participantCount =
    document.getElementById(
        "participantCount"
    );

const participantsToggle =
    document.getElementById(
        "participantsToggle"
    );


const participantsArrow =
    document.getElementById(
        "participantsArrow"
    );


const participantsList =
    document.getElementById(
        "participantsList"
    );

const timerElement =
    document.getElementById("timer");

const copyCodeButton =
    document.getElementById("copyCodeButton");

const leaveButton =
    document.getElementById("leaveButton");

const messagesElement =
    document.getElementById("messages");

const messageInput =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");

const typingIndicator =
    document.getElementById("typingIndicator");


// ========================================
// MESSAGE INFO
// ========================================

const messageInfoModal =
    document.getElementById(
        "messageInfoModal"
    );

const infoMessage =
    document.getElementById(
        "infoMessage"
    );

const infoUsers =
    document.getElementById(
        "infoUsers"
    );

const closeInfoButton =
    document.getElementById(
        "closeInfoButton"
    );


// ========================================
// STATE
// ========================================

let username = "";

let currentRoomCode = "";

let expiresAt = null;

let timerInterval = null;

let typingTimeout = null;

let currentlyTypingUsers =
    new Set();


// ========================================
// MESSAGE STORAGE
// ========================================

const messageElements =
    new Map();


// ========================================
// CREATE ROOM
// ========================================

createButton.addEventListener(
    "click",
    () => {

        errorMessage.textContent = "";

        const name =
            createUsername.value.trim();

        const capacity =
            Number(
                capacityInput.value
            );

        const duration =
            durationInput.value;


        socket.emit(
            "create_room",
            {
                username: name,

                capacity: capacity,

                duration: duration
            }
        );

    }
);


// ========================================
// JOIN ROOM
// ========================================

joinButton.addEventListener(
    "click",
    () => {

        errorMessage.textContent = "";

        const name =
            joinUsername.value.trim();

        const roomCode =
            roomCodeInput.value
                .trim()
                .toUpperCase();


        socket.emit(
            "join_room",
            {
                username: name,

                roomCode: roomCode
            }
        );

    }
);

participantsToggle.addEventListener(
    "click",
    () => {

        const isHidden =
            participantsList.classList.contains(
                "hidden"
            );


        if (isHidden) {

            participantsList.classList.remove(
                "hidden"
            );

            participantsArrow.textContent =
                "▲";

        } else {

            participantsList.classList.add(
                "hidden"
            );

            participantsArrow.textContent =
                "▼";

        }

    }
);
// ========================================
// SEND BUTTON
// ========================================

sendButton.addEventListener(
    "click",
    sendMessage
);


// ========================================
// ENTER KEY
// ========================================

messageInput.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter"
        ) {

            event.preventDefault();

            stopTyping();

            sendMessage();

        }

    }
);


// ========================================
// TYPING
// ========================================

messageInput.addEventListener(
    "input",
    () => {

        if (
            messageInput.value.trim() === ""
        ) {

            stopTyping();

            return;
        }


        /*
         * Only send typing_start once.
         * Otherwise every keystroke would
         * generate another socket event.
         */

        if (
            messageInput.dataset.isTyping !== "true"
        ) {

            socket.emit(
                "typing_start"
            );

            messageInput.dataset.isTyping =
                "true";
        }


        clearTimeout(
            typingTimeout
        );


        /*
         * If the user does not type
         * anything for 1200ms,
         * automatically stop typing.
         */

        typingTimeout =
            setTimeout(
                () => {

                    stopTyping();

                },
                1200
            );

    }
);


// ========================================
// STOP TYPING
// ========================================

function stopTyping() {

    clearTimeout(
        typingTimeout
    );


    if (
        messageInput.dataset.isTyping === "true"
    ) {

        socket.emit(
            "typing_stop"
        );

        messageInput.dataset.isTyping =
            "false";
    }

}


// ========================================
// SEND MESSAGE
// ========================================

function sendMessage() {

    const message =
        messageInput.value.trim();


    if (!message) {
        return;
    }


    socket.emit(
        "chat_message",
        {
            message:
                message
        }
    );


    messageInput.value = "";

    stopTyping();

    messageInput.focus();

}


// ========================================
// ROOM CREATED
// ========================================

socket.on(
    "room_created",
    (data) => {

        username =
            createUsername.value.trim();

        enterChat(
            data
        );


        addSystemMessage(
            `Room created. Code: ${data.roomCode}`
        );

    }
);


// ========================================
// ROOM JOINED
// ========================================

socket.on(
    "room_joined",
    (data) => {

        username =
            joinUsername.value.trim();

        enterChat(
            data
        );


        addSystemMessage(
            `You joined room ${data.roomCode}`
        );

    }
);


// ========================================
// ENTER CHAT
// ========================================

function enterChat(data) {

    currentRoomCode =
        data.roomCode;

    expiresAt =
        data.expiresAt;


    roomCodeElement.textContent =
        currentRoomCode;


    currentUsernameElement.textContent =
        `You: ${username}`;


    updateParticipants(
        data.users,
        data.capacity
    );


    homeScreen.classList.add(
        "hidden"
    );

    chatScreen.classList.remove(
        "hidden"
    );


    messageInput.disabled =
        false;

    sendButton.disabled =
        false;

    copyCodeButton.disabled =
        false;

    leaveButton.disabled =
        false;


    connectionStatus.textContent =
        "Connected";


    startTimer();

    messageInput.focus();

}

function updateParticipants(
    users,
    capacity
) {

    users =
        users || [];


    capacity =
        capacity || 0;


    participantCount.textContent =
        `${users.length} / ${capacity}`;


    participantsList.innerHTML =
        "";


    users.forEach(
        (name) => {

            const participant =
                document.createElement(
                    "span"
                );


            participant.className =
                "participant";


            if (
                name.toLowerCase() ===
                username.toLowerCase()
            ) {

                participant.classList.add(
                    "you"
                );

            }


            const dot =
                document.createElement(
                    "span"
                );

            dot.textContent =
                "●";


            const nameElement =
                document.createElement(
                    "span"
                );

            nameElement.textContent =
                name;


            participant.appendChild(
                dot
            );

            participant.appendChild(
                nameElement
            );


            participantsList.appendChild(
                participant
            );

        }
    );

}
// ========================================
// ROOM ERROR
// ========================================

socket.on(
    "room_error",
    (message) => {

        errorMessage.textContent =
            message;

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
// PARTICIPANT COUNT UPDATE
// ========================================

socket.on(
    "room_users_update",
    (data) => {

        const users =
            data.users || [];


        const capacity =
            data.capacity || 0;


        participantCount.textContent =
            `Participants: ${users.length} / ${capacity}`;

    }
);
socket.on(
    "room_users_update",
    (data) => {

        updateParticipants(
            data.users,
            data.capacity
        );

    }
);
// ========================================
// USER LEFT
// ========================================

socket.on(
    "user_left",
    (name) => {

        /*
         * Remove this user from the
         * typing list as well.
         */

        currentlyTypingUsers.delete(
            name
        );

        updateTypingIndicator();


        /*
         * Show notification to
         * every remaining user.
         */

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
        document.createElement(
            "div"
        );


    element.className =
        "system-message";


    element.textContent =
        text;


    messagesElement.appendChild(
        element
    );


    scrollToBottom();

}


// ========================================
// CHAT MESSAGE
// ========================================

socket.on(
    "chat_message",
    (data) => {

        renderMessage(
            data
        );

    }
);


// ========================================
// RENDER MESSAGE
// ========================================

function renderMessage(data) {

    const isMine =
        data.senderId === socket.id;


    const messageElement =
        document.createElement(
            "div"
        );


    messageElement.classList.add(
        "message"
    );


    messageElement.classList.add(
        isMine
            ? "mine"
            : "other"
    );


    // ====================================
    // HEADER
    // ====================================

    const header =
        document.createElement(
            "div"
        );


    header.className =
        "message-header";


    header.textContent =
        isMine
            ? "You:"
            : `${data.username}:`;


    // ====================================
    // MESSAGE TEXT
    // ====================================

    const text =
        document.createElement(
            "div"
        );


    text.className =
        "message-text";


    text.textContent =
        data.message;


    // ====================================
    // FOOTER
    // ====================================

    const footer =
        document.createElement(
            "div"
        );


    footer.className =
        "message-footer";


    const time =
        document.createElement(
            "span"
        );


    time.textContent =
        formatTime(
            data.timestamp
        );


    footer.appendChild(
        time
    );


    // ====================================
    // MESSAGE STATUS
    // ====================================

    let status = null;


    if (isMine) {

        status =
            document.createElement(
                "span"
            );


        status.className =
            "message-status";


        status.textContent =
            getMessageStatus(
                data
            );


        footer.appendChild(
            status
        );

    }


    // ====================================
    // APPEND MESSAGE
    // ====================================

    messageElement.appendChild(
        header
    );


    messageElement.appendChild(
        text
    );


    messageElement.appendChild(
        footer
    );


    messagesElement.appendChild(
        messageElement
    );


    // ====================================
    // STORE MESSAGE
    // ====================================

    messageElements.set(
        data.id,
        {
            element:
                messageElement,

            status:
                status,

            data:
                data
        }
    );


    // ====================================
    // CLICK OWN MESSAGE
    // ====================================

    if (isMine) {

        messageElement.addEventListener(
            "click",
            () => {

                showMessageInfo(
                    data
                );

            }
        );

    }


    // ====================================
    // MARK OTHER MESSAGE AS SEEN
    // ====================================

    if (!isMine) {

        socket.emit(
            "message_seen",
            {
                messageId:
                    data.id
            }
        );

    }


    scrollToBottom();

}


// ========================================
// MESSAGE STATUS
// ========================================

function getMessageStatus(data) {

    const delivered =
        data.deliveredTo || [];

    const seen =
        data.seenBy || [];


    /*
     * Nobody else has received it.
     */

    if (
        delivered.length === 0
    ) {

        return "Sent";

    }


    /*
     * Everyone who received it
     * has seen it.
     */

    if (
        seen.length ===
        delivered.length
    ) {

        return "Seen";

    }


    /*
     * At least one user received it,
     * but not everyone has seen it.
     */

    return "Delivered";

}


// ========================================
// STATUS UPDATE
// ========================================

socket.on(
    "message_status_update",
    (data) => {

        const message =
            messageElements.get(
                data.messageId
            );


        if (!message) {
            return;
        }


        message.data.deliveredTo =
            data.deliveredTo || [];


        message.data.seenBy =
            data.seenBy || [];


        if (message.status) {

            message.status.textContent =
                getMessageStatus(
                    message.data
                );

        }

    }
);


// ========================================
// MESSAGE INFO
// ========================================

function showMessageInfo(data) {

    infoMessage.textContent =
        data.message;


    infoUsers.innerHTML =
        "";


    const delivered =
        data.deliveredTo || [];

    const seen =
        data.seenBy || [];


    // ====================================
    // OVERALL STATUS
    // ====================================

    const overallRow =
        document.createElement(
            "div"
        );


    overallRow.className =
        "status-row message-overall-status";


    const overallName =
        document.createElement(
            "span"
        );


    overallName.className =
        "status-name";


    overallName.textContent =
        "Overall status";


    const overallValue =
        document.createElement(
            "span"
        );


    overallValue.className =
        "status-value";


    overallValue.textContent =
        getMessageStatus(
            data
        );


    overallRow.appendChild(
        overallName
    );


    overallRow.appendChild(
        overallValue
    );


    infoUsers.appendChild(
        overallRow
    );


    // ====================================
    // SENDER STATUS
    // ====================================

    const senderRow =
        document.createElement(
            "div"
        );


    senderRow.className =
        "status-row";


    const senderName =
        document.createElement(
            "span"
        );


    senderName.className =
        "status-name";


    senderName.textContent =
        "You";


    const senderStatus =
        document.createElement(
            "span"
        );


    senderStatus.className =
        "status-value";


    senderStatus.textContent =
        "Sent";


    senderRow.appendChild(
        senderName
    );


    senderRow.appendChild(
        senderStatus
    );


    infoUsers.appendChild(
        senderRow
    );


    // ====================================
    // RECIPIENT STATUS
    // ====================================

    if (
        delivered.length === 0
    ) {

        const row =
            document.createElement(
                "div"
            );


        row.className =
            "status-row";


        const nameElement =
            document.createElement(
                "span"
            );


        nameElement.className =
            "status-name";


        nameElement.textContent =
            "Other users";


        const statusElement =
            document.createElement(
                "span"
            );


        statusElement.className =
            "status-value";


        statusElement.textContent =
            "Not delivered";


        row.appendChild(
            nameElement
        );


        row.appendChild(
            statusElement
        );


        infoUsers.appendChild(
            row
        );

    } else {

        delivered.forEach(
            (name) => {

                const row =
                    document.createElement(
                        "div"
                    );


                row.className =
                    "status-row";


                const nameElement =
                    document.createElement(
                        "span"
                    );


                nameElement.className =
                    "status-name";


                nameElement.textContent =
                    name;


                const statusElement =
                    document.createElement(
                        "span"
                    );


                statusElement.className =
                    "status-value";


                statusElement.textContent =
                    seen.includes(name)
                        ? "Seen"
                        : "Delivered";


                row.appendChild(
                    nameElement
                );


                row.appendChild(
                    statusElement
                );


                infoUsers.appendChild(
                    row
                );

            }
        );

    }


    messageInfoModal.classList.remove(
        "hidden"
    );

}


// ========================================
// CLOSE INFO
// ========================================

closeInfoButton.addEventListener(
    "click",
    () => {

        messageInfoModal.classList.add(
            "hidden"
        );

    }
);


messageInfoModal.addEventListener(
    "click",
    (event) => {

        if (
            event.target ===
            messageInfoModal
        ) {

            messageInfoModal.classList.add(
                "hidden"
            );

        }

    }
);


// ========================================
// COPY ROOM CODE
// ========================================

copyCodeButton.addEventListener(
    "click",
    async () => {

        try {

            await navigator.clipboard.writeText(
                currentRoomCode
            );


            const oldText =
                copyCodeButton.textContent;


            copyCodeButton.textContent =
                "Copied";


            setTimeout(
                () => {

                    copyCodeButton.textContent =
                        oldText;

                },
                1500
            );

        } catch (error) {

            alert(
                `Room Code: ${currentRoomCode}`
            );

        }

    }
);


// ========================================
// LEAVE ROOM
// ========================================

leaveButton.addEventListener(
    "click",
    () => {

        const confirmed =
            confirm(
                "Are you sure you want to leave this room?"
            );


        if (!confirmed) {
            return;
        }


        stopTyping();


        socket.emit(
            "leave_room"
        );

    }
);


// ========================================
// ROOM LEFT
// ========================================

socket.on(
    "room_left",
    () => {

        resetChat();

    }
);


// ========================================
// RESET CHAT
// ========================================

function resetChat() {

    if (timerInterval) {

        clearInterval(
            timerInterval
        );

        timerInterval =
            null;

    }


    clearTimeout(
        typingTimeout
    );


    currentRoomCode =
        "";

    expiresAt =
        null;


    currentlyTypingUsers.clear();

    messageElements.clear();


    messagesElement.innerHTML =
        "";


    typingIndicator.textContent =
        "";


    messageInput.value =
        "";

    messageInput.dataset.isTyping =
        "false";


    messageInput.disabled =
        false;

    sendButton.disabled =
        false;

    copyCodeButton.disabled =
        false;

    leaveButton.disabled =
        false;


    timerElement.textContent =
        "No duration";


    connectionStatus.textContent =
        "Connected";


    errorMessage.textContent =
        "";


    chatScreen.classList.add(
        "hidden"
    );

    homeScreen.classList.remove(
        "hidden"
    );
   participantsList.innerHTML =
    "";

participantCount.textContent =
    "0 / 0";

participantsList.classList.add(
    "hidden"
);

participantsArrow.textContent =
    "▼";
currentUsernameElement.textContent =
    "You: -";
}


// ========================================
// TYPING RECEIVED
// ========================================

socket.on(
    "user_typing",
    (name) => {

        /*
         * Don't show our own name.
         */

        if (
            name === username
        ) {

            return;

        }


        currentlyTypingUsers.add(
            name
        );


        updateTypingIndicator();

    }
);


// ========================================
// TYPING STOPPED
// ========================================

socket.on(
    "user_stopped_typing",
    (name) => {

        currentlyTypingUsers.delete(
            name
        );


        updateTypingIndicator();

    }
);


// ========================================
// TYPING UI
// ========================================

function updateTypingIndicator() {

    const users =
        [
            ...currentlyTypingUsers
        ];


    if (
        users.length === 0
    ) {

        typingIndicator.textContent =
            "";

        return;

    }


    if (
        users.length === 1
    ) {

        typingIndicator.textContent =
            `${users[0]} is typing...`;

        return;

    }


    if (
        users.length === 2
    ) {

        typingIndicator.textContent =
            `${users[0]} and ${users[1]} are typing...`;

        return;

    }


    typingIndicator.textContent =
        `${users.length} people are typing...`;

}


// ========================================
// TIMER
// ========================================

function startTimer() {

    if (timerInterval) {

        clearInterval(
            timerInterval
        );

    }


    if (
        expiresAt === null
    ) {

        timerElement.textContent =
            "No duration";

        return;

    }


    updateTimer();


    timerInterval =
        setInterval(
            updateTimer,
            1000
        );

}


// ========================================
// UPDATE TIMER
// ========================================

function updateTimer() {

    if (
        expiresAt === null
    ) {

        timerElement.textContent =
            "No duration";

        return;

    }


    const remaining =
        Math.max(
            0,
            expiresAt - Date.now()
        );


    const totalSeconds =
        Math.floor(
            remaining / 1000
        );


    const minutes =
        Math.floor(
            totalSeconds / 60
        );


    const seconds =
        totalSeconds % 60;


    timerElement.textContent =
        `Room expires in: ${minutes}m ${String(seconds).padStart(2, "0")}s`;


    if (
        remaining <= 0
    ) {

        clearInterval(
            timerInterval
        );

    }

}


// ========================================
// ROOM WARNING
// ========================================

socket.on(
    "room_warning",
    (data) => {

        addSystemMessage(
            data.message
        );

    }
);


// ========================================
// ROOM EXPIRED
// ========================================

socket.on(
    "room_expired",
    () => {

        if (timerInterval) {

            clearInterval(
                timerInterval
            );

        }


        stopTyping();


        addSystemMessage(
            "This room has expired."
        );


        messageInput.disabled =
            true;

        sendButton.disabled =
            true;

        copyCodeButton.disabled =
            true;

        leaveButton.disabled =
            true;


        connectionStatus.textContent =
            "Room expired";


        timerElement.textContent =
            "Expired";

    }
);


// ========================================
// CONNECTION
// ========================================

socket.on(
    "connect",
    () => {

        connectionStatus.textContent =
            "Connected";

    }
);


// ========================================
// DISCONNECT
// ========================================

socket.on(
    "disconnect",
    () => {

        connectionStatus.textContent =
            "Disconnected";

    }
);


// ========================================
// FORMAT TIME
// ========================================

function formatTime(timestamp) {

    const date =
        new Date(timestamp);


    return date.toLocaleTimeString(
        [],
        {
            hour:
                "2-digit",

            minute:
                "2-digit"
        }
    );

}


// ========================================
// SCROLL
// ========================================

function scrollToBottom() {

    messagesElement.scrollTop =
        messagesElement.scrollHeight;

}