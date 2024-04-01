import AUDIO from "../audio"
import DOM, { DOMParams } from "../dom"

const DEFAULTS = { 
    audioParams: [], 
    unit: "percentage", 
    callback: null, 
    autoConnect: false
};

export default class Slider 
{
    owner: any;
    nodes: any;
    params: DOMParams;

    constructor(owner:any, nodes, params:DOMParams)
    {
        this.owner = owner;
        this.nodes = nodes;
        this.params = params;

        for(const [key,data] of Object.entries(DEFAULTS))
        {
            if(key in this.params) { continue; }
            this.params[key] = data;
        }

        this.createAutoConnection();
    }

    needsAutoConnection()
    {
        return (this.params.unit || this.params.audioParams || this.params.callback) || this.params.autoConnect;
    }

    createAutoConnection()
    {
        if(!this.needsAutoConnection()) { return; }

        DOM.connectSlider(this.nodes.slider, this, () => {
            const name = this.nodes.slider.name;

            let val = this.getValueAsFloat();
            if(this.params.unit == "none") { val = this.getValue(); }
            if(this.params.unit == "gain") { val = this.getValueAsGain(); }

            DOM.setProperty(this.owner, name, val);

            if(this.params.audioParams)
            {
                this.params.audioParams.setTargetAtTime(val, null, 0.03);
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

    setDisplay(val:any, unit = this.params.unit)
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