PQ_DAW.PLUGIN_LIST["distortion"] = class {
    constructor(plugin)
    {
        this.plugin = plugin;
        this.audioNodes = {};
        this.defaults = {
            wet: 0.5,
            oversample: 0,
            gain: 0
        }
        
        this.desc = "Distorts the signal. Usually way louder. Draw your own curve and listen to the results."
    }

    // @SOURCE: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createWaveShaper#example
    makeDistortionCurve(amount = 20) {
        let n_samples = 256, curve = new Float32Array(n_samples);
        for (let i = 0 ; i < n_samples; ++i ) {
            let x = i * 2 / n_samples - 1;
            curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    createNodes()
    {
        const ctx = this.plugin.getContext();
        const distortion = ctx.createWaveShaper();
        const gainNode = ctx.createGain();
        this.audioNodes = { distortion: distortion, gain: gainNode }
        
        distortion.curve = this.makeDistortionCurve();

        this.plugin.attachToFirstInput(distortion);
        distortion.connect(gainNode);
        this.plugin.attachToFinalOutput(gainNode);
    }

    createHTML(cont, defaults)
    {
        const dom = PQ_DAW.DOM;
        const an = this.audioNodes.distortion;
        const gain = this.audioNodes.gain;
        const node = this.plugin.node

        this.plugin.createDryWetControl(cont, defaults.wet);

        dom.createSlider(node, {
            cont: cont, min: 0, max: 4, value: defaults.oversample, step: 2,
            name: "oversample", text: "Oversample", unit: "none", callback: (val) => { 
                if(val == 0) { an.oversample = 'none'; }
                else { an.oversample = val + "x"; } 
            }
        })

        this.plugin.createMakeUpGainControl(cont, gain.gain, defaults.gain);
    }
}