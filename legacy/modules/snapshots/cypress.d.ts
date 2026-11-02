// Types for cypress.js, for a repo whose Cypress tests are TypeScript.
// A picture of the page the test is on, for codegraph to show on the map;
// name the page where codegraph cannot read its route.
export declare function snapshot(name?: string): Cypress.Chainable<string>;
