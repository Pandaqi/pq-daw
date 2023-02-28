PQ_DAW.PLUGIN_LIST["equalizer"] = class {
    constructor(plugin)
    {
        this.plugin = plugin;
        this.audioNodes = {};
        this.canvas = null;

        this.bands = {
            "HighPass": { start: 28, end: 1000, def: 80, type: "highpass" },
            "LowPass": { start: 1000, end: 20000, def: 16000, type: "lowpass" },
            "LF": { start: 20, end: 200 }, 
            "LMF": { start: 200, end: 700 }, 
            "MF": { start: 700, end: 3000 }, 
            "HMF": { start: 3000, end: 7000 }, 
            "HF": { start: 7000, end: 20000 },
        };

        const defaultsObject = { gain: 0.0 };
        for(const key in this.bands)
        {
            const dataKey = key.toLowerCase();
            const val = this.bands[key];
            const avgVal = val.def || 0.5*(val.start + val.end);
            defaultsObject[dataKey + "frequency"] = avgVal;
            defaultsObject[dataKey + "q"] = 1.0;
            defaultsObject[dataKey + "gain"] = 0.0;
        }
        this.defaults = defaultsObject;

        this.animFrame = null;

        this.desc = "Higher Q = more narrow influence. Change gain on filters to use them (and see them in the graph).";
    }

    createNodes()
    {
        const ctx = this.plugin.getContext();
        let lastNode = this.plugin.wetGain;
        this.plugin.setWet(1.0);

        for(const key in this.bands)
        {
            const val = this.bands[key];
            const avgVal = val.def || 0.5*(val.start + val.end);
            const biquad = ctx.createBiquadFilter();
            biquad.type = val.type || "peaking";
            biquad.frequency.value = avgVal;
            biquad.gain.value = 0.0;
            this.audioNodes[key] = biquad;
            lastNode.connect(biquad);
            lastNode = biquad;
        }

        const gainNode = ctx.createGain();
        this.audioNodes.gain = gainNode;
        lastNode.connect(gainNode);

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.maxDecibels = 0;
        analyser.minDecibels = -128;
        this.audioNodes.analyser = analyser;
        gainNode.connect(analyser);

        this.plugin.attachToFinalOutput(analyser);
    }

    getColorFromFrequency(freq)
    {
        const minFreq = 20, maxFreq = 20000;
        const ratio = (Math.log2(freq) - Math.log2(minFreq)) / Math.log2(maxFreq);
        const hue = Math.round(ratio * 360);
        return "hsl(" + hue + ", 50%, 50%)";
    }

    // Frequency follows a logarithmic scale; we want more "resolution" in the lower frequencies than the higher ones
    // This function does that: step through the full analyser range, but in logarithmic steps
    // The result is therefore an array of _indices_ (into the analyser bins)
    getFrequencyBins(numSteps = 64)
    {
        const bufferLength = this.audioNodes.analyser.frequencyBinCount;
        const stepSize = bufferLength / numSteps;
        const arr = [];
        for(let i = 1; i <= bufferLength; i += stepSize)
        {
            arr.push( PQ_DAW.AUDIO.toLog(i, 0.5, bufferLength) );
        }
        return arr;
    }

    // This simply takes those _indices_ (frequency bins) and converts them to frequency numbers
    getFrequencies(numSteps = 64)
    {
        const bufferLength = this.audioNodes.analyser.frequencyBinCount;
        const sampleRate = this.plugin.getContext().sampleRate;
        const maxFrequency = 0.5*sampleRate;
        const frequencies = [];
        for(const val of this.getFrequencyBins(numSteps))
        {
            frequencies.push(val * (maxFrequency/bufferLength));
        }
        return frequencies;
    }

    // This gets the smoothed, interpolated volume at each of those _indices_ (frequency bins)
    getLogarithmicFrequencyVolumes(numSteps = 64)
    {
        const bufferLength = this.audioNodes.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.audioNodes.analyser.getByteFrequencyData(dataArray);
        const volumesPerFrequency = [];
        for(const val of this.getFrequencyBins(numSteps))
        {
            const lowBin = Math.floor(val); // bin before this exact frequency
            const highBin = Math.ceil(val); // bin after this exact frequency
            const lowValue = dataArray[lowBin] / 256.0;
            const highValue = dataArray[highBin] / 256.0;
            const weight = (val-lowBin)/(highBin-lowBin); // weights it according to distance to low/high edge
            const finalValue = lowValue + (highValue-lowValue)*weight;
            volumesPerFrequency.push(finalValue);
        }
        return volumesPerFrequency;
    }

    visualize()
    {
        this.animFrame = requestAnimationFrame(this.visualize.bind(this));

        if(!this.plugin.isVisible()) { return; }

        this.canvas.width = this.canvas.parentElement.offsetWidth;
        this.canvas.height = 0.5*this.canvas.width;

        this.visualConfig = {
            centerLine: 0.6*this.canvas.height,
            numSteps: 64,
            marginBetweenBars: 2,
            totalBarWidth: 100,
            filterResolution: 4.0,
            dotRadius: this.canvas.width / 60.0,
            fontSize: this.canvas.width / 60.0,
            volumeRange: 0.5*(this.audioNodes.analyser.maxDecibels - this.audioNodes.analyser.minDecibels) // seems reasonable
            //volumeRange: -PQ_DAW.AUDIO.gainToDecibels(0.025),
        }

        const ctx = this.canvas.getContext("2d");
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.fillStyle = "#042e04"; // this is a darker color of the general plugin background defined in CSS (lightgreen)
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.visualizeGrid();
        this.visualizeBars();
        this.visualizeFilters();
    }

    visualizeGrid()
    {
        let numOctaves = 10;
        let resolution = 12;

        const ctx = this.canvas.getContext("2d");
        const centerLine = this.visualConfig.centerLine;

        ctx.strokeStyle = "#FFCCAA";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, centerLine);
        ctx.lineTo(this.canvas.width, centerLine);
        ctx.stroke();

        for(let i = 0; i < numOctaves; i++)
        {
            const octaveWidth = (this.canvas.width / numOctaves);
            const baseX = i * octaveWidth;

            for(let j = 0; j < resolution; j++)
            {
                ctx.lineWidth = (j == 0) ? 2 : 1;
                ctx.strokeStyle = (j == 0) ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)";

                const x = baseX + (j / resolution) * octaveWidth;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, this.canvas.height);
                ctx.stroke();
            }
        }
    }

    // this draws the bars showing ACTUAL frequency usage, using logarithmic scale
    // (this means the jumps between frequencies aren't the same, even if their jump in "pixels" on the canvas is constant)
    // we save some results to make sure subsequent visualizations stay consistent (in size and scale)
    visualizeBars()
    {
        const numSteps = this.visualConfig.numSteps;
        const volumesPerFrequency = this.getLogarithmicFrequencyVolumes(numSteps);
        const frequencies = this.getFrequencies(numSteps);

        const numFrequencies = volumesPerFrequency.length;
        const totalBarWidth = (this.canvas.width / numFrequencies);
        this.visualConfig.totalBarWidth = totalBarWidth;

        const barWidth = totalBarWidth - this.visualConfig.marginBetweenBars;
        const maxAmplitude = this.visualConfig.centerLine;
        const marginForCenterLine = (this.canvas.height - this.visualConfig.centerLine);

        this.visualConfig.numOctaves = Math.log2(frequencies[numFrequencies-1]) - Math.log2(frequencies[0]);
        this.visualConfig.octaveInPixels = this.canvas.width / this.visualConfig.numOctaves;
        this.visualConfig.pixelsPerDecibelVolume = (this.visualConfig.centerLine / this.visualConfig.volumeRange);

        const ctx = this.canvas.getContext("2d");
        for(let i = 0; i < numFrequencies; i++) {
            const x = totalBarWidth*i;
            const barHeight = volumesPerFrequency[i]*maxAmplitude;
        
            ctx.fillStyle = this.getColorFromFrequency(frequencies[i]);
            ctx.fillRect(x, this.canvas.height - marginForCenterLine - barHeight, barWidth, barHeight);

            const drawLabel = (i % 4 == 0);
            if(drawLabel)
            {
                let val = frequencies[i];
                if(val >= 1000) { val = Math.round(val / 1000) + "kHz"; }
                else { val = Math.round(val) + "Hz"; }
    
                ctx.font = this.visualConfig.fontSize + "px Dosis";
                ctx.fillStyle = "#FFFFFF";
                ctx.fillText(val, x, this.visualConfig.centerLine+24);
            }
        } 
    }

    // here's the gist: for each filter, we generate a smooth (4-point) _bezier_ curve for its area of influence
    // the result is a set of discrete points (x: frequency, y: volume), per filter, approximating this curve
    // we sum all these individual sets into one array: every cell has a correct summed value, or is untouched (null)
    // finally, we create a line through all non-null cells and simply draw that on the canvas
    // (along the way we also track where the filter's center frequencies are = dots)
    //
    // @CAVEAT: this is an imprecise algorithm; 
    //          - the discrete representation of a bezier curve might miss cells, 
    //          - or when the frequency is rounded to the nearest "bin" it might end up too far out of the way;
    //          - by using a high enough resolution, though, this practically never happens
    //
    // any other approach does NOT work for a myriad of reasons I personally encountered while making this :p
    visualizeFilters()
    {
        const {summedCurves, dots} = this.getSummedFilterData();
        const line = this.convertSummedCurvesToLine(summedCurves);
        this.visualizeFilterLine(line);
        this.visualizeFilterDots(dots);
    }

    getSummedFilterData()
    {
        const numSteps = this.visualConfig.filterResolution * this.visualConfig.numSteps;
        const frequencies = this.getFrequencies(numSteps);
        const summedCurves = new Array(frequencies.length).fill(null);
        const dots = [];
        
        for(const key in this.bands)
        {
            const keyPoints = this.getFilterCurve(key, frequencies);
            this.addToSummedCurve(summedCurves, keyPoints);
            const dot = this.extractFilterDot(keyPoints);
            if(dot) { dots.push(dot); }
        }

        return {summedCurves, dots};
    }

    extractFilterDot(list)
    {
        for(const val of list)
        {
            if(val.dot) { return val }
        }
        return null
    }

    // convert the key points we collected into bezier curves => save samples into the array
    addToSummedCurve(summedCurves, list)
    {
        const curveBinSize = (this.canvas.width / summedCurves.length);
        
        let lastBinIndex = -1;
        for(let i = 0; i < list.length - 1; i++)
        {
            const start = list[i];
            const end = list[i+1];

            const binIndexStart = Math.floor(start.x / curveBinSize);
            const binIndexEnd = Math.ceil(end.x / curveBinSize);
            const resolution = (binIndexEnd - binIndexStart)*2;

            for(let j = 0; j < resolution; j++)
            {
                const controlXOffset = Math.pow(Math.abs(end.x-start.x), 0.75);

                const p1 = { x: start.x + controlXOffset, y: start.y };
                const p2 = { x: end.x - controlXOffset, y: end.y };
                const interp = j/resolution;
                const point = PQ_DAW.AUDIO.getBezierCurveTo(interp, start, p1, p2, end);
                
                const binIndex = Math.round(point.x / curveBinSize);
                if(binIndex <= lastBinIndex) { continue; }
                if(binIndex < 0 || binIndex >= summedCurves.length) { continue; }

                if(summedCurves[binIndex] == null) { summedCurves[binIndex] = 0; }
                summedCurves[binIndex] += point.y;
                lastBinIndex = binIndex;
            }
        }
    }

    getFilterCurve(key, frequencies)
    {
        const an = this.audioNodes[key];
        const bandFreq = an.frequency.value;
        const bandQ = an.Q.value;
        
        const keyPoints = [];

        // @IMPROV: make this a general function: convert _any_ frequency into pixels, and the other way around
        const freqAsOctave = (Math.log2(bandFreq) - Math.log2(frequencies[0]));
        const freqInPixels = freqAsOctave * this.visualConfig.octaveInPixels;

        // create point at start (12 dB/octave lowered) + our point
        if(an.type == "highpass")
        {
            const lowestFrequency = frequencies[0];
            const distInOctaves = Math.log2(bandFreq) - Math.log2(lowestFrequency);
            keyPoints.push({ x: 0, y: -12*distInOctaves });
            keyPoints.push({ x: freqInPixels, y: 0, dot: true, freq: bandFreq })
        }

        // same thing: point at end (12 dB/octave lowered) + our point
        if(an.type == "lowpass")
        {
            const highestFrequency = frequencies[frequencies.length-1];
            const distInOctaves = Math.log2(highestFrequency) - Math.log2(bandFreq);
            keyPoints.push({ x: freqInPixels, y: 0, dot: true, freq: bandFreq });
            keyPoints.push({ x: this.canvas.width, y: -12*distInOctaves });
            
        }

        // other filters create the two points around them + themselves
        // Q = 1 = 1/1 octave spread
        // Q = 2 = 1/2 octave spread
        // ...
        // (the logarithmic display and scale is really helping us out here, calculations are simple)
        if(an.type == "peaking" && Math.abs(an.gain.value) >= 0.03)
        {
            const bandGain = an.gain.value;
            const freqBefore = freqInPixels - this.visualConfig.octaveInPixels / bandQ;
            const freqAfter = freqInPixels + this.visualConfig.octaveInPixels / bandQ;
            keyPoints.push({ x: freqBefore, y: 0 });
            keyPoints.push({ x: freqInPixels, y: bandGain, dot: true, freq: bandFreq });
            keyPoints.push({ x: freqAfter, y: 0 });
        }

        return keyPoints;
    }
    
    // @IMPROV: check for jumps that are too large; ignore or smooth those by default
    convertSummedCurvesToLine(curves)
    {
        const line = [];
        const centerLine = this.visualConfig.centerLine;
        const binSize = (this.canvas.width / curves.length);

        for(let i = 0; i < curves.length; i++)
        {
            const val = curves[i];
            if(val == null) { continue; }
            const x = i * binSize;
            const y = centerLine - val*this.visualConfig.pixelsPerDecibelVolume; // turn upside down + scale according to volume scale of canvas
            line.push({ x: x, y: y });
        }

        return line;
    }

    // this actually draws the frequency line
    visualizeFilterLine(line)
    {
        const ctx = this.canvas.getContext("2d");

        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for(let i = 1; i < line.length; i++)
        {
            ctx.lineTo(line[i].x, line[i].y);
        }
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 5;
        ctx.stroke();
    }

    visualizeFilterDots(dots)
    {
        const ctx = this.canvas.getContext("2d");
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#222222";

        for(const dot of dots)
        {
            const x = dot.x;
            const y = this.visualConfig.centerLine - dot.y*this.visualConfig.pixelsPerDecibelVolume;
            
           
            ctx.fillStyle = this.getColorFromFrequency(dot.freq);

            ctx.beginPath();
            ctx.arc(x, y, this.visualConfig.dotRadius, 0, 2 * Math.PI);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
    }

    createHTML(cont, defaults)
    {
        const dom = PQ_DAW.DOM;
        const node = this.plugin.node;

        // create canvas
        const canv = document.createElement("canvas");
        cont.appendChild(canv);
        this.canvas = canv;        

        // create sliders for all the frequencies
        // @IMPROV: allow toggling each on/off + proper layout of course
        for(const key in this.bands)
        {
            const dataKey = key.toLowerCase();
            const val = this.bands[key];
            const an = this.audioNodes[key];

            const bandCont = document.createElement("div");
            bandCont.classList.add("effect-subsection");
            cont.appendChild(bandCont);

            const header = document.createElement("div");
            header.classList.add("effect-subsection-header");
            header.innerHTML = key;
            bandCont.appendChild(header);

            // frequency
            let id = dataKey + "frequency";
            dom.createSlider(node, { 
                cont: bandCont, min: val.start, max: val.end, value: defaults[id],
                name: id, text: "Freq", unit: "hertz", audioParams: an.frequency
            });

            // Q
            id = dataKey + "q";
            dom.createSlider(node, { 
                cont: bandCont, min: 0.001, max: 4, value: defaults[id], step: 0.01,
                name: id, text: "Q", unit: "dimensionless", audioParams: an.Q
            });

            const valueHasNoGainParam = val.type == "lowpass" || val.type == "highpass";
            if(valueHasNoGainParam) { continue; }

            // gain
            id = dataKey + "gain"
            dom.createSlider(node, { 
                cont: bandCont, min: -20, max: 20, value: defaults[id], step: 0.25,
                name: id, text: "Gain", unit: "decibels", audioParams: an.gain
            });
        }

        // make-up gain
        const subCont = document.createElement("div");
        subCont.classList.add("effect-subsection");
        cont.appendChild(subCont);
        this.plugin.createMakeUpGainControl(subCont, this.audioNodes.gain.gain, defaults.gain);

        this.visualize();
    }

    remove()
    {
        if(!this.animFrame) { return; }
        cancelAnimationFrame(this.animFrame);
    }
}