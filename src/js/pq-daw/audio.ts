import Daw from "./daw";
import Part from "./part";

interface AudioLoadParams
{
  path?: string,
  extension?: string
}

type Point = { x: number, y: number };

// responsible for loading audio and handling the audio context
export default 
{
    init()
    {
        this.buffer = {};
    },

    gainToDecibels(gainValue:number)
    {
        return 20 * Math.log10(gainValue);
    },

    decibelsToGain(decibels:number)
    {
        return Math.pow(10, (decibels / 20.0));  
    },

    getResource(url:string)
    {
        return this.buffer[url];
    },

    hasResource(url:string)
    {
        return (url in this.buffer);
    },

    saveResource(url:string, res:any)
    {
        this.buffer[url] = res;
    },

    async saveBlobResource(daw:Daw, url:string, blob:Blob)
    {
        let fileReader = new FileReader();

        const that = this;
        return new Promise((resolve, reject) => {
            
            fileReader.onloadend = () => {
                const arrayBuffer = fileReader.result as ArrayBuffer;
                daw.getContext().decodeAudioData(
                    arrayBuffer, 
                    (b) => { that.saveResource(url, b); resolve(true); }, 
                    (e) => { console.warn(e); reject(false); }
                );
            }

            fileReader.readAsArrayBuffer(blob);
        })
    },

    checkAndLoadResources(daw:Daw, urls:string[], params:AudioLoadParams = {})
    {
        let promises = [];
        for(const url of urls)
        {
            if(this.hasResource(url)) { continue; }
            promises.push(this.loadResource(daw, url, params));
        }

        return Promise.all(promises);
    },

    loadResource(daw:Daw, url:string, params:AudioLoadParams = {})
    {
        let path = params.path || "";
        if(path.length > 0 && path.slice(0,-1) != "/") { path += "/"; }

        const extension = params.extension || "ogg";
        const file = path + url + "." + extension;

        const xhr = new XMLHttpRequest();
        xhr.open('GET', file, true);
        xhr.responseType = 'arraybuffer';

        const that = this;
        return new Promise((resolve, reject) => {
            xhr.onload = function()
            {
                let notFound = this.response.byteLength <= 24;
                if(notFound) { return; }
    
                daw.getContext().decodeAudioData(
                    this.response, 
                    (b) => { that.saveResource(url, b); resolve(true); }, 
                    (e) => { console.warn(e); reject(false); }
                );
            }
            xhr.onerror = () => { reject(false); };   
            xhr.send(); 
        });
    },

    play(partNode:Part, seekTime = 0, startOffset = 0)
    {
        if(partNode.getType() == "automation") { return; }

        const ctx = partNode.getContext();
        if(ctx.state === "suspended") { ctx.resume(); } // @NOTE: used to have ctx.started && before, but apparently that isn't a thing anymore, so is this fine now?

        const curTime = ctx.currentTime;
        const startTime = curTime + startOffset;
        const seekTimeOffset = seekTime + partNode.getOffset();
        const stopTime = startTime + partNode.getDuration() - seekTime;

        let source;
        if(partNode.getType() == "audio" || partNode.getType() == "blob")
        {
            source = ctx.createBufferSource();
            source.buffer = this.getResource(partNode.getSource());

            source.start(startTime, seekTimeOffset, partNode.getDuration());
            source.stop(stopTime);
        } 
        else if(partNode.getType() == "oscillator")
        {
            source = ctx.createOscillator();
            source.type = 'sine';
            source.frequency = 440;

            source.start(startTime);
            source.stop(stopTime);
        }

        const gainNode = partNode.getGain();

        const fadeStart = partNode.getFadeStart();
        const fadeEnd = partNode.getFadeEnd();

        gainNode.gain.cancelScheduledValues(curTime);

        if(fadeStart > 0)
        {
          // start fade only happens if we actually start in that zone
          if(seekTime <= fadeStart) {
            const fadeStartTime = startTime - seekTime;
            const fadeStartGain = partNode.getFadeValueAt(fadeStartTime - curTime, { min: 0.0001, max: 1.0 });
            gainNode.gain.setValueAtTime(fadeStartGain, fadeStartTime);
            gainNode.gain.exponentialRampToValueAtTime(1.0, fadeStartTime + fadeStart);
          } else {
            gainNode.gain.exponentialRampToValueAtTime(1.0, startTime + 0.03);
          }
        }

        if(fadeEnd > 0)
        {
          // end fade always happens
          const fadeEndTime = stopTime - fadeEnd;
          let fadeEndGain = partNode.getFadeValueAt(fadeEndTime - curTime, { min: 0.0001, max: 1.0 });
          if(fadeEndTime <= startTime) { fadeEndGain = 1.0; }
          gainNode.gain.setValueAtTime(fadeEndGain, fadeEndTime);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);
        }

        return source;
    },
    
    stop(source:AudioBufferSourceNode)
    {
        source.stop();
    },


    // @SOURCE: https://stackoverflow.com/questions/62172398/convert-audiobuffer-to-arraybuffer-blob-for-wav-download
    //
    // Alternatives
    // @SOURCE: https://stackoverflow.com/questions/61264581/how-to-convert-audio-buffer-to-mp3-in-javascript
    //  => Works and supports MP3, but needs another library (LAME) and coded very ... obscurely
    // @SOURCE: https://stackoverflow.com/questions/22560413/html5-web-audio-convert-audio-buffer-into-wav-file
    //  => Works even better (no MP3 though), but requires separate service worker
    //
    audioBufferToWaveBlobSimple(audioBuffer:AudioBuffer)
    {
        // Float32Array samples
        const [left, right] =  [audioBuffer.getChannelData(0), audioBuffer.getChannelData(1)]

        // interleaved
        const interleaved = new Float32Array(left.length + right.length)
        for (let src=0, dst=0; src < left.length; src++, dst+=2) {
            interleaved[dst] =   left[src]
            interleaved[dst+1] = right[src]
        }

        // get WAV file bytes and audio params of your audio source
        const wavBytes = this.getWavBytes(interleaved.buffer, {
            isFloat: true,       // floating point or 16-bit integer
            numChannels: 2,
            sampleRate: 48000,
        })

        return new Blob([wavBytes], { type: 'audio/wav' })
    },

    // Returns Uint8Array of WAV bytes
    getWavBytes(buffer, options) {
        const type = options.isFloat ? Float32Array : Uint16Array
        const numFrames = buffer.byteLength / type.BYTES_PER_ELEMENT
    
        const headerBytes = this.getWavHeader(Object.assign({}, options, { numFrames }))
        const wavBytes = new Uint8Array(headerBytes.length + buffer.byteLength);
    
        // prepend header, then add pcmBytes
        wavBytes.set(headerBytes, 0)
        wavBytes.set(new Uint8Array(buffer), headerBytes.length)
    
        return wavBytes
    },
    
    // adapted from https://gist.github.com/also/900023
    // returns Uint8Array of WAV header bytes
    getWavHeader(options) {
        const numFrames =      options.numFrames
        const numChannels =    options.numChannels || 2
        const sampleRate =     options.sampleRate || 44100
        const bytesPerSample = options.isFloat? 4 : 2
        const format =         options.isFloat? 3 : 1
    
        const blockAlign = numChannels * bytesPerSample
        const byteRate = sampleRate * blockAlign
        const dataSize = numFrames * blockAlign
    
        const buffer = new ArrayBuffer(44)
        const dv = new DataView(buffer)
    
        let p = 0
    
        function writeString(s) {
        for (let i = 0; i < s.length; i++) {
            dv.setUint8(p + i, s.charCodeAt(i))
        }
        p += s.length
        }
    
        function writeUint32(d) {
        dv.setUint32(p, d, true)
        p += 4
        }
    
        function writeUint16(d) {
        dv.setUint16(p, d, true)
        p += 2
        }
    
        writeString('RIFF')              // ChunkID
        writeUint32(dataSize + 36)       // ChunkSize
        writeString('WAVE')              // Format
        writeString('fmt ')              // Subchunk1ID
        writeUint32(16)                  // Subchunk1Size
        writeUint16(format)              // AudioFormat https://i.stack.imgur.com/BuSmb.png
        writeUint16(numChannels)         // NumChannels
        writeUint32(sampleRate)          // SampleRate
        writeUint32(byteRate)            // ByteRate
        writeUint16(blockAlign)          // BlockAlign
        writeUint16(bytesPerSample * 8)  // BitsPerSample
        writeString('data')              // Subchunk2ID
        writeUint32(dataSize)            // Subchunk2Size
    
        return new Uint8Array(buffer)
    },

    toLog(val:number, min:number, max:number)
    {
        const exp = (val-min) / (max-min);
        return min * Math.pow(max/min, exp);
    },

    getSimpleBezierCurveTo(t:number, start:Point, p1:Point, end:Point)
    {
      const x = Math.pow(1-t, 2) * start.x 
                + 2*(1-t) * t * p1.x 
                + Math.pow(t,2) * end.x;

      const y = Math.pow(1-t, 2) * start.y 
              + 2*(1-t) * t * p1.y 
              + Math.pow(t,2) * end.y;

      return { x: x, y: y };
    },

    getBezierCurveTo(t:number, start:Point, p1:Point, p2:Point, end:Point)
    {
        const x = Math.pow(1-t, 3) * start.x 
                + 3*Math.pow(1-t,2) * t * p1.x 
                + 3*(1-t) * t * t * p2.x 
                + Math.pow(t,3) * end.x;

        const y = Math.pow(1-t, 3) * start.y 
                + 3*Math.pow(1-t,2) * t * p1.y 
                + 3*(1-t) * t * t * p2.y + 
                + Math.pow(t,3) * end.y;

        return { x: x, y: y };
    },

    // automation tracks, for example, have no concept of volume or analyser
    //
    // @NOTE: an earlier version used the other approach (getByteTimeDomainData)
    // but the Uint8 arrays were just stupid to work with, because they are 0-255, but 0 is actually 128, and bla bla bla
    getVolumeAsGain(analyserNode = null)
    {
        if(!analyserNode) { return null; } 

        const bufferLength = analyserNode.fftSize; // analyserNode.frequencyBinCount;
        const volumes = new Float32Array(bufferLength);
        analyserNode.getFloatTimeDomainData(volumes);

        let avgVolume = 0;
        let sumOfSquares = 0;
        for(const vol of Array.from(volumes)) // @TODO: this conversion might be REALLY costly, check that
        {
            const amplitude = (vol - avgVolume);
            sumOfSquares += amplitude*amplitude;
        }

        sumOfSquares /= volumes.length;
        
        const volume = Math.sqrt(sumOfSquares);
        return volume;
    }
      
}