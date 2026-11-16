// Exemplo do padrão do modo-deus. Apague ao escrever o primeiro teste real.
describe("CA1 · usuário entra e vê o painel", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/login").as("login");
  });

  it("entra com credenciais válidas e cai no painel", () => {
    cy.visit("/login");
    cy.dataCy("email").type("pessoa@exemplo.test");
    cy.dataCy("senha").type("senha-de-teste");
    cy.dataCy("entrar").click();
    cy.wait("@login").its("response.statusCode").should("eq", 200);
    cy.location("pathname").should("eq", "/painel");
    cy.injectAxe();
    cy.checkA11y(undefined, { includedImpacts: ["serious", "critical"] });
  });
});
