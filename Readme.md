# Persistent and Secure WebSocket Chat

A real-time group chat system implemented using Node.js, Socket.io, and SQLite. This project demonstrates four core security properties: **Persistence**, **Confidentiality**, **Integrity**, and **Authenticity**.

---

## 🚀 Features

* **Real-time Communication:** Built with WebSockets (Socket.io).
* **Persistence:** All messages are stored in a SQLite database (`chat.db`).
* **Confidentiality:** Messages are encrypted using **AES-256-GCM** before storage.
* **Integrity:** The system uses GCM Authentication Tags to detect and block tampered messages.
* **Authenticity:** Every message is digitally signed using **ECDSA (P-256)** signatures generated on the client side.
* **HTTPS/SSL:** Runs over a secure context to enable modern browser Cryptography APIs.

---

## 🛠️ Prerequisites

* **Node.js** (v14 or higher)
* **npm** (Node Package Manager)
* **OpenSSL** (Usually pre-installed on Linux/Mac; required for SSL generation)

---

## 📥 Installation & Setup

### 1. Clone the Repository

```bash
git clone <your-github-link>
cd Group_Chat_Web_Application
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Generate SSL Certificates

Modern browsers block the Web Crypto API on HTTP origins. You must generate a self-signed certificate to run the app over HTTPS.

Run the following command in the root folder:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

Press **Enter** for all prompts to use the default values.

### 4. Prepare the Database

The server will automatically create `chat.db` on its first run.

Ensure that the folder has write permissions.

---

## 🏃 Running the Application

### 1. Start the Server

```bash
node server/index.js
```

### 2. Access the Website

**Local:**

```text
https://localhost:3249
```

**Lab Server:**

```text
https://10.1.75.79:3249
```

### 3. Bypassing the SSL Warning

Since the certificate is self-signed, the browser will show a **"Your connection is not private"** warning.

1. Click **Advanced**.
2. Click **Proceed to ... (unsafe)**.

This step is necessary to enable the Digital Signature features.

---

## 🧪 Demonstration Guide

### 1. Persistence

Send a message, refresh the browser, and join again.

You will see your message displayed under the:

```text
--- Past Messages ---
```

section, proving that the message was retrieved from the database.

### 2. Digital Signatures (Authenticity)

Upon joining, each client generates a unique ECDSA key pair. Every message sent is digitally signed.

The server verifies the signature using the sender's public key.

**Evidence:**

Authentic messages show a green:

```text
✓ Verified Signature
```

badge in the UI.

The server console will also log:

```text
[SECURE] Signature VERIFIED
```

### 3. Tamper Detection (Integrity)

To demonstrate that the system detects modified messages:

1. Stop the server.
2. Manually edit a ciphertext value in `chat.db` using a SQLite viewer.
3. Restart the server and join the chat.

The modified message will be displayed as:

```text
[Message Corrupted]
```

This proves that the AES-GCM authentication tag detected the modification.

---

## 📂 Project Structure

```text
Group_Chat_Web_Application/
│
├── server/
│   └── index.js              # Main server logic
│                              # HTTPS, WebSockets, Encryption, Verification
│
├── public/
│   ├── app.js                # Client-side logic
│   │                          # Key generation, Signing, UI
│   └── index.html             # Chat interface
│
├── chat.db                    # SQLite database
├── cert.pem                   # SSL certificate
└── key.pem                    # SSL private key
```

## 📄 File Description

* **server/index.js** — Main server logic handling HTTPS, WebSockets, encryption, and signature verification.
* **public/app.js** — Client-side logic for ECDSA key generation, message signing, and UI handling.
* **public/index.html** — Frontend chat interface.
* **chat.db** — SQLite database used for persistent message storage.
* **cert.pem / key.pem** — Self-signed SSL certificate and private key generated locally.
