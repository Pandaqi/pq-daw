import PluginTemplate from "./pluginTemplate";

export default class Gain extends PluginTemplate
{
    desc = "Just a node to change volume."
    defaults = { gain: 0 }

    constructor(plugin)
    {
        super(plugin);
    }

    createNodes()
    {
        const ctx = this.plugin.getContext();
        const gainNode = ctx.createGain();
        this.audioNodes = { gain: gainNode }
        
        this.plugin.attachToFirstInput(gainNode);
        this.plugin.attachToFinalOutput(gainNode);
    }

    createHTML(cont, defaults)
    {
        const connectedControl = (this.audioNodes.gain as GainNode).gain;
        this.plugin.createMakeUpGainControl(cont, connectedControl, defaults.gain);
    }
}