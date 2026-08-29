# Distributed Group Chat with Go Load Balancer & Shared PostgreSQL
This project implements a scalable, high-availability group chat application. It features a Go-based Load Balancer on Sys1 that distributes traffic across three Node.js backends (Sys2, Sys3, Sys4). Shared state is managed via a centralized PostgreSQL database on Sys2, with inter-node synchronization to ensure all users see messages in real-time regardless of their connected node.
# Architecture
* Sys1 (Entry Point): Go Load Balancer (Port 3249 External / 3000 Internal).
* Sys2: Node.js Backend + Centralized PostgreSQL Database.
* Sys3: Node.js Backend.
* Sys4: Node.js Backend.
## 1. Security: Generating SSL Certificates
Since the application uses the Web Crypto API, HTTPS is required. Generate self-signed certificates on all systems (or generate once and copy to all):
```
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj "/C=IN/ST=State/L=City/O=Organization/OU=Dept/CN=10.1.75.79"
```
## 2. Sys2: Centralized Database Setup (PostgreSQL)
Sys2 acts as the single source of truth for chat history.
**Installation**
```
sudo apt update
sudo apt install postgresql postgresql-contrib -y
sudo service postgresql start
```
**Database & User Configuration**
```
sudo -u postgres psql -c "CREATE DATABASE chat_db;"
sudo -u postgres psql -c "CREATE USER student WITH PASSWORD 'password123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE chat_db TO student;"
sudo -u postgres psql -d chat_db -c "GRANT ALL ON SCHEMA public TO student;"
```
**Enable Remote Connections**
Allow Sys3 and Sys4 to connect to Sys2:
### 1. Modify postgresql.conf:
```
echo "listen_addresses = '*'" | sudo tee -a /etc/postgresql/16/main/postgresql.conf
```
### 2. Modify pg_hba.conf:
```
echo "host all all 0.0.0.0/0 md5" | sudo tee -a /etc/postgresql/16/main/pg_hba.conf
```
### 3. Restart PostgreSQL:
```
sudo service postgresql restart
```
## 3. Sys2, Sys3, Sys4: Node.js Backend Setup
**Prerequisites**
Install Node.js and the required drivers:
```
npm install express socket.io pg
```
**Deployment (Background Mode)**
Run the following commands on the respective systems to ensure the server remains active after logout:
**Sys2:**
```
nohup env INSTANCE_NAME=Sys2 PORT=3000 node server/index.js > sys2.log 2>&1 &
```
**Sys3:**
```
nohup env INSTANCE_NAME=Sys3 PORT=3000 node server/index.js > sys3.log 2>&1 &
```
**Sys4:**
```
nohup env INSTANCE_NAME=Sys4 PORT=3000 node server/index.js > sys4.log 2>&1 &
```
## 4. Sys1: Go Load Balancer Setup
**Build the Load Balancer**
```
go build -o loadbalancer main.go
```
**Deployment (Background Mode)**
The Load Balancer uses HTTPS to encrypt traffic and routes it to the internal IPs of the backends:
```
nohup ./loadbalancer -port 3000 -tls=true -cert=cert.pem -key=key.pem -backends "https://172.17.0.51:3000,https://172.17.0.52:3000,https://172.17.0.53:3000" > lb.log 2>&1 &
```
## 5. Verification & Evaluation
**Accessing the Application**
Open your browser and navigate to:
**https://10.1.75.79:3249**

**Measuring Metrics**
Metrics are collected automatically by the Load Balancer. View them at:
**https://10.1.75.79:3249/lb/metrics**
* Testing Shared State
  * Open Tab 1 (assigned to Sys2).
  * Open Tab 2 (assigned to Sys4).
  * Send a message from Tab 1.
  * Verify that Tab 2 receives the message via the PostgreSQL sync loop (400ms polling).
## 6. Maintenance Commands
To stop all processes:
```
# Kill Node.js backends
pgrep -f node | xargs kill -9

# Kill Go Load Balancer
pgrep -f loadbalancer | xargs kill -9
```
To check logs:
```
tail -f lb.log      # Load Balancer logs
tail -f sys2.log    # Backend logs
```
