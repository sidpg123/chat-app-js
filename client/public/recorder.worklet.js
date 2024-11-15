class RecorderWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    console.log('RecorderWorkletProcessor initialized');
    // Initialize any state or buffers here
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];  // Get the input audio buffer
    const output = outputs[0];  // Get the output audio buffer

    if (input && input[0] && output && output[0]) {
      // Copy input to output
      output[0].set(input[0]);

      // Post data to the main thread
      if (this.port) {
        // console.log("Posting audio data to main thread");
        this.port.postMessage(input[0]);  // Send audio data to the main thread
      }
    } else {
      console.warn('Input or output buffer is missing');
    }

    return true; // Continue processing
  }
}

// Register the AudioWorkletProcessor class
registerProcessor('recorder-worklet', RecorderWorkletProcessor);
