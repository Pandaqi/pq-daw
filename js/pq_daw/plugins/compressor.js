PQ_DAW.PLUGIN_LIST["compressor"] = class {
    constructor(plugin)
    {
        this.plugin = plugin;
        this.audioNodes = {};
        this.defaults = {
            threshold: -3,
            knee: 3,
            ratio: 2,
            attack: 0.05,
            release: 0.05,
            gain: 0
        }

        this.minGain = 0.001;
        this.maxGain = 1.0;
        this.graphStyle = "linear";
        this.prevVolumeDot = { x: 0.5, y: 0.5 };

        this.desc = "To compress more, lower threshold and raise ratio. Won't change much if the source already has low dynamic range.";
    }

    createNodes()
    {
        const ctx = this.plugin.getContext();
        const compressor = ctx.createDynamicsCompressor();
        const gainNode = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.maxDecibels = PQ_DAW.AUDIO.gainToDecibels(this.maxGain);
        analyser.minDecibels = PQ_DAW.AUDIO.gainToDecibels(this.minGain);

        this.audioNodes = { compressor: compressor, gain: gainNode, analyser: analyser }
        this.plugin.setWet(1.0); // compressor node is fully wet, no knob to change that
        this.plugin.attachToFirstInput(analyser);
        analyser.connect(compressor);
        compressor.connect(gainNode);
        this.plugin.attachToFinalOutput(gainNode);
    }

    createHTML(cont, defaults)
    {
        const dom = PQ_DAW.DOM;
        const an = this.audioNodes.compressor;
        const gain = this.audioNodes.gain;
        const node = this.plugin.node

        const canv = document.createElement("canvas");
        cont.appendChild(canv);
        this.canvas = canv; 

        dom.createSlider(node, { 
            cont: cont, min: -50, max: 0, value: defaults.threshold, step: 0.25, 
            name: "threshold", text: "Threshold", unit: "decibels", audioParams: an.threshold 
        });

        dom.createSlider(node, { 
            cont: cont, min: 0, max: 40, value: defaults.knee, step: 0.5, 
            name: "knee", text: "Knee", unit: "decibels", audioParams: an.knee 
        });

        dom.createSlider(node, { 
            cont: cont, min: 1, max: 20, value: defaults.ratio, step: 0.5, 
            name: "ratio", text: "Ratio", unit: "ratio", audioParams: an.ratio 
        });

        dom.createSlider(node, { 
            cont: cont, min: 0, max: 1, value: defaults.attack, step: 0.01, 
            name: "attack", text: "Attack", unit: "time", audioParams: an.attack 
        });

        dom.createSlider(node, { 
            cont: cont, min: 0, max: 1, value: defaults.release, step: 0.01, 
            name: "release", text: "Release", unit: "time", audioParams: an.release 
        });

        dom.createSlider(node, {
            cont: cont, min: -4, max: 10, value: defaults.gain, step: 0.25,
            name: "gain", text: "Gain", unit: "gain", audioParams: gain.gain
        })

        this.visualize();
    }

    visualize()
    {
        this.animFrame = requestAnimationFrame(this.visualize.bind(this));

        if(!this.plugin.isVisible()) { return; }

        this.canvas.width = this.canvas.parentElement.offsetWidth;
        this.canvas.height = 0.5*this.canvas.width;

        const visualConfig = {
            widthScale: 0.66,
            heightScale: 1.0,
            numGridLines: 13,
            numCurvePoints: 64,
            minGain: this.minGain,
            maxGain: this.maxGain,
            edgeMargin: 20.0,
            fontSize: this.canvas.width / 60.0,
            volumeDotRadius: 10.0
        }

        visualConfig.actualWidth = this.canvas.width * visualConfig.widthScale - 2*visualConfig.edgeMargin;
        visualConfig.actualHeight = this.canvas.height * visualConfig.heightScale - 2*visualConfig.edgeMargin;
        visualConfig.oX = 0.5 * (this.canvas.width - visualConfig.actualWidth);
        visualConfig.oY = 0.5 * (this.canvas.height - visualConfig.actualHeight);

        const ctx = this.canvas.getContext("2d");        
        ctx.fillStyle = "#420742"; // this is a darker color of the general plugin background defined in CSS 
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.visualizeGrid(visualConfig);
        const curve = this.visualizeCompressionCurve(visualConfig);
        this.visualizeVolume(visualConfig, curve);
    }

    visualizeGrid(cfg)
    {
        const w = cfg.actualWidth;
        const h = cfg.actualHeight;
        const oX = cfg.oX;
        const oY = cfg.oY;
        const ctx = this.canvas.getContext("2d");
        const numLines = cfg.numGridLines;

        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;

        // X-axis
        ctx.beginPath();
        ctx.moveTo(oX, oY + h);
        ctx.lineTo(oX + w, oY + h);
        ctx.stroke();

        // Y-axis
        ctx.beginPath();
        ctx.moveTo(oX + w, oY);
        ctx.lineTo(oX + w, oY + h);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;

        ctx.font = cfg.fontSize + "px Dosis";
        ctx.fillStyle = "#FFFFFF";

        const minGain = cfg.minGain;
        const maxGain = cfg.maxGain;
        const stepGain = (maxGain - minGain) / numLines;

        const minDecibels = PQ_DAW.AUDIO.gainToDecibels(cfg.minGain);
        const maxDecibels = PQ_DAW.AUDIO.gainToDecibels(cfg.maxGain);
        const stepDecibels = (maxDecibels - minDecibels) / numLines;

        const stepX = w / numLines;
        const stepY = h / numLines;
        for(let i = 0; i < numLines; i++)
        {
            const x = oX + i*stepX;
            const y = oY + h - i*stepY;

            // X lines
            ctx.beginPath();
            ctx.moveTo(oX, y);
            ctx.lineTo(oX + w, y);
            ctx.stroke();

            // Y lines
            ctx.beginPath();
            ctx.moveTo(x, oY);
            ctx.lineTo(x, oY + h);
            ctx.stroke(); 

            // labels
            let volume;

            if(this.graphStyle == "log")
            {
                const interpGain = minGain + i * stepGain;
                volume = PQ_DAW.AUDIO.gainToDecibels(interpGain); 
            } else if(this.graphStyle == "linear") {
                volume = minDecibels + i * stepDecibels;
            }  
            
            const textMargin = 15;

            const drawLabelX = (i % 2 == 0);
            if(drawLabelX)
            {
                let val = Math.ceil(volume) + " dB";
                ctx.fillText(val, x, oY + h + textMargin)
            }

            const drawLabelY = (i % 2 == 0);
            if(drawLabelY)
            {
                let val = Math.ceil(volume) + " dB";
                ctx.fillText(val, oX + w + 0.5*textMargin, y);
            }
        }
    }

    visualizeCompressionCurve(cfg)
    {
        const getProp = PQ_DAW.DOM.getProperty;
        const node = this.plugin.node;
        const ctx = this.canvas.getContext("2d");

        const resolution = cfg.numCurvePoints;
        const step = 1.0 / resolution;
        const w = cfg.actualWidth;
        const h = cfg.actualHeight;
        const oX = cfg.oX;
        const oY = cfg.oY;
        const stepX = w * step;
        const stepY = h * step;

        const minDecibels = PQ_DAW.AUDIO.gainToDecibels(cfg.minGain);
        const maxDecibels = PQ_DAW.AUDIO.gainToDecibels(cfg.maxGain);

        const line = [];
        const thresh = parseFloat(getProp(node, "threshold"));
        const knee = parseFloat(getProp(node, "knee"));
        const ratio = parseFloat(getProp(node, "ratio"));
        //const bezierCurve = PQ_DAW.AUDIO.getSimpleBezierCurveTo;

        const thresholdDb = thresh;
        const kneeDb = thresh + knee

        const thresholdGain = PQ_DAW.AUDIO.decibelsToGain(thresh);
        const kneeGain = Math.min(PQ_DAW.AUDIO.decibelsToGain(kneeDb), 1.0);

        

        // Until threshold, this is a linear progression
        // After threshold, we get the knee (which gradually changes ratio 1:1 to the full ratio, giving a nice quadratic-like curve)
        // After that, we're at full ratio compression
        let x = 0, y = h;

        while(x <= w)
        {
            let gain = (x/w);
            if(this.graphStyle == "linear") { 
                let db = minDecibels + (maxDecibels - minDecibels) * gain;
                gain = PQ_DAW.AUDIO.decibelsToGain(db); 
            }

            const goLinear = gain < thresholdGain;
            if(goLinear)
            {
                x += stepX;
                y -= stepY;
                line.push({ x: oX + x, y: oY + y });
                continue;
            }

            const goKnee = (gain >= thresholdGain && gain < kneeGain);
            if(goKnee)
            {
                let kneeLength = (kneeGain - thresholdGain);
                if(this.graphStyle == "linear") { 
                    kneeLength = (kneeDb - thresholdDb) / (maxDecibels - minDecibels); 
                }

                const numPoints = Math.ceil(kneeLength / step);
                const ratioChangePerStep = (ratio - 1) / numPoints;
                for(let i = 0; i <= numPoints; i++)
                {
                    let curRatio = 1 + i*ratioChangePerStep;
                    x += stepX;
                    y -= stepY * (1.0/curRatio);
                    line.push({ x: oX + x, y: oY + y });
                    continue;
                }
            }

            const goCompressed = (gain >= kneeGain);
            if(goCompressed)
            {
                x += stepX;
                y -= stepY*(1.0 / ratio);
                line.push({ x: oX + x, y: oY + y });
                continue;
            }
        }

        ctx.strokeStyle = "pink";
        ctx.lineWidth = 6;

        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for(let i = 1; i < line.length; i++)
        {
            ctx.lineTo(line[i].x, line[i].y);
        }

        ctx.stroke();

        return line;
    }

    visualizeVolume(cfg, curve)
    {
        const ctx = this.canvas.getContext("2d");

        // reduction meter (rectangle coming from above, read from audio node)
        const volReduction = this.audioNodes.compressor.reduction;
        const fullReduction = PQ_DAW.AUDIO.gainToDecibels(cfg.minGain);

        const reducMargin = 40;
        const reducEdgeMargin = 10;
        const reducWidth = cfg.oX - reducMargin - reducEdgeMargin;

        const minDecibels = PQ_DAW.AUDIO.gainToDecibels(cfg.minGain);
        const maxDecibels = PQ_DAW.AUDIO.gainToDecibels(cfg.maxGain);

        const reducRatio = (volReduction/fullReduction);
        const height = cfg.actualHeight * reducRatio;
        ctx.fillStyle = "#33FF33" 
        if(Math.abs(volReduction) >= 10) { ctx.fillStyle = "#FF3333"; }
        else if(Math.abs(volReduction) >= 5) { ctx.fillStyle = "#AAAA33"; }

        ctx.fillRect(cfg.oX + cfg.actualWidth + reducMargin, cfg.oY, reducWidth, height);

        // volume meter (shown as a dot on the curve)
        const vol = PQ_DAW.AUDIO.getVolumeAsGain(this.audioNodes.analyser);
        const volDb = PQ_DAW.AUDIO.gainToDecibels(vol);
        let volRatio = PQ_DAW.AUDIO.decibelsToGain(volDb);
        if(this.graphStyle == "linear") { volRatio = (volDb-minDecibels) / (maxDecibels - minDecibels); }

        const volInPixels = cfg.oX + volRatio * cfg.actualWidth;

        let volumeDot = this.prevVolumeDot;
        if(volInPixels <= curve[0].x) { return; }

        for(let i = 1; i < curve.length; i++)
        {  
            if(curve[i-1].x <= volInPixels && curve[i].x >= volInPixels)
            {
                volumeDot = { 
                    x: 0.5*(curve[i-1].x + curve[i].x),
                    y: 0.5*(curve[i-1].y + curve[i].y)
                };
                break;
            }
        }

        ctx.shadowBlur = 10;
        ctx.shadowColor = "#333333";
        ctx.fillStyle = "pink";

        const h = this.canvas.height;
        const w = this.canvas.width;
        const interp = 0.33;
        const smoothedDot = { 
            x: ( this.prevVolumeDot.x + interp*((volumeDot.x/w) - this.prevVolumeDot.x) ),
            y: ( this.prevVolumeDot.y + interp*((volumeDot.y/h) - this.prevVolumeDot.y) )
        }; 

        console.log(smoothedDot.x * w, smoothedDot.y * h);

        const realX = smoothedDot.x * w;
        const realY = smoothedDot.y * h;

        ctx.beginPath();
        ctx.arc(realX, realY, cfg.volumeDotRadius, 0, 2*Math.PI);
        ctx.fill();
        
        this.prevVolumeDot = smoothedDot;

        ctx.shadowBlur = 0;
    }

    remove()
    {
        if(!this.animFrame) { return; }
        cancelAnimationFrame(this.animFrame);
    }
}