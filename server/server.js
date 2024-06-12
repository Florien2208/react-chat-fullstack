const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const User = require("./models/User");
const Message = require("./models/Message");
const bcrypt = require("bcrypt");
const app = express();
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
app.use(express.json());

app.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .send({ message: "Username and password are required" });
    }
    const user = new User({ username, password, role });
    await user.save();
    res.status(201).send(user);
  } catch (error) {
    console.error("Error during registration:", error);
    if (error.code === 11000) {
      // Handle duplicate key error
      return res.status(400).send({ message: "Username already exists" });
    }
    res.status(500).send({ message: "Internal server error" });
  }
});
app.get("/messages", async (req, res) => {
  try {
    const userId = req.query.userId;
    const messages = await Message.find({
      $or: [{ sender: userId }, { recipient: userId }],
    }).populate("sender recipient");

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
    console.log("Login request body:", req.body);

    if (!username || !password) {
      console.log("Username or password is missing");
      return res
        .status(400)
        .send({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    console.log("User found:", user);

    if (user) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      console.log("Password validation result:", isPasswordValid);

      if (isPasswordValid) {
        res.status(200).send(user);
      } else {
        res.status(400).send({ message: "Invalid credentials" });
      }
    } else {
      console.log("User not found");
      res.status(400).send({ message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(500).send({ message: "Internal server error" });
  }
});

io.on("connection", (socket) => {
  console.log("New client connected");

  // Emit event to update online users
  io.emit("onlineUsers", Object.keys(io.sockets.sockets));

  // Inside the 'sendMessage' event handler
  socket.on("sendMessage", async (message) => {
    const newMessage = new Message({
      sender: message.sender,
      recipient: message.recipient,
      content: message.content,
      timestamp: moment().toDate(), // Adding the current timestamp using Moment.js
    });
    await newMessage.save();
    io.emit("receiveMessage", message);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    // Emit event to update online users
    // io.emit("onlineUsers", Object.keys(io.sockets.sockets));
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
