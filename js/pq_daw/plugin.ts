import AUDIO from "./audio"
import DISPLAY from "./display"
import DOM from "./dom"
import Reverb from "./plugins/reverb"
import Noise from "./plugins/noise"
import Gain from "./plugins/gain"
import Equalizer from "./plugins/equalizer"
import Distortion from "./plugins/distortion"
import Delay from "./plugins/delay"
import Compressor from "./plugins/compressor"
import Track from "./track"
import PluginTemplate from "./plugins/pluginTemplate"


// @TODO: allow user to extend this from the outside?
const PLUGIN_LIST = {
    reverb: Reverb,
    noise: Noise,
    gain: Gain,
    equalizer: Equalizer,
    distortion: Distortion,
    delay: Delay,
    compressor: Compressor
};

interface PluginParams
{
    parent?: Track,
    type?: string,
    button?: HTMLButtonElement,
    existingHTML?: HTMLElement,
}

// handles the visual and data for one plugin (of given type)
export default class Plugin 
{
    track: Track
    type: string
    button: HTMLButtonElement
    visible: boolean
    existingHTML: HTMLElement
    constant: boolean
    oldWetValue: number
    node: HTMLElement
    plugin: PluginTemplate
    inputNode: AudioNode
    outputNode: AudioNode
    dryGain: GainNode
    wetGain: GainNode

    constructor(params:PluginParams = {})
    {
        this.track = params.parent;
        this.type = params.type;
        this.button = params.button;
        this.visible = false;
        this.existingHTML = params.existingHTML;
        this.constant = false;
        this.oldWetValue = null;

        if(this.existingHTML) { this.node = this.existingHTML; }

        const interfaceClass = PLUGIN_LIST[this.type];
        this.plugin = new interfaceClass(this);

        this.createEssentialHTML();
        this.node.dataset.name = this.type;

        if(!this.existingHTML)
        {
            const parentContainer = this.track.effectWindowsContainer;
            parentContainer.appendChild(this.node);
        }
        
        this.createEssentialNodes();
        this.createCustomNodes();

        this.createCustomHTML();

        const startOpen = this.track.node.dataset.show.includes(this.type);
        if(startOpen) { DOM.fakeClickButton(this.button); }
    }

    setConstant(val:boolean)
    {
        this.constant = val;
    }

    setPlaying(val:boolean)
    {
        this.plugin.setPlaying(val);
    }

    isConstant()
    {
        return this.constant;
    }

    getDaw()
    {
        return this.track.daw;
    }

    getContext()
    {
        return this.getDaw().getContext();
    }

    isVisible()
    {
        return this.visible;
    }

    setVisible(val:boolean)
    {
        this.visible = val;
        if(val) { this.node.style.display = "block"; }
        else { this.node.style.display = "none"; }
        this.node.style.borderColor = DISPLAY.getColorForTrack(this.track).lighten(-30).toString();
    }

    createEssentialNodes()
    {
        const ctx = this.getContext();

        //const splitNode = ctx.createChannelSplitter(2);
        //const mergeNode = ctx.createChannelMerger(2);

        const splitNode = ctx.createGain();
        const mergeNode = ctx.createGain();

        this.inputNode = splitNode;
        this.outputNode = mergeNode;

        this.dryGain = new GainNode(ctx);
        this.wetGain = new GainNode(ctx);
        this.setWet(0.5);

        // the original signal just goes straight to the merger on channel 0
        // this means channel 1 is used for modifications by plugins

        splitNode.connect(this.dryGain).connect(this.outputNode);
        splitNode.connect(this.wetGain);

        //splitNode.connect(this.dryGain, 0).connect(mergeNode, 0, 0);
        //splitNode.connect(this.wetGain, 1);
    }

    // we always add effects to the wet side (by now, this is just one channel)
    attachToFirstInput(node:AudioNode)
    {
        this.wetGain.connect(node);
    }

    // first channel is dry signal, so we connect to second channel ( = 1)
    attachToFinalOutput(node:AudioNode)
    {
        node.connect(this.outputNode);
        //node.connect(this.outputNode, 0, 1);
    }

    createCustomNodes()
    {
        this.wetGain.disconnect(); 
        this.plugin.createNodes();
    }

    createEssentialHTML()
    {
        const alreadyHasHTML = this.node;
        if(alreadyHasHTML) { return; }
        
        const div = document.createElement("div");
        div.classList.add("effect");
        div.classList.add("effect-" + this.type);
        div.classList.add(this.type);
        div.dataset.type = this.type;

        // @TODO: listen to initial setup for effect windows
        div.style.display = "none"; 

        this.node = div;
    }

    createCustomHTML()
    {
        // these defaults are extracted from the existing HTML + plugin defaults
        // (before we override/set/remove them, order is crucial here)
        const defaults = this.generateDefaults(this.plugin.defaults);

        let cont;
        let alreadyHaveContainer = this.existingHTML;
        if(alreadyHaveContainer) {
            cont = this.existingHTML.firstChild; // get the container
            cont.innerHTML = ''; // and empty it entirely
        } else {
            cont = document.createElement("div");
            cont.classList.add("effect-container");
            this.node.appendChild(cont);
        }

        this.createHeaderHTML(cont);

        this.plugin.createHTML(cont, defaults);
    }

    createHeaderHTML(cont)
    {
        const headerCont = document.createElement("div");
        headerCont.classList.add("full-width", "effect-header");
        cont.appendChild(headerCont);

        const header = document.createElement("h2");
        header.innerHTML = this.type.toUpperCase();
        headerCont.appendChild(header);

        const desc = document.createElement("p");
        const defaultDesc = "No description.";
        desc.innerHTML = this.plugin.desc || defaultDesc;
        headerCont.appendChild(desc);

        const defaultBypassed = DOM.getProperty(this.node, "bypass") == "true";
        DOM.createButton(this.node, {
            cont: headerCont, value: defaultBypassed,
            name: "bypass", text: "Bypass", callback: this.onBypassToggle.bind(this)
        })
    }

    isBypassed()
    {
        return this.oldWetValue != null;
    }

    // On bypass, we simply set the signal to be completely DRY (wet = 0)
    // but we save the value it was before, so we can put it back when we remove the bypass
    onBypassToggle()
    {
        const isBypassed = this.isBypassed();
        if(isBypassed) {
            this.setWet(this.oldWetValue);
            this.oldWetValue = null;
        } else {
            this.oldWetValue = this.getWetValue();
            this.setWet(0.0);
        }

        // constant plugins don't work via dry/wet values, so they need their own callback
        if(this.isConstant())
        {
            this.plugin.setPlaying(!this.isBypassed());
        }
    }

    createDryWetControl(cont:HTMLElement, defValue = 0.5)
    {
        DOM.createSlider(this.node, { 
            cont: cont, min: 0, max: 1, value: defValue, step: 0.01, 
            name: "wet", text: "Dry/Wet", unit: "percentage", 
            callback: (val) => { this.setWet(val); } 
        });
    }

    createMakeUpGainControl(cont:HTMLElement, audioParams:AudioParam, defValue = 0.0, bounds = { min: -20, max: 20 })
    {
        const step = (bounds.max - bounds.min) / 128.0;
        DOM.createSlider(this.node, {
            cont: cont, min: bounds.min, max: bounds.max, value: defValue, step: step,
            name: "gain", text: "Gain", unit: "gain", audioParams: audioParams
        })
    }

    // @SOURCE: https://www.oreilly.com/library/view/web-audio-api/9781449332679/ch03.html
    // @SOURCE: https://webaudioapi.com/book/Web_Audio_API_Boris_Smus_html/ch06.html
    // This uses an "equal power crossfade" to keep volume rougly the same
    setWet(wetness:number)
    {
        var dryGain = Math.cos(wetness * 0.5*Math.PI);
        var wetGain = Math.cos((1.0 - wetness) * 0.5*Math.PI);
        
        this.dryGain.gain.value = dryGain;
        this.wetGain.gain.value = wetGain;
    }

    getWetValue()
    {
        return this.wetGain.gain.value;
    }

    getInputNode()
    {
        return this.inputNode;
    }

    getOutputNode()
    {
        return this.outputNode;
    }

    generateDefaults(defaults = {})
    {
        const node = this.node;
        if(!node) { return structuredClone(defaults); }

        for(const key in defaults)
        {
            let knownValue:(number|string) = DOM.getProperty(node, key);
            if(!knownValue) { continue; }

            // some units convert between slider value and real value; so convert back if we encounter those
            const relatedNode = node.querySelectorAll("*[name='" + key + "']")[0] as HTMLElement;
            let unitType = relatedNode.dataset.unit;
            if(unitType == "gain") { knownValue = AUDIO.gainToDecibels(parseFloat(knownValue)); }

            defaults[key] = knownValue;
        }
        return defaults;
    }

    remove()
    {
        if(this.button) { this.button.remove(); }
        this.plugin.remove();
        this.node.remove();
    }
}
