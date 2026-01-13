## Portrait Slide Deck

A lightweight browser-based slide deck tuned for a 9:16 portrait output. Keep the controller window on one half of your screen, open the display view in another window (or OBS Browser Source), and advance slides with a click or the arrow keys.

### One-click macOS app

If you prefer a Finder-friendly launcher, drag `Portrait Slide Deck.app` into `/Applications` (or `~/Applications`) and double-click it. The app:

1. Runs a bundled `python3 -m http.server` in the background on port 8778.
2. Opens `http://localhost:8778/` in your default browser (control room) and the display view in a background tab.
3. Stores the tiny server PID/log in `~/Library/Application Support/Portrait Slide Deck/` so you can quit the server by running `kill $(cat server.pid)` if needed (usually logging out or rebooting cleans it up automatically).

Launch it again anytime; it reuses the existing server if it is already running.

### Run it locally

The deck is a static HTML app, so any local web server works. Python's built-in server is the quickest way to launch it:

```bash
cd portrait-slide-deck
python3 -m http.server 8000
```

* Control room (editor + previews): <http://localhost:8000/>
* Stage/output window: <http://localhost:8000/?view=display>

### OBS setup

1. Add a **Browser Source** in OBS and point it at `http://localhost:8000/?view=display`.
2. Set the source dimensions to **1080 x 1920** (or any 9:16 resolution you prefer).
3. Enable **Refresh browser when scene becomes active** so the deck syncs if you hot-swap scenes.
4. Drag/scale that Browser Source to fill the portrait half of your scene. The window is transparent-friendly, so you can layer graphics above it if needed.

### Building slides

* **Text slides** - Use the form in the controller window to set the eyebrow, title, body, footer, colors, and alignment. Hit "Add text slide" to append it to the deck.
* **Image slides** - Click "Add image slides" and pick one or more PNG/JPG files. Each file becomes its own slide; swap between *cover* and *contain* fit from the editor sidebar if needed.
* **Deck import/export** - The "Download deck JSON" button writes the current deck (including embedded images) to disk so you can reload a rundown later via the Import button.
* **Sample rundown** - Load three starter slides with the "Load sample deck" button if you just need a placeholder graphic in rehearsal.

Slides stay in your browser's `localStorage`, so closing the window won't wipe your rundown. Export before major edits if you want a backup or need to shuttle the deck to another machine.

### Controller highlights

* Dual previews show the live slide plus the upcoming one.
* Large, touch-friendly **Previous / Next** buttons plus `Left Arrow` / `Right Arrow` / `space` keyboard shortcuts.
* Slide browser with miniature previews, instant "Go live", duplicate, delete, and drag-free reordering via `Up Arrow` / `Down Arrow` buttons.
* Inline editor panel updates colors, copy, and image fit in real time while keeping the display view synced.
* One-click "Open display window" action to pop out the stage for use on a second monitor or for capturing via OBS window/desktop sources.

That's it-serve the folder, build your slides, and route the display view wherever your show needs it.
