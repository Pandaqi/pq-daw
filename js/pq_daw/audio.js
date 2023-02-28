// responsible for loading audio and handling the audio context
PQ_DAW.AUDIO = {
    init()
    {
        this.buffer = {};
    },

    gainToDecibels(gainValue)
    {
        return 20 * Math.log10(gainValue);
    },

    decibelsToGain(decibels)
    {
        return Math.pow(10, (decibels / 20.0));  
    },

    getResource(url)
    {
        return this.buffer[url];
    },

    hasResource(url)
    {
        return (url in this.buffer);
    },

    saveResource(url, res)
    {
        this.buffer[url] = res;
    },

    async saveBlobResource(daw, url, blob)
    {
        let fileReader = new FileReader();

        const that = this;
        return new Promise((resolve, reject) => {
            
            fileReader.onloadend = () => {
                const arrayBuffer = fileReader.result;
                daw.getContext().decodeAudioData(
                    arrayBuffer, 
                    (b) => { that.saveResource(url, b); resolve(true); }, 
                    (e) => { console.warn(e); reject(false); }
                );
            }

            fileReader.readAsArrayBuffer(blob);
        })
    },

    checkAndLoadResources(daw, urls, params = {})
    {
        let promises = [];
        for(const url of urls)
        {
            if(this.hasResource(url)) { continue; }
            promises.push(this.loadResource(daw, url, params));
        }

        return Promise.all(promises);
    },

    loadResource(daw, url, params = {})
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
                    function (b) { that.saveResource(url, b); resolve(true); }, 
                    function (e) { console.warn(e); reject(false); }
                );
            }
            xhr.onerror = function () { reject(false); };   
            xhr.send(); 
        });
    },

    play(partNode, seekTime = 0, startOffset = 0)
    {
        if(partNode.getType() == "automation") { return; }

        const ctx = partNode.getContext();
        if(ctx.started && ctx.state === "suspended") { ctx.resume(); }

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
    
    stop(source)
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
    audioBufferToWaveBlobSimple(audioBuffer)
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

    async audioBufferToWaveBlob(audioBuffer) {

        return new Promise(function(resolve, reject) {
      
          var worker = new Worker('/tutorials/js/buffer_to_wav.js');
      
          worker.onmessage = function( e ) {
            var blob = new Blob([e.data.buffer], {type:"audio/wav"});
            resolve(blob);
          };
      
          let pcmArrays = [];
          for(let i = 0; i < audioBuffer.numberOfChannels; i++) {
            pcmArrays.push(audioBuffer.getChannelData(i));
          }
      
          worker.postMessage({
            pcmArrays,
            config: {sampleRate: audioBuffer.sampleRate}
          });
      
        });
      
    },

    convertAudioBufferToType(buffer, type = "mp3")
    {
        return this.audioBufferToWav(buffer, "mp3");
    },

    
    audioBufferToWav(aBuffer, format = "wav") {
        let numOfChan = aBuffer.numberOfChannels,
          btwLength = aBuffer.length * numOfChan * 2 + 44,
          btwArrBuff = new ArrayBuffer(btwLength),
          btwView = new DataView(btwArrBuff),
          btwChnls = [],
          btwIndex,
          btwSample,
          btwOffset = 0,
          btwPos = 0;
        setUint32(0x46464952); // "RIFF"
        setUint32(btwLength - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"
        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // length = 16
        setUint16(1); // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(aBuffer.sampleRate);
        setUint32(aBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2); // block-align
        setUint16(16); // 16-bit
        setUint32(0x61746164); // "data" - chunk
        setUint32(btwLength - btwPos - 4); // chunk length
      
        for (btwIndex = 0; btwIndex < aBuffer.numberOfChannels; btwIndex++)
          btwChnls.push(aBuffer.getChannelData(btwIndex));
      
        while (btwPos < btwLength) {
          for (btwIndex = 0; btwIndex < numOfChan; btwIndex++) {
            // interleave btwChnls
            btwSample = Math.max(-1, Math.min(1, btwChnls[btwIndex][btwOffset])); // clamp
            btwSample =
              (0.5 + btwSample < 0 ? btwSample * 32768 : btwSample * 32767) | 0; // scale to 16-bit signed int
            btwView.setInt16(btwPos, btwSample, true); // write 16-bit sample
            btwPos += 2;
          }
          btwOffset++; // next source sample
        }
      
        let wavHdr = lamejs.WavHeader.readHeader(new DataView(btwArrBuff));
      
        //Stereo
        let data = new Int16Array(btwArrBuff, wavHdr.dataOffset, wavHdr.dataLen / 2);
        let leftData = [];
        let rightData = [];
        for (let i = 0; i < data.length; i += 2) {
          leftData.push(data[i]);
          rightData.push(data[i + 1]);
        }
        var left = new Int16Array(leftData);
        var right = new Int16Array(rightData);
      
        if (format === "MP3") {
          //STEREO
          if (wavHdr.channels === 2)
            return wavToMp3Stereo(
              wavHdr.channels,
              wavHdr.sampleRate,
              left,
              right,
            );
          //MONO
          else if (wavHdr.channels === 1)
            return wavToMp3(wavHdr.channels, wavHdr.sampleRate, data);
        } else return new Blob([btwArrBuff], { type: "audio/wav" });
      
        function setUint16(data) {
          btwView.setUint16(btwPos, data, true);
          btwPos += 2;
        }
      
        function setUint32(data) {
          btwView.setUint32(btwPos, data, true);
          btwPos += 4;
        }
    },

    wavToMp3(channels, sampleRate, left, right = null) {
        var buffer = [];
        var mp3enc = new lamejs.Mp3Encoder(channels, sampleRate, 128);
        var remaining = left.length;
        var samplesPerFrame = 1152;
      
        for (var i = 0; remaining >= samplesPerFrame; i += samplesPerFrame) {
          if (!right) {
            var mono = left.subarray(i, i + samplesPerFrame);
            var mp3buf = mp3enc.encodeBuffer(mono);
          } else {
            var leftChunk = left.subarray(i, i + samplesPerFrame);
            var rightChunk = right.subarray(i, i + samplesPerFrame);
            var mp3buf = mp3enc.encodeBuffer(leftChunk, rightChunk);
          }
          if (mp3buf.length > 0) {
            buffer.push(mp3buf); //new Int8Array(mp3buf));
          }
          remaining -= samplesPerFrame;
        }
        var d = mp3enc.flush();
        if (d.length > 0) {
          buffer.push(new Int8Array(d));
        }
      
        return new Blob(buffer, { type: "audio/mp3" });
    },

    toLog(val, min, max)
    {
        const exp = (val-min) / (max-min);
        return min * Math.pow(max/min, exp);
    },

    getSimpleBezierCurveTo(t, start, p1, end)
    {
      const x = Math.pow(1-t, 2) * start.x 
                + 2*(1-t) * t * p1.x 
                + Math.pow(t,2) * end.x;

      const y = Math.pow(1-t, 2) * start.y 
              + 2*(1-t) * t * p1.y 
              + Math.pow(t,2) * end.y;

      return { x: x, y: y };
    },

    getBezierCurveTo(t, start, p1, p2, end)
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
        for(const vol of volumes)
        {
            const amplitude = (vol - avgVolume);
            sumOfSquares += amplitude*amplitude;
        }

        sumOfSquares /= volumes.length;
        
        const volume = Math.sqrt(sumOfSquares);
        return volume;
    }
      
}