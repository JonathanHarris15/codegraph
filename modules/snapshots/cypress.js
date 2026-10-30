// codegraph: module snapshots
// codegraph: front door snapshot
// For a repo's Cypress tests: a picture of the page the test is on, saved
// with its address and when it was taken, for codegraph to show on the map.
//
//   import { snapshot } from './codegraph/cypress.js'
//   snapshot()                  // the map finds the page by its address
//   snapshot('notes-new')       // or by its name, where it has no route
//
// Cypress keeps the picture with its own screenshots; what codegraph reads
// about it goes in .codegraph/shots/ at the project's root.
export function snapshot(name = '') {
  return cy.url().then(url => {
    const stem = shotName(url, name)
    let picture = ''
    cy.screenshot('codegraph/' + stem, {
      overwrite: true,
      capture: 'viewport',
      log: false,
      onAfterScreenshot: (_el, props) => { picture = props.path },
    })
    cy.then(() => cy.writeFile('.codegraph/shots/' + stem + '.json',
      { url, page: name, taken: new Date().toISOString(), picture }, { log: false }))
  })
}

// One file per page: a later picture of the same page takes the place of the last.
function shotName(url, name) {
  const path = name || new URL(url, 'http://x').pathname
  return path.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'start'
}
