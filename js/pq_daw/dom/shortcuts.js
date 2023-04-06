import Part from "../part"
import Track from "../track"

export default {
    
    shortcuts: {

        all: {
            "Space": { type: "custom", name: "play" },
            "Escape": { type: "custom", name: "stop" }
        },

        tracks: {
            "m": { type: "button", name: "mute" },
            "v": { type: "slider", name: "volume", value: 5 },
            "b": { type: "slider", name: "volume", value: -5 },
            "q": { type: "slider", name: "pan", value: -5 },
            "w": { type: "slider", name: "pan", value: 5 },
            "s": { type: "button", name: "solo" },
            "p": { type: "button", name: "phase" },
            "r": { type: "button", name: "record" },
    
            "C": { type: "effect", name: "compressor", shift: true },
            "E": { type: "effect", name: "equalizer", shift: true },
            "D": { type: "effect", name: "delay", shift: true },
            "X": { type: "effect", name: "distortion", shift: true },
            "N": { type: "effect", name: "noise", shift: true },
            "R": { type: "effect", name: "reverb", shift: true },
        },

        parts: {
            "f": { type: "fade", value: 0.1 },
            "g": { type: "fade", value: -0.1 }
        }

    },

    getTitleFor(focusNode = "tracks", params)
    {
        const matches = [];
        const name = params.name || "";
        let useShift = false;
        for(const [key, value] of Object.entries(this.shortcuts[focusNode]))
        {
            if(!this.allPropertiesMatch(value, params)) { continue; }
            matches.push(key.toUpperCase());
            if(value.shift) { useShift = true; }
        }
        if(matches.length <= 0) { return "No shortcut"; }
        
        let string = "Shortcut";
        if(name != "") { string += " (" + name + ")"; }
        string += ": ";
        if(useShift) { string += "SHIFT+"; }
        string += matches.join("/");
        return string;
    },

    executeShortcut(nodes, data)
    {
        if(data.type == "button")
        {
            this.fakeClickButton(nodes.node.getButton(data.name));
        }
        else if(data.type == "slider")
        {
            this.fakeChangeSlider(nodes.node.getSlider(data.name), data.value);
        }
        else if(data.type == "effect")
        {
            nodes.node.addEffect({ type: data.name });
        }
        else if(data.type == "fade")
        {
            nodes.node.changeFade(data.value);
        }
        else if(data.type == "custom")
        {
            if(data.name == "play")
            {
                nodes.daw.togglePlayPause();
            }
            else if(data.name == "stop")
            {
                nodes.daw.reset();
            }
        }
    },

    init()
    {
        document.addEventListener('keydown', (ev) => {
            const name = ev.key;
            const shift = ev.shiftKey;
            const code = ev.code;

            const node = this.focusNode;
            if(!node) { return true; }

            const isTrack = this.isType(node, Track);
            const isPart = this.isType(node, Part);
            const isTextInput = this.isType(node, HTMLElement) && node.hasAttribute("contenteditable");


            let daw = null;
            let track = null;
            let part = null;

            if(isTrack) { daw = node.daw; track = node; }
            if(isPart) { daw = node.getDaw(); track = node.track; part = node; }

            const nodes = { daw: daw, track: track, part: part, node: node }
            let didSomething = false;

            // general daw controls (accessible anywhere)
            if(isTrack || isPart)
            {
                if(code in this.shortcuts.all)
                {
                    this.executeShortcut(nodes, this.shortcuts.all[code]);
                    didSomething = true;
                }
            }

            // general track controls (also accessible if part selected)
            if(isTrack)
            {
                if(name == "Delete") { 
                    if(shift) { node.removeLastEffect(); }
                    else { node.queueRemoval(); }
                }

                if(name in this.shortcuts.tracks)
                {
                    this.executeShortcut(nodes, this.shortcuts.tracks[name]);
                    didSomething = true;
                }
            }

            if(isPart)
            {
                if(name == "Delete") { node.queueRemoval(); }

                if(name in this.shortcuts.parts)
                {
                    this.executeShortcut(nodes, this.shortcuts.parts[name]);
                    didSomething = true;
                }
            }

            if(!didSomething) { return true; }

            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            return false;
        });

    },

    allPropertiesMatch(obj1, obj2)
    {
        for(const key in obj2)
        {
            if(!(key in obj1)) { return false; }
            if(obj1[key] != obj2[key]) { return false; }
        }
        return true;
    },

}