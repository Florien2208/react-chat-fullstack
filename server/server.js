const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const User = require("./models/User");
const Message = require("./models/Message");
const bcrypt = require("bcrypt");
const app = express();
const ChatHistory = require("./models/ChatHistory");
const moment = require("moment");
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

mongoose
  .connect("mongodb://127.0.0.1:27017/chaapp", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });


app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

app.post("/register", async (req, res) => {
  try {
    const { username, password, role, name, email } = req.body;
    if (!username || !password || !role || !name || !email) {
      return res
        .status(400)
        .send({ message: "Username and password are required" });
    }
    const user = new User({ username, password, role, name, email });
    await user.save();
    res.status(201).send(user);
  } catch (error) {
    console.error("Error during registration:", error);
    if (error.code === 11000) {
      return res.status(400).send({ message: "Username already exists" });
    }
    res.status(500).send({ message: "Internal server error" });
  }
});
app.get("/chatHistory", async (req, res) => {
  try {
    const { sender, recipient } = req.query;
    const query = {
      $or: [
        { sender, recipient },
        { sender: recipient, recipient: sender },
      ],
    };

    const chatHistory = await ChatHistory.find(query, { messages: 1, _id: 0 });

    res.status(200).send(chatHistory);
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});


app.post("/saveChatHistory", async (req, res) => {
  try {
    const { sender, recipient, messages } = req.body;

    // Save the chat history to the database or other persistent storage
    const chatHistory = new ChatHistory({
      sender,
      recipient,
      messages: messages.map((msg) => ({
        sender: msg.sender,
        recipient: msg.recipient,
        content: msg.content,
        timestamp: msg.timestamp,
      })),
    });
    await chatHistory.save();

    res.status(200).send({ message: "Chat history saved successfully" });
  } catch (error) {
    console.error("Error saving chat history:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});
app.get("/messages", async (req, res) => {
  try {
    const { sender, recipient } = req.query;
    const query =
      sender && recipient
        ? {
            $or: [
              { sender, recipient },
              { sender: recipient, recipient: sender },
            ],
          }
        : req.query;

    const messages = await Message.find(query).populate("sender recipient");

    res.status(200).send(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});
app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).send(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log("Received login request:", req.body);
    if (!username || !password) {
      return res
        .status(400)
        .send({ message: "Username and password are required" });
    }
    const user = await User.findOne({ username, password });
    console.log("Found user:", user);
    if (user) {
      res.status(200).send(user);
    } else {
      res.status(400).send({ message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(500).send({ message: "Internal server error" });
  }
});
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("userConnected", (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit("onlineUsers", Array.from(onlineUsers.keys()));
  });

  socket.on("sendMessage", async (message) => {
    const timestamp = moment().toDate();
    const newMessage = new Message({
      sender: message.sender,
      recipient: message.recipient,
      content: message.content,
      timestamp,
    });
    await newMessage.save();

    // Emit the message only to the sender and recipient
    const messageWithTimestamp = { ...message, timestamp };
    io.to(onlineUsers.get(message.sender)).emit(
      "receiveMessage",
      messageWithTimestamp
    );
    const recipientSocketId = onlineUsers.get(message.recipient);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("receiveMessage", messageWithTimestamp);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    // Find and remove the disconnected user's socket
    const userId = [...onlineUsers.entries()].find(
      ([, socketId]) => socketId === socket.id
    )?.[0];
    if (userId) {
      onlineUsers.delete(userId);
      io.emit("onlineUsers", Array.from(onlineUsers.keys()));
    }
  });
});


const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
