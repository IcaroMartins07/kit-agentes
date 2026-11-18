// Paletas do mod temas. Dados puros, entrada do makeColors (ver make-colors.d.ts).
// Cada tema tem os dois modos, menos o neon, que é só escuro. As dunas (o padrão) são o visual do mockup aprovado, no
// claro e no escuro: as cores quentes, a cena das dunas atrás da conversa (`cena`, ver dither-dunes.ts; de noite no
// escuro, de dia no claro) e o vidro por cima dela (`vidro`: sem blur, que apagaria os pontinhos da cena, e sem tint: toma a cor do
// painel de cada modo), tudo num tema só, porque a sessão tem um tema de cada vez.

export const PALETAS = {
  dunas: {
    nome: 'Dunas',
    descricao: 'o padrão do kit, o visual do mockup: cores quentes, as dunas atrás da conversa (de noite no escuro, de dia no claro) e painéis translúcidos, sem blur, para a cena aparecer por trás',
    cena: 'dunas',
    // Sem blur: no app (2026-11-18, blur 16 e 25%), o vidro age na coluna da conversa e apaga os pontinhos da cena num
    // marrom liso; a barra lateral de sessões não muda com nenhum valor (é do app, fora do alcance do tema).
    vidro: { blur: 0, opacity: 0.55 },
    def: {
      label: 'Dunas',
      roles: { accent: '#e8742c', danger: '#d9534a', success: '#5f9a58', warning: '#c98d1f', pro: '#8a64b8' },
      light: {
        gray: {
          anchors: {
            'surface-0': '#ece2cd',
            'surface-1': '#f3ebdb',
            'surface-2': '#f8f2e7',
            'text-primary': '#2a241d',
            'text-secondary': '#4f4539',
            'text-muted': '#655a4b',
          },
        },
      },
      dark: {
        roles: { success: '#7dbb76', warning: '#e0a63a', pro: '#9b78c2' },
        gray: {
          anchors: {
            'surface-0': '#1c1712',
            'surface-1': '#221c17',
            'surface-2': '#29221c',
            'surface-3': '#2f2721',
            'text-primary': '#ece6dc',
            'text-secondary': '#cdc5b8',
            'text-muted': '#a39b8e',
          },
        },
      },
    },
  },
  kit: {
    nome: 'Kit',
    descricao: 'laranja sobre preto no escuro, laranja sobre bege no claro',
    def: {
      label: 'Kit',
      roles: { accent: '#e8742c', danger: '#c0392b', success: '#4f8a4b', warning: '#c08a1e', pro: '#8a5cc7' },
      light: {
        gray: {
          anchors: {
            'surface-0': '#f4ebdc',
            'surface-1': '#f9f2e6',
            'surface-2': '#fdf9f2',
            'text-primary': '#1c1712',
            'text-secondary': '#4a3f33',
            'text-muted': '#5e5142',
          },
        },
      },
      dark: {
        gray: {
          anchors: {
            'surface-0': '#000000',
            'surface-1': '#0a0a0a',
            'surface-2': '#161616',
            'surface-3': '#202020',
            'text-primary': '#f4efe7',
            'text-secondary': '#cdc6ba',
            'text-muted': '#a39b8e',
          },
        },
      },
    },
  },
  cafe: {
    nome: 'Café',
    descricao: 'grãos torrados de dia, balcão à luz de luminária à noite',
    def: {
      label: 'Café',
      roles: { accent: '#9a5a2a', danger: '#b23a2e', success: '#4f7a3a', warning: '#b07818', pro: '#7a4f86' },
      light: {
        gray: {
          anchors: {
            'surface-0': '#efe4d6',
            'surface-1': '#f4ebdf',
            'surface-2': '#faf4ec',
            'text-primary': '#2b1f16',
            'text-secondary': '#54422f',
            'text-muted': '#6b5642',
          },
        },
      },
      dark: {
        gray: {
          anchors: {
            'surface-0': '#1c1511',
            'surface-1': '#251c16',
            'surface-2': '#2d231b',
            'surface-3': '#352920',
            'text-primary': '#f2e6d8',
            'text-secondary': '#d3c1ad',
            'text-muted': '#b09c87',
          },
        },
      },
    },
  },
  noite: {
    nome: 'Meia-noite',
    descricao: 'azul profundo, como um céu limpo depois das dez',
    def: {
      label: 'Meia-noite',
      roles: { accent: '#2f6fd6', danger: '#c23b3b', success: '#2f8a5b', warning: '#b8860b', pro: '#7a55c7' },
      light: {
        gray: {
          anchors: {
            'surface-0': '#e3e8f1',
            'surface-1': '#eaeef5',
            'surface-2': '#f4f6fa',
            'text-primary': '#151c2b',
            'text-secondary': '#36435c',
            'text-muted': '#4d5b75',
          },
        },
      },
      dark: {
        gray: {
          anchors: {
            'surface-0': '#0e1320',
            'surface-1': '#141b2b',
            'surface-2': '#1a2234',
            'surface-3': '#1f283c',
            'text-primary': '#e6ecf7',
            'text-secondary': '#b9c4d9',
            'text-muted': '#94a1ba',
          },
        },
      },
    },
  },
  floresta: {
    nome: 'Floresta',
    descricao: 'musgo e madeira, sombra fresca',
    def: {
      label: 'Floresta',
      roles: { accent: '#2f7d55', danger: '#b4402f', success: '#3f8a3a', warning: '#a87a12', pro: '#6a5a9a' },
      light: {
        gray: {
          anchors: {
            'surface-0': '#e3eadf',
            'surface-1': '#e9efe5',
            'surface-2': '#f3f6f0',
            'text-primary': '#16211a',
            'text-secondary': '#34473a',
            'text-muted': '#4b5f50',
          },
        },
      },
      dark: {
        gray: {
          anchors: {
            'surface-0': '#111a14',
            'surface-1': '#16211a',
            'surface-2': '#1b2820',
            'surface-3': '#203025',
            'text-primary': '#e3efe5',
            'text-secondary': '#b6c9ba',
            'text-muted': '#93a998',
          },
        },
      },
    },
  },
  neon: {
    nome: 'Neon',
    descricao: 'synthwave: roxo escuro e acentos elétricos (só modo escuro)',
    def: {
      label: 'Neon',
      only: 'dark',
      roles: { accent: '#d03fb5', danger: '#e0455a', success: '#2fbf8a', warning: '#e0a030', pro: '#8f6cf0' },
      dark: {
        gray: {
          anchors: {
            'surface-0': '#140d22',
            'surface-1': '#1b122d',
            'surface-2': '#211737',
            'surface-3': '#271b40',
            'text-primary': '#f3e9ff',
            'text-secondary': '#cdbde6',
            'text-muted': '#a996c6',
          },
        },
      },
    },
  },
  papel: {
    nome: 'Papel',
    descricao: 'caderno de papel de dia, papel à luz de lamparina à noite',
    def: {
      label: 'Papel',
      roles: { accent: '#2f5d8c', danger: '#b3392f', success: '#4e7d3a', warning: '#a86f14', pro: '#6d4f94' },
      light: {
        gray: {
          anchors: {
            'surface-0': '#efe6d3',
            'surface-1': '#f4ecdc',
            'surface-2': '#faf5e9',
            'text-primary': '#2a241d',
            'text-secondary': '#544a3d',
            'text-muted': '#6a5f50',
          },
        },
      },
      dark: {
        gray: {
          anchors: {
            'surface-0': '#1f1a15',
            'surface-1': '#28221b',
            'surface-2': '#312a22',
            'surface-3': '#3a3229',
            'text-primary': '#f0e7d7',
            'text-secondary': '#cfc4b2',
            'text-muted': '#aca08d',
          },
        },
      },
    },
  },
}

export const ORDEM = ['dunas', 'kit', 'cafe', 'noite', 'floresta', 'neon', 'papel']
