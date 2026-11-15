// Modelo do modo-deus: acessibilidade e seletor padrão.
import "cypress-axe";

declare global {
  namespace Cypress {
    interface Chainable {
      /** cy.get('[data-cy="<nome>"]') */
      dataCy(nome: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add("dataCy", (nome: string) => cy.get(`[data-cy="${nome}"]`));
