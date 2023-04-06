import DOM from "../dom"

export default class Delay {
    constructor(plugin)
    {
        this.plugin = plugin;
        this.audioNodes = {};
        this.defaults = {
            wet: 0.5,
            feedback: 0.5,
            delayTime: 0.03,
            numRepetitions: 0,
            pingPong: false
        }

        this.desc = "Lower feedback = softer repetitions. If repetitions zero, repeats continue until inaudible."
    }

    createNodes()
    {
        const node = this.plugin.node;
        const getProp = DOM.getProperty;

        // disconnect all existing outbound connections from us
        this.audioNodes = { delay: [], gain: [], pan: [] }

        const ctx = this.plugin.getContext();
        const maxDelayTime = 10;
        const delayTime = Math.min(getProp(node, "delayTime") || 1.0, maxDelayTime);
        const feedback = getProp(node, "feedback") || 1.0;
        const numRepetitions = getProp(node, "numRepetitions") || 0;
        const useRepetitions = (numRepetitions > 0);
        const delayParams = { delayTime: delayTime, maxDelayTime: maxDelayTime };
        let lastNode;

        const pingPong = (getProp(node, "pingPong") == "true") || false; 

        // REPETITIONS
        // we create all the delays beforehand
        // each one has its own connection to one merger node
        // which we then put back into the main channel
        if(useRepetitions)
        {
            let lastNodeL = this.plugin.wetGain;
            let lastNodeR = null;
            let finalLastNode = null;

            for(let i = 0; i < numRepetitions; i++)
            {
                const delayNode = new DelayNode(ctx, delayParams);
                this.audioNodes.delay.push(delayNode);

                if(i == 0)
                {
                    this.plugin.attachToFirstInput(delayNode);
                }

                const gainNode = new GainNode(ctx, { gain: feedback })
                this.audioNodes.gain.push(gainNode);

                finalLastNode = gainNode;

                if(i % 2 == 0)
                {
                    lastNodeL.connect(delayNode);
                    delayNode.connect(gainNode);
                    lastNodeR = gainNode;
                }
                else if(i % 2 == 1)
                {
                    lastNodeR.connect(delayNode);
                    delayNode.connect(gainNode);
                    lastNodeL = gainNode;
                }
            }

            if(pingPong)
            {
                const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
                lastNodeL.connect(merger, 0, 0);
                lastNodeR.connect(merger, 0, 1);
                this.plugin.attachToFinalOutput(merger);
            }
            else
            {
                this.plugin.attachToFinalOutput(finalLastNode);
            }


        // FEEDBACK
        // we simply create an infinite cycle between these nodes
        // while reducing volume each iteration
        } else {
            const delayNodeL = new DelayNode(ctx, delayParams);
            const delayNodeR = new DelayNode(ctx, delayParams);
            this.audioNodes.delay.push(delayNodeL);
            this.audioNodes.delay.push(delayNodeR);
            
            const gainNode = new GainNode(ctx, { gain: feedback });
            this.audioNodes.gain.push(gainNode);

            // loop/chain delay + gain changing + swap positions for pingpong
            this.plugin.attachToFirstInput(gainNode);

            if(pingPong)
            {
                const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 })
                gainNode.connect(delayNodeL);
                delayNodeR.connect(gainNode);
                delayNodeL.connect(delayNodeR); // the ping-pong chain
                delayNodeL.connect(merger, 0, 0);
                delayNodeR.connect(merger, 0, 1);
                this.plugin.attachToFinalOutput(merger);
            }
            else
            {
                gainNode.connect(delayNodeL);
                delayNodeL.connect(gainNode);
                this.plugin.attachToFinalOutput(gainNode);
            }
        }
    }

    createHTML(cont, defaults)
    {
        const node = this.plugin.node;
  
        const gainCallback = (val) => {
            const curTime = this.plugin.getContext().currentTime;
            for(const gainNode of this.audioNodes.gain)
            {
                gainNode.gain.setValueAtTime(val, curTime, 0.03);
            }
        };

        const delayCallback = (val) => {
            const curTime = this.plugin.getContext().currentTime;
            for(const delayNode of this.audioNodes.delay)
            {
                delayNode.delayTime.setValueAtTime(val, curTime, 0.03);
            }
        }

        this.plugin.createDryWetControl(cont, defaults.wet);

        // feedback slider
        DOM.createSlider(node, { 
            cont: cont, min: 0, max: 1, value: defaults.feedback, step: 0.01,
            name: "feedback", text: "Feedback", unit: "percentage", callback: gainCallback 
        });
        
        // timing slider
        DOM.createSlider(node, { 
            cont: cont, min: 0.03, max: 4, value: defaults.delayTime, step: 0.01, 
            name: "delayTime", text: "Delay", unit: "time", callback: delayCallback 
        });

        // repetition slider 
        // (@NOTE: destroys and recreates nodes!)
        DOM.createSlider(node, {
            cont: cont, min: 0, max: 10, value: defaults.numRepetitions, 
            name: "numRepetitions", text: "Repetitions", unit: "none", callback: (val) => { this.plugin.createCustomNodes(); } 
        });

        // pingpong button
        // (@NOTE: destroys and recreates nodes!)
        DOM.createButton(node, {
            cont: cont, value: defaults.pingPong,
            name: "pingPong", text: "Ping-Pong", callback: (val) => { this.plugin.createCustomNodes(); }
        })
    }

}