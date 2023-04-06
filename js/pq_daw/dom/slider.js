import AUDIO from "../audio"
import DOM from "../dom"

export default class Slider {
    constructor(owner, nodes, params)
    {
        this.owner = owner;
        this.nodes = nodes;
        this.params = params;

        const defaultParams = { audioParams: [], unit: "percentage", callback: null, autoConnect: false };
        for(const key in defaultParams)
        {
            if(key in this.params) { continue; }
            this.params[key] = defaultParams[key];
        }

        if(!Array.isArray(this.params.audioParams)) { this.params.audioParams = [this.params.audioParams]; }
        this.createAutoConnection();
    }

    needsAutoConnection()
    {
        return (this.params.unit || this.params.audioParams || this.params.callback) || this.params.autoConnect;
    }

    createAutoConnection()
    {
        if(!this.needsAutoConnection()) { return; }

        this.connectSlider(this.nodes.slider, this, () => {
            const name = this.nodes.slider.name;

            let val = this.getValueAsFloat();
            if(this.params.unit == "none") { val = this.getValue(); }
            if(this.params.unit == "gain") { val = this.getValueAsGain(); }

            DOM.setProperty(this.owner, name, val);

            for(const param of this.params.audioParams)
            {
                param.setTargetAtTime(val, null, 0.03);
            }

            if(this.params.callback)
            {
                this.params.callback(val);
            }

            this.setDisplay(val);
        });
    }

    getValue()
    {
        return parseInt(this.nodes.slider.value);
    }

    getValueAsFloat()
    {
        return parseFloat(this.nodes.slider.value);
    }

    getValueAsGain()
    {
        return AUDIO.decibelsToGain(this.getValueAsFloat());
    }

    setDisplay(val, unit = this.params.unit)
    {
        let string = "";
        if(unit == "percentage") { string = Math.round(val * 100) + "%"; }
        if(unit == "time") { string = val + "s"; }
        if(unit == "none") { string = val.toString(); }
        if(unit == "dimensionless") { string = (Math.round(val * 100)/100).toString(); }
        if(unit == "decibels") { string = val + "dB"; }
        if(unit == "gain") { string = Math.round(AUDIO.gainToDecibels(val)) + "dB"; }
        if(unit == "ratio") { string = "1:" + val; }
        if(unit == "hertz") { 
            if(val >= 1000) { string = Math.round(val/1000*10)/10 + "kHz"; }
            else { string = val + "Hz"; }
        }

        this.nodes.display.innerHTML = "(" + string + ")";
    }
}