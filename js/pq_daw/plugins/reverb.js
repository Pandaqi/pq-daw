PQ_DAW.PLUGIN_LIST["reverb"] = class {
    constructor(plugin)
    {
        this.plugin = plugin;
        this.audioNodes = {};
        this.defaults = {
            wet: 0.5,
            gain: 0.0,
            duration: 3,
            decay: 2,
            reverse: false,
            pregain: 0.0,
            predelay: 0.0
        };

        this.desc = "Pick an impulse response. Or change the sliders to generate a dynamic impulse.";

        // @SOURCE: http://reverbjs.org/
        // (selection based on variety, file size, and ignoring reverbs that sound too "muddled")
        this.impulseResponses = {
            "None": "",
            "Abernyte": "AbernyteGrainSilo",
            "Living Room": "DomesticLivingRoom",
            "Elveden Hall 1": "ElvedenHallLordsCloakroom",
            "Elveden Hall 2": "ElvedenHallSmokingRoom",
            "Brickworks": "ErrolBrickworksKiln",
            "Royal Tennis Court": "FalklandPalaceRoyalTennisCourt",
            "Inside Piano": "InsidePiano",
            "Kinoull": "KinoullAisle",
            "Maes Howe": "MaesHowe",
            "Railroad Tunnel": "PurnodesRailroadTunnel",
            "University Stairway": "StairwayUniversityOfYork",
            "St Patricks Church": "StPatricksChurchPatringtonPosition3",
            "Typing Room": "TerrysTypingRoom",
            "Car Park": "UndergroundCarPark",
        }
    }

    // When any of them is changed, a new buffer is generated and given to the convolver
    onDynamicParametersChanged()
    {
        this.calculateAndUseDynamicImpulse();
    }

    // When changed to any value other than "None", we use that instead of the dynamic impulse
    async onImpulseSourceChanged()
    {
        const val = PQ_DAW.DOM.getProperty(this.plugin.node, "impulse");
        if(!val) { 
            this.calculateAndUseDynamicImpulse();
            return;
        }

        const daw = this.plugin.getDaw();
        const loadParams = { extension: "m4a", path: "/tutorials/daw/impulse_responses" }
        await PQ_DAW.AUDIO.checkAndLoadResources(daw, [val], loadParams);

        this.audioNodes.convolver.buffer = PQ_DAW.AUDIO.getResource(val);
    }

    calculateAndUseDynamicImpulse()
    {
        const dom = PQ_DAW.DOM
        const node = this.plugin.node;

        const params = {
            duration: parseFloat(dom.getProperty(node, "duration")),
            decay: parseFloat(dom.getProperty(node, "decay")),
            reverse: dom.getProperty(node, "reverse") == "true"
        }

        const audioBuffer = this.getDynamicImpulse(params);
        this.audioNodes.convolver.buffer = audioBuffer;
    }

    // Calculates an impulse on the fly based on parameters
    getDynamicImpulse(params)
    {
        const ctx = this.plugin.getContext();
        const sampleRate = ctx.sampleRate;
        const bufferLength = sampleRate * (params.duration || this.defaults.duration);
        const decay = params.decay || this.defaults.decay;
        const shouldReverse = params.reverse;
        const impulse = ctx.createBuffer(2, bufferLength, sampleRate);
        const dataL = impulse.getChannelData(0);
        const dataR = impulse.getChannelData(1);

        for(let i = 0; i < bufferLength; i++) {
            const n = shouldReverse ? bufferLength - i : i;
            dataL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / bufferLength, decay);
            dataR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / bufferLength, decay);
        }

        return impulse;
    }
    
    createNodes()
    {
        const ctx = this.plugin.getContext();

        const convolver = ctx.createConvolver();
        const gain = ctx.createGain();
        const splitter = ctx.createChannelSplitter(2);
        const merger = ctx.createChannelMerger(2);

        const preGain = ctx.createGain();
        const maxDelayTime = 5.0;
        const preDelay = ctx.createDelay(maxDelayTime);

        this.plugin.attachToFirstInput(preGain);
        preGain.connect(preDelay);
        preDelay.connect(splitter);
        splitter.connect(convolver);
        convolver.connect(merger);
        merger.connect(gain);
        this.plugin.attachToFinalOutput(gain);

        this.audioNodes = {
            splitter: splitter,
            merger: merger,
            convolver: convolver,
            gain: gain,
            preGain: preGain,
            preDelay: preDelay
        }
    }

    createHTML(cont, defaults)
    {
        const node = this.plugin.node;
        const dom = PQ_DAW.DOM;

        // the standard stuff
        this.plugin.createDryWetControl(cont, defaults.wet);
        this.plugin.createMakeUpGainControl(cont, this.audioNodes.gain.gain, defaults.gain);

        // pre-gain and pre-delay (seemed useful)
        dom.createSlider(node, { 
            cont: cont, min: -20, max: 20, value: defaults.pregain, step: 0.1,
            name: "pregain", text: "Pre-Gain", unit: "gain", audioParams: this.audioNodes.preGain.gain
        });

        dom.createSlider(node, { 
            cont: cont, min: 0.0, max: 5.0, value: defaults.predelay, step: 0.05,
            name: "predelay", text: "Pre-Delay", unit: "time", audioParams: this.audioNodes.preDelay.delayTime
        });

        // controls for picking a specific impulse response
        dom.createDropdown(node, {
            cont: cont, keys: Object.keys(this.impulseResponses), values: Object.values(this.impulseResponses),
            name: "impulse", "text": "Impulse", callback: this.onImpulseSourceChanged.bind(this)
        })

        // controls for dynamic impulse
        const subCont = document.createElement("div");
        subCont.classList.add("effect-subsection");
        cont.appendChild(subCont);
        
        dom.createSlider(node, { 
            cont: subCont, min: 0.1, max: 20, value: defaults.duration, step: 0.1,
            name: "duration", text: "Duration", unit: "time", callback: this.onDynamicParametersChanged.bind(this)
        });

        dom.createSlider(node, { 
            cont: subCont, min: 0.0, max: 100.0, value: defaults.decay, step: 0.5,
            name: "decay", text: "Decay", unit: "none", callback: this.onDynamicParametersChanged.bind(this)
        });

        dom.createButton(node, {
            cont: subCont, value: defaults.reverse,
            name: "reverse", text: "Reverse", callback: this.onDynamicParametersChanged.bind(this)
        })
    }
}