// define the container object for all DAW tools; 
// this file therefore needs to load first in combined JS file
if(!window.PQ_DAW) { window.PQ_DAW = {}; }

// initialize all DAW interfaces
window.addEventListener('load', async function () {

    PQ_DAW.AUDIO.init();
    PQ_DAW.PLAYER.init();
    PQ_DAW.DISPLAY.init();
    PQ_DAW.DOM.init();

    const daws = [];
    const dawNodes = document.getElementsByClassName("pq-daw-wrapper");
    for(const node of dawNodes)
    {
        const newDaw = new PQ_DAW.Daw({ parent: node.parentNode, node: node });
        await newDaw.loadResources();
        daws.push(newDaw);
        node.remove(); // remove the original node used for setup (once the loop is done, it will be garbage collected)
    }

    window.DAWS = daws;
})
