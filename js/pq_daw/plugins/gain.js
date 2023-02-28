PQ_DAW.PLUGIN_LIST["gain"] = class {
    constructor(plugin)
    {
        this.plugin = plugin;
        this.audioNodes = {};
        this.defaults = {
            gain: 0
        }

        this.desc = "Just a node to change volume.";
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
        this.plugin.createMakeUpGainControl(cont, this.audioNodes.gain.gain, defaults.gain);
    }
}