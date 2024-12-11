import express from "express";
import { connectDB } from "./utils/features.js";
import dotenv from "dotenv";
import { errorMiddleware } from "./middlewares/error.js";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import { createServer } from "http";
import { v4 as uuid } from "uuid";
import cors from "cors";
import axios from 'axios'; // Import axios library
import speech from "@google-cloud/speech"
import textToSpeech from "@google-cloud/text-to-speech"
import { v2 as cloudinary } from "cloudinary";
import {
  AUDIO_ERROR,
  AUDIO_GENERATED,
  CHAT_JOINED,
  CHAT_LEAVED,
  GENERATE_AUDIO,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  ONLINE_USERS,
  START_TYPING,
  STOP_TYPING,
} from "./constants/events.js";
import { getGcpLanguageCode, getSockets } from "./lib/helper.js";
import { Message } from "./models/message.js";
import { corsOptions } from "./constants/config.js";
import { socketAuthenticator } from "./middlewares/auth.js";

import userRoute from "./routes/user.js";
import chatRoute from "./routes/chat.js";
import adminRoute from "./routes/admin.js";
import { TranslatedMessage } from "./models/translatedMessage.js";
import { User } from "./models/user.js";

dotenv.config({
  path: "./.env",
});

const mongoURI = process.env.MONGO_URI;
const port = process.env.PORT || 3000;
const envMode = process.env.NODE_ENV.trim() || "PRODUCTION";
const adminSecretKey = process.env.ADMIN_SECRET_KEY || "adsasdsdfsdfsdfd";
const userSocketIDs = new Map();
const onlineUsers = new Set();
const userLanguage = new Map();

connectDB(mongoURI);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});
const client = new speech.SpeechClient();
const ttsClient = new textToSpeech.TextToSpeechClient(); 
app.set("io", io);

// Using Middlewares Here
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));

app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);

const encoding = 'LINEAR16';
const sampleRateHertz = 16000;
let languageCode;


let recognizeStream = null;

async function translateMessage(message, sourceLanguage, targetLanguage) {
  try {
    const response = await axios.post('https://api.translateplus.io/v1/translate', {
      text: message,
      source: sourceLanguage,
      target: targetLanguage

    }, {
      headers: {
        'X-API-KEY': '98e0df0cdd6d814cde9421d4cc8a8e24169fda75',
        'Content-Type': 'application/json'
      }
    });
    // console.count(response)
    // console.log('response', response);
    return response.data.translations.translation;
  } catch (error) {
    console.error('Error translating message:');
    return message; // Return original message if translation fails
  }
}

async function detectLanguage(message) {
  try {
    const response = await axios.post('https://api.translateplus.io/v1/language_detect', {
      text: message
    }, {
      headers: {
        'X-API-KEY': '98e0df0cdd6d814cde9421d4cc8a8e24169fda75',
        'Content-Type': 'application/json'
      }
    })
    return response.data.language_detection.language;
  } catch (error) {
    console.error(error);
    return message;
  }
}


app.get("/", (req, res) => {
  res.send("Hello World");
});

io.use((socket, next) => {
  cookieParser()(
    socket.request,
    socket.request.res,
    async (err) => await socketAuthenticator(err, socket, next)
  );
});

io.on("connection", (socket) => {


  const user = socket.user;
   
  userSocketIDs.set(user._id.toString(), socket.id);

  
  socket.on('startGoogleCloudStream', () => {
    
    languageCode = getGcpLanguageCode(user.language)
    startRecognitionStream(socket, languageCode);
  });


  socket.on('endGoogleCloudStream', () => {
    // console.log('Ending Google Cloud stream');
    stopRecognitionStream();
  });

  socket.on('send_audio_data', (audioData) => {
    
    if (recognizeStream) {
      try {
        
        const audioArray = Float32Array.from(audioData.audio);
        const pcmData = convertFloat32ToInt16(audioArray);
        // console.log("sending data to recognizeStream", audioArray);
        recognizeStream.write(pcmData);
      } catch (err) {
        console.log('Error sending audio data:', err);
      }
    } 
    // else {
    //   console.log('No active recognition stream');
    // }
  });

  socket.on("GENERATE_AUDIO", async ({ content }) => {

    languageCode = getGcpLanguageCode(user.language);

    if (!content || typeof content !== 'string' || content.trim() === '') {
      console.error('Invalid message:', content);
      socket.emit(AUDIO_ERROR, { error: 'Message is undefined or empty' });
      return;
    }

    try {
      const request = {
        input: { text: content },
        voice: { languageCode, ssmlGender: 'NEUTRAL' },
        audioConfig: { audioEncoding: 'MP3' },
      };

      const [response] = await ttsClient.synthesizeSpeech(request);
      const audioContent = response.audioContent.toString('base64');
      socket.emit(AUDIO_GENERATED, { audio: audioContent });
    } catch (error) {
      console.error('Error generating audio:', error);
      socket.emit(AUDIO_ERROR, { error: 'Failed to generate audio' });
    }
  });


  socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
    const sourceLanguage = user.language;
    const receiverIds = members.filter(member => member !== user._id.toString());

    const senderSocketId = userSocketIDs.get(user._id.toString());

    // Emit original message to the sender's socket
    await io.to(senderSocketId).emit(NEW_MESSAGE, {
      chatId,
      message: {
        content: message,
        _id: uuid(),
        sender: {
          _id: user._id,
          name: user.name,
        },
        chat: chatId,
        createdAt: new Date().toISOString(),
      }
    });

    // Iterate through each receiver and send translated message
    await Promise.all(receiverIds.map(async (member) => {
      const receiver = await User.findById(member);
      const targetLanguage = receiver.language;
      const translatedMessage = await translateMessage(message, sourceLanguage, targetLanguage);
      const receiverSocketId = member ? userSocketIDs.get(member.toString()) : null;

      if (receiverSocketId) {
        await io.to(receiverSocketId).emit(NEW_MESSAGE, {
          chatId,
          message: {
            content: translatedMessage,
            _id: uuid(),
            sender: {
              _id: user._id,
              name: user.name,
            },
            chat: chatId,
            createdAt: new Date().toISOString(),
          }
        });
      } else {
        console.error('Receiver socket ID not available for member:', member);
      }

      try {
        // Save the translated message to the database for each receiver
        await TranslatedMessage.create({
          content: translatedMessage,
          sender: user._id,
          chat: chatId,
          targetLanguage: targetLanguage,
        });
      } catch (error) {
        console.error('Error saving translated message to database:', error);
      }
    }));

    // Save the original message to the database once (outside the loop)
    try {
      await Message.create({
        content: message,
        sender: user._id,
        chat: chatId,
      });
    } catch (error) {
      console.error('Error saving original message to database:', error);
    }

    // Emit a new message alert to all members except the sender
    io.to(getSockets(receiverIds)).emit(NEW_MESSAGE_ALERT, { chatId });
  });




  socket.on(START_TYPING, ({ members, chatId }) => {
    const membersSockets = getSockets(members);
    socket.to(membersSockets).emit(START_TYPING, { chatId });
  });

  socket.on(STOP_TYPING, ({ members, chatId }) => {
    const membersSockets = getSockets(members);
    socket.to(membersSockets).emit(STOP_TYPING, { chatId });
  });

  socket.on(CHAT_JOINED, ({ userId, members }) => {
    onlineUsers.add(userId.toString());

    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  socket.on(CHAT_LEAVED, ({ userId, members }) => {
    onlineUsers.delete(userId.toString());

    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  socket.on("disconnect", () => {
    userSocketIDs.delete(user._id.toString());
    onlineUsers.delete(user._id.toString());
    socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
    stopRecognitionStream();
  });
});

let timeoutId;
const INACTIVITY_TIMEOUT = 5000; // 5 seconds


function startRecognitionStream(socket, languageCode) {

  if(!languageCode){
    languageCode = 'en-IN'
  }
  // console.log("languageCOde in startRecognizaiton", languageCode);

  const request = {
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      enableAutomaticPunctuation: true,
      singleUtterance: false, // Switch to true if you'd like to stop on silence
    },
    interimResults: false, // Provide real-time results
  };

  // console.log("Starting recognition stream...");
  try {
    recognizeStream = client
      .streamingRecognize(request)
      .on("error", (error) => {
        console.error("Stream error:", error);
        restartStream(socket); // Restart on error
      })
      .on("data", (data) => {
        clearTimeout(timeoutId); // Clear timeout on data reception

        if (!data.results || !data.results[0]) {
          console.log("No valid transcription data received.");
          return;
        }

        const result = data.results[0].alternatives;
        const isFinal = data.results[0].isFinal;
        const transcription = data.results
          .map((result) => result.alternatives[0].transcript)
          .join("\n");


        // console.log("Data received:", data);
        // console.log("result", result);
        
        // console.log("Transcription:", transcription);

        if (transcription && isFinal) {
          socket.emit("receive_audio_text", { text: transcription, isFinal: isFinal });
        }

        // If result is final, handle it but don't necessarily restart the stream
        if (isFinal) {
          // console.log("Final transcription received.");
          // Optional: Set a short delay before resetting the stream
          timeoutId = setTimeout(() => restartStream(socket), INACTIVITY_TIMEOUT);
        } else {
          // Set timeout to restart if no new data is received within the specified time
          timeoutId = setTimeout(() => restartStream(socket), INACTIVITY_TIMEOUT);
        }
      });
  } catch (err) {
    console.error("Error starting recognition stream:", err);
  }
}

function stopRecognitionStream() {
  if (recognizeStream) {
    // console.log("Stopping recognition stream...");
    recognizeStream.end();
    recognizeStream = null;
  }
}

function restartStream(socket) {
  stopRecognitionStream();
  startRecognitionStream(socket);
}


function convertFloat32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    int16Array[i] = Math.max(-1, Math.min(1, float32Array[i])) * 32767; // Scale to Int16 range
  }
  return Buffer.from(int16Array.buffer);
}



app.use(errorMiddleware);

server.listen(port, () => {
  console.log(`Server is running on port ${port} in ${envMode} Mode`);
});

export { envMode, adminSecretKey, userSocketIDs };
