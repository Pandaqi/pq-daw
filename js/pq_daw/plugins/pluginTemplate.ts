import Plugin from "../plugin";

export default class PluginTemplate
{
    desc = "No description."
    defaults:Record<string,any> = {}
    plugin:Plugin = null
    audioNodes:Record<string, AudioNode> = {}
    animFrame:any = null

    constructor(plugin:Plugin)
    {
        this.plugin = plugin;
    }

    setPlaying(val:boolean) {}
    createNodes() {}
    createHTML(cont:HTMLElement, defaults:Record<string,any>) {}
    remove() {}
}