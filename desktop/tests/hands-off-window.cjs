// codegraph: tooling
// Loaded into the real app ahead of its own code when a page test opens it.
// A test drives the page from inside, so it needs no real mouse or keyboard,
// and a person's would only move the page from under it. The window still
// shows and draws as usual: clicks go through it to whatever is underneath,
// keys never reach it, and it never takes the front.
const { app } = require('electron')

// A Mac brings a newly opened app to the front otherwise, window or no window.
if (process.platform === 'darwin') app.setActivationPolicy('accessory')

app.on('browser-window-created', (_event, window) => {
  window.setFocusable(false)
  window.setIgnoreMouseEvents(true)
  window.show = window.showInactive
})
