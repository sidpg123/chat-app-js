import { Box, Typography, IconButton } from "@mui/material";
import React, { memo, useEffect, useState } from "react";
import { lightBlue } from "../../constants/color";
import moment from "moment";
import { fileFormat } from "../../lib/features";
import RenderAttachment from "./RenderAttachment";
import { motion } from "framer-motion";
import VolumeUpIcon from "@mui/icons-material/VolumeUp"; // Importing speaker icon
import { AUDIO_ERROR, AUDIO_GENERATED, GENERATE_AUDIO } from "../../constants/events";
import { getSocket } from "../../socket";

const MessageComponent = ({ message, user }) => { 
  const socket = getSocket();

  const { sender, content, attachments = [], createdAt } = message;

  const sameSender = sender?._id === user?._id;

  const timeAgo = moment(createdAt).fromNow();

  const [hovered, setHovered] = useState(false);

  const handleTextToSpeech = (content) => {
    console.log(content)
    socket.emit("GENERATE_AUDIO", {
      content,
    });
  };

  socket.on(AUDIO_GENERATED, ({ audio }) => {
    console.log(audio)
    const audioPlayer = new Audio(`data:audio/mp3;base64,${audio}`);
    audioPlayer.play();
  });

  socket.on(AUDIO_ERROR, ({ error }) => {
    console.error('Error:', error);
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: "-100%" }}
      whileInView={{ opacity: 1, x: 0 }}
      style={{
        alignSelf: sameSender ? "flex-end" : "flex-start",
        backgroundColor: "white",
        color: "black",
        borderRadius: "5px",
        padding: "0.5rem",
        width: "fit-content",
        position: "relative", // To position the speaker icon
      }}
      onMouseEnter={() => setHovered(true)} // Show the icon on hover
      onMouseLeave={() => setHovered(false)} // Hide the icon when not hovered
    >
      {!sameSender && (
        <Typography color={lightBlue} fontWeight={"600"} variant="caption">
          {sender.name}
        </Typography>
      )}

      {content && <Typography>{content}</Typography>}

      {attachments.length > 0 &&
        attachments.map((attachment, index) => {
          const url = attachment.url;
          const file = fileFormat(url);

          return (
            <Box key={index}>
              <a
                href={url}
                target="_blank"
                download
                style={{
                  color: "black",
                }}
              >
                {RenderAttachment(file, url)}
              </a>
            </Box>
          );
        })}

      <Typography variant="caption" color={"text.secondary"}>
        {timeAgo}
      </Typography>

      {/* Speaker icon that appears on hover */}
      {hovered && (
        <IconButton
             onClick={() => handleTextToSpeech(content)} // Send message content to TTS API
          style={{
            position: "absolute",
            top: "50%",
            // Position icon based on whether the sender is the same
            [sameSender ? "left" : "right"]: "-30px", // Icon appears on the left for the same sender, right for others
            transform: "translateY(-50%)",
            color: "black",
          }}
        >
          <VolumeUpIcon />
        </IconButton>
      )}
    </motion.div>
  );
};

export default memo(MessageComponent);
