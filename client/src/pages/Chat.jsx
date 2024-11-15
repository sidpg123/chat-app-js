import React, {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import AppLayout from "../components/layout/AppLayout";
import { IconButton, Skeleton, Stack } from "@mui/material";
import { grayColor, orange } from "../constants/color";
import {
  AttachFile as AttachFileIcon,
  Send as SendIcon,
} from "@mui/icons-material";
import MicIcon from '@mui/icons-material/Mic';
import { InputBox } from "../components/styles/StyledComponents";
import FileMenu from "../components/dialogs/FileMenu";
import MessageComponent from "../components/shared/MessageComponent";
import { getSocket } from "../socket";
import {
  ALERT,
  CHAT_JOINED,
  CHAT_LEAVED,
  NEW_MESSAGE,
  START_TYPING,
  STOP_TYPING,
} from "../constants/events";
import { useChatDetailsQuery, useGetMessagesQuery } from "../redux/api/api";
import { useErrors, useSocketEvents } from "../hooks/hook";
import { useInfiniteScrollTop } from "6pp";
import { useDispatch, useSelector } from "react-redux";
import { setIsFileMenu } from "../redux/reducers/misc";
import { removeNewMessagesAlert } from "../redux/reducers/chat";
import { TypingLoader } from "../components/layout/Loaders";
import { useNavigate } from "react-router-dom";
import { setRecordingState, setCurrentRecognition, addToRecognitionHistory, clearRecognitionHistory } from '../redux/reducers/transcription';

const Chat = ({ chatId, user }) => {
  const socket = getSocket();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioInputRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  const [fileMenuAnchor, setFileMenuAnchor] = useState(null);

  const [IamTyping, setIamTyping] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const typingTimeout = useRef(null);

  const chatDetails = useChatDetailsQuery({ chatId, skip: !chatId });

  const oldMessagesChunk = useGetMessagesQuery({ chatId, page });

  const { data: oldMessages, setData: setOldMessages } = useInfiniteScrollTop(
    containerRef,
    oldMessagesChunk.data?.totalPages,
    page,
    setPage,
    oldMessagesChunk.data?.messages
  );

  const errors = [
    { isError: chatDetails.isError, error: chatDetails.error },
    { isError: oldMessagesChunk.isError, error: oldMessagesChunk.error },
  ];

  const members = chatDetails?.data?.chat?.members;


  const { isRecording, currentRecognition, recognitionHistory } = useSelector((state) => state.transcription);

  useEffect(() => {
    setMessage(recognitionHistory.join(' ')); // Update message state with the transcribed text
  }, [recognitionHistory]);

  useEffect(() => {
    socket.on('receive_audio_text', (data) => {
      // console.log("data",data)
      dispatch(setCurrentRecognition(data.text));
      setMessage((prevMessage) => prevMessage + ' ' + data.text);
      if (data.isFinal) {
        dispatch(addToRecognitionHistory(data.text));
      }
    });

    return () => {
      socket.off('receive_audio_text');
    };
  }, []);

  const sampleRate = 16000;

  const getMediaStream = () => {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: 'default',
        sampleRate: sampleRate,
        sampleSize: 16,
        channelCount: 1,
      },
      video: false,
    });
  };


  const loadAudioWorklet = async (mediaStream) => {
    try {
      // console.log("Initializing AudioContext");
      audioContextRef.current = new window.AudioContext({sampleRate: 16000});
  
      // console.log("Loading AudioWorklet module from /recorder.worklet.js");
      await audioContextRef.current.audioWorklet.addModule('/recorder.worklet.js');
      
      // console.log("Creating AudioWorkletNode");
      processorRef.current = new AudioWorkletNode(audioContextRef.current, 'recorder-worklet');

      // Create a MediaStreamAudioSourceNode from the media stream
      const sourceNode = audioContextRef.current.createMediaStreamSource(mediaStream);
  
      // Connect source node to the processor, but do not connect processor to the audio context's destination
      sourceNode.connect(processorRef.current);
  
      // Handle audio data sent back from the AudioWorklet
      processorRef.current.port.onmessage = (event) => {
        const audioData = event.data;
        if (socket) {
          // console.log("Sending audio data to backend", audioData);
          socket.emit('send_audio_data', { audio: Array.from(audioData) });
        }
      };
  
      // console.log("AudioWorkletNode successfully created and connected without local playback");
    } catch (error) {
      console.error('Error loading AudioWorkletModule:', error);
    }
  };
  

  const startRecording = async () => {
    dispatch(setRecordingState(true));
    socket.emit('startGoogleCloudStream'); // Start recognition

    try {
      // Obtain the media stream
      const mediaStream = await getMediaStream();
      streamRef.current = mediaStream; // Save the media stream reference
  
      await loadAudioWorklet(mediaStream); // Pass the media stream to loadAudioWorklet
  
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      stopRecording(); // Stop and clean up if there's an error
    }
  };
  

  const stopRecording = () => {
    dispatch(setRecordingState(false));
    dispatch(clearRecognitionHistory());

    socket.emit('endGoogleCloudStream');

    // Disconnect audio input
    if (audioInputRef.current) {
      audioInputRef.current.disconnect();
      audioInputRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Disconnect processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
  };

  const handleMic = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };



  const messageOnChange = (e) => {
    setMessage(e.target.value);

    if (!IamTyping) {
      socket.emit(START_TYPING, { members, chatId });
      setIamTyping(true);
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      socket.emit(STOP_TYPING, { members, chatId });
      setIamTyping(false);
    }, [2000]);
  };

  const handleFileOpen = (e) => {
    dispatch(setIsFileMenu(true));
    setFileMenuAnchor(e.currentTarget);
  };

  const submitHandler = (e) => {
    e.preventDefault();

    if (!message.trim()) return;

    // Emitting the message to the server
    socket.emit(NEW_MESSAGE, { chatId, members, message });
    setMessage("");
  };

  useEffect(() => {
    socket.emit(CHAT_JOINED, { userId: user._id, members });
    dispatch(removeNewMessagesAlert(chatId));

    return () => {
      setMessages([]);
      setMessage("");
      setOldMessages([]);
      setPage(1);
      socket.emit(CHAT_LEAVED, { userId: user._id, members });
    };
  }, [chatId]);

  useEffect(() => {
    if (bottomRef.current)
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (chatDetails.isError) return navigate("/");
  }, [chatDetails.isError]);

  const newMessagesListener = useCallback(
    (data) => {
      if (data.chatId !== chatId) return;

      setMessages((prev) => [...prev, data.message]);
    },
    [chatId]
  );

  const startTypingListener = useCallback(
    (data) => {
      if (data.chatId !== chatId) return;

      setUserTyping(true);
    },
    [chatId]
  );

  const stopTypingListener = useCallback(
    (data) => {
      if (data.chatId !== chatId) return;
      setUserTyping(false);
    },
    [chatId]
  );

  const alertListener = useCallback(
    (data) => {
      if (data.chatId !== chatId) return;
      const messageForAlert = {
        content: data.message,
        sender: {
          _id: "djasdhajksdhasdsadasdas",
          name: "Admin",
        },
        chat: chatId,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, messageForAlert]);
    },
    [chatId]
  );

  const eventHandler = {
    [ALERT]: alertListener,
    [NEW_MESSAGE]: newMessagesListener,
    [START_TYPING]: startTypingListener,
    [STOP_TYPING]: stopTypingListener,
  };

  useSocketEvents(socket, eventHandler);

  useErrors(errors);

  const allMessages = [...oldMessages, ...messages];

  return chatDetails.isLoading ? (
    <Skeleton />
  ) : (
    <Fragment>
      <Stack
        ref={containerRef}
        boxSizing={"border-box"}
        padding={"1rem"}
        spacing={"1rem"}
        bgcolor={grayColor}
        height={"90%"}
        sx={{
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        {allMessages.map((i) => (
          <MessageComponent key={i._id} message={i} user={user} />
        ))}

        {userTyping && <TypingLoader />}

        <div ref={bottomRef} />
      </Stack>

      <form
        style={{
          height: "10%",
        }}
        onSubmit={submitHandler}
      >
        <Stack
          direction={"row"}
          height={"100%"}
          padding={"1rem"}
          alignItems={"center"}
          position={"relative"}
        >
          <IconButton
            sx={{
              position: "absolute",
              left: "1.5rem",
              rotate: "30deg",
            }}
            onClick={handleFileOpen}
          >
            <AttachFileIcon />
          </IconButton>

          <IconButton
            sx={{
              position: "absolute",
              left: "3.5rem",
            }}
            onClick={handleMic}
          >
            <MicIcon color={isRecording ? 'primary' : 'inherit'} />
          </IconButton>

          <InputBox
            placeholder="Type Message Here..."
            value={message}
            onChange={messageOnChange}
          />

          <IconButton
            type="submit"
            sx={{
              rotate: "-30deg",
              bgcolor: orange,
              color: "white",
              marginLeft: "1rem",
              padding: "0.5rem",
              "&:hover": {
                bgcolor: "error.dark",
              },
            }}
          >
            <SendIcon />
          </IconButton>
        </Stack>
      </form>

      <FileMenu anchorE1={fileMenuAnchor} chatId={chatId} />
    </Fragment>
  );
};

export default AppLayout()(Chat);
