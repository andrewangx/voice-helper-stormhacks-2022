var async = require("async");


// required dom elements
const messageEl = document.getElementById('texts');
const answerEl = document.getElementById('answer')

// set initial state of application variables
messageEl.style.display = 'none';
let isRecording = true;
let socket;
let recorder;

let message = ""

// runs real-time transcription and handles global variables
const run = async () => {
  if (isRecording) { 
    if (socket) {
      socket.send(JSON.stringify({terminate_session: true}));
      socket.close();
      socket = null;
    }

    if (recorder) {
      recorder.pauseRecording();
      recorder = null;
    }
  } else {
    const response = await fetch('http://localhost:8000'); // get temp session token from server.js (backend)
    const data = await response.json();

    if(data.error){
      alert(data.error)
    }
    
    const { token } = data;

    // establish wss with AssemblyAI (AAI) at 16000 sample rate
    socket = await new WebSocket(`wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`);

    // handle incoming messages to display transcription to the DOM
    const texts = {};
    socket.onmessage = (message) => {
      let msg = ''; 
      const res = JSON.parse(message.data);
      texts[res.audio_start] = res.text;
      const keys = Object.keys(texts);
      keys.sort((a, b) => a - b);
      for (const key of keys) {
        if (texts[key]) {
          msg += ` ${texts[key]}`;
          
        }
      }
      // Whenever new text is detected, we will send it for analysis.
      renderMsg(msg)
      analyzeAndRender(msg)
      
    };

    socket.onerror = (event) => {
      console.error(event);
      socket.close();
    }
    
    socket.onclose = event => {
      console.log(event);
      socket = null;
    }

    socket.onopen = () => {
      // once socket is open, begin recording
      messageEl.style.display = '';
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          recorder = new RecordRTC(stream, {
            type: 'audio',
            mimeType: 'audio/webm;codecs=pcm', // endpoint requires 16bit PCM audio
            recorderType: StereoAudioRecorder,
            timeSlice: 250, // set 250 ms intervals of data that sends to AAI
            desiredSampRate: 16000,
            numberOfAudioChannels: 1, // real-time requires only one channel
            bufferSize: 4096,
            audioBitsPerSecond: 128000,
            ondataavailable: (blob) => {
              const reader = new FileReader();
              reader.onload = () => {
                const base64data = reader.result;

                // audio data must be sent as a base64 encoded string
                if (socket) {
                  socket.send(JSON.stringify({ audio_data: base64data.split('base64,')[1] }));
                }
              };
              reader.readAsDataURL(blob);
            },
          });

          recorder.startRecording();
        })
        .catch((err) => console.error(err));
    };
  }

  isRecording = !isRecording;
  
};

//checks to see if audio is present, runs the program if true 



function renderMsg(text) {
  messageEl.innerText = "You: " + text;
}
function renderAns(ans) {
  answerEl.innerText = ans
}

function analyzeAndRender(msg) {
  for (let [matcher, rxn] of rxns) {
    console.log(matcher)
    matchList = (msg.toLowerCase().match(matcher))
    if (!(matchList === null) && matchList.length > 0) {
      renderAns(rxn.response)
      rxn.func(msg)
      break;
    }

  }
}





const RxnTemplate = function (response, func = (text) => {}) {
  this.response = response
  this.func = func
}

const rxns = new Map();

rxns.set(
  /add \$[0-9]+ ?(dollars)?\.? ?(to my account)?/,
  new RxnTemplate("Funds added.")
)
rxns.set(
  /transfer [0-9]+ dollars to (.*)/,
  new RxnTemplate("Funds transferred", (text) => {

    alert("Transfer successful")
  })
)

async.forever(run, (err) => {
  console.log("Error: " + err);
  alert("An error has occurred.")
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
