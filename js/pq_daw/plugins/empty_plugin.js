PQ_DAW.PLUGIN_LIST["NAME"] = class {
    constructor(plugin)
    {
        this.plugin = plugin;
        this.audioNodes = {};
        this.defaults = {};
        this.desc = "Some plugin description"

        // @IMPROV: might make the things below default functionality so I don't need to remember this
        // "constant plugins"
        // they must set themselves to constant and implement a "setPlaying" function
        this.plugin.setConstant(true);

        // "visualizing plugins"
        // they must save their animation frame and add a "remove" function where it's removed
        this.animFrame = null;
    }

    createNodes()
    {
        
    }

    createHTML(cont, defaults)
    {

    }
}