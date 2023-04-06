import DOM from "../dom"

export default class Noise {
    constructor(plugin)
    {
        this.plugin = plugin;
        this.audioNodes = {};
        this.defaults = {
            noise: "pink",
            gain: -25
        };
        this.noiseBuffers = {
            white: null,
            pink: null,
            brown: null,
            blue: null,
            violet: null
        }
        this.needsNewNode = false;
        this.playing = false;

        this.plugin.setConstant(true);

        this.desc = "Pick one of the noise types. Very loud, constant sound.";
    }

    setNoiseType(val)
    {
        DOM.setProperty(this.plugin.node, "noise", val);
    }

    getNoiseType()
    {
        return DOM.getProperty(this.plugin.node, "noise");
    }

    convertToWhiteNoise(data, bufferSize)
    {
        for(let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    convertToPinkNoise(data, bufferSize)
    {
        var b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;

        for(let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            
            let val = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;

            val *= 0.11; // (roughly) compensate for gain
            data[i] = val;
        }
    }

    convertToBrownNoise(data, bufferSize)
    {
        let lastVal = 0.0;
        for(let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            let val = (lastVal + (0.02 * white)) / 1.02;
            lastVal = val;
            val *= 3.5; // (roughly) compensate for gain
            data[i] = val;
        }
    }
    
    createNodes()
    {
        this.plugin.setWet(0.0); // just send the original signal through

        const ctx = this.plugin.getContext();
        const sampleRate = ctx.sampleRate;
        const noiseDuration = 5; // we just loop this later
        const bufferSize = sampleRate * noiseDuration;

        // create a buffer and fill it with random values ( = white noise)
        for(const key in this.noiseBuffers)
        {
            if(key == "blue" || key == "violet") { continue; }

            const noiseBuffer = new AudioBuffer({ length: bufferSize, sampleRate: sampleRate });
            const data = noiseBuffer.getChannelData(0);

            if(key == "white") { this.convertToWhiteNoise(data, bufferSize) }
            else if(key == "pink") { this.convertToPinkNoise(data, bufferSize) }
            else if(key == "brown") { this.convertToBrownNoise(data, bufferSize) }

            this.noiseBuffers[key] = noiseBuffer;
        }

        this.noiseBuffers.blue = this.noiseBuffers.white;
        this.noiseBuffers.violet = this.noiseBuffers.white;

        const gainNode = ctx.createGain();
        this.audioNodes.gain = gainNode;

        this.plugin.attachToFinalOutput(gainNode);
        this.needsNewNode = true; 
    }

    // to allow changing noise type while playing
    onNoiseTypeChanged()
    {
        if(!this.playing) { return; }
        
        this.setPlaying(false);
        this.setPlaying(true);
    }
    
    createHTML(cont, defaults)
    {
        
        // create the noise type selection
        const keys = [];
        for(const key in this.noiseBuffers)
        {
            keys.push(key + " noise");
        }

        DOM.createDropdown(this.plugin.node, {
            cont: cont, keys: keys, values: Object.keys(this.noiseBuffers),
            name: "noise", "text": "Type", callback: this.onNoiseTypeChanged.bind(this)
        })

        // general gain knob => noise is LOUD, so default is lower
        this.plugin.createMakeUpGainControl(cont, this.audioNodes.gain.gain, defaults.gain, { min: -50, max: 0 });
    }

    createNewNode()
    {
        const ctx = this.plugin.getContext();
        const type = this.getNoiseType();
        const noiseNode = new AudioBufferSourceNode(ctx, { buffer: this.noiseBuffers[type] });
        noiseNode.loop = true;
        this.audioNodes.noise = noiseNode;

        const noiseNeedsFilter = type == "blue" || type == "violet";
        if(noiseNeedsFilter)
        {
            const bandHz = 20000;
            let Q = 0.1;
            if(type == "violet") { Q = 1.0; }
            const bandpassFilter = new BiquadFilterNode(ctx, { type: "bandpass", frequency: bandHz, Q: Q });
            noiseNode.connect(bandpassFilter).connect(this.audioNodes.gain);
        } else {
            noiseNode.connect(this.audioNodes.gain);
        }

        this.needsNewNode = false;
    }

    setPlaying(val)
    {        
        if(this.plugin.isBypassed()) { val = false; }

        this.playing = val;

        if(val) { 
            if(this.needsNewNode) { this.createNewNode() }
            this.audioNodes.noise.start(); 
        } else {
            if(this.audioNodes.noise) { this.audioNodes.noise.stop(); }
            this.needsNewNode = true;
        }
    }

    // @IMPROV: selection used to work via radio buttons
    // I should generalize this and move it to the DOM, in case I want it for something else later
    /*
    createRadioButton(key, checked)
    {
        const dataKey = key + "-noise";
        const label = document.createElement("label");
        label.for = dataKey;
        label.innerHTML = key + " Noise";

        const inp = document.createElement("input");
        inp.type = "radio";
        inp.id = dataKey;
        inp.name = "noisetype";
        inp.dataset.noise = key;

        if(checked) { inp.checked = "checked"; }

        inp.addEventListener("change", this.onRadioChange.bind(this));

        const cont = document.createElement("div");
        cont.classList.add('effect-subsection');
        cont.appendChild(label);
        cont.appendChild(inp);

        if(checked)
        {
            const fakeEvent = new Event("change");
            inp.dispatchEvent(fakeEvent);
        }

        return cont;
    }

    onRadioChange(ev)
    {
        const elem = ev.currentTarget;
        const allButtons = elem.parentNode.getElementsByTagName("input");
        let value;
        for(const btn of allButtons)
        {
            if(!btn.checked) { continue; }
            value = btn.dataset.noise;
        }

        if(!value) { return; }

        this.setNoiseType(value);

        // to allow changing while playing
        if(this.playing)
        {
            this.setPlaying(false);
            this.setPlaying(true);
        }
    }

    createRadioButtons(cont, defaults)
    {
        // radio buttons for noise type
        for(const key in this.noiseBuffers)
        {
            const checked = (defaults.noise == key);
            cont.appendChild(this.createRadioButton(key, checked));
        }
    }
    */
}