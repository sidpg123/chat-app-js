import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isRecording: false,
  currentRecognition: '',
  recognitionHistory: [],
};

const transcriptionSlice = createSlice({
  name: 'transcription',
  initialState,
  reducers: {
    setRecordingState: (state, action) => {
      state.isRecording = action.payload;
    },
    setCurrentRecognition: (state, action) => {
      state.currentRecognition = action.payload;
    },
    addToRecognitionHistory: (state, action) => {
      state.recognitionHistory.push(action.payload);
    },
    clearRecognitionHistory: (state) => {
      state.recognitionHistory = [];
    },
  },
});

export const { setRecordingState, setCurrentRecognition, addToRecognitionHistory, clearRecognitionHistory } = transcriptionSlice.actions;
export default transcriptionSlice;
