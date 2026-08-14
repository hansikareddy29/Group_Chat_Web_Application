# Real-Time Group Chat Application

A real-time group chat application built using **Node.js, Express, Socket.IO, HTML, CSS, and JavaScript**.

The application allows users to create or join temporary chat rooms, communicate in real time, see other participants, track message status, and receive live updates when users join or leave.

---

## ✨ Features

### 🏠 Room Creation

Users can create their own chat room by providing:

- Username
- Room capacity
- Optional room duration

Each room receives a unique **room code** that can be shared with other users.

---

### 🔑 Join Room

Users can join an existing room using:

- Username
- Room code

The server validates the room before allowing the user to join.

---

### 👤 Unique Usernames

Usernames must be unique within a room.

Username matching is **case-insensitive**.

For example:

```text
Hansika
hansika
HANSIKA
are treated as the same username.

If a username is already being used, the user cannot join the room with that name.

🙋 Current User Display

Every user can clearly see their own username in the chat interface:

You: Hansika

This makes it easy to identify which account is currently being used.

👥 Participants

The chat interface displays the current number of participants and the room capacity:

👥 Participants 3/10

The participant list is hidden by default.

Clicking Participants itself expands the list:

👥 Participants 3/10


● Hansika
● Rahul
● Priya

Clicking Participants again collapses the list.

The list is automatically updated when someone joins or leaves the room.

🚪 Leave Room

Users can leave the room using the Leave button.

Before leaving, the application asks for confirmation.

After leaving:

The user is removed from the room
Other users are notified
The participant count is updated
The participant list is updated
The user is returned to the home screen
🔔 Join & Leave Notifications

All users in a room receive real-time system notifications when someone joins or leaves.

Example:

Rahul joined the room

or

Rahul left the room
💬 Real-Time Messaging

Messages are delivered instantly using WebSockets through Socket.IO.

Messages display:

Username
Message content
Timestamp
Message status

Example:

Rahul:
Hey everyone!


10:32 AM

Messages sent by the current user are displayed separately from messages received from other users.

⌨️ Typing Indicator

The application provides a real-time typing indicator.

When another user is typing:

Rahul is typing...

If multiple users are typing:

Rahul and Priya are typing...

For more users:

3 people are typing...

The typing indicator automatically disappears when the user stops typing.

✓ Message Status

Messages sent by a user have delivery status tracking.

A message can have the following statuses:

Sent
Delivered
Seen

The status is displayed next to the message.

Example:

You:
Hello everyone!


10:35 AM   Seen
📋 Message Information

Clicking on one of your own messages opens a Message Info window.

It shows the message and the status for each recipient.

Example:

Message Info


Hello everyone!


Rahul             Seen
Priya             Delivered
Arjun             Seen

This allows the sender to see who has received and seen the message.

📋 Copy Room Code

Users can copy the current room code using the Copy Code button.

Example:

Room ABC123


[ Copy Code ]

After copying, the button temporarily changes to:

Copied
⏱️ Temporary Rooms

Rooms can optionally have a duration.

Available durations include:

1 minute
5 minutes
10 minutes
30 minutes
60 minutes
120 minutes
No duration

When a duration is selected, users can see a live countdown:

Room expires in: 4m 32s
⚠️ Room Expiry Warnings

Users receive warnings before a timed room expires.

For example:

Room expires in 5 minutes.

and:

Room expires in 1 minute.

When the room expires, users receive:

This room has expired.

Messaging is then disabled.

🧹 Empty Room Grace Period

When the last user leaves a room, the room does not immediately get deleted.

Instead, an empty-room grace period is started.

If nobody rejoins during the grace period, the room is removed from the server.

This prevents unnecessary persistence of abandoned rooms while still allowing a short period for users to return.

🔄 Live Participant Synchronization

Participant information is synchronized in real time.

When someone joins or leaves, every connected user receives the updated:

Participant count
Room capacity
Participant list

No page refresh is required.

🌐 Real-Time Connection Status

The interface displays the current connection status.

Example:

Connected

If the WebSocket connection is lost:

Disconnected
🛠️ Tech Stack
Frontend
HTML5
CSS3
JavaScript
Backend
Node.js
Express.js
Real-Time Communication
Socket.IO
WebSockets
🏗️ Architecture
┌──────────────────────┐
│      Frontend        │
│  HTML / CSS / JS     │
└──────────┬───────────┘
           │
           │ Socket.IO
           ▼
┌──────────────────────┐
│      Node.js         │
│      Express         │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│      Socket.IO       │
│                      │
│  Room Management     │
│  User Management     │
│  Messaging           │
│  Typing Indicators   │
│  Message Status      │
│  Room Expiration     │
└──────────────────────┘
📁 Project Structure
group-chat/
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── index.js
├── package.json
├── package-lock.json
└── README.md
🚀 Installation
1. Clone the Repository
git clone <repository-url>

Navigate into the project:

cd group-chat
2. Install Dependencies
npm install
3. Start the Server
node index.js

The server will start on:

http://localhost:3000
4. Open the Application

Open the following URL in your browser:

http://localhost:3000
🧪 Testing the Application

For testing real-time functionality, open the application in multiple browser tabs.

For example:

Tab 1 → Hansika
Tab 2 → Rahul
Tab 3 → Priya

Create a room in Tab 1 and join the same room from the other tabs.

You can then test:

Real-time messaging
Unique usernames
Participant count
Participant list
Join notifications
Leave notifications
Typing indicators
Message delivery
Message seen status
Message information
Room capacity
Room expiry
Room expiry warnings
Leave functionality
🔐 Room Rules

Each room has:

A unique room code
A maximum participant capacity
An optional expiry duration
Unique usernames

Users cannot join a full room.

Users cannot use a username that is already present in the same room.

🔄 Real-Time Socket Events

The application uses Socket.IO events for real-time communication.

Important events include:

create_room
join_room
chat_message


typing_start
typing_stop


message_seen


leave_room


user_joined
user_left


room_users_update


message_status_update


room_warning
room_expired
📊 Current Feature Status
Feature	Status
Create Room	✅
Join Room	✅
Unique Usernames	✅
Current Username Display	✅
Room Capacity	✅
Participant Count	✅
Expandable Participant List	✅
Leave Room	✅
Join Notifications	✅
Leave Notifications	✅
Real-Time Messaging	✅
Typing Indicator	✅
Message Delivery Status	✅
Message Seen Status	✅
Message Info	✅
Copy Room Code	✅
Room Duration	✅
Room Countdown	✅
Expiry Warnings	✅
Room Expiration	✅
Empty Room Grace Period	✅
Connection Status	✅
AI Group Chat Summary	🚧 Planned
🚧 Future Features
🤖 AI Group Chat Summary

When a room expires, the room creator/admin will receive an AI-generated summary of the entire conversation.

The summary can include:

Main topics discussed
Important decisions
Key points
Action items
Questions raised
Participants involved
Overall conversation summary

This feature is planned and has not been implemented yet.

🎯 Project Goals

The goal of this project is to build a lightweight, real-time group communication platform while exploring:

WebSockets
Real-time event-driven architecture
Room management
State synchronization
Message delivery tracking
User presence
Temporary rooms
Real-time UI updates
🔮 Future Improvements

Potential improvements include:

AI-powered group chat summaries
Persistent message storage
User authentication
Private messaging
File and image sharing
Emoji support
Message reactions
Message editing and deletion
Online/offline presence
Improved room security
Database-backed room management
Scalable deployment
👩‍💻 Author

Gurrala Hansika

B.Tech Computer Science & Engineering
IIT Bhilai


