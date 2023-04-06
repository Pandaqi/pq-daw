# To Do

## Bussing

Actual bus support => allow adding bus track, changing output per track, connecting in any order

* (OPTIONAL) Bussing: for now, they always need to be created in order. Allow any order?
o	When track is created, we check for its bus. But we also check if any other tracks want to go to us, and then connect those
o	Auto-number tracks if not given a custom name. (So check if it matches the pattern “Track #” + a number, then ensure the number is correct?) => would require a check to move the busses to the renamed ones

## Fading

Perhaps some opacity / gradient fade to indicate fades would look nicer (and be more appropriate)?

* A different, better curve for the fading. (Actual cross fading. An equal power curve. Something that actually works like the fading line I draw.)
  * https://github.com/WebAudio/web-audio-api/issues/2415
  * Nah, this one is better: https://stackoverflow.com/questions/34694580/how-do-i-correctly-cancel-a-currently-changing-audioparam-in-the-web-audio-api

## EQ

* Allow toggling all bands/filters on/off (with a neat checkbox top right of subsection)
* Allow moving points around with click+drag on canvas

## Bugs
* The end of parts (when resizing/dragging) moves sometimes 
* Volume meters: these only update when DAW is re-visualized … but the only solution would be to keep visualizing all DAWs all the time …

## Niceties

* DOM (shortcuts/key inputs) => now uses a stupid combination of name and code for reading the event (and no support for shift) … improve
* Automation => the current system of “first part is special, the rest is constantly recreated” is … meh for performance?
* Turn track name into an editable input field
* Undo / Redo => but would probably require complete rewrite and I don’t feel like it
* Metronome
* Download the HTML of the DAW to save project state.
* MIDI / quantize support
* Uploading/adding your own audio files to tracks
* Distortion: Allow drawing your own distortion curve
* Compressor (and other plugins with time) => Allow relative time units (based on tempo)
* Automation: Proper explanation / error-handling (etcetera) for changing the out path
* Re-enable the Mono/Stereo switch? (Would need to add a Splitter/Merger node combo; split each track before doing anything more, potentially merge at the end for mono)

## Optimizations / Cleanup

* Remove unnecessary AudioNodes / connections.
* DOM: 
  * Dedicated functions/classes for RADIO/CHECKBOX input
  * A dedication function for “getByClassName()[0]” that is SHORTER (would need a regex replacement
* More Rust-style code. (Now I still have lots of interdependencies, mostly with tracks/parts/plugins needing to know their parent. Don’t think I can lose that, though.)

Create clear functions and entry points (configs) if others want to use this. Allow creating tracks, parts, effects, and modifying them, all from code.
Also reuse this DAW for some parts of the “Recording” (and even “Songwriting”) courses?
When using, don’t give too many hints/info through the sidenote/caption. It’s not visible on mobile/small screens. 

