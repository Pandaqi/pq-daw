import AUDIO from "./audio"
import Color from "./color"

export default {
    generateColors(seed, num)
    {
        const arr = [];
        const start = seed * 360;
        const diff = (360 / num);
        for(let i = 0; i < num; i++)
        {
            const hue = (start + i * diff);
            arr.push(new Color(hue, 50, 50));
        }
        return arr;
    },

    visualizeDaw(daw, redrawParts = false)
    {
        if(!daw.isLoaded()) { console.error("Can't visualize DAW that's not fully loaded"); return; }

        const time = daw.getTime();
        for(const track of daw.tracks)
        {
            this.visualizeTrack(daw, track, redrawParts);
        }

        daw.updateMetadata();
    },

    visualizeTrack(daw, track, redrawParts = true)
    {
        if(!track.isVisible()) { return; }

        // @IMPROV: neater way way to get/set this?
        track.node.style.height = daw.config.trackHeight + "px"; 

        this.visualizeTimeGrid(daw, track);
        this.visualizeCursor(daw, track);
        this.visualizeVolume(daw, track);

        const color = this.getColorForTrack(track);
        track.trackControls.style.backgroundColor = color.lighten(-25).toString();
        track.trackContent.style.backgroundColor = color.lighten(25).toString();
        track.volumeDisplay.style.backgroundColor = color.lighten(-35).toString();

        for(const part of track.parts)
        {
            this.positionPart(daw, track, part);
            if(redrawParts) { this.visualizePart(daw, track, part); }
        }
    },

    visualizeTimeGrid(daw, track)
    {
        const canv = track.timeGridCanvas;
        canv.width = daw.config.trackWidth;
        canv.height = daw.config.trackHeight;

        const minDistBetweenBars = 10;
        const alpha = 0.15;

        const ctx = canv.getContext("2d");

        // @IMPROV: calculate and get from daw config ( + tempo)
        const secondsPerMeasure = 0.25; 
        const stepSize = daw.getPixelsPerSecond() * daw.getSecondsPerBeat();
        const steps = Math.ceil(canv.width / stepSize);

        let numBeats = 4.0;
        const subStep = (stepSize / numBeats);
        if(subStep <= minDistBetweenBars) { numBeats = 1; }

        for(let i = 0; i < steps; i++)
        {
            for(let j = 0; j < numBeats; j++)
            {
                const x = i * stepSize + j * subStep;
                const width = (j == 0) ? 2 : 1;
                ctx.fillStyle = (j == 0) ? "rgba(0,0,0," + alpha + ")" : "rgba(100,100,100," + alpha + ")";
                ctx.fillRect(x, 0, width, canv.height);
            }
            
        }
    },

    visualizeCursor(daw, track)
    {
        track.cursor.style.width = daw.config.cursorWidth + "px";
        track.cursor.style.left = (daw.getPixelsPerSecond() * daw.getTime() - 0.5*daw.config.cursorWidth) + "px"; 
    },

    visualizeVolume(daw, track)
    {
        let newVolume = AUDIO.getVolumeAsGain(track.getAnalyser());
        if(newVolume == null) { return; }

        const maxTrackVolume = 48;
        newVolume = 1.0 - (-AUDIO.gainToDecibels(newVolume) / maxTrackVolume);
        newVolume = Math.round(newVolume*100); // round and convert to percentage

        const oldVolume = parseInt(track.volumeRect.style.height.replace("%", "") || 100);
        let smoothedVolume = oldVolume + (newVolume - oldVolume)*0.1;
        smoothedVolume = Math.max(Math.min(smoothedVolume, 100), 0);

        const hue = 100 * (1 - (smoothedVolume/100.0));
        const volumeColor = new Color(hue, 50, 50);

        const sliderLength = daw.config.trackHeight;
        const volSlid = track.getSlider("volume");
        volSlid.style.width = (sliderLength-5) + "px";
        volSlid.style.top = (0.5*sliderLength-10) + "px";
        volSlid.style.left = -(0.5*sliderLength-8) + "px";
        track.volumeRect.style.height = smoothedVolume + "%";
        track.volumeRect.style.backgroundColor = volumeColor.toString();
    },

    positionPart(daw, track, part)
    {
        const pixelPos = this.timeToPixels(daw, part.getStartTime(), false);
        part.setLeftPos(pixelPos);
    },

    getColorForTrack(track)
    {
        const config = track.daw.config;
        if(!config) { return "#000000"; }
        return config.colors[track.getNum()];
    },

    visualizePart(daw, track, part)
    {
        if(part.dontVisualize) { return; }

        const partType = part.getType();
        const partMargin = 2*window.getComputedStyle(part.node)["margin-top"].slice(0,-2); // chops off "px" at the end

        const canv = part.getCanvas();
        canv.height = daw.config.trackHeight - partMargin;
        canv.width = this.timeToPixels(daw, part.getDuration(), false);

        const color = this.getColorForTrack(track);
        part.node.style.backgroundColor = "rgba(255,255,255,0.3)";
        part.setWidth(canv.width);

        const ctx = canv.getContext("2d");
        ctx.clearRect(0, 0, canv.width, canv.height);

        // visualize the content
        if(partType == "audio" || partType == "blob") {
            this.visualizeFullWaveform(daw, part, color);
        } else if(partType == "automation") {
            this.visualizeAutomation(daw, part, color);
        } else if(partType == "oscillator") {
            this.visualizeOscillator(daw, part, color);
        }

        // visualize the fades
        this.visualizePartFades(part, daw.config.pixelsPerSecond);
    },

    visualizePartFades(part, secToPx)
    {
        const fsWidth = part.getFadeStart() * secToPx;
        const feWidth = part.getFadeEnd() * secToPx;

        this.visualizeFadeLine(part.getCanvas(), fsWidth, "start");
        this.visualizeFadeLine(part.getCanvas(), feWidth, "end");


    },

    visualizeFadeLine(canvas, fsWidth, type = "start")
    {
        const ctx = canvas.getContext('2d');

        ctx.save();

        ctx.beginPath();
        
        const startX = (type == "start") ? 0 : canvas.width;
        ctx.moveTo(startX, canvas.height);
       
        const maxSteps = 16;
        const stepSize = (1 / maxSteps);
        for(let i = 0; i <= maxSteps; i++)
        {
            const ratio = i * stepSize;
            let x = ratio * fsWidth;
            if(type == "end") { x = canvas.width - x; }

            const yLocal = Math.pow(ratio, 0.35)
            const y = (1 - yLocal)*canvas.height;
            ctx.lineTo(x, y)
        }

        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
    },

    timeToPixels(daw, time, units = true)
    {
        let px = daw.getTimeInPixels(time);
        if(units) { px += "px"; }
        return px;
    },

    pixelsToTime(daw, pixels, units = true)
    {
        if(units) { pixels = pixels.slice(0,-2); }
        let time = daw.getPixelsInTime(pixels);
        return time;
    },
    
    visualizeOscillator(daw, part, color)
    {
        const canvas = part.getCanvas();
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const stepSize = 1.0;
        const wideness = 4.0;
        const steps = Math.ceil(width / stepSize);

        ctx.beginPath();
        ctx.moveTo(0, 0.5*height);
        for(let i = 0; i < steps; i++)
        {
            const angle = i * stepSize;
            ctx.lineTo(angle, height * (0.5 + 0.5*Math.sin((1.0/wideness)*angle)));
        }

        ctx.stroke();
    },
    
    visualizeAutomation(daw, part, color)
    {
        part.canvasDrawable.visualize(color);
    },

    visualizeFullWaveform(daw, part, color)
    {
        const canvas = part.getCanvas();
        const ctx = canvas.getContext('2d');
        ctx.save();

        const width = canvas.width;
        const height = canvas.height;
        const maxAmplitude = 0.5 * height;

        ctx.fillStyle = color.lighten(-30).toString();
        ctx.strokeStyle = color.lighten(30).toString();
        ctx.lineWidth = 3;

        const buffer = AUDIO.getResource(part.getSource());
        const data = buffer.getChannelData(0);

        const secondsToDisplay = this.pixelsToTime(daw, width, false);
        const offsetInSeconds = part.getOffset();
        const totalDuration = buffer.duration;

        const samplesPerSecond = (data.length / totalDuration);
        const numSamplesToDisplay = samplesPerSecond * secondsToDisplay;
        const numSamplesOffset = Math.floor(samplesPerSecond * offsetInSeconds);
        
        // how large our jumps between points in the audio are
        const stepSize = 1.0;
        
        // divide the canvas into exactly the number of samples we wish to display
        const sampleSize = Math.ceil(numSamplesToDisplay / (width * stepSize));
    
        // generate all the points
        // for each step, sample ahead until the next step, calculate peaks above and below
        let pointsAbove = [];
        let pointsBelow = [];

        for (let i = 0; i < width; i += stepSize) {
            var min = 1.0, max = -1.0;
            const baseIdx = (i * sampleSize) + numSamplesOffset;
            
            for (let j = 0; j < sampleSize; j++) {
                const idx = baseIdx + j;
                const dataPoint = data[idx];
                min = Math.min(min, dataPoint);
                max = Math.max(max, dataPoint);
            }

            const y1 = (1 + min)*maxAmplitude + 1;
            const y2 = y1 + Math.max(1, (max - min) * maxAmplitude);

            pointsAbove.push({ x: i, y: y1 });
            pointsBelow.push({ x: i, y: y2 })
        }

        pointsBelow.reverse();

        // so it's much easier to draw one single path for all and fill it
        ctx.beginPath();
        ctx.moveTo(0,0);
        for(const p of pointsAbove)
        {
            ctx.lineTo(p.x, p.y);
        }
        for(const p of pointsBelow)
        {
            ctx.lineTo(p.x, p.y);
        }

        //ctx.stroke();
        
        ctx.shadowColor = "rgba(255,255,255,0.8)";
        ctx.shadowBlur = 10;
        ctx.fill();

        ctx.restore();
    }
}