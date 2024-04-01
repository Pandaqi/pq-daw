export default class Dragger 
{
    node: HTMLElement;
    dragging: boolean;
    lastDrag: { x: number; y: number; };
    callback: Function;

    constructor(node:HTMLElement)
    {
        this.node = node;
        this.dragging = false;
        this.lastDrag = { x: 0, y: 0 }
        this.callback = null

        this.node.addEventListener('mousedown', this.onDragStart.bind(this), true);
        document.addEventListener('mousemove', this.onDragProgress.bind(this), true);
        document.addEventListener('mouseup', this.onDragEnd.bind(this), true);
        //this.node.addEventListener('mouseleave', this.onMouseLeave.bind(this), true);
    }

    onDragStart(ev)
    {
        this.dragging = true;
        this.lastDrag = { x: ev.clientX, y: ev.clientY }
    }

    onDragProgress(ev)
    {
        if(!this.dragging) { return; }

        const curDrag = { x: ev.clientX, y: ev.clientY }
        let delta = { x: curDrag.x - this.lastDrag.x, y: curDrag.y - this.lastDrag.y }
        this.lastDrag = curDrag;

        if(this.callback) { this.callback(delta); }
    }

    onDragEnd(ev = null)
    {   
        if(!this.dragging) { return; }
        
        this.dragging = false;
        if(ev) { ev.stopPropagation(); ev.preventDefault(); ev.stopImmediatePropagation(); }
        return false;
    }

    onMouseLeave()
    {
        this.onDragEnd(null)
    }
}