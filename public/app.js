const socket = io();

const homeScreen = document.getElementById("homeScreen");
const chatScreen = document.getElementById("chatScreen");
const usernameInput = document.getElementById("usernameInput");
const joinButton = document.getElementById("joinButton");
const messagesElement = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const participantCount = document.getElementById("participantCount");
const participantsList = document.getElementById("participantsList");
const participantsToggle = document.getElementById("participantsToggle");
const typingIndicator = document.getElementById("typingIndicator");
const displayMyName = document.getElementById("displayMyName");

let myUsername = "";
let privateKey = null;
let typingTimeout;


// CRYPTO LOGIC 
async function generateKeys() {
    const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );
    privateKey = keyPair.privateKey;
    // Export public key to send to server so it can verify us
    return await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
}

async function signMessage(text) {
    const encoder = new TextEncoder();
    const sigBuffer = await window.crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        privateKey,
        encoder.encode(text)
    );
    // Convert buffer to Hex string for transport
    return Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}


// SOCKET ACTIONS & LISTENERS
joinButton.addEventListener("click", async () => {
    const name = usernameInput.value.trim();
    if (!name) return;
    
    // Generate keys before joining
    const publicKey = await generateKeys();
    myUsername = name;
    socket.emit("join_room", { username: name, publicKey });
});

socket.on("room_joined", (data) => {
    homeScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    displayMyName.textContent = `You: ${myUsername}`;
    updateParticipantsUI(data.users, data.capacity);
});

socket.on("room_error", (msg) => alert(msg));

// Load History
socket.on("message_history", (history) => {
    if (history.length > 0) {
        addSystemMessage("--- Past Messages (Retrieved from DB) ---");
        history.forEach(msg => renderMessage(msg));
        addSystemMessage("--- New Messages ---");
    }
});

sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    // Create Digital Signature
    const signature = await signMessage(text);
    socket.emit("chat_message", { message: text, signature });
    socket.emit("typing_stop");
    messageInput.value = "";
}

socket.on("chat_message", (data) => renderMessage(data));

// UI RENDERING 
function renderMessage(data) {
    const isMine = data.username === myUsername;
    const div = document.createElement("div");
    div.className = `message ${isMine ? "mine" : "other"}`;


    // If the server verified the signature, we show a green badge
    let verificationBadge = "";
    if (data.verified === true) {
        verificationBadge = `<span style="color:#28a745; font-size:9px; font-weight:bold; margin-left:8px;">✓ Verified Signature</span>`;
    } else if (data.verified === false) {
        verificationBadge = `<span style="color:#dc3545; font-size:9px; font-weight:bold; margin-left:8px;">✗ Unverified</span>`;
    }

    div.innerHTML = `
        <div class="message-header">
            ${isMine ? "You" : data.username} 
            <span style="font-size:10px; opacity:0.6">${data.timestamp}</span>
            ${verificationBadge}
        </div>
        <div class="message-text">${data.message}</div>
    `;
    messagesElement.appendChild(div);
    messagesElement.scrollTop = messagesElement.scrollHeight;
}


// TYPING INDICATORS
messageInput.addEventListener("input", () => {
    socket.emit("typing_start");
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("typing_stop"), 2000);
});

socket.on("user_typing", (name) => {
    typingIndicator.textContent = `${name} is typing...`;
});

socket.on("user_stopped_typing", () => {
    typingIndicator.textContent = "";
});


// PARTICIPANTS & SYSTEM
socket.on("user_joined", (name) => addSystemMessage(`${name} joined`));
socket.on("user_left", (name) => addSystemMessage(`${name} left`));

socket.on("room_users_update", (data) => {
    updateParticipantsUI(data.users, data.capacity);
});

function updateParticipantsUI(users, capacity) {
    participantCount.textContent = `${users.length}/${capacity}`;
    participantsList.innerHTML = users.map(u => `<div class="participant">● ${u} ${u === myUsername ? "(You)" : ""}</div>`).join("");
}

participantsToggle.addEventListener("click", () => {
    participantsList.classList.toggle("hidden");
});

function addSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "system-message";
    div.textContent = text;
    messagesElement.appendChild(div);
    messagesElement.scrollTop = messagesElement.scrollHeight;
}

document.getElementById("leaveButton").addEventListener("click", () => {
    socket.emit("leave_room");
    location.reload();
});